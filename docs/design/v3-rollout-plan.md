# Rollout Plan — Autopilot as mainline (handover + decisions)

Status: **in progress.** `autopilot-mainline` was merged into `v3` (`68def56`) and deleted — Stage 0/1
work now lives as ordinary commits on `v3` itself, and Stages 2–3 (below) landed the same way,
directly on `v3`. The earlier "worktree-isolated sandbox" constraint that forced a separate branch no
longer applies (this work continued from a different machine/session with a normal `v3` checkout).
This doc is the authoritative capture of the rollout plan and every grilled decision (Q1–Q16), the
migration backlog, execution stages, and current state. Companion:
`docs/design/v2-v3-parallel-maintenance.md` (release mechanics) and `docs/design/v3-devops-experience.md`
(Autopilot design).

## The two lines (naming)

- **Blueprint** — the current `PipelineBlueprint.builder()` API, semver **`0.x`**. Parked on branch
  **`legacy-blueprint`** (maintenance; patch/release on demand). Already publish-safe (security+legal
  review = GO).
- **Autopilot** — the new zero-touch `cdk-cicd exec` + `cicd.config.ts` experience, semver **`1.x`**.
  Becomes **`main`**.

Release mechanism = **per-branch `.projenrc.ts` `releaseOptions`** (cdklabs `yarn.Monorepo`'s
`MonorepoRelease` is single-branch; `releaseBranches` is a no-op). dist-tags: `latest` stays
**Blueprint (0.x)** until Autopilot hits `1.0.0`; **Autopilot alpha → `next`**; flip `latest`→Autopilot
at 1.0.0. Isolation: `MAJOR=0` vs `MAJOR=1` in the bump task keeps the shared tag prefix from
cross-contaminating.

## Decisions (Q1–Q16)

- **Q1 — reconcile mechanism:** cherry-pick the 12 substantive OSS-readiness fixes from
  `review/v3-oss-readiness` onto v3 (NOT a merge — the branch is 675a97c-based and would drag stale
  generated files); skip `b46c08b` (already on v3). One more full review round before go-live.
- **Q2 — folder structure:** flatten `src/v3/**` → `src/`; **delete the Blueprint code**; any Blueprint feature not
  yet in Autopilot → `task.md` (migrated later, not discarded).
- **Q3 — docs:** full **rewrite** for Autopilot (deliberately used to surface missing features);
  relocate Blueprint docs to a `legacy/` subsection with signposting + redirects.
- **Q4 — sequencing:** stage everything on the branch → one full test/verify → **PR to `main`** (CI
  hooks verify) → **squash the new Step-2 work to one commit** (preserve Autopilot rewrite history). The
  feature migration gates the **1.0/latest** cutover, NOT the `main`-branch flip.
- **Q5 — doc verification:** **Fable + Opus + Haiku**, each simulating personas reading.
- **Q6 — removal boundary:** delete the Blueprint builder API + Blueprint-exclusive code; the Autopilot tree is
  **fully self-contained** (imports zero Blueprint code; CLI imports only Autopilot), so deleting all of
  `stacks/ resource-providers/ code-pipeline/ plugins/ common/ constructs/ utils/` breaks nothing.
  BUT the Blueprint **features** (security plugins, smart providers, …) are a **migrate + re-architect loop**,
  not discard.
- **Q7 — staging branch:** `v3` (implemented as `autopilot-mainline` off v3 — the sandbox blocks
  writing the main `v3` checkout; fast-forward/PR lands it).
- **Q8 — API compat:** accept a clean **`0.x`→`1.x` break** (no 1.x published yet; re-baseline the
  already-red compat gate post-flatten). Future feature ports should keep APIs **familiar** (same
  types/similar props) + a migration guide.
- **Q9 — personas + gate:** personas = (1) new user, (2) Blueprint→Autopilot migrator, (3) security/compliance
  reviewer, (4) non-TS (Python/Java) consumer, (5) skeptical senior eng. **Accuracy vs the shipped
  `cdk-cicd exec`/`defineCICD`/CLI + broken links = must-fix gate; clarity/UX = advisory.**
- **Q10 — final review round:** repeat the full multi-lens **code + security + legal** review on the
  finished branch. **Docs quality is the priority gate** (code issues are lower-worry).
- **Q11/Q13 — projen generator:** **decommission** it — delete `src/projen/**` AND the
  `@cdklabs/cdk-cicd-wrapper-projen` package (legacy-blueprint keeps it; its last 0.x npm version
  stays live).
- **Q14 — monorepo collapse:** **keep the 2-package monorepo** (jsii wrapper + CLI). Spike verdict:
  do NOT merge the CLI into the jsii package — it would bundle node-only CLI deps into every
  PyPI/Maven/NuGet artifact (contradicts decision D5), it's orthogonal work, and it loses independent
  CLI releases. "One install" is already met (CLI depends on the wrapper).
