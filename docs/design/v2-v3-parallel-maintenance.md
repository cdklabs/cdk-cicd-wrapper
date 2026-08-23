# Maintaining Blueprint and Autopilot in parallel

**Question:** how do we keep **Blueprint** (the current `PipelineBlueprint.builder()` line, semver
`0.x` — patchable/releasable on demand) and **Autopilot** (the new zero-touch `cdk-cicd exec` line,
semver `1.x` — actively developed) in the repo in parallel, with **Autopilot on `main`** and
Blueprint patchable whenever a fix is needed?

**Answer:** **not via the obvious `releaseBranches` knob** — this monorepo's project type ignores it
— but yes with a small, well-defined `releaseOptions` change per branch, once the blockers below are
fixed.

## Decision (2026-08 — supersedes the earlier "keep v2 on main" recommendation)

- **Naming.** The two generations are **Blueprint** (formerly "v2": the explicit `PipelineBlueprint`
  builder API, semver `0.x`) and **Autopilot** (formerly "v3": zero-touch injection + `cdk-cicd
  exec`, semver `1.x`). The semver numbers are unchanged; the names are how we refer to the lines in
  docs, branches, and dist-tags. (Where the analysis below still says "v2"/"v3", read
  Blueprint/Autopilot.)
- **Branches.** `main` = **Autopilot** (active development). `blueprint` = **Blueprint**
  (maintenance).
- **dist-tags.** `latest` stays **Blueprint** (`0.x`) so an existing `npm install` is unchanged;
  **Autopilot** alpha publishes to `next`. When Autopilot reaches `1.0.0` stable, flip `latest` →
  Autopilot and move Blueprint to the `blueprint` dist-tag.
- **Mechanism.** Per-branch `.projenrc.ts` `releaseOptions` (below), because `MonorepoRelease` is
  single-branch.

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

So adding `releaseBranches: { ... }` to `RootConfig` is a **silent no-op**. Parallel publishing is
instead achieved by letting the two branches carry **different `releaseOptions`** — each branch
synthesizes its own single-branch release workflow.

## Current state (confirmed)

- **Published line is `0.x`** (Blueprint) — tags `@cdklabs/cdk-cicd-wrapper@v0.2.2 … v0.3.9`; no
  `1.x`, no `-alpha`.
- **Branches:** `main` (the published `0.x`/Blueprint line) and the Autopilot rewrite branch (under
  `src/v3`, **never released** — no workflow targets it). `main` is a strict ancestor of the
  Autopilot branch, so the flip below is a clean fast-forward.
- `.github/workflows/release.yml` triggers **only** on push to `main` and runs `npx projen release`,
  publishing to the npm default dist-tag `latest` (no `npmDistTag` configured anywhere).
- `projenrc/RootConfig.ts`: `majorVersion` and `prerelease` are set at the **top level of
  `MonorepoOptions`**, which the project type **does not forward** to the release component. Proof:
  the generated `bump` task has **no `MAJOR` env**, so the bumper tracks the global latest tag
  forever. Both settings are inert as written (the mechanical root cause of finding
  `planning-projen-majorversion-mismatch`).

## Per-branch configuration (the flip)

Because `main` is a strict ancestor of the Autopilot branch, `main` fast-forwards to it with no
conflicts:

```
git branch blueprint origin/main                     # preserve the 0.x line as `blueprint`
git checkout main && git merge --ff-only <autopilot> # main becomes Autopilot
```

**`main` (Autopilot)** — move the version knobs *into* `releaseOptions` so `MAJOR` is emitted (they
are inert at the top level today):
```ts
releaseOptions: {
  publishToNpm: true,
  releaseTrigger: pj.release.ReleaseTrigger.continuous({ paths: ['packages/*', 'package.json'] }),
  // branchName defaults to 'main'
  majorVersion: 1,          // MAJOR=1 → bump tracks only the 1.x line → 1.0.0-alpha.0
  prerelease: 'alpha',      // drop at 1.0.0 stable
  npmDistTag: 'next',       // keep alpha OFF 'latest' until 1.0.0
},
```

