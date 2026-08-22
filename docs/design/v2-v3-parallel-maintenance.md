# Maintaining v2 and v3 in parallel

**Question:** can the current projen setup easily support keeping **v2** (deprecated but
patchable at any time) and **v3** (actively developed) published in parallel for the ~2–3 month
deprecation window?

**Answer:** **not via the obvious `releaseBranches` knob** — this monorepo's project type ignores
it — but yes with a small, well-defined config change per branch, once two pre-existing blockers are
fixed. **v2 is already patchable today.**

---

## Why `releaseBranches` does not work here

The repo is built on `cdklabs-projen-project-types` `yarn.Monorepo`. Its release layer
(`MonorepoRelease`) is **hard-wired to a single branch** and never reads `options.releaseBranches`:

- `MonorepoReleaseOptions` exposes `branchName` (singular), not `releaseBranches`
  (`node_modules/cdklabs-projen-project-types/lib/yarn/monorepo-release-options.d.ts:10`).
- `MonorepoRelease` sets `this.branchName = options.branchName ?? 'main'` and emits **one** workflow
  triggered on that one branch (`.../monorepo-release.js:31,266,321`).
- `yarn.Monorepo` forwards only `...options.releaseOptions` into that component
  (`.../monorepo.js:150,179`).

So adding `releaseBranches: { v2: {...} }` to `RootConfig` is a **silent no-op**. Parallel publishing
is instead achieved by letting the two branches carry **different `releaseOptions`** — each branch
synthesizes its own single-branch release workflow.

## Current state (confirmed)

- **Published line is 0.x** — tags `@cdklabs/cdk-cicd-wrapper@v0.2.2 … v0.3.9`; no `1.x`, no `-alpha`.
- **Branches:** `main` (the published 0.x / v2-era line) and `v3` (the rewrite under `src/v3`, **never
  released** — no workflow targets it).
- `.github/workflows/release.yml` triggers **only** on push to `main` and runs `npx projen release`,
  publishing to the npm default dist-tag `latest` (no `npmDistTag` configured anywhere).
- `projenrc/RootConfig.ts`: `majorVersion: 1` (line 37) and `prerelease: 'alpha'` (line 80) are set at
  the **top level of `MonorepoOptions`**, which the project type **does not forward** to the release
  component. Proof: the generated `bump` task has **no `MAJOR` env**, so the bumper tracks the global
  latest tag → 0.x forever. Both settings are inert as written (this is the mechanical root cause of
  finding `planning-projen-majorversion-mismatch`).

## Recommended setup

Keep v2 on `main` (least churn — the existing workflow already targets it); give v3 its own branch and
dist-tag. Because `.projenrc.ts` is maintained per branch, the two lines diverge in `releaseOptions`:

**`main` (v2 maintenance line)** — move the version knobs *into* `releaseOptions` so `MAJOR` is emitted:
```ts
// RootConfig.ts on main — remove top-level majorVersion/prerelease; put them here:
releaseOptions: {
  publishToNpm: true,
  releaseTrigger: pj.release.ReleaseTrigger.continuous({ paths: ['packages/*', 'package.json'] }),
  majorVersion: 0,        // emits MAJOR=0 → bump pinned to the 0.x tag line
  npmDistTag: 'latest',   // v2 stays the default `npm install`
  // branchName defaults to 'main' → release.yml keeps triggering on main
},
```

**`v3` (active line)** — its own copy of `.projenrc.ts`:
```ts
releaseOptions: {
  publishToNpm: true,
  releaseTrigger: pj.release.ReleaseTrigger.continuous({ paths: ['packages/*', 'package.json'] }),
  branchName: 'v3',       // → generates a `release-v3` workflow, triggers on push to v3
  majorVersion: 1,        // emits MAJOR=1 → bump tracks only 1.x tags
  prerelease: 'alpha',    // 1.0.0-alpha.N (decision D6)
  npmDistTag: 'next',     // CRITICAL: keep alpha OFF `latest` so it never clobbers v2
},
```

**Patching v2 on demand:** checkout `main` → commit a `fix:`/`feat:` → push. The existing workflow runs
`npx projen release`, computes the next `0.x.(z+1)` from the latest `@cdklabs/cdk-cicd-wrapper@0.*` tag
(now correctly filtered by `MAJOR=0`), and publishes to `latest`. Continuous-on-push, so "patch
whenever needed" == "merge the fix." Enabling v3 changes nothing about main's workflow.

**Publishing v3 in parallel:** push to `v3` runs the separate `release-v3` workflow → `1.0.0-alpha.N`
→ dist-tag `next`. Two fully independent single-branch pipelines; no dependence on the unwired
`releaseBranches`.

## Blockers to fix first

1. **`majorVersion` at the wrong level (correctness, not cosmetics).** As shipped it is dropped, so the
   bumper has no `MAJOR` filter. With v2=0.x and v3=1.x-alpha sharing the **same git tag prefix**, an
   unfiltered bump computes each line's next version from the *other* line's tags. Moving `majorVersion`
   into `releaseOptions` (or per-workspace) is what makes `MAJOR` appear and isolates the two tag lines.
2. **dist-tag collision.** No `npmDistTag` today → everything goes to `latest`. v3 alpha **must**
   publish to a non-`latest` tag (`next`), or `npm install` starts resolving to `1.0.0-alpha`.
3. **Red compat gate (`qa-compat-gate-already-red`).** `npx projen compat` already exits 1 with ~64
   pre-existing `aws-cdk-lib`-inherited removals (caret-vs-lockfile version skew). Until fixed (align the
   resolved `aws-cdk-lib`, then a curated `.compatignore`, which does not yet exist), the API tripwire is
   effectively down on both lines.

## Backporting & drift

Because there is no single-source `releaseBranches`, the two lines diverge in `.projenrc.ts` **and** in
generated files (`release.yml` vs `release-v3.yml`, versions, …). Every regen must run on the branch it
belongs to, and a straight `git merge` between the lines will conflict on generated artifacts.
**Backport by cherry-picking the source `fix:` commit** (main→v3 or v3→main) and re-running `npx projen`
on the target branch — never merge the generated files.

## Step-by-step

1. Fix the compat gate first (unblocks the API tripwire for both lines).
2. On `main`: delete top-level `majorVersion: 1` / `prerelease: 'alpha'`; add `majorVersion: 0` +
   `npmDistTag: 'latest'` to `releaseOptions`. `npx projen`; confirm the bump task now shows
   `MAJOR: '0'` and `release.yml`'s trigger is unchanged.
3. Dry-run main's release (`workflow_dispatch`, `dry_run: true`): confirm it computes `0.3.10` from
   `0.3.9` and targets `latest`.
4. On `v3`: set `releaseOptions` to `{ branchName: 'v3', majorVersion: 1, prerelease: 'alpha',
   npmDistTag: 'next', … }`. `npx projen`; verify a `release-v3` workflow is generated and the bump
   computes `1.0.0-alpha.0`.
5. First v3 publish: push `v3`; confirm `1.0.0-alpha.0` lands under `next` and `latest` still points at
   the v2 `0.3.x`.
6. Convention: patch v2 by committing `fix:` to `main`; cherry-pick the source commit to `v3` and re-run
   `npx projen` when it also applies.

**Key files:** `projenrc/RootConfig.ts` (36–37, 66–72, 80), `.github/workflows/release.yml`, and the
project-type internals proving the single-branch limitation:
`node_modules/cdklabs-projen-project-types/lib/yarn/monorepo.js:150,179`,
`.../monorepo-release.js:31,266,321`, `.../monorepo-release-options.d.ts:10`,
`.../typescript-workspace.js:80–97`.