- **Q12 — squash scope:** preserve the Autopilot rewrite history; squash only the new Step-2 commits.
- **Q15 — migration backlog:** one **"migrate Blueprint features to Autopilot"** milestone in `task.md`, one task per
  feature, each citing the Blueprint source + the Q8 keep-API-familiar constraint.
- **Q16 — needed vs later:** see table below.

## Migration backlog (Q15/Q16) — goes into task.md in Stage 4

**🔴 Migrate before `1.0`/`latest` (gates the cutover, not the main-flip):**
1. Security-hardening plugins (bucket SSL/encryption, CloudWatch-log & SNS encryption, KMS rotation,
   Lambda DLQ, EC2 public-IP block — **incl. S3 access-logging enforcement** = the
   `AccessLogsForBucketPlugin`)
2. Compliance / access-log bucket · 3. VPC · 4. HTTP proxy · 5. CodeBuild env customization
   (privileged/compute/env vars) · 6. Private-npm-registry basic-auth · 7. Phase/command model ·
   8. Custom BuildSpec escape hatch · 11. **CloudWatch log-retention** ·
   **+ GitHub Actions pipeline rendering** (port the Blueprint `GitHubPipelinePlugin` to an Autopilot GitHub engine —
   Autopilot only has GitHub-as-source today; the render capability would otherwise be lost)