**`blueprint` (Blueprint maintenance)** — its own `.projenrc.ts`:
```ts
releaseOptions: {
  publishToNpm: true,
  releaseTrigger: pj.release.ReleaseTrigger.continuous({ paths: ['packages/*', 'package.json'] }),
  branchName: 'blueprint',  // → generates a release-blueprint workflow, triggers on push to blueprint
  majorVersion: 0,          // MAJOR=0 → next is 0.3.10 from 0.3.9
  npmDistTag: 'latest',     // Blueprint stays the default install until Autopilot is stable
},
```

Run `npx projen` **on each branch**: `main` regenerates `release.yml` (Autopilot → `next`), the
`blueprint` branch generates `release-blueprint.yml` (Blueprint → `latest`). The `MAJOR` env isolates
the two lines that share the `@cdklabs/cdk-cicd-wrapper@v*` tag prefix.

**Patching Blueprint on demand:** commit a `fix:`/`feat:` to `blueprint` → its workflow computes the
next `0.x.(z+1)` (correctly filtered by `MAJOR=0`) and publishes to `latest`. Continuous-on-push.

**Publishing Autopilot:** push to `main` → `release.yml` publishes `1.0.0-alpha.N` to `next`. Two
fully independent single-branch pipelines; no dependence on the unwired `releaseBranches`.

**At Autopilot `1.0.0` stable:** drop `prerelease`, set `main`'s `npmDistTag: 'latest'`, and change
`blueprint`'s `npmDistTag` to `'blueprint'`; announce in MIGRATION.md / README.

## Blockers to fix first

1. **`majorVersion` at the wrong level (correctness, not cosmetics).** As shipped it is dropped, so
   the bumper has no `MAJOR` filter. With Blueprint=`0.x` and Autopilot=`1.x-alpha` sharing the
   **same git tag prefix**, an unfiltered bump computes each line's next version from the *other*
   line's tags. Moving `majorVersion` into `releaseOptions` is what makes `MAJOR` appear and isolates
   the two tag lines.
2. **dist-tag collision.** No `npmDistTag` today → everything goes to `latest`. Autopilot alpha
   **must** publish to a non-`latest` tag (`next`), or `npm install` starts resolving to
   `1.0.0-alpha`.
3. **Red compat gate (`qa-compat-gate-already-red`).** `npx projen compat` already exits 1 with ~64
   pre-existing `aws-cdk-lib`-inherited removals (caret-vs-lockfile version skew). Until fixed (align
   the resolved `aws-cdk-lib`, then a curated `.compatignore`, which does not yet exist), the API
   tripwire is effectively down on both lines.

## Backporting & drift

Because there is no single-source `releaseBranches`, the two lines diverge in `.projenrc.ts` **and**
in generated files (`release.yml` vs `release-blueprint.yml`, versions, …). Every regen must run on
the branch it belongs to, and a straight `git merge` between the lines will conflict on generated
artifacts. **Backport by cherry-picking the source `fix:` commit** (main↔blueprint) and re-running
`npx projen` on the target branch — never merge the generated files.

## Step-by-step

1. Create `blueprint` from the current `main` (`0.x` tip); fast-forward `main` to the Autopilot
   branch.
2. On `main`: delete the top-level `majorVersion`/`prerelease`; add `releaseOptions` `{ majorVersion:
   1, prerelease: 'alpha', npmDistTag: 'next' }`. `npx projen`; confirm the bump task shows
   `MAJOR: '1'` and `release.yml` triggers on `main`.
3. On `blueprint`: set `releaseOptions` `{ branchName: 'blueprint', majorVersion: 0, npmDistTag:
   'latest' }`. `npx projen`; verify a `release-blueprint` workflow is generated and the bump computes
   `0.3.10`.
4. Dry-run each release (`workflow_dispatch`, `dry_run: true`): Blueprint computes `0.3.10` → `latest`,
   Autopilot computes `1.0.0-alpha.0` → `next`.
5. Fix the compat gate before relying on the API tripwire on either line.
6. Convention: patch Blueprint on `blueprint`; cherry-pick source `fix:` commits across lines and
   re-run `npx projen` on the target — never merge generated files.

**Key files:** `projenrc/RootConfig.ts`, `.github/workflows/release.yml`, and the project-type
internals proving the single-branch limitation:
`node_modules/cdklabs-projen-project-types/lib/yarn/monorepo.js:150,179`,
`.../monorepo-release.js:31,266,321`, `.../monorepo-release-options.d.ts:10`,
`.../typescript-workspace.js:80–97`.