Note also the skipped Stage-1 fix `0b7ae02` (Blueprint compliance-bucket TLS/SSE policy correctness) → fold
into the compliance-bucket migration (#2).

**🗑️ Dropped (not migrated):** 9. CodeGuru scanning (CLI `security-scan` covers it) · 10. SSM-parameter
integration · 12. Deploy hooks / pre-post-deploy steps · 13. Workbench (→ replaced by the plain local
`cdk deploy` no-pipeline story — a docs item) · 14. `addStack` provider model (→ replaced by `bin/`-app
replay; migration-guide note).

**Already in Autopilot (keep, not backlog):** CodePipeline-Blueprint parity = the `CdkPipelinesEngine` (+ flat
`CodePipelineEngine`) under `src/v3/engine/**` — preserved by the flatten.

## Execution stages & current state

Commits so far (Stage 0–1 landed on `autopilot-mainline` before the merge; Stage 2 onward landed
directly on `v3`):
- `436235d` **Stage 0** — captured your 4 uncommitted Autopilot files (a complete `--express` deploy feature).
- `fa43b85` **Stage 1** — reconciled the 12 OSS fixes (source auto-merged clean; `findings.json`/
  `yarn.lock` kept as v3's; picomatch verified 2.3.2).
- `f249cd8` **Stage 1 fixup** — restored v3's `AppConfig` rosetta example (a cherry-pick regressed it).
- `68def56` **merge** — `autopilot-mainline` → `v3`; the branch was then deleted (local + `origin`).
- `58d312a` **Stage 2** — flattened `src/v3/*`→`src/`, deleted the entire Blueprint tree
  (`stacks/ resource-providers/ code-pipeline/ plugins/ common/ constructs/ utils/`) and
  `src/projen/**` (Q13), landed the curated `src/index.ts` barrel.
- **Stage 3** (this session) — decommissioned `@cdklabs/cdk-cicd-wrapper-projen`: deleted the package,
  `projenrc/ProjenConfig.ts`, and its `.projenrc.ts` wiring; regenerated the projen-managed files
  (`package.json` workspaces/jest, `tsconfig*.json`, `.github/workflows/release.yml`) via `npx projen`;
  re-baselined `npx projen compat` with a new `.compatignore` (122 removed Blueprint symbols — the clean
  0.x→1.x break from Q8/Q2/Q6). Also deleted `samples/cdk-ts-example` (Blueprint-exclusive, entangled with the
  projen removal per `m5-sample-migrate`'s own note; superseded by `samples/cdk-cicd-wrapper-example`) and fixed
  the one test (`MigrateCommand.test.ts`) that read it off disk. This closes out `task.md`'s
  `m8-remove-v2` — all its dependencies were already `done`, so the "deprecation period" gate was
  satisfied by the `legacy-blueprint` branch split instead of in-place deprecation. **Found but not
  fixed** (now in `findings.json`): `samples/cdk-python-example` still imports the deleted
  `PipelineBlueprint` — never got the TS sample's migration treatment.

Remaining:
- **Stage 4** — ~~done, mostly~~. Migration backlog is now in `task.md` as Wave 8 (10 per-feature
  tasks + `m9-migration-gate`), each citing its Blueprint source path and the Q8 keep-API-familiar
  constraint. The "local `cdk deploy` w/o pipeline" docs note (dropped #13) and the `addStack`→`bin/`
  note (dropped #14) turned out to **already exist** in `MIGRATION.md`'s mapping table (rows for
  `workbench(...)` and `PipelineBlueprint...addStack(...)` respectively) — nothing to add. **Could
  not do:** "mark the OSS-readiness findings resolved" — `review/v3-oss-readiness` (the branch whose
  own `findings.json` presumably tracked them) no longer exists anywhere in this repo's git history,
  and a targeted grep of `v3`'s current `findings.json` for the 12 reconciled fixes (picomatch, SPDX,
  SECURITY.md, Action SHA pins, etc.) found none of them tracked there either — `fa43b85` explicitly
  kept `v3`'s `findings.json` over the branch's own copy, so those findings' resolved-state was never
  carried over and can't be reconstructed. There is nothing left to mark; treat this sub-step as moot
  rather than pending.
- **Stage 5** — ✅ done. Full Autopilot docs rewrite + Blueprint docs → `legacy/` with banner +
  redirects. `overview`/`getting_started` rewritten around `defineCICD`/`cicd.config.ts`; a `legacy/`
  section established with `mkdocs-redirects` wiring; 6 developer guides + 2 workshops relocated there
  (no Autopilot equivalent); 11 developer guides rewritten for Autopilot; `MIGRATION.md` gained rows for
  `pipelineOptions` (dropped) and a corrected container-mode row. `cli/`, `mcp/`, `contributing`,
  `prerequisites`, `faqs` kept in place but factually corrected where Stage 6 found them stale, not
  wholesale-relocated (they were never Blueprint-only in the way the 18 developer guides were).
- **Stage 6** — ✅ done. Q9 gate: five persona reviews (new user, Blueprint→Autopilot migrator,
  security/compliance reviewer, non-TS/Python consumer, skeptical senior engineer), each independently
  verifying doc claims against source rather than trusting prose. Found and fixed as must-fix (9
  commits): wrong Blueprint default stages (`RES`/`DEV`/`INT`, not `+PROD`) in `MIGRATION.md` + a workshop
  chapter; two workshop chapters claiming `EngineType.CODEPIPELINE` was "the only option" (stale —
  `CDK_PIPELINES`/`GITHUB_ACTIONS` both ship); 3 wrong/missing CLI command descriptions in
  `cli/index.md` (`check`, `compliance-bucket`, missing `deploy-ci`); `cdk-cicd migrate` overstated as
  extracting the repository (it never does); the TS/JS-only scope of the zero-touch `exec` path never
  stated; `security.md` overselling Semgrep's free tier as supply-chain/secrets scanning; two known,
  already-logged gaps (`AwsSolutions-S10` unsatisfiable, GitHub Actions engine's `DenyExternalId`
  bootstrap incompatibility) not mentioned in the docs pages a reader would need them on; a dead
  `migration_guide.md` nav stub; stale fixed-`RES`/`DEV`/`INT`/`PROD` framing in `prerequisites.md`/
  `faqs/index.md`. Every fix verified against source directly (not just trusting the reviewing
  persona's claim) before editing; `mkdocs build --strict` re-run clean after. Advisory-only findings
  (clarity/UX, not accuracy) were logged in the review transcripts but not treated as a merge gate per
  Q9 — notably the two architecture diagrams in `overview/index.md` still visually depict Blueprint
  0.x and need an actual redraw, not a text fix; `cdk_context.md` is still fully Blueprint-flavored;
  `docs/content/legacy/workshops/github-pipeline/index.md` has one pre-existing unfilled image
  placeholder (predates this session).
- **Stage 7** — final full code+security+legal review (Q10; docs-priority). Not started.
- **Stage 8** — squash the new Step-2 work; PR `v3`→`main` (CI verifies); set Autopilot
  `releaseOptions` `{ majorVersion:1, prerelease:'alpha', npmDistTag:'next' }` (move the currently-inert
  top-level `majorVersion`/`prerelease` in RootConfig into `releaseOptions`). Not started.

## Parallel track — Blueprint (legacy) line
Branch `legacy-blueprint` is configured + committed (`8e29f16`): `releaseOptions` `{ branchName:
'legacy-blueprint', majorVersion:0, npmDistTag:'latest' }`, generating `release-legacy-blueprint.yml`.
**Not pushed.** Pushing it triggers a `0.3.10` release to `latest` (behaviorally identical to `0.3.9`;
review = GO). Push cmd: `git push -u origin legacy-blueprint`.

## Continue from here
Read this doc + `docs/design/v2-v3-parallel-maintenance.md`. Stages 0–6 are done (see above). Next is
**Stage 7** — the final full code+security+legal review (Q10, docs-priority per that decision). Not
started; scope it against the current `v3` diff vs. `main` before diving in.
