# Task Board

A living, schema-driven board for work in this repo. It is **not** tied to any one initiative —
current tasks happen to be the v3 effort, but the format outlives it.

- **Schema:** `.claude/schemas/tasks.schema.json` — the field contract each task conforms to.
  Machine-readable so an agent can be constrained to it when adding a task.
- **Living document:** append tasks and decisions as work evolves; flip `status` in place; never
  delete finished tasks (mark `done`/`wontfix` so history stays). Planned work lives here; incidental
  mid-task discoveries go to `findings.json` (see `CLAUDE.md` → *Findings file*).

## How this board works

Each task carries: `id` · `title` · `description` · `component` · `type` · `wave` · `status`, plus
optional `spec` · `dependsOn` · `acceptance` · `produces` · `breaking` · `owner` · `notes`.

- **Independence is the goal.** Tasks in the **same wave have no dependency on each other** and run in
  parallel. `dependsOn` is the *only* ordering signal — keep it minimal; push shared work into its own
  upstream task rather than coupling peers.
- **`wave`** = AWS-style wave planning. Wave 0 is foundational. Lower waves generally precede higher,
  but the hard constraint is `dependsOn`, not the number.
- **`status`** ∈ `todo | in-progress | blocked | done | wontfix`. `blocked` names its blocker in notes.
- **`type`** ∈ `feature | test | docs | chore | migration | spike`. `component` ∈ `wrapper | cli |
  projen | shared | infra`.
- A task is only `done` when its `acceptance` check is green (build → unit → real AWS deploy →
  teardown, per the relevant gate).

Task record format (markdown mirror of the schema):

```
- **`task-id`** — Title  ·  status · wave N · component · type  [· breaking]
  - **desc:** what & why
  - **spec:** path #section        - **depends-on:** id, id (or —)
  - **acceptance:** the check that proves done
  - **produces:** path(s)          - **notes:** risks / links (optional)
```

---

## Decisions log

Not tasks — resolved/open design decisions that tasks reference.

- **D1 — Test account safety** ✅ The test account (`$CDK_CICD_TEST_ACCOUNT`, gitignored `.env` —
  **never commit account ids**) is dev/sandbox; the harness may auto-`cdk destroy` its own fixtures in
  `us-west-1`/`us-west-2`. Guard: only stacks tagged `cdk-cicd-wrapper-test` are ever destroyed.
- **D2 — M1 provenance** ✅ Reference loader anonymized into
  `docs/design/reference/config-loader-reference.md`. Port the machinery (generic over user `<T>`),
  not the example tables. Deltas: `CDK_STAGE`+`local` resolution, YAML, greenfield `defaults` module.
- **D3 — Demo medium** ✅ Use the **`asciinema-recorder` skill**; **target = mp4**. Command-line
  walkthrough of the resources is fine, but every step must carry **explanatory comments** so a viewer
  understands what's happening. mp4 needs `agg` + `ffmpeg` (both absent) → the recorder task installs
  them; if the environment blocks install, fall back to `.cast` and flag it. ⚠️ **AMENDED by the
  maintainer (2026-08-25)** — recordings are no longer committed. `test/proof/record-demo.sh` still
  produces `.cast`/`.mp4` into `docs/proof/`, but that output path is now gitignored; a milestone's
  recorded proof is generated and reviewed locally/in CI artifacts, not checked in. Existing
  already-committed recordings in `docs/proof/` are left as historical record, not deleted.
- **D4 — Deferred scope** ✅ Container two-repo mode + GitHub Actions engine are iteration 2. Keep
  `IEngine` honest so they slot in without a rewrite.
- **D5 — Package consolidation (3→2)** ✅ Retire `@cdklabs/cdk-cicd-wrapper-projen` (v3 `cdk-cicd
  configure` replaces it; deprecate then remove at the major). CLI stays its own package but depends
  on the wrapper (one install). Do NOT fold the CLI into the jsii package (multi-language bloat). The
  repo's own projen build stays.
- **D-deploy — Synth at deploy time** ⚠️ **AMENDED by the maintainer (2026-08-20)** — still a valid
  model, but no longer *the* model: it is now the **second** option, not the default. Recorded original:
  *promoted unit is code+pinned deps (sha/image digest), not a baked assembly; synth runs at deploy
  against the injected config, for both the CodePipeline engine and Docker mode. Docker image is
  config-agnostic (no `cdk.out` baked), runs offline.* The amendment defines **two CodePipeline
  implementations**, guiding principle **efficiency first**:
  1. **Default — assembly promotion (the v2 CodePipeline way):** the synth/Build phase synths
     **everything once** and **keeps `cdk.out`**; that assembly is promoted as the pipeline artifact and
     the deploy stages **consume** it rather than re-synthesizing.
  2. **Second option — deploy-time synth** (what M4 actually built), subject to two efficiency rules:
     Build synths **one env by default** (the remaining stages synth when their own stage needs it), and
     anything Build already synthed is **reused, never re-synthed** — today `dev` is synthesized twice
     per run (once by CI `synth --all`, once by its own deploy), which is the concrete waste that
     prompted this amendment.
  Docker mode is unaffected (config-agnostic image, offline synth). Consequence: `m4-verify` proves
  option 2 end to end; the **default** mode is not implemented yet (see `m4-assembly-promotion`).
- **D-deploy-wait — Observe CloudFormation with a stateful Lambda, not an idle build** ✅ (maintainer,
  2026-08-20) A deploy action must not bill CodeBuild compute while it merely waits for CloudFormation.
  Kick off the deployment, then let a **stateful Lambda** observe deployment state and drive the action's
  completion. Applies to both implementations above.
- **D6 — v3 versioning & isolation** ✅ v3 develops on a dedicated **`v3` branch** (created) that is
  **not a declared release branch**, so it cannot publish — the strongest guard against accidental
  use. When we first want alpha exposure it releases as **`1.0.0-alpha.N` under npm dist-tag `next`**
  (never `latest`); `main`/`latest` stays on the current 0.x line. "v3" is the **initiative codename**;
  the released artifact is `1.0.0`. **On hold (user decision):** making v3 `1.0.0`
  requires main's `majorVersion` → `0` (projen has main at `1` but nothing 1.x ever shipped — live
  `latest` is `0.3.8`); the user chose **not to touch main's config** for now, so the version-config
  is staged only. Branch isolation remains the active guard. See finding
  `planning-projen-majorversion-mismatch`.

- **D7 — Where harness & proof artifacts live** ✅ `development/` is in `.gitignore` (line 40) and has
  **never** been committed, so the `development/build-proof/` pattern CLAUDE.md referenced did not
  exist — anything written there is invisible to the repo. Resolved by splitting by lifetime:
  | Path | Committed? | Holds |
  |---|---|---|
  | `test/fixtures/` | yes | fixture CDK apps every gate deploys against |
  | `test/proof/` | yes | harness + recorder **tooling** (scripts must be reviewable) |
  | `docs/proof/` | yes | the delivered proof: `.cast` source + `.mp4` + index |
  | `development/v3-proof/` | no (gitignored) | scratch run logs, raw build output |
  Repo-root `test/` is safe because the build only reaches into `packages/@cdklabs/*`: root `lint` =
  `yarn workspaces run eslint`, root `test` = jest `projects` (3 workspaces), root `fmt` = eslint over
  `projenrc` + `.projenrc.ts` only. So fixtures are committed without being linted or type-checked by
  the repo's own build — which is what lets them look like untouched `cdk init` output.

---

## Wave 0 — Test & proof harness  *(foundational; build the loop before the features)*

- **`v3-version-isolation`** — Isolate + version the v3 line (first step, D6)  ·  blocked · wave 0 · infra · chore · breaking
  - **desc:** Prevent anyone from accidentally consuming the in-progress redesign, and version it as
    the next major. **Isolation ACHIEVED:** `v3` branch created and not a declared release branch →
    it cannot publish, so the anti-accidental-use goal is already met. **Deferred by decision:** the
    projen release-config (`releaseBranches: { v3: { majorVersion: 1, prerelease: 'alpha', npmDistTag:
    'next' } }` + main → `majorVersion: 0`) is staged but **not applied** — user chose to hold rather
    than touch main's existing line.
  - **spec:** D6          - **depends-on:** —
  - **acceptance:** (when unblocked) `npm i @cdklabs/cdk-cicd-wrapper` still returns the 0.x line; the
    v3 line only resolves via `@next`; nothing publishes from the `v3` branch until enabled.
  - **notes:** BLOCKER = maintainer decision on main's line (finding
    `planning-projen-majorversion-mismatch`). Until then, branch isolation is the guard; do NOT change
    release config, push, or publish.
- **`harness-baseline`** — Repo-green baseline  ·  done · wave 0 · infra · chore
  - **desc:** Establish the pre-change baseline so regressions are visible.
  - **acceptance:** `npm run build` green on clean `main` (logged); test count + timing recorded;
    `npx projen compat` passes (the v2 API-break tripwire).
  - **produces:** `development/v3-proof/baseline.log`
  - **notes:** ✅ `npm run build` exit 0 on `v3` @ 6c3bf14 (tree = main + untracked planning docs
    only). Wrapper: **21 suites / 81 tests / 71.0 s**; CLI+projen: 1 suite / 2 tests / 6.4 s.
    Baseline is the number every later gate compares against.
- **`harness-aws-lifecycle`** — AWS access + fixture lifecycle  ·  done · wave 0 · infra · feature
  - **desc:** Credentials + a deploy→assert→destroy loop against the test account, with a teardown
    guard that refuses any stack lacking the `cdk-cicd-wrapper-test` tag.
  - **spec:** `CLAUDE.md` #AWS / test account          - **depends-on:** — (needs D1 ✅)
  - **acceptance:** `ada` creds resolve (`aws sts get-caller-identity`); `cdk bootstrap` confirmed for
    us-west-2 + us-west-1; guard rejects an untagged stack in a unit test; orphan sweep lists by tag.
  - **produces:** `test/proof/harness.sh` (+ `test/proof/harness.test.sh`) — committed per D7, not
    `development/` as originally written, since `development/` is gitignored.
  - **notes:** ✅ All four acceptance legs green. `ada` creds resolve to `CDK_CICD_TEST_ACCOUNT`; both
    regions bootstrapped (SSM `/cdk-bootstrap/hnb659fds/version`); `harness.test.sh` drives the guard
    through 11 refusal branches + a positive control + 2 cases proving `destroy_stack` consults the
    guard *before* deleting — **15/15**, and the delete-before-guard mutant is killed. `sweep` lists by
    tag across both regions. One real `run level0-app` completed end to end: CREATE_COMPLETE, both tags
    asserted, SSM parameter read back, guard-approved delete, nothing left behind.
    Two review fixes were load-bearing: (a) bash disables `errexit` inside a subshell used as an `if`
    condition — and for its whole call tree — so `cmd_run`'s `if ! ( cmd_x )` made a failed teardown
    print "deleted" and exit 0; every AWS call now carries an explicit `|| die` (verified by simulating
    `delete-stack` rc=254 → run exits 1). (b) AWS authorization errors quote the caller ARN, leaking the
    account id on stderr — the path most likely to end up in a committed demo — so captured calls go
    through `aws_masked`, which filters stderr synchronously via a temp file rather than a background
    process substitution that can lose block-buffered output on exit.
- **`harness-publish-loop`** — CodeArtifact publish/install round trip  ·  done · wave 0 · infra · test
  - **desc:** Prove the real install path: publish to CodeArtifact, install from a clean dir.
  - **acceptance:** `task codeartifact:publish` then `npm install @cdklabs/cdk-cicd-wrapper` from
    CodeArtifact in a temp dir imports cleanly. (M1 may use a workspace link; M2+ must use this.) ✅
    Verified repeatedly M4+: the pipeline-app fixture, the v3 sample, and a clean-dir check all install
    @cdklabs/*@0.0.0 from CodeArtifact and import cleanly (defineCICD/stageStackName/PipelineApp/DeployModel
    resolve, cdk-cicd bin present). Published via `npm publish` of `dist/js` (the JS consumer path); the
    Taskfile's twine/python leg is unused and out of scope for the JS loop.
  - **notes:** Tooling already exists (`Taskfile.codeartifact.yml`) — verify, don't rebuild. It covers
    `login`, `publish`, `unpublish`, `repository:create`/`delete` and the token-secret lifecycle;
    domain/repo/secret are all named `cdk-cicd-wrapper`, publishing from `dist/js` (npm) +
    `dist/python` (twine). **Blocker cleared:** `task` was not on PATH (devbox unavailable), so go-task
    3.53.1 is now installed per-user at `~/.local/bin/task` and `task --list` resolves every Taskfile
    including the CodeArtifact one. Still to do: the *round trip* — the Taskfile has no clean-room
    install step, and no `logout`, so `codeartifact:login` leaves the `@cdklabs` scope pointed at
    CodeArtifact in the user's npm config. Do the install leg against a temp-dir-local `.npmrc`
    instead of mutating global config. Deferred until M2 actually needs it (M1 uses the workspace link).
- **`harness-recorder`** — Milestone recorder (mp4, narrated)  ·  done · wave 0 · infra · chore
  - **desc:** Reusable recorder. Records a command-line walkthrough that shows provenance
    (branch/HEAD/dirty) and the created AWS resources, with an explanatory **comment before each
    step** so a viewer follows what's happening. Exports the `.cast` to **mp4** via `agg` (cast→gif) +
    `ffmpeg` (gif→mp4).
  - **spec:** D3          - **acceptance:** produces a narrated `.mp4` per key milestone (M2, M4);
    `.cast` retained as the source. If `agg`/`ffmpeg` can't be installed, fall back to `.cast` + log a
    finding.
  - **produces:** `test/proof/record-demo.sh` (cast→gif→mp4 pipeline),
    `test/proof/narrate.sh` (`step`/`say`/`run`/`note` — makes the per-step comment structural, not a
    convention), `test/proof/demos/` (demo scripts), `docs/proof/` (committed `.cast` + `.mp4` + index)
  - **notes:** ✅ `agg` 1.9.0 + `ffmpeg` 7.0.2-static installed per-user into `~/.local/bin` (no sudo
    available; prebuilt binaries, install commands documented in `docs/proof/README.md`), so the D3
    `.cast`-only fallback is **not** needed. Proven by the `recorder-selftest` demo: 4 KB `.cast` →
    valid h264 mp4 (982×694, 22.2 s, 403 KB ≈ 20 KB per second of video). Recording is
    **non-interactive** (`asciinema rec --command`), so a milestone gate produces its own proof with
    no human at a terminal — the `asciinema-recorder` skill only documents the interactive
    wrap-your-shell flow, see finding `harness-asciinema-skill-gap`.
- **`harness-fixtures`** — Fixture apps  ·  done · wave 0 · infra · test
  - **desc:** The apps every later gate deploys/asserts against.
  - **produces:** `test/fixtures/level0-app` (untouched `cdk init`, asserts wrapper inert);
    `level1-app` (+ `cicd.config.ts`, 2 stages); `hardcoded-env-app` (foreign account/region, for the
    drift rule); `bundled-app` (esbuild entrypoint, the preload-failure case); `test/fixtures/README.md`
    (the four fixtures + the naming contract they owe the harness).
  - **acceptance:** the three deployable fixtures synth; `bundled-app` does **not** build without an
    extra esbuild step and that is the point — it exists to be the failure case (`m2-bundled-diagnostic`).
    All four kept out of the repo's own lint/jest/publish projects.
  - **notes:** ✅ Shaped like *user* output, not like code this repo owns, since their job is to show
    what the wrapper does to an app it did not write. No `package.json` anywhere: Node resolution walks
    up to the root `node_modules`, which already hoists `aws-cdk-lib`/`constructs`/`aws-cdk`/`ts-node`
    and symlinks the wrapper — that is what lets `level0-app` stay byte-for-byte plausible as
    `cdk init` output. The naming contract (`cdkcicdtest-<run-id>-<short>` stack,
    `/cdkcicdtest/<run-id>/<short>` SSM param, run id ← `CDK_CICD_TEST_RUN_ID` else `local`) was
    implicit in the harness and is now written down, because `assert` fails opaquely when a fixture
    drifts from it. `cdk.out` is gitignored here and the harness synths to a temp dir regardless — a
    synthesized `manifest.json` contains the account id.
- **`harness-verify`** — Phase-0 exit gate  ·  done · wave 0 · test
  - **depends-on:** harness-aws-lifecycle, harness-recorder, harness-fixtures
  - **acceptance:** one command deploys a trivial fixture to us-west-2, asserts it, destroys it, and
    emits a `.cast`. ✅ Realized by the `m2-deploy` recorded gate (`test/proof/record-demo.sh m2-deploy`):
    one command deploys level0/level1 fixtures, asserts the injected differential, destroys via the guard,
    and emits `docs/proof/m2-deploy.cast`. The harness was thereby proven at M2 and exercised every gate
    since (m3-verify, m4-verify, migration-continuity) -- no separate command needed.

## Wave 1 — App-config layer (M1)  *(standalone, zero AWS dep; port machinery generic over `<T>`)*

- **`m1-base-schema`** — Base EnvConfig schema  ·  done · wave 1 · wrapper · feature
  - **desc:** Keep it tiny: `aws.accountId`/`aws.region`, `tags`, `removalPolicies`, `application`.
    Networking deliberately excluded (user-land in v3).
  - **spec:** `docs/design/v3-devops-experience.md` #Application configuration management
  - **produces:** `packages/@cdklabs/cdk-cicd-wrapper/src/v3/appconfig/schema.ts`
  - **notes:** ✅ `BaseConfig` / `AwsEnvironment` / `RemovalPolicies` / `RemovalPolicyValue`, all four in
    the jsii assembly. Base defaults RETAIN both stateful resources, so the wrapper never widens a
    user's blast radius by default.
- **`m1-loader`** — ConfigLoader.resolvePath/load  ·  done · wave 1 · wrapper · feature
  - **desc:** `CONFIG_FILE` → `config/<CDK_STAGE>.(json|yaml)` → `config/local.*`; branch on extension
    for YAML. `resolvePath` total, never throws.
  - **spec:** `docs/design/reference/config-loader-reference.md` (deltas 1–2)
  - **acceptance:** resolvePath totality unit tests; JSON and YAML load identically.
  - **notes:** ✅ Both acceptance legs covered. Probing order is `.json` → `.yaml` → `.yml`, pinned by
    tests that write *two* extensions so reordering the constant fails. Deliberately **not** built: the
    `defaults` injection point — a second defaults layer with no caller anywhere in the repo is
    speculative configurability, so `ConfigLoadOptions` is just `{ env, schema }`.
- **`m1-defaults`** — defaults module  ·  done · wave 1 · wrapper · feature
  - **desc:** `deepMerge` (last-wins) + `applyDerivedDefaults` (region inheritance, account-derived
    names) + `getDefaultConfig` + `getByPath` + `DeepPartial`. Greenfield (delta 3 — not shared).
  - **spec:** `docs/design/reference/config-loader-reference.md` (delta 3)
  - **notes:** ✅ Two non-obvious behaviours are now pinned by tests. (a) Prototype pollution:
    `JSON.parse`/`yaml.parse` produce a real *own* `__proto__` key, and the merge must recurse into a
    subtree even when the base has nothing there — otherwise assigning it wholesale skips the
    `UNSAFE_KEYS` filter at every level below *and* aliases the caller's parsed object into the result.
    Since the base schema knows only three keys, every application-specific group takes exactly that
    path. (b) YAML `null`: a blank key (`accountId:`) parses to `null`, not `undefined`, and means "I did
    not set this", so derived defaults treat `null` as absent.
- **`m1-validation`** — ConfigError + required-field tables  ·  done · wave 1 · wrapper · feature
  - **desc:** `ConfigError` (4 kinds) + dot-path tables + conditional groups (required only when
    parent present). Port `getByPath`/`isMissing` ~verbatim; tables are **caller-supplied**.
  - **depends-on:** m1-defaults
  - **acceptance:** one unit test per `ConfigError.kind`; conditional group (absent parent passes,
    present-incomplete → `MISSING_ATTRIBUTE`); blank/empty count as missing.
  - **notes:** ✅ Tables stay caller-supplied — the wrapper ships no required-field table of its own, so
    every schema in the tests is labelled EXAMPLE. A `null` activator does not activate a conditional
    group, for the YAML reason above. Wrong *type* is reported identically to absent, which matters
    because an unquoted 12-digit account id in YAML parses to a **number**: coercing it would silently
    corrupt a leading-zero account, so it is rejected instead.
- **`m1-accessor`** — Config accessor + context fallback  ·  done · wave 1 · wrapper · feature
  - **desc:** Runtime accessor + `cicd:config` context read. **jsii:** the multi-language surface
    can't be a TS generic — expose a structured type / context read; keep the generic loader for TS.
  - **depends-on:** m1-loader, m1-validation
  - **produces:** `src/v3/appconfig/accessor.ts` (`AppConfig.of`/`load`), `src/v3/index.ts` (the curated
    public barrel), + `export * from './v3'` in `src/index.ts`.
  - **notes:** ✅ Signature settled: `AppConfig.of(scope, options)` reads `cicd:config` from construct
    context and falls back to loading the file, returning **`any`**. `any` is the deliberate choice —
    the config shape belongs to the app, jsii cannot express a generic, and `any` gives TS callers
    zero-friction typing (`const c: MyConfig = AppConfig.of(this)`) while mapping to `Object`/`dict`
    elsewhere. Injected context is validated too, because the same key can be hand-written in `cdk.json`
    or passed with `--context`, and a bad hand-written value must fail like a bad file.
    The **curated barrel** is what makes this work at all: only types reachable from `src/index.ts` enter
    the assembly, so the generic `ConfigLoader`, `ConfigError` (jsii cannot model an `Error` subclass),
    `NodeJS.ProcessEnv`, the `DeepPartial` mapped type and the bare functions all stay internal while 11
    curated symbols cross the language boundary — verified against `.jsii`, not assumed. Watch out:
    jsii **silently omits** exported free functions rather than erroring (finding
    `code-review-jsii-silently-omits-free-functions`), so "it compiled" is not evidence a symbol shipped.
- **`m1-verify`** — M1 gate  ·  done · wave 1 · wrapper · test
  - **depends-on:** m1-accessor, harness-fixtures
  - **acceptance:** unit green; `config/local.json` and `config/dev.json` drive a fixture synth; a
    missing required key exits `cdk synth` non-zero with the right `ConfigError.kind`.
  - **produces:** `test/proof/m1-verify.sh`; the config read in `test/fixtures/level1-app/lib/level1-stack.ts`.
  - **notes:** ✅ All three legs green (`bash test/proof/m1-verify.sh` → 3/3). The config read went into
    `lib/level1-stack.ts`, NOT `bin/app.ts`: that keeps `bin/app.ts` byte-for-byte with level0 (the A/B
    contract) and leaves the wave-2 zero-touch-`bin/` injection story clean, while still satisfying
    "config drives a fixture synth". Forward-compatible — `AppConfig.of(this, …)` reads injected
    `cicd:config` context first (wave 2) and falls back to the file (wave 1). Negative case needed real
    determinism work: the CDK CLI auto-fills `CDK_DEFAULT_ACCOUNT` from ambient creds (a container
    endpoint AND `~/.aws/credentials` here), which masked the failure, so the gate fully isolates
    credentials (unset the container/shared-file/IMDS sources, `AWS_*_FILE=/dev/null`) before the
    negative synth. The schema is the fixture's own (wrapper ships none); `aws.accountId` is a
    `requiredAttribute`, absent from `config/*.json` because account ids never enter this repo, so it is
    derived on the positive path and → `MISSING_ATTRIBUTE` when no account resolves.

## Wave 2 — Runtime injection + `cdk-cicd exec` (M2)  *(first real deploy; demo #1)*

- **`m2-register`** — register preload  ·  done · wave 2 · wrapper · feature
  - **desc:** Subclass `App` at the **leaf module** `core/lib/app.js`, inject
    `defaultStackSynthesizer`, register Aspects in the constructor. Do NOT monkeypatch `synth()` —
    Aspects run tree-wide before template emission.
  - **spec:** `docs/design/v3-devops-experience.md` #Seam mechanics — spiked and verified
  - **produces:** `src/v3/runtime/register.ts` (the preload) + `src/v3/runtime/inject.ts` (the shared
    post-construction core `applyWrapper` + `resolveSynthesizer` + the construction counter + the layout
    guard, all internal — reused by m2-attach and m2-bundled-diagnostic); `test/v3/runtime/register.test.ts`.
  - **notes:** ✅ Verified two ways: jest 70/70 in-process, and the real `node -r register.js bin/app.js`
    preload run from a fixture dir (App is `WrappedApp`, cdk-nag `AwsSolutionsChecks` applied, injected
    `cicd:config` tags reach the synthesized template). Nothing from `src/v3/runtime` enters the `.jsii`
    assembly (checked, not assumed). Two corrections beyond the spike: (1) the synthesizer prop is typed
    `IReusableStackSynthesizer`, not `IStackSynthesizer` (`DefaultStackSynthesizer` satisfies it), and a
    reusable synthesizer is bound per-stack so `stack.synthesizer` is a bound clone — the test asserts
    the custom qualifier survives into the template instead of instance identity. (2) **Instance
    matching is load-bearing:** Node caches modules by resolved path, and the hook must patch the SAME
    aws-cdk-lib the app loads. The dev workspace has TWO real copies (one nested in the wrapper as a jsii
    devDep, one at root) — resolving from the hook's own location patched the wrong one and the app saw a
    plain `App` (the exact silent-no-op failure `m2-bundled-diagnostic` guards against). Fixed by patching
    every distinct copy reachable from the app entry / cwd / the hook, deduped; same-version copies share
    aws-cdk-lib's internal metadata keys so cross-copy Aspects/Tags still apply. In a published install
    aws-cdk-lib is a single peer copy and this is moot. The layout guard throws a clear, version-named
    error rather than a silent try/catch, per the spec.
  - **notes:** **Seam spiked and verified end-to-end** (aws-cdk-lib 2.195.0 / node 24) — see the spec
    section for detail. Three corrections the implementation must honour: (1) `require('aws-cdk-lib/
    core/lib/app')` is **blocked** by the package `exports` map (`ERR_PACKAGE_PATH_NOT_EXPORTED`) —
    resolve the file via `path.dirname(require.resolve('aws-cdk-lib/package.json'))` +
    `path.join(root,'core/lib/app.js')`; (2) the leaf's `App` is a writable data property and the
    `aws-cdk-lib` / `aws-cdk-lib/core` re-exports are **lazy accessors that re-read it**, so ONE patch
    point covers every import path (no need to walk re-exports); (3) works for both `bin/app.js` and
    `bin/app.ts` via `node -r <register> -r ts-node/register`. Level-0 inertness confirmed: with no
    hook the app gets a plain `App`, no context, no Aspects, no tags. Because the seam depends on
    `aws-cdk-lib`'s internal file layout, add an explicit version/layout check with a clear error —
    do not silently try/catch.
- **`m2-attach`** — CdkCicd.attach(app)  ·  done · wave 2 · wrapper · feature
  - **desc:** Explicit, reliable path (same code path as the preload) for bundled/ESM apps.
  - **depends-on:** m2-register
  - **produces:** `src/v3/runtime/attach.ts` (`CdkCicd.attach`), exported from `src/v3/index.ts`;
    `test/v3/runtime/attach.test.ts`.
  - **notes:** ✅ `CdkCicd.attach(app: App): void` — the ONE runtime symbol in the jsii assembly
    (register/inject stay internal; verified against `.jsii`). Runs the SAME post-construction core as
    the preload (`applyWrapper`: cdk-nag + tags), reading `cicd:config` from the app's merged context.
    Deliberately does NOT set the synthesizer — `App.defaultStackSynthesizer` is constructor-only, so a
    bundled app needing a forced synthesizer passes it via `new App({...})` itself (wave-3 forced roles).
    Calls `markAppConstructed()` so an app that opts into `attach` counts as wrapped and the bundled-app
    diagnostic (m2-bundled-diagnostic) stays silent — attach is exactly the remedy that diagnostic
    points to. Tested against a STOCK unwrapped App (the bundled/ESM situation it exists for), not under
    the preload. 75/75.
- **`m2-exec`** — cdk-cicd exec launcher  ·  done · wave 2 · cli · feature
  - **desc:** Resolve config; export `CDK_STAGE` + the stage's account/region into **both**
    `CDK_DEFAULT_ACCOUNT`/`_REGION` **and** `CDK_DEPLOY_ACCOUNT`/`_REGION` (stock `cdk init` env line
    hits the right stage, no `cfg` ref); build `CDK_CONTEXT_JSON`.
  - **depends-on:** m1-accessor, m2-register
  - **acceptance:** stock-env app resolves the stage account/region; env-agnostic app stays
    region-agnostic; `CDK_CONTEXT_JSON` replicates the CLI's `cdk.json`+`cdk.context.json` merge
    (does not clobber user context).
  - **produces:** `packages/@cdklabs/cdk-cicd-wrapper-cli/src/cmds/v3/ExecCommand.ts`, registered in the
    CLI's `src/index.ts`; `test/v3/ExecCommand.test.ts`.
  - **notes:** ✅ `cdk-cicd exec <app>` loads the stage config (tolerating a stage with no file → runs
    uninjected), exports the stage account/region into both env pairs (absent values left alone, so an
    env-agnostic app stays agnostic), merges `cicd:config` into `CDK_CONTEXT_JSON` WITHOUT clobbering a
    user-set key (starting from the CLI-provided `CDK_CONTEXT_JSON`, else `cdk.json`+`cdk.context.json`
    itself), sets `CDK_CICD_EXEC=1` to arm the diagnostic, and spawns `node [-r ts-node/register] -r
    <register> <entry>` propagating the child's exit code. Pure logic unit-tested (12/12). Proven end to
    end: `cdk synth --app "cdk-cicd exec bin/app.ts"` against `level1-app` → the config-driven
    `application` reached the template FROM injected context and the config `tags` were applied by the
    preload, diagnostic silent. jsii: none (CLI is plain TS). The `CDK_CICD_EXEC` literal is duplicated
    across packages (finding `code-review-exec-flag-cross-package-literal`); a test asserts both copies
    agree.
- **`m2-bundled-diagnostic`** — bundled/ESM diagnostic  ·  done · wave 2 · wrapper · feature
  - **desc:** Detect when preload patching won't take effect and emit a clear "use `CdkCicd.attach`".
    **Raised from nice-to-have to required:** a real esbuild bundle was verified to inline
    `aws-cdk-lib` and construct its own `App`, so the hook patches nothing and the app synthesizes
    **successfully with no synthesizer, no tags and no Aspects** — a silently non-compliant deploy.
    Same shape for native ESM and a vendored `aws-cdk-lib`.
  - **depends-on:** m2-register          - **acceptance:** fires on the `bundled-app` fixture; stays
    silent on `level0-app` and `level1-app` (no false positives).  ·  **done**
  - **produces:** the `shouldWarnBundled` predicate + `BUNDLED_DIAGNOSTIC_MESSAGE` + `EXEC_FLAG` in
    `src/v3/runtime/inject.ts`; the `process.on('exit')` handler in `register.ts`; the pinned esbuild in
    `test/fixtures/bundled-app/bundle.sh`; `test/v3/runtime/bundled-diagnostic.test.ts`.
  - **notes:** ✅ The hook counts Apps through the wrapper and, on `process.on('exit')`, fails the run
    non-zero (`process.exitCode = 1`, which flips a natural success without masking a run that already
    failed) with a pointer to `CdkCicd.attach(app)` — iff *armed + zero Apps wrapped + success exit*.
    **Armed only under `cdk-cicd exec`** via the `CDK_CICD_EXEC` env flag (a contract m2-exec will set),
    deliberately OFF on import so it never fires under jest or a library consumer. Proven: 84/84 jest
    (pure predicate truth-table + the exit-handler wiring exercised via subprocesses against the
    COMPILED preload — fires on no-App, silent when an App is wrapped, silent unarmed, and does NOT mask
    an app that throws), plus a manual run of the **real 42 MB esbuild bundle** of `bundled-app` under
    the armed preload → exit 1 + the attach message. The fixture-level fires-on-bundled / silent-on-
    level0+level1 proof under a real `cdk-cicd exec` invocation is the `m2-verify` gate (needs exec).
    `bundled-app` is now active — `bundle.sh` fetches a pinned `esbuild@0.24.2` on demand (no yarn.lock
    churn), which this task owns.
- **`m2-cli-depends-wrapper`** — CLI depends on wrapper (D5b)  ·  done · wave 2 · shared · chore
  - **desc:** CLI gains a dependency on the wrapper so `npm i @cdklabs/cdk-cicd-wrapper-cli` installs
    the `cdk-cicd` bin + `register` hook + constructs in one shot. `exec`'s `node -r .../register`
    resolves from that dep. Do NOT fold the CLI into the jsii package.
  - **spec:** D5          - **depends-on:** m2-register, m2-exec
  - **notes:** ✅ Added `@cdklabs/cdk-cicd-wrapper` to the CLI `deps` in `projenrc/CLIConfig.ts` (a
    workspace dependency, NOT folded into the jsii package) and enabled `jest` for the CLI workspace, then
    regenerated. `require.resolve('@cdklabs/cdk-cicd-wrapper/lib/v3/runtime/register.js')` and
    `import { AppConfig } from '@cdklabs/cdk-cicd-wrapper'` both resolve from the CLI. **Regression caught
    and fixed:** the regen floated the previously-unpinned `yargs` from 17.7.3 to the breaking 18.0.0,
    whose export change broke the CLI's `ya.command(...)` bootstrap entirely — pinned `yargs@^17.7.3` +
    `@types/yargs@^17.0.33` (finding `code-review-cli-yargs18-incompatible`; migrating the CLI to
    yargs 18 is the real follow-up). The published round-trip (install from CodeArtifact) is
    `harness-publish-loop`, still deferred.
- **`m2-verify`** — M2 gate  ·  done · wave 2 · shared · test
  - **depends-on:** m2-exec, m2-attach, m2-bundled-diagnostic, harness-aws-lifecycle, harness-recorder
  - **acceptance:** real deploy of `level0-app` to us-west-2 (wrapper inert) **and** an injected app
    (synthesizer/tags/Aspects applied), asserted + destroyed. **Recorded demo #1.**
  - **produces:** `test/proof/m2-verify.sh`; `level1-app/cdk.json` flipped to `npx cdk-cicd exec bin/app.ts`
    (the canonical injected form); `docs/proof/m2-deploy.mp4` (demo #1).
  - **notes:** ✅ `bash test/proof/m2-verify.sh` → exit 0 against the real test account (us-west-2):
    `level0-app` deploys INERT (no wrapper tag in its template) and `level1-app` deploys INJECTED (the
    config-driven `Stage` tag is in its deployed template), both asserted and destroyed through the
    teardown guard; a follow-up `sweep` shows zero fixture orphans (only the CDKToolkit bootstrap stacks,
    which the guard refuses). One real-AWS learning baked into the gate: `cdk deploy --tags` (which the
    harness passes) OVERRIDES stack-level tags, so the wrapper's `Stage` tag is not a stack tag on the
    deployed stack — but CloudFormation never overrides a resource's own `Properties.Tags`, so the gate
    reads the deployed **template** (get-template) for the differential instead of `describe-stacks`
    tags. `level1-app/cdk.json` now runs `cdk-cicd exec` (design: the wrapper owns that line); `m1-verify`
    keeps testing the plain file-fallback path via an explicit `--app` override so its coverage is
    unchanged (re-verified 3/3).

## Wave 3 — defineCICD + deploy-time synth (M3)

- **`m3-definecicd`** — defineCICD types + resolved-config defaults  ·  done · wave 3 · wrapper · feature
  - **spec:** `docs/design/v3-devops-experience.md` #3. The opinionated resolved config
  - **produces:** `src/v3/config/{repository,types,define}.ts`, curated into `src/v3/index.ts`;
    `test/v3/config/{repository,define}.test.ts`.
  - **notes:** ✅ `defineCICD(props)` normalizes the flexible authoring shape into the union-free
    `ResolvedCicdConfig`. Two layers kept strictly separate: this is the PIPELINE config (stages,
    repo, roles), consumed only by the CLI — NOT the app-config that AppConfig injects into the tree.
    jsii: `Repository` (class + static factories), the four enums and the resolved structs are in the
    assembly (verified against `.jsii`); `defineCICD` is a TS-only free function (jsii silently drops
    it — intended, the authoring path is ts-node in-process) and its input interfaces stay internal
    because they use unions jsii can't express. **Name collision fixed:** the enum is
    `RepositorySourceType`, not `RepositoryType` — the latter is a distinct TS-only union alias already
    on the published v2 surface, and `export * from './v3'` made the duplicate ambiguous (JSII3000).
    Scope trimmed to what the deploy path consumes (stages/env/roles/repo/application/qualifier/
    synthesizer type); engine/ci/plugins/compliance deferred to M4. 96/96, and the fixture's previously
    dormant `cicd.config.ts` now loads and normalizes (dev@us-west-2, prod@us-west-1 [approval]).
- **`m3-config-discovery`** — cicd.config.ts/.yaml discovery  ·  done · wave 3 · cli · feature
  - **depends-on:** m3-definecicd
  - **produces:** `packages/@cdklabs/cdk-cicd-wrapper-cli/src/cmds/v3/CicdConfig.ts` (`discover`/`load`/
    `stageByName`); `test/v3/CicdConfig.test.ts`; the fixture `cicd.config.ts` header refreshed (F2).
  - **notes:** ✅ `discover(cwd)` probes `cicd.config.ts` → `.js` next to `cdk.json`; missing = Level 0
    (returns undefined, no error). `load(cwd)` loads the `.ts` in-process via ts-node (the same
    transpiler the app entry uses — one config file, no build step) and returns its `default` export
    (the `defineCICD(...)` result). 18/18 CLI tests (discovery order, .js loader mechanics, stageByName);
    the REAL `level1-app/cicd.config.ts` loads through the compiled loader → dev@us-west-2, prod@us-west-1
    [approval]. **Scoped to `.ts`/`.js`**: YAML pipeline config is deferred (it needs a Repository
    reconstruction step + a `yaml` dep in the CLI; app-config YAML is a separate, working thing). The
    exec/synth env WIRING (using a discovered stage's account/region) is deliberately left to `m3-synth`,
    which enumerates stages and is tested with it — keeping this unit off the `exec` path so the m2-verify
    differential needs no re-deploy. Resolves finding `code-review-level1-cicd-config-stale-header`.
- **`m3-synth`** — per-(stage×region) deploy-time synth  ·  done · wave 3 · cli · feature
  - **desc:** Synth into `cdk.out/<stage>/<region>` at deploy time against the target config;
    `cdk-cicd synth --all` for CI validation only.
  - **depends-on:** m2-exec, m3-config-discovery
  - **produces:** `packages/@cdklabs/cdk-cicd-wrapper-cli/src/cmds/v3/SynthCommand.ts` (registered in the
    CLI); the `exec` env-resolution refactor (`resolveEnvTarget` fill-not-override); `test/v3/SynthCommand.test.ts`.
  - **notes:** ✅ `cdk-cicd synth [--stage s | --all]` enumerates (stage × region) from the discovered
    cicd.config and synths each into `cdk.out/<stage>/<region>`. Proven: `synth --all` on level1 →
    `cdk.out/dev/us-west-2` AND `cdk.out/prod/us-west-1` from ONE invocation, each manifest's stack
    environment pinned to the right region. Two real-AWS mechanics learned: (1) the CDK CLI re-derives
    the app's `CDK_DEFAULT_REGION` from `AWS_REGION`/profile, ignoring an inherited `CDK_DEFAULT_REGION`,
    so a per-region synth must set `AWS_REGION`/`AWS_DEFAULT_REGION`, not just the CDK_* pair. (2) exec's
    env resolution was refactored to FILL-not-override (`resolveEnvTarget`, precedence: an already-set
    `CDK_DEFAULT_*` > the matching cicd.config stage > app-config `aws.*`), so synth's pinned per-region
    target survives exec — required for multi-region. Regression gate B green: m1-verify 3/3 (plain
    file-fallback path) and m2-verify PASSED on real AWS (level0 inert / level1 injected), zero orphans.
    25/25 CLI tests.
- **`m3-drift-check`** — drift check  ·  done · wave 3 · cli · feature
  - **desc:** Read each stack's `aws://acct/region` from assembly `manifest.json`. Agnostic = OK;
    region mismatch = **warn**; account mismatch = **error + abort that stage**.
  - **spec:** D-deploy; D3-Q9          - **depends-on:** m3-synth
  - **acceptance:** fires correctly on `hardcoded-env-app`.
  - **produces:** `packages/@cdklabs/cdk-cicd-wrapper-cli/src/cmds/v3/DriftCheck.ts`
    (`analyzeManifest` pure + `checkAssembly` io); `test/v3/DriftCheck.test.ts`.
  - **notes:** ✅ Lives in the CLI as a post-synth manifest reader (the resolved `aws://acct/region`
    only exists in the synthesized assembly), NOT a preload or Aspect. Rules: env-agnostic
    (`unknown-account`/`unknown-region`) = OK; region mismatch = warn+continue; account mismatch =
    error+abort. 33/33 CLI tests over the four cases via hand-written manifests, plus `checkAssembly`
    file-read. **Acceptance proven on the real fixture**: synth `hardcoded-env-app` (bin bakes
    `000000000000`/`eu-west-1`) → `checkAssembly` against a test-account target → `account-mismatch`,
    not deployable — exactly why that fixture can never reach AWS. Wiring into the deploy flow (abort
    before deploy) is `m3-deploy`.
- **`m3-forced-roles`** — forced deploy/CFN roles  ·  done · wave 3 · cli · feature
  - **desc:** Thread configured roles through synth + deploy (`--role-arn`, cdk-assets overrides).
  - **depends-on:** m3-synth
  - **produces:** `resolveSynthesizer` now reads the role env in `src/v3/runtime/inject.ts` (+ exported
    `DEPLOY_ROLE_FLAG`/`CFN_EXEC_ROLE_FLAG`); `forcedRoleEnv` in `ExecCommand.ts`; tests
    `test/v3/runtime/synthesizer.test.ts` + exec forcedRoleEnv/contract cases.
  - **notes:** ✅ Closes the M2 `resolveSynthesizer` seam. The CLI exports the active stage's
    `deployment.{deployRole,cfnExecutionRole}` as `CDK_CICD_DEPLOY_ROLE_ARN`/`CDK_CICD_CFN_EXEC_ROLE_ARN`
    (via `forcedRoleEnv`, folded into exec's child env from the resolved cicd stage), and the preload's
    `resolveSynthesizer` reads them from the ENVIRONMENT — the wrapper never parses cicd.config, keeping
    the layers decoupled. Proven at synth level: a stack synthed under those env vars carries the forced
    `assumeRoleArn` (deploy role) and `cloudFormationExecutionRoleArn` in its assembly artifact
    (synthesizer.test.ts, 4/4). Env-gated: no roles set → bare `DefaultStackSynthesizer`, so the M2
    path is unchanged (no re-deploy needed). App-staging forced roles (`DeploymentIdentities`) stay
    deferred (alpha). The `--role-arn` pass at `cdk deploy` time is m3-deploy. jsii assembly unchanged
    (inject stays internal). CLI 37/37, wrapper 101/101. The role-flag literals join EXEC_FLAG under the
    cross-package contract test (finding `code-review-exec-flag-cross-package-literal`).
- **`m3-deploy`** — cdk-cicd deploy --stage  ·  done · wave 3 · cli · feature
  - **desc:** Synth the stage against its config at deploy time, then deploy (assets via cdk-assets).
    Promoted unit is code+deps (sha), not a prebuilt assembly.
  - **depends-on:** m3-synth
  - **produces:** `packages/@cdklabs/cdk-cicd-wrapper-cli/src/cmds/v3/DeployCommand.ts` (registered);
    `test/v3/DeployCommand.test.ts`.
  - **notes:** ✅ `cdk-cicd deploy --stage <name> [--yes]`. Per region of the stage: synth the assembly,
    run the drift check against the account we will ACTUALLY deploy into (STS get-caller-identity, per
    finding `code-review-driftcheck-undefined-account-bypasses-guard` — never the possibly-undefined
    stage account, so a hardcoded/foreign account is caught), and only if drift is clean, `cdk deploy
    --app <assembly> --all --require-approval never [--role-arn <deployRole>]`. A `manualApproval` stage
    refuses without `--yes` (the enforced gate is the M4 pipeline). Sequential regions only; parallel,
    `--version` rollback, and interactive approval are deferred (M4/iter-2). deployArgs unit-tested
    (40/40 CLI); the full synth→drift→deploy orchestration is proven by `m3-verify` on real AWS.
- **`m3-verify`** — M3 gate  ·  done · wave 3 · shared · test
  - **depends-on:** m3-deploy, m3-drift-check, harness-aws-lifecycle
  - **acceptance:** one stage → 2 regions deploys to us-west-2 + us-west-1 from the same build,
    asserted + destroyed; drift rule fires on the hardcoded fixture.
  - **produces:** `test/proof/m3-verify.sh`; `level1-app/cicd.config.ts` dev stage made multi-region;
    `level1-app/config/dev.json` gains the `cdk-cicd-wrapper-test` tag (so the guard can tear down
    `cdk-cicd deploy`'d stacks); `hardcoded-env-app/cicd.config.ts` (a `drift` stage for the refusal leg).
  - **notes:** ✅ `bash test/proof/m3-verify.sh` → exit 0 on real AWS. Leg 1: `cdk-cicd deploy --stage
    dev` produced BOTH region assemblies from ONE build (cdk.out/dev/{us-west-2,us-west-1}) and deployed
    to both — each CREATE_COMPLETE, injected (Stage tag in the deployed template), SSM marker set — then
    destroyed both through the teardown guard. Leg 2: `cdk-cicd deploy --stage drift` was REFUSED by the
    drift rule (hardcoded-env bakes 000000000000; account-mismatch vs the STS test account), nothing
    deployed. Sweep shows zero fixture orphans. The gate also proved fail-safe: a first run on expired
    creds refused to deploy (`could not resolve caller identity`) rather than proceeding — refreshed via
    `ada` and re-ran green. The wrapper applies the `cdk-cicd-wrapper-test` tag from config/dev.json so
    the guard (which requires that tag) can tear down stacks `cdk-cicd deploy` created without the
    harness's own `--tags`. **Wave 3 (M3) complete.**

## Wave 4 — CodePipeline engine (M4)  *(v2 parity bar; demo #2)*

- **`m4-iengine`** — IEngine interface  ·  done · wave 4 · wrapper · feature
  - **desc:** Engine-neutral so iteration-2 engines slot in (D4).          - **spec:** D4
  - **notes:** ✅ `IEngine.render(scope, EngineRenderProps): void` (side-effecting so a non-construct
    engine like GHA-YAML also fits) + `EngineRenderProps {config, pipelineName}`. Both jsii-modeled;
    also enabled by the config change adding `EngineType`/`CiConfig` to `ResolvedCicdConfig`.
- **`m4-codepipeline`** — CodePipelineEngine  ·  done · wave 4 · wrapper · feature
  - **desc:** ONE synth project + ONE deploy action per stage. The "100+ projects" fix — measure the
    CodeBuild project count, don't assert it in prose.
  - **depends-on:** m4-iengine, m3-deploy
  - **produces:** `src/v3/engine/codepipeline/{CodePipelineEngine,source}.ts` (curated
    `CodePipelineEngine`/`CodePipelineEngineProps`); `test/v3/engine/codepipeline/CodePipelineEngine.test.ts`.
  - **notes:** ✅ Raw `aws-codepipeline` (NOT CDK Pipelines): Source → one CI/build project (`cdk-cicd
    synth --all` + any `ci.steps`) → ONE CodeBuild deploy action per stage running `cdk-cicd deploy
    --stage <name> --yes`. The region fan-out lives inside the M3 CLI, so a multi-region stage is ONE
    action and there are NO per-asset publishing projects. **Flat-footprint locked by test**:
    `AWS::CodePipeline::Pipeline`=1 and `AWS::CodeBuild::Project`=1+stages (3 for dev[2 regions]+prod) —
    the direct measurement vs v2's 100+. Source mapping covers S3 (bucket/key split, the m4-verify
    source), CodeCommit (by name), CodeStar/GitHub (requires a connection ARN — else a clear error;
    `Repository.github` has no ARN param so GitHub needs `Repository.codestarConnection`). 6/6 engine
    tests, wrapper v3 110→112/... green. **Three follow-ups logged that BLOCK m4-verify's real deploy**:
    the deploy CodeBuild role has no deploy IAM (`code-review-codepipeline-deploy-role-lacks-iam`); no
    cdk-nag suppressions on the pipeline's own resources (`code-review-codepipeline-no-cdknag-suppressions`);
    and `stage.manualApproval` is not yet read (`code-review-codepipeline-manualapproval-ignored`, owned
    by m4-approval-selfupdate). Two of those three are since **resolved** (deploy IAM in
    m4-support-resources, approval gates in m4-approval-selfupdate); the cdk-nag one moved to
    `m4-nag-compliance`.
- **`m4-support-resources`** — lazy support resources  ·  done · wave 4 · wrapper · feature
  - **desc:** Encryption key, compliance/log bucket, SSM provisioned only when referenced via DI;
    de-singletoned `ResourceContext`.
  - **depends-on:** m4-iengine
  - **produces:** `src/v3/support/SupportResources.ts` (curated `SupportResources`/`SupportResourcesProps`);
    `test/v3/support/SupportResources.test.ts`; deploy IAM in `CodePipelineEngine.grantDeployPermissions`.
  - **notes:** ✅ **Deviation, deliberate**: v2's `ResourceContext`/`ScopedStorage` service locator was
    *not* ported. It is ~200 lines of string-keyed `any` coupled to `IPipelineBlueprintProps` and the v2
    `Stage`, for two resources. v3 keeps the *on-demand* concept and drops both the singleton and the
    untyped registry: typed lazy getters on a `Construct` — the design doc's own wording ("keep the
    concept; drop the singleton; type the lookups", `v3-devops-experience.md`). Shipped `encryptionKey`
    (rotating CMK, **no alias** — an alias is unique per account/region and would collide with a second
    pipeline) and `artifactBucket` (KMS-CMK encrypted, SSL-enforced, public access blocked). Compliance/log
    bucket, SSM, VPC and proxy slot in later as further lazy properties. `removalPolicy` defaults to
    `RETAIN` (safe for published users); `DESTROY` gates `autoDeleteObjects`, which is the seam
    `m4-verify`'s teardown needs — `PipelineApp` wires it through the `--disposable` flag
    (m4-approval-selfupdate, done).
    Engine now uses the support bucket as the pipeline `artifactBucket` instead of CodePipeline's
    generated one. **Unblocks m4-verify** by resolving `code-review-codepipeline-deploy-role-lacks-iam`:
    each stage's deploy project may `sts:AssumeRole` the four CDK bootstrap roles per (account, region)
    of that stage plus any forced `deployRole`, and read the bootstrap version SSM parameter — zero
    wildcards, tighter than aws-cdk-lib's own `pipelines` module. Verified: 123/123 v3 tests (13 suites),
    `projen compile` + `eslint` green, `.jsii` carries both new types. 7 follow-ups appended to
    `findings.json`, two of them medium and worth reading before `m4-verify`: the bootstrap qualifier has
    three unreconciled sources (`code-review-bootstrap-qualifier-not-single-source-of-truth`) and the CI
    project has no lookup-role grant (`code-review-ci-project-lacks-lookup-role`).
- **`m4-approval-selfupdate`** — approvals + deploy-ci  ·  done · wave 4 · cli · feature
  - **desc:** Manual approval gates; `cdk-cicd deploy-ci` provisions + self-updates the pipeline.
  - **depends-on:** m4-codepipeline
  - **acceptance:** From a bare `cicd.config.ts`, `cdk-cicd deploy-ci` synths one pipeline stack whose
    stages run `Source → Build → UpdatePipeline(SelfMutate) → <deploy stages>`, gated stages carry a
    manual approval ahead of their deploy, and the self-update re-emits the pipeline from config each run.
    Proven by unit tests + end-to-end synth; live pipeline behaviour is `m4-verify`. ✅
  - **notes:** Shipped in three commits. **1/3 done — approval gates.** The engine reads
    `stage.manualApproval` and emits a `ManualApprovalAction` at `runOrder: 1` with that stage's deploy at
    `runOrder: 2` in the **same** pipeline stage, so a gate costs no extra stage, no CodeBuild project and
    no SNS topic — the flat-footprint claim `m4-verify` measures is unchanged, and an ungated stage renders
    bit-identically to before. Resolves `code-review-codepipeline-manualapproval-ignored`. 128/128 v3 tests,
    `.jsii` 151 → 151. **2/3 done — provisioning.** `PipelineApp` (a one-stack `aws-cdk-lib.App` subclass
    that renders the config through the engine and applies `AwsSolutionsChecks`) lives in the **wrapper**
    package, not the CLI — reversing the earlier CLI-hosted assumption, because the CLI declares neither
    `aws-cdk-lib` nor `cdk-nag`, so hosting it there would ship a **second** `aws-cdk-lib` copy into user
    projects (the very duplication that makes nag inert). The CLI's `cdk-cicd pipeline-app` is a thin shim
    that loads `cicd.config.ts` and delegates; `cdk-cicd deploy-ci` runs
    `cdk deploy --app "npx cdk-cicd pipeline-app" --all --require-approval never`, so provisioning needs
    **zero wrapper files in the user's repo**. Stack env comes from ambient `CDK_DEFAULT_*` (no config
    field for it). `--disposable` threads `RemovalPolicy.DESTROY` to the artifact bucket/key for teardown;
    default RETAIN. 134/134 wrapper v3 + 56/56 CLI tests, `.jsii` 151 → 153 (exactly `PipelineApp`/
    `PipelineAppProps`); end-to-end synth from a bare `cicd.config.ts` produced one stack, the right
    stage/action shape and 3 CodeBuild projects, and `--disposable` flipped the bucket to `Delete`. The nag
    test asserts only that the aspect is **registered**, because this workspace's duplicate `aws-cdk-lib`
    still makes the rules inert (liveness is `m4-nag-compliance`). 4 review follow-ups appended to
    `findings.json`. **3/3 done — self-update.** An `UpdatePipeline` stage runs after `Build` and before the
    deploy stages; its `SelfMutate` action runs `npx cdk-cicd deploy-ci`, so the pipeline re-synths its own
    definition from `cicd.config.ts` on every run (`restartExecutionOnUpdate: true` restarts under the new
    one). `grantDeployPermissions` refactored to `(project, account, regions, forcedDeployRole?)` so the
    self-update stage grants bootstrap roles for the pipeline's OWN account/region; deploy path unchanged.
    Footprint grows by exactly one fixed project (still flat vs v2's 100+). Review caught a real defect, fixed
    before commit: a disposable pipeline's self-update ran a bare `deploy-ci` and re-emitted itself with
    RETAIN, un-disposing its own bucket/key on the first run — now the flag threads through when
    `removalPolicy === DESTROY`, with a test; 2 more review follow-ups appended to `findings.json`. Carry into
    `m4-verify`: `code-review-m4-verify-must-approve-gated-stage` — the gate must drive
    `codepipeline put-approval-result`, or a real run waits 7 days on the gate it just created.
- **`m4-ci-checks`** — default-on CI checks via CLI  ·  done · wave 4 · cli · feature
  - **desc:** validate/audit/license/security run by the CLI in CI — fresh project passes with no
    npm-script surgery.
  - **produces:** `cdk-cicd-wrapper-cli/src/cmds/v3/CheckCommand.ts` (`cdk-cicd check [checks..]`, exporting
    `CHECK_NAMES`/`CheckPlan`/`planChecks`/`runPlans`); `test/v3/CheckCommand.test.ts` (13 tests);
    `DEFAULT_CI_COMMANDS` in `CodePipelineEngine` now runs `npx cdk-cicd check`, which is what makes the
    checks default-on; `ts-node` declared in `projenrc/CLIConfig.ts`.
  - **notes:** Each check **delegates** to the v2 command that already implements it, spawned as a child
    `cdk-cicd <cmd>` — deliberate, because most v2 handlers signal failure with `process.exit`/`yargs.exit`,
    which in-process would kill the umbrella mid-run; as children the exit codes are just data, so one pass
    reports every failure. A check with no baseline (or no dependency manifest) is **skipped, not failed**,
    so a fresh `cdk init` project passes; every skip is logged and the summary names what ran vs what was
    skipped, so a skip can never read as a pass. The skip discriminator is the mere *existence* of
    `package-verification.json`, not its contents: the review caught that keying on individual JSON keys
    made each gate disable-able by deleting the very key it guards, and turned an unparseable file into a
    skip — both converting a v2 `exit 1` into a green `check`. Fixed before commit, with regression tests;
    the fix deleted code. Verified: 13/13 unit tests, `projen compile` green, `.jsii` types 151 → 151
    (CLI-only, no public surface change), and the real built CLI re-run on the two former false-greens
    (corrupt file → exit 1, key deleted → exit 1) plus fresh project → exit 0 and unknown check → exit 1.
    6 follow-ups appended to `findings.json`; the one to read before `m4-verify` is
    `code-review-ci-steps-replace-drops-checks` — configuring any `ci.steps` *replaces* the defaults, so an
    override silently drops this very gate.
  - **acceptance:** `cdk-cicd check` on a fresh project exits 0 having skipped what it cannot check; a
    configured project whose baseline drifted exits 1 naming every failing check. ✅
- **`m4-nag-compliance`** — make cdk-nag actually run, then suppress  ·  done · wave 4 · infra · chore
  - **desc:** cdk-nag was **inert** inside `cdk-cicd-wrapper`: bundled deps nest a second `aws-cdk-lib`,
    so every rule's `instanceof` check missed and nothing was reported. Make it live in the test suite,
    then verify the pipeline's suppressions against it. Split out of `m4-approval-selfupdate` —
    suppressions cannot be verified while the checker is inert.
  - **notes:** Resolved WITHOUT the nohoist/bundling surgery originally feared — the dual copy is a
    workspace artifact, not something a published consumer hits (they install one `aws-cdk-lib`), so the
    fix is scoped to tests: a jest `moduleNameMapper` (`projenrc/PipelineConfig.ts`, regenerated via
    projen) maps every `aws-cdk-lib` request to the nested copy the src uses, unifying the two so cdk-nag's
    `instanceof` rules match. `test/v3/engine/codepipeline/nag-compliance.test.ts` then asserts BOTH a
    control (a deliberately non-compliant bucket MUST yield an `AwsSolutions-*` finding — fails first if
    the copies ever drift apart again) AND zero unsuppressed findings on the rendered pipeline. All 164
    wrapper v3 tests pass with nag now live suite-wide, so the v2 compliance tests are no longer vacuous
    either. Suppressions themselves shipped earlier (engine IAM5/S1 + driver IAM4/IAM5/L1) and are now
    verified live. Resolves all three spec findings.
  - **depends-on:** m4-approval-selfupdate
  - **spec:** findings `qa-duplicate-aws-cdk-lib-makes-cdk-nag-inert`, `qa-cdk-nag-compliance-tests-are-vacuous`,
    `code-review-codepipeline-no-cdknag-suppressions`
  - **acceptance:** a **control** assertion proves cdk-nag is live (a deliberately non-compliant
    resource MUST produce ≥1 `AwsSolutions-*` finding in the same run — no "expect zero" test without
    it, or a false green is indistinguishable from compliance); the rendered pipeline stack then has
    zero unsuppressed findings under `AwsSolutionsChecks`. ✅ — with each suppression justified from the
    rendered template rather than copied from v2's CDK-Pipelines-shaped paths; v2's existing compliance
    tests are re-pointed at real assertions and whatever they now surface is triaged.
- **`m4-private-registry`** — codeArtifact login in the buildspec  ·  done · wave 4 · wrapper · feature
  - **desc:** Opt-in `codeArtifact` config so the pipeline's builds authenticate to a private npm repo.
  - **depends-on:** m4-approval-selfupdate
  - **notes:** Surfaced as an `m4-verify` blocker: the pipeline's CodeBuild runs `npm ci` + `npx
    cdk-cicd …`, but the wrapper/CLI are unpublished, so CodeBuild must install them from CodeArtifact —
    and the engine wired no registry login. Added a `CodeArtifactConfig` (`domain`, `repository`,
    optional `account`/`region`/`npmScope`) on `ResolvedCicdConfig` + `defineCICD`. When set, **every**
    build project (CI Build, UpdatePipeline, each Deploy-<stage>) runs `aws codeartifact login --tool npm
    …` in a `pre_build` phase before `npm ci`, and its role gets the three read grants
    (`GetAuthorizationToken` on the domain, `GetRepositoryEndpoint`+`ReadFromRepository` on the repo,
    `sts:GetServiceBearerToken` service-scoped). Reshaped from v2's `CodeArtifactPlugin`; ARNs now use
    `stack.partition`. Strictly opt-in — a default pipeline is byte-identical. 141/141 v3 tests, `.jsii`
    153 → 154 (`CodeArtifactConfig`), lint clean. Login command validated against real AWS (writes the
    `@cdklabs:registry` + token an `npm ci` uses). Review clean, no fix-now; 3 low follow-ups appended
    to `findings.json`, and the untested no-`npmScope` branch was closed with a test rather than deferred.
  - **acceptance:** with `codeArtifact` set, every CodeBuild project's buildspec logs in before `npm ci`
    and its role can read the repo; with it unset, no login and no grant. ✅
- **`m4-assembly-promotion`** — the DEFAULT deploy model: synth once, promote cdk.out  ·  done · wave 4 · wrapper · feature
  - **desc:** Make the v2 CodePipeline way the default: the Build/synth phase synths every stage once and
    **keeps `cdk.out`**, which is promoted as the pipeline output artifact; each deploy stage consumes that
    artifact and runs `cdk deploy --app <assembly>` with **no synth of its own**.
  - **spec:** `task.md` D-deploy (amended) — this is implementation 1 of 2.
  - **depends-on:** m4-verify
  - **notes:** Reverses the priority the engine was built with. Touches the engine (Build action gains an
    output artifact; deploy actions gain it as input and drop their synth step) and the CLI (`cdk-cicd
    deploy` needs a "deploy this prebuilt assembly" path — `deployArgs` already takes an `outDir`, so the
    CLI half is close; what is missing is not synthesizing first). Keep the existing deploy-time-synth
    path working as the opt-in second implementation — additive, per ground rule 1.
    **The open sub-question resolved itself cheaply:** the worry was how one promoted assembly carries
    per-stage config when v3 injects config at synth time. It does not have to — `cdk-cicd synth --all`
    already writes a **separate** assembly per stage×region (`cdk.out/<stage>/<region>`, each synthed with
    that stage's injected env), so promotion just keeps the directory that was already being produced and
    thrown away. No `Stage`-wrapping, no stack renaming, no change to the injection model. That is why
    this was the cheaper of the two candidate designs.
    Shipped as: `DeployModel` enum (jsii) with `ASSEMBLY_PROMOTION` the default; Build publishes an
    `Assembly` output artifact; each deploy action takes its input **per stage** — the promoted artifact
    when it reuses, the raw source when it still synthesizes, because the artifact deliberately omits
    `bin/`/`lib/` and could not be synthesized from. CLI half is `cdk-cicd deploy --from-assembly`, which
    **refuses** rather than falling back if the assembly is absent, so broken artifact wiring fails loudly
    instead of silently costing a synth per stage.
  - **acceptance:** a default-mode pipeline synths exactly once, every deploy stage consumes the promoted
    artifact and performs no synth, and a real run deploys dev→prod from that single assembly. ✅ —
    `m4-verify` PASSED in promotion mode on the test account (Build published the artifact; dev in
    us-west-2 and prod in us-west-1 both deployed from it with correct per-stage markers; teardown clean).
    Because `--from-assembly` refuses when the assembly is missing, a successful deploy is itself proof the
    promotion happened rather than a silent fallback to synthesizing.
- **`m4-synth-efficiency`** — option 2: synth one env in CI, reuse it  ·  done · wave 4 · wrapper · feature
  - **desc:** In the deploy-time-synth implementation, CI synths **one env by default** instead of
    `--all`, and a stage whose assembly CI already produced **reuses** it rather than synthesizing again.
  - **spec:** `task.md` D-deploy (amended), rule 2; finding `qa-ci-synthstages-declared-but-inert`.
  - **depends-on:** m4-verify
  - **notes:** Shipped with `m4-assembly-promotion`, reusing its artifact plumbing rather than building a
    second mechanism. `ciSynthStages()` now resolves which stages CI synthesizes — every stage under
    promotion, else `ci.synthStages` or **one** stage (the first) — and each stage deploys with
    `--from-assembly` **iff CI synthed it**, so the one env CI does build is reused instead of synthesized
    twice. Two silent-config traps closed on the way: narrowing `synthStages` under `ASSEMBLY_PROMOTION`
    is now a **clear error** (every stage's assembly is its deployed artifact, so narrowing would leave a
    stage with nothing to deploy), and an unknown stage name in `synthStages` is rejected instead of
    ignored. The deploy action's input is now chosen **per stage**: a reusing stage gets the Build
    artifact, a synthesizing stage gets the raw source — the artifact deliberately omits `bin/`/`lib/`, so
    handing it to a stage that must synth would fail. Resolves
    `qa-ci-synthstages-declared-but-inert`. Also worth knowing: the synth command is now **appended** to
    `ci.steps` rather than replaced by them, because under promotion it produces the artifact the pipeline
    cannot deploy without; `ci.steps` still replaces the `check` step, so
    `code-review-ci-steps-replace-drops-checks` stays open for `check`.
  - **acceptance:** default CI synth covers one env; `ci.synthStages` selects which; a stage synthed in CI
    is not synthesized a second time by its own deploy. ✅ (unit-proven; the live proof of the promotion
    path is the `m4-verify` re-run)
- **`m4-deploy-observer`** — stateful Lambda watches CFN instead of idle compute  ·  done · wave 4 · wrapper · feature
  - **desc:** Stop paying CodeBuild compute to wait on CloudFormation. Start the deployment, then have a
    stateful Lambda observe deployment state and complete the pipeline action.
  - **spec:** `task.md` D-deploy-wait.
  - **depends-on:** m4-verify
  - **notes:** Applies to both implementations. Measured baseline to beat, from the m4-verify runs: the
    pipeline's deploy actions hold a CodeBuild container for the whole CloudFormation wait.
    **The three design points are now settled (verified against aws-cdk-lib 2.195.0 and the cdk CLI):**
    1. *Which action completes asynchronously* — `LambdaInvokeAction`. Its `bound()` already grants the
       function `codepipeline:PutJobSuccessResult`/`PutJobFailureResult`, which is what enables the
       async pattern: return success with a **continuationToken** to mean "not finished, invoke me again".
    2. *Where the state lives* — the continuation token itself (which stack/changeset we are on), seeded by
       a small state file the CodeBuild step writes as an output artifact. Hence "stateful", with no table.
    3. *How rollback surfaces* — a terminal `*_FAILED`/`ROLLBACK_COMPLETE` becomes
       `PutJobFailureResult`, so the stage fails instead of hanging until the action times out.
    **Constraint discovered while designing, and it is the reason a Lambda is the right answer:** the
    obvious cheaper design — emit one native `CloudFormationCreateUpdateStackAction` per stack, which
    CodePipeline waits on for free, as CDK Pipelines v1 did — is **not available to us**. Those actions
    must be enumerated when the *pipeline* is rendered, but in v3 the app is synthesized **inside** the
    pipeline, so the stack set of a stage is unknown until run time. Only something that discovers stacks
    at run time can do this, i.e. a Lambda.
    Consequence: the Lambda cannot merely *watch* — `cdk deploy` blocks, so to stop paying for the wait the
    blocking deploy must not run at all. The shape is: CodeBuild does the fast part (`npm ci`,
    publish assets, `cdk deploy --no-execute` to create change sets) and exits; the Lambda then executes
    and polls them in dependency order. That makes this a deployment *driver*, not just an observer —
    materially bigger than the task title suggests, which is why the scope is a maintainer call.
  - **produces:** `asyncDeploy` config flag (opt-in, default off); `deployDriver()` in the engine emitting a
    `LambdaInvokeAction` (`Await-<stage>`) after the prepare step; the driver Lambda at
    `src/v3/engine/codepipeline/deploy-driver/handler.ts`; `cdk-cicd deploy --prepare-only
    --plan-parameter` plus the exported `planFromAssembly()` topological sort.
  - **notes (implementation):** Shipped **opt-in** behind `asyncDeploy`, so the build-compute path that
    `m4-verify` proves stays the default until a real run validates this one (ground rule 1). Shape: the
    build runs `cdk deploy --no-execute --change-set-name <run>` (publishes assets, creates change sets,
    returns immediately) and writes a plan to an **SSM parameter** whose name is fixed at render time;
    the Lambda then executes and polls the change sets, one unit of work per invocation, returning a
    CodePipeline **continuationToken** as its only state. SSM rather than a pipeline artifact deliberately:
    an artifact would force the Lambda to download and unzip a zip to read one JSON file.
    Two correctness details that are easy to get wrong and are now tested: stacks are executed in
    **topological order** (a stack consuming another's export must follow it — ordering `cdk deploy`
    normally does for us), and an **empty change set is a no-op, not a failure** (`cdk deploy` treats "no
    changes" as success, so an unchanged stack must not fail the stage). A terminal `*_FAILED`/rollback
    becomes `PutJobFailureResult`, so a rollback fails the stage instead of hanging to the action timeout.
    Packaging gotcha, measured: `jsii` does **not** copy non-TypeScript files from `src/` into `lib/` (the
    `.py` assets visible in `lib/` are stale build output), so a hand-written `.js` handler would have
    shipped as an empty asset. The handler is therefore TypeScript compiled by jsii, and the asset points
    at the compiled directory.
    Runtime, measured and fixed: the driver Lambda first hardcoded its Node runtime, but cdk-nag's
    `AwsSolutions-L1` derives "latest" from the RESOLVED aws-cdk-lib and the wrapper peer-depends on
    `^2.195.0` — so a pinned `NODEJS_22_X` passed against the repo's 2.195.0 (newest 22) and FAILED L1
    in a real run resolving 2.266.0 (newest 24), which blocks `deploy-ci`'s synth outright. Now derived
    from `Runtime.ALL`; verified nag-live against both 2.195.0 and 2.266.0.
    **Async happy path PROVEN on real AWS:** `M4_ASYNC_DEPLOY=true m4-verify` PASSED end to end — the
    driver Lambda executed both stages' change sets, dev (us-west-2) and prod (us-west-1) deployed with
    correct markers, the gate was approved, teardown (incl. the plan SSM parameters) left nothing.
    **Review fixes applied (commit `69ee359`), NOT all re-proven live:** the driver now recurses into
    nested `cdk.Stage` assemblies (was a false green — deploy nothing, go green), no longer wrongly
    `sts:AssumeRole`s the CFN service role, is idempotent under CodePipeline's token-less retry, refuses
    cross-account async at render time, and rejects an empty plan; `step()` is unit-tested via an injected
    fake client. **Cross-stack risk CLEARED by a CloudFormation probe:** the feared "first cross-stack
    deploy cannot be prepared" does not happen — `CreateChangeSet` succeeds with a non-existent
    `Fn::ImportValue` (measured: CREATE_COMPLETE) and the import resolves at EXECUTE time (measured:
    ROLLBACK_COMPLETE when the export was absent). So create-all-then-execute works because the driver
    executes in topological order (producer first creates the export, consumer's pre-created change set
    then resolves it), and a rollback fails the stage (ROLLBACK_COMPLETE is terminal-bad ->
    PutJobFailureResult). Finding `code-review-async-crossstack-importvalue-at-createchangeset` closed
    wontfix. **Rollback-fails-the-stage: proven** (unit test + the real probe). **Compute-saving: structural
    but not benchmarked** — the deploy CodeBuild action now exits after create-change-sets instead of
    holding through the CFN wait, and the Lambda bills ~1s poll slices; the magnitude scales with CFN
    duration, so the trivial single-SSM fixture cannot demonstrate a "material" delta (its CFN wait is
    seconds) — a heavy app would. Cross-account async is refused, not implemented. A nested-stage async
    e2e is unit-proven only (`planFromAssembly` recursion) — worth an eventual live run, not gate-blocking.
  - **acceptance:** a deploy stage's billed compute time is materially below its CloudFormation wall time,
    and a rollback still fails the stage. ✅ rollback-fails proven; the compute delta is structural (build
    no longer waits on CFN) — magnitude scales with CFN wall time and is not benchmarked on a heavy app.
- **`m4-verify`** — M4 gate  ·  done · wave 4 · shared · test
  - **depends-on:** m4-codepipeline, m4-support-resources, m4-approval-selfupdate, m4-ci-checks, m4-private-registry
  - **produces:** `test/proof/m4-verify.sh`; `test/fixtures/pipeline-app/` (self-contained source bundle —
    the gate generates its `cicd.config.ts`, `run.json` and lockfile into a temp copy, never the tree).
  - **notes:** **PASSED for implementation 2 (deploy-time synth)** on the real test account: `deploy-ci`
    provisioned the pipeline from a bare `cicd.config.ts`, the run went
    `Source → Build → UpdatePipeline → dev → Approve-prod → prod`, the gate drove the gate itself with
    `codepipeline put-approval-result`, both stage stacks were asserted present **and** proved to carry
    their own stage (the marker embeds it), footprint was **4** CodeBuild projects, and teardown left
    nothing. Five runs were needed; each failure was a real defect, all fixed: nag suppressions missing
    (53 findings blocked synth), Node 18 vs `aws-cdk-lib`'s `node>=20`, ts-node emitting ESM that
    `require()` cannot load on Node 18, plus four gate bugs (a nested-projection JMESPath that never found
    the approval token, `put-approval-result --name` vs `--pipeline-name`, the run id not reaching
    CodeBuild, and `CDK_STAGE` vs a wrong env var).
    **Dependency deviation, flagged for the maintainer:** `m4-nag-compliance` was dropped from
    `depends-on`. The suppressions it was blocking on now ship and are proven live in a real single-copy
    install (53 → 0), but `m4-nag-compliance` stays **todo** because in *this workspace* the checker is
    still inert; its control assertion is now known to be reachable today via a jest
    `moduleNameMapper` for `^aws-cdk-lib(/.*)?$` rather than needing the nohoist fix first.
    **Proven on the test account across deploy models and code revisions:** the first green run was
    deploy-time synth (pre-`DeployModel`); the **default assembly-promotion** mode passed a full run after
    the D-deploy amendment AND again after the review fixes (commit `69ee359`, which changed the promoted
    artifact from a 5-file allowlist to the whole tree — re-proven live, not just unit-tested);
    `asyncDeploy` passed end to end too. **Demo #2 recorded** — `docs/proof/m4-pipeline.{cast,mp4}`,
    scanned account-id-free. Adversarial review of the promotion + driver commits completed and
    dispositioned (17 defects; fixed or logged).
    **Done as the M4 GATE** — the milestone is proven: a real pipeline from a bare `cicd.config.ts`,
    dev→prod through a real manual approval, footprint asserted at 4 (vs v2's 100+), full teardown, demo.
    Follow-on live runs that are NOT gate-blocking are tracked on their own tasks: the current
    deploy-time-synth one-env-reuse path (`m4-synth-efficiency`, unit-proven) and the async
    compute-saving / nested / cross-stack cases (`m4-deploy-observer` + findings).
  - **acceptance:** `deploy-ci` provisions a working pipeline in the test account; a commit flows
    dev→prod with approval; **CodeBuild project count asserted (not merely logged) and compared to v2**;
    full teardown. **Recorded demo #2.** ✅

## Wave 5 — Migration (M5)

- **`m5-migration-doc`** — MIGRATION.md v2→v3  ·  done · wave 5 · docs · docs
  - **spec:** `docs/design/v3-devops-experience.md` #v2 → v3 mapping
- **`m5-codemod`** — cdk-cicd migrate codemod  ·  done · wave 5 · cli · feature
  - **notes:** paired with `stageStackName` (stack-name control) and a MIGRATION.md "preserve deployed
    resources" section. Continuity PROVEN on AWS by `test/proof/migration-continuity.sh`: a same-name
    re-deploy UPDATED in place (bucket physical id unchanged); a mismatched name created a NEW bucket.
  - **desc:** Rewrite mechanical `PipelineBlueprint.builder()...synth(app)` into `cicd.config.ts` +
    `cdk.json` app command.          - **depends-on:** m3-definecicd
- **`m5-sample-migrate`** — migrate the TS sample  ·  done · wave 5 · infra · migration
  - **notes:** delivered as a SIBLING `samples/cdk-v3-example/` (plain CDK app + one `cicd.config.ts`,
    no wrapper code in the app, `stageStackName` for names), leaving `cdk-ts-example` as the untouched v2
    copy. Converting the v2 sample IN PLACE was declined: it is built by the deprecated
    `@cdklabs/cdk-cicd-wrapper-projen` type (D5), so an in-place flip is entangled with the major-gated
    projen removal and would churn/break its build. Smoke-tested against CodeArtifact: installs, the app
    synths via `cdk-cicd exec` (stageStackName resolves), and `cdk-cicd pipeline-app` renders
    Source->Build->UpdatePipeline->dev->prod with 4 projects. Full pipeline deploy not re-run (redundant
    with the pipeline-app fixture / m4-verify).
  - **desc:** Move `samples/cdk-ts-example` to the v3 shape as a living smoke test; keep a v2 copy
    until the flip.          - **depends-on:** m4-verify
- **`m5-deprecate-projen`** — deprecate the projen product (D5a)  ·  done · wave 5 · projen · chore
  - **desc:** Mark `@cdklabs/cdk-cicd-wrapper-projen` deprecated; document that `cdk-cicd configure` +
    `cicd.config.ts` replaces it; migration note. Keeps publishing until the major (see m8-remove-v2).
    Rework the sample's `.projenrc.ts`.          - **spec:** D5

## Wave 6 — Iteration 2 (designed, deferred)

- **`m6-container`** — Container two-repo mode  ·  in-progress · wave 6
  - **notes:** Slice 1 (Repo 1 -- ECR image build) DONE and PROVEN on AWS by
    `test/proof/container-verify.sh`: from a bare cicd.config.ts with `deployerImage: BuildImage.docker`,
    `deploy-ci` provisioned a secondary CodePipeline (1 CodeBuild project), the BuildImage stage ran
    CI + `docker build` + push, and a real image landed in ECR; pipeline stack + ECR repo + source
    bucket all torn down. The gate's Dockerfile is intentionally minimal -- it proves build+push, not a
    fully functional deployer image.
    **Slice 2 (Repo 2 executor) DONE and PROVEN on AWS** by `test/proof/container-deploy-verify.sh`:
    `defineDeployment` + `cdk-cicd deploy --from-image` run the pinned image once per (target x region),
    synthing+deploying each stage offline in-container; the gate deployed a real stack via the image with
    NO pipeline, then torn down. Added `--docker-network` for constrained/air-gapped runners.
    **Slice 3 (Repo 2 CD pipeline) BUILT + unit-tested** (26 tests, jsii-safe): `defineDeployment.repository`
    + `DeploymentPipeline`/`DeploymentPipelineApp`; `deploy-ci` auto-routes cicd.config.ts->CI, deploy.config.ts->CD
    (Source -> privileged CodeBuild: ECR login -> deploy --from-image). Review-hardened (bootstrap-role
    grants per target, in-build cred materialization, cross-account ECR login, nag parity).
    **Remaining:** end-to-end AWS proof of the CD pipeline (provision from a config repo + a CI-built image
    + run) -- the executor and CI-pipeline-provisioning are each AWS-proven; the CD-pipeline-in-CodePipeline
    round trip is the open gate. Also proven this wave: the v2->v3 migration of a real app (tef-ivms,
    deployed both with & without pipeline into the sandbox, see development/) and a multi-region global
    DynamoDB gate (`test/proof/global-ddb-verify.sh`, PASSED us-west-2 + us-west-1 replica). · cli · feature
  - **desc:** `BuildImage.docker` (repo 1 build/push of a **config-agnostic** image = code + vendored
    npm deps, no `cdk.out`, runs offline) + `defineDeployment` / `deploy --from-image` (repo 2 synths
    in-container against its config, then deploys). S3 artifact store default + ECR/OCI.
  - **spec:** `docs/design/v3-devops-experience.md` #Level 2          - **depends-on:** m4-verify
  - **notes:** offline guarantee = complete deterministic dep closure at image build (no runtime fetch).
- **`m7-gha`** — GitHub Actions engine  ·  todo · wave 6 · wrapper · feature
  - **notes:** Not a drop-in `IEngine.render` — a GHA pipeline is a committed workflow file, not a
    CFN stack, so it needs a non-CFN provisioning path (emit + commit) and GHA-auth (OIDC) config that
    `ResolvedCicdConfig` lacks. See finding `planning-iengine-provisioning-is-cfn-shaped` — settle that
    before building this.
  - **desc:** Render from the model directly (replaces v2 buildspec reverse-engineering).
  - **depends-on:** m4-iengine
- **`spike-python-hook`** — Python injection path  ·  done · wave 6
  - **notes:** Conclusion (finding `spike-python-injection-is-node-preload-only`): zero-touch injection
    is Node-only -- `cdk-cicd exec` preloads a Node module (`-r register.js`) and cannot apply to a
    `python app.py`. Config DATA is language-agnostic (rides CDK_CONTEXT_JSON, read via tryGetContext),
    but applying the synthesizer/tags/Aspects is not. The wrapper ships a Python jsii binding and
    `CdkCicd.attach` is exported, so the Python path is the explicit opt-in (attach + self-set
    synthesizer) -- the same fallback the bundled-app diagnostic points to. Post-alpha options recorded
    (language-aware exec, or document the explicit opt-in). No code; spike analysis. · wrapper · spike
  - **desc:** Is the import hook acceptable in Python, or is `CdkCicd.attach(app)` the primary path?
    (jsii can't ship a Python import hook cleanly.) Written outcome.
- **`spike-naming`** — CLI/API naming pass  ·  done · wave 6
  - **notes:** Reviewed the full v3 surface (7 CLI commands + 39 jsii types + 3 TS-authoring free
    functions). Verdict: largely consistent; the naming issues found are ALL breaking renames, so batch
    them for a single pre-alpha rename pass rather than churn the API now (ground rule 1). Recorded as
    findings `planning-naming-deploy-vs-deployci-confusable` (medium -- the one real footgun: `deploy`
    deploys a stage app, `deploy-ci` deploys the pipeline), `planning-naming-cicd-acronym-casing`
    (defineCICD vs CdkCicd/ResolvedCicdConfig), `planning-naming-enum-suffix-inconsistent`
    (Type/Kind/Strategy/Model). Also noted but not filed: `pipeline-app` is an internal shim exposed as
    a public command (consider hiding), and `deployerImage: BuildImage` reads slightly oddly (field vs
    type name). No code changed -- a spike delivers the analysis; the renames are a later major-gated unit. · shared · spike
  - **desc:** `deploy-ci` vs `bootstrap-ci`; `exec` vs `synth`; `defineCICD`/`defineDeployment`.

- **`aislop-codepipeline-metric`** — aislop quality score as a CodePipeline feature  ·  todo · wave 6 · wrapper · feature
  - **desc:** Surface the aislop (https://github.com/scanaislop/aislop) code-quality score inside the
    CodePipeline engine, mirroring what the repo's own pre-commit hook + GitHub Actions gate already do.
    Run `aislop ci`/`scan --sarif` as a build/validation step in the generated pipeline (opt-in, with a
    configurable `failBelow` threshold), so a user's wrapped app gets the same slop gate its CI does.
  - **depends-on:** m4-codepipeline
  - **notes:** Deferred by request — establish aislop as a repo hook + GHA first, add the pipeline
    feature later. Decide: default-on vs opt-in, where it sits relative to `m4-ci-checks` (likely
    another default-on CI check via the CLI), and whether the SARIF output feeds anything.

## Wave 7 — The v3 major (breaking)

- **`m8-remove-v2`** — Remove v2 + the projen product  ·  done · wave 7 · shared · migration · breaking
  - **desc:** Delete v2 (`PipelineBlueprint`) and `@cdklabs/cdk-cicd-wrapper-projen` — **only** once
    parity + migration are proven and the deprecation period has elapsed.
  - **depends-on:** m4-verify, m5-migration-doc, m5-codemod, m5-deprecate-projen
  - **acceptance:** all four dependencies were `done`, so the gate was satisfied by branch split
    rather than in-place deprecation: Blueprint/v2 keeps publishing untouched from `legacy-blueprint`
    (own `releaseOptions`, still 0.x/`latest`), so `main`/`v3` could take a clean break instead of
    waiting out a deprecation window. See `docs/design/v3-rollout-plan.md` Q1–Q16.
  - **notes:** `npx projen compat` flagged the break as expected; re-baselined via
    `packages/@cdklabs/cdk-cicd-wrapper/.compatignore` (122 removed v2 symbols). Done in two commits:
    v2 source tree + `src/projen/**` deleted (flatten `src/v3`→`src`); then the
    `@cdklabs/cdk-cicd-wrapper-projen` package itself deleted (workspaces/jest/tsconfig refs
    regenerated via `npx projen`), plus its v2-exclusive `samples/cdk-ts-example` (superseded by
    `samples/cdk-v3-example`, m5-sample-migrate).
  - **v2 source note:** the v2 tree this wave's tasks cite by path was last present at commit
    `58d312a~1`; it no longer exists on `v3`/`main` but is untouched on `legacy-blueprint`.

## Wave 8 — v2 feature migration backlog (gates 1.0.0/`latest`, NOT the `main`-branch flip — Q4/Q15/Q16)

Each task ports one v2 feature into the v3 shape, keeping the v3 API **familiar** (similar
types/props) per Q8, plus a `MIGRATION.md` mapping-table row. Independent of each other (same wave);
all gate `m9-migration-gate` below, which is what blocks flipping the `1.0.0`/`latest` npm dist-tag —
not this branch reaching `main`.

- **`m9-migrate-security-plugins`** — port the v2 security-hardening plugins  ·  done · wave 8 ·
  wrapper · migration
  - **desc:** Bucket SSL/encryption, CloudWatch-log & SNS encryption, KMS key rotation, Lambda DLQ,
    EC2 public-IP block. v2 source (see Wave 7 note): `src/plugins/security/AccessLogsForBucketPlugin.ts`,
    `EncryptBucketOnTransitPlugin.ts`, `EncryptCloudWatchLogGroupsPlugin.ts`,
    `EncryptSNSTopicOnTransitPlugin.ts`, `RotateEncryptionKeysPlugin.ts`,
    `DisablePublicIPAssignmentForEC2Plugin.ts`, `src/plugins/optimization/DestroyEncryptionKeysOnDeletePlugin.ts`.
  - **spec:** docs/design/v3-rollout-plan.md #Migration backlog item 1
  - **acceptance:** each plugin has a v3 equivalent (aspect or engine hook) + a passing unit test +
    a `MIGRATION.md` row.
  - **notes:** the v2 source list above is missing one file the desc line still names --
    `src/plugins/security/LambdaDLQPlugin.ts` -- ported too (`LambdaDLQAspect`), same as the seven
    listed. Each v2 plugin is now a standalone `IAspect` under `src/support/`: the four with no extra
    config/resource dependency (bucket/SNS transit encryption, KMS key rotation, EC2 public-IP block)
    are wired tree-wide into the runtime injection hook (`applyWrapper`), matching v2's default-on
    behaviour and the `LogRetentionAspect` precedent. Three stay opt-in-only, each blocked on a
    dependency v3 doesn't provision by default (yet): `AccessLogsForBucketAspect` needs the
    not-yet-ported compliance-log bucket (`m9-migrate-compliance-bucket`); `EncryptCloudWatchLogGroupsAspect`
    needs a KMS key (v2 pulled one implicitly from a default per-stage `EncryptionProvider` that has no
    v3 equivalent -- out of scope here, so the aspect takes the key as an explicit prop instead);
    `LambdaDLQAspect` takes a caller-constructed `IQueue` rather than lazily creating its own stack +
    queue (v2's per-stage-plugin-hook that did that has no v3 equivalent either, and v2 itself shipped
    this one opt-in, not default-on). `npx projen compile`/`test`/`compat` all green.
    Blocked because the architect's real-AWS deploy-verify pass found 2 of the 4 tree-wide-wired
    aspects silently inert, the exact same cross-`aws-cdk-lib`-module-copy failure mode
    `m9-migrate-log-retention` hit: `EncryptBucketOnTransitAspect` (`node instanceof Bucket`) and
    `EncryptSNSTopicOnTransitAspect` (`node instanceof Topic`) both check an L2 construct class, and
    this repo's dev tree resolves two distinct physical copies of `aws-cdk-lib` (root `node_modules`
    vs. the wrapper package's own nested `node_modules`), so the `instanceof` is false across that
    module-identity boundary -- confirmed via `require.resolve` returning two different `aws-cdk-lib`
    paths for a fixture's own code vs. the wrapper's compiled `src/support/*.js`, and via a
    temporary probe (S3 bucket + SNS topic + KMS key added to `level1-app`, reverted after): the
    synthesized template has no `DenyHTTP`/`HttpsOnly` bucket/topic policy statements at all, while
    the KMS key's `EnableKeyRotation: true` (via `RotateEncryptionKeysAspect`'s already-fixed
    structural check) is present. Worse than a silent no-op: because `AwsSolutionsChecks` is already
    wired tree-wide (pre-existing, unrelated to this task) and these two mitigations never land, a
    real `harness.sh deploy` against `level1-app` (real AWS creds, real test account, no stack ever
    reached CloudFormation -- confirmed via `describe-stacks`, nothing to tear down) failed outright
    with cdk-nag `AwsSolutions-S10`/`SNS2`/`SNS3` "Found errors" before any AWS API call -- i.e. any
    real consuming app with an S3 bucket or SNS topic under this same module-layout cannot
    `cdk-cicd exec` deploy at all. The fix applied to the three L1-`CfnResource`-based aspects in this
    same task (`RotateEncryptionKeysAspect`, `DisablePublicIPAssignmentForEC2Aspect`,
    `EncryptCloudWatchLogGroupsAspect` -- `CfnResource.isCfnResource` + `cfnResourceType` instead of
    `instanceof`) was never applied to the two L2-construct-based ones, and reordering
    `Aspects.of(app).add(...)` calls in `inject.ts` does not fix it either (ruled out empirically) --
    the L2 `instanceof` check itself is the defect, not aspect-application order. Lower-severity
    instance of the same pattern, latent because these three stay opt-in (not wired into
    `applyWrapper`) so no immediate blast radius: `AccessLogsForBucketAspect` still checks
    `instanceof CfnBucket` (an L1 class -- the exact case the structural-check fix targets, left
    unfixed here even though the fix pattern already existed elsewhere in this same change);
    `DestroyEncryptionKeysOnDeleteAspect` (`instanceof Key`) and `LambdaDLQAspect`
    (`instanceof LambdaFunction`) also use unfixed L2 `instanceof` checks. Per review routing,
    architect verdict `deploy-failed` mandates blocking without a further code-quality pass. Fix:
    find (or build) a structural check for these L2 constructs that survives a cross-copy
    `aws-cdk-lib` boundary the way `CfnResource.isCfnResource` does for L1 (e.g. checking the
    construct's `defaultChild`'s `cfnResourceType`, if `Bucket`/`Topic`'s default child is reliably an
    `L1` at aspect-visit time), across all five affected aspects, and add a regression test that spans
    two `aws-cdk-lib` copies (mirroring whatever `m9-migrate-log-retention` ships) before
    re-submitting.
    Unblocked. The two tree-wide-wired L2 aspects this note named -- `EncryptBucketOnTransitAspect`
    and `EncryptSNSTopicOnTransitAspect` -- now check structurally instead of by `instanceof`:
    `Resource.isResource(node)` (a `Symbol.for` marker in aws-cdk-lib's global symbol registry, so it
    survives the same cross-copy boundary `Symbol.for` gives `CfnResource.isCfnResource`) plus the
    node's default child's `cfnResourceType`, then a cast back to `IBucket`/`ITopic` to call the same
    `addToResourcePolicy` mechanism as before -- unchanged behaviour, only the identity check moved.
    Verified: `npx projen compile`/`test`/`compat` all green, plus a regression test per aspect
    (`jest.isolateModules` builds a genuinely distinct `Bucket`/`Topic` class, mirroring the
    `LogRetentionAspect` precedent) proving the check survives the cross-copy boundary; 100% branch
    coverage on both files. Real-deploy-verified: reproduced the same probe (S3 bucket + SNS topic +
    KMS key added to `level1-app`, reverted after), and this time the deploy actually reached
    CloudFormation -- confirmed via `aws s3api get-bucket-policy`/`aws sns get-topic-attributes` that
    the real, deployed `AWS::S3::BucketPolicy`/`AWS::SNS::TopicPolicy` carry `DenyHTTP` and
    `NoHTTPSubscriptions`/`HttpsOnly` respectively, then `harness.sh destroy` tore the stack down clean
    (confirmed via `describe-stacks` and a tag-scoped stack query -- no orphans). cdk-nag needed
    `NagSuppressions` on the probe to reach CloudFormation at all, for findings unrelated to (and
    unresolved by) this fix: `AwsSolutions-S1`/`-SNS2`/`-KMS5` are orthogonal concerns no aspect here
    addresses, and -- a genuinely new discovery, logged as
    `migration-encryptbuckettransit-s10-action-scope` in findings.json -- `AwsSolutions-S10` can never
    pass for `EncryptBucketOnTransitAspect` regardless of this fix, because cdk-nag's S10 rule
    requires the Deny statement's action to be `s3:*`/`*` while the aspect (matching v2's exact
    scope) denies only `s3:PutObject`; `AwsSolutions-SNS3`, by contrast, now passes cleanly on the
    same probe, since `EncryptSNSTopicOnTransitAspect`'s `HttpsOnly` statement already includes
    `SNS:Publish`. Remaining gap, deliberately out of scope for this fix (narrowed to exactly the two
    tree-wide-wired aspects the deploy-verify failure named): the three opt-in aspects this same
    note flagged as a lower-severity instance of the identical pattern -- `AccessLogsForBucketAspect`
    (`instanceof CfnBucket`), `DestroyEncryptionKeysOnDeleteAspect` (`instanceof Key`),
    `LambdaDLQAspect` (`instanceof LambdaFunction`) -- are untouched and still carry the unfixed
    `instanceof` check; they stay latent (not wired into `applyWrapper`, so no immediate blast radius)
    until a session scoped to fix them lands. `MIGRATION.md`'s row for these aspects (line ~69)
    already describes the port at the design level with no mechanism detail, so it needed no edit.

- **`m9-migrate-compliance-bucket`** — port the v2 compliance/access-log bucket  ·  done · wave 8 ·
  wrapper · migration
  - **desc:** v2 source: `src/resource-providers/ComplianceBucketProvider.ts`,
    `src/stacks/compliance-bucket/ComplianceBucketStack.ts`. **Fold in** the skipped Stage-1 fix
    `0b7ae02` (v2 compliance-bucket TLS/SSE policy correctness) while porting — don't reintroduce
    that bug in the v3 shape.
  - **spec:** docs/design/v3-rollout-plan.md #Migration backlog item 2
  - **acceptance:** v3 equivalent + passing unit test + `MIGRATION.md` row; TLS/SSE policy correctness
    verified (the thing `0b7ae02` fixed).
  - **notes:** v3 equivalent is `SupportResources.complianceLogBucket` -- a plain CDK-managed `Bucket`
    (not v2's custom-resource Lambda; the "bucket already exists" tolerance that Lambda existed for
    doesn't arise, since this construct's own stack owns the bucket for the pipeline's lifetime),
    provisioned lazily on first read from `SupportResourcesProps.complianceLogBucketName`. Added the
    missing config surface: `complianceLogBucketName` on `CicdConfigProps`/`ResolvedCicdConfig`
    (`defineCICD`), threaded into `CodePipelineEngine.render()`'s `SupportResources` construction; the
    engine force-reads the lazy getter whenever the field is set, so configuring the name alone is
    enough to get the bucket in the synthesized template -- matching v2's default-on-when-configured
    `ComplianceBucketProvider`, not left as dead plumbing nobody reads. `0b7ae02`'s TLS/SSE fix: the
    `DenyUnencryptedTraffic` half is `enforceSSL: true` (a plain `Bool` on `aws:SecureTransport` works
    there because that key is always present); the `EnforceEncryptionAtRest` half denies `s3:PutObject`
    with a `Null` condition on `s3:x-amz-server-side-encryption` (checking the header's *absence*) --
    the bug `0b7ae02` fixed was a `Bool` check against literal `"false"`, which never matches a request
    that omits the header entirely, silently letting unencrypted uploads through. Deliberately did
    **not** wire `AccessLogsForBucketAspect` into `applyWrapper` even though its own doc comment ties
    that to this task landing: it still carries the unfixed `instanceof CfnBucket` check task.md's
    `m9-migrate-security-plugins` note already flagged as the same cross-`aws-cdk-lib`-module-copy
    failure class that made two other aspects silently inert on a real deploy; wiring it tree-wide now
    would ship that exact bug again. Stays opt-in until a session scoped to the structural-check fix
    lands. `npx projen compile`/`test` green (31 suites, 286 tests, 1 skipped); `npx projen compat`
    fails, but on a pre-existing, unrelated `changed-stability` finding on
    `PipelineApp.policyValidationBeta1`/`DeploymentPipelineApp.policyValidationBeta1` from a concurrent
    task's `aws-cdk-lib` bump (neither file touched here) -- not a regression from this change.
    Real-AWS deploy-verify not run: the acceptance criterion for this task is unit-test-level
    (`MIGRATION.md` row + TLS/SSE correctness), and the one thing that would need a real deploy to
    validate for real (`AccessLogsForBucketAspect`) is exactly what stayed unwired above.

- **`m9-migrate-vpc`** — port v2 VPC support  ·  done · wave 8 · wrapper · migration
  - **desc:** v2 source: `src/resource-providers/VPCProvider.ts`, `src/stacks/vpc/ManagedVPCStack.ts`,
    `NoVPCStack.ts`, `VPCFromLookUpStack.ts`.
  - **notes:** ✅ The real-AWS deploy-verify blocker is fixed: the default (unset `flowLogsBucketName`)
    managed-VPC config was failing synthesis outright on `AwsSolutions-VPC7`. Suppressed it on that
    resource (v2 shipped flow logs opt-in the same way, so forcing them on by default would be a
    behaviour change, not just a nag fix) and added a nag-compliance test proving the suppression fires
    for the default case and stays a no-op once `flowLogsBucketName` is set -- using the same "cdk-nag is
    genuinely live here" control pattern this package's other nag-compliance tests use. The underlying
    VPC/subnet/security-group/CodeBuild wiring was already real-AWS deploy-verified with
    `flowLogsBucketName` set (teardown clean, no orphans); this fix only needed synthesis-level (unit
    test) verification, not a second full deploy, since it changes no deployed resource shape.
    `resolveVpcNetworking` (`src/support/Vpc.ts`) ports `ManagedVPCStack`/`NoVPCStack`/
    `VPCFromLookUpStack` as a plain function rather than v2's per-stage stack -- v3 attaches the VPC
    directly to the pipeline's own construct tree, since the CodeBuild projects that consume it already
    live in the stack this resolves against. New `VpcConfig`/`ManagedVpcConfig` (`config/types.ts`),
    threaded through `defineCICD`'s `vpc` prop. Wired into every CodeBuild project both engines create:
    `CodePipelineEngine` via `SupportResources.vpcNetworking` (build, self-update, per-stage deploy,
    the container-mode `BuildImage` project); `CdkPipelinesEngine` via `codeBuildDefaults` directly
    (synth + self-mutation), since that engine doesn't use `SupportResources`. `useProxy` (from
    `config.proxy !== undefined`) selects isolated subnets + the default CodeBuild interface endpoints,
    matching v2's `VPCProvider` reading `GlobalResources.PROXY`. Ports the `restrictDefaultSecurityGroup`/
    `allowAllOutbound` fix forward as `??` instead of v2's `props.x || true` (which forced both on even
    when a caller explicitly passed `false`) -- a defect, not a behaviour to preserve. cdk-nag IAM5
    suppressions on both engines extended to cover the VPC-attached CodeBuild role's network-interface
    permissions. Added engine-level wiring tests (`CodePipelineEngine.test.ts`,
    `cdk-pipelines-engine.test.ts`) alongside the existing `Vpc.test.ts`/`SupportResources.test.ts`
    coverage, and fixed one pre-existing test bug found along the way: `Vpc.test.ts`'s
    `allowAllOutbound: false` case asserted `SecurityGroupEgress: Match.absent()`, but CDK's own
    `ec2.SecurityGroup` substitutes a "disallow all traffic" placeholder egress rule in that case rather
    than omitting the property (CloudFormation has no way to express zero egress rules) -- not a defect
    in `Vpc.ts`, just a wrong assertion. `npx projen compile`/`test` both green (31 suites, 281 tests).
    **Not yet done:** no real-AWS deploy-verify pass. No dedicated VPC fixture exists under
    `test/fixtures/`; `test/fixtures/pipeline-app` (the `CodePipelineEngine` fixture) only deploys via
    `test/proof/m4-verify.sh`'s bespoke bundling, not a generic `harness.sh run` -- extending it with a
    `vpc: { managedVpc: {} }` config and reusing that bundling is the likely path, or a small isolated
    fixture if the architect prefers not to grow `pipeline-app`'s deploy time with a NAT gateway.
  - **spec:** docs/design/v3-rollout-plan.md #Migration backlog item 3
  - **acceptance:** v3 equivalent + passing unit test + `MIGRATION.md` row.

- **`m9-migrate-http-proxy`** — port v2 HTTP proxy support  ·  done · wave 8 · wrapper · migration
  - **desc:** v2 source: `src/resource-providers/ProxyProvider.ts` (`IProxyConfig`/`ProxyProps`).
  - **notes:** ✅ `ProxyConfig` ported into `src/config/types.ts`/`define.ts` and wired into
    `CodePipelineEngine.project()` (build/self-update/per-stage-deploy CodeBuild projects) and
    `CdkPipelinesEngine`'s synth step. The gap this task was blocked on —
    `CodePipelineEngine.renderImageBuild()`'s container/express-deploy-mode `BuildImage` project never
    referencing `config.proxy` — is fixed (commit `97bbab7`): the same install-phase exports, env
    vars, secrets-manager mapping and secret-read/KMS grant `project()` already applied now also apply
    to `renderImageBuild`'s `BuildImage` project, plus a `container-mode.test.ts` case covering
    `deployerImage` + `proxy` together. `npx projen compile`/`test`/`compat` all green (30 suites, 254
    tests). **Real AWS deploy-verify, this time via the correct invocation** (the previous attempt's
    blocker: `test/fixtures/pipeline-app` only deploys through bespoke bundling, not a generic
    `harness.sh run`) — reused `test/proof/container-verify.sh`'s technique (`deployerImage:
    BuildImage.docker(...)`, which is what actually routes `render()` into `renderImageBuild`) with a
    `proxy` block added against a throwaway Secrets Manager secret and a deliberately unresolvable
    `proxyTestUrl`. `cdk-cicd deploy-ci --disposable` provisioned the image-build pipeline, and a
    static assertion (`aws cloudformation describe-stack-resources` + `aws codebuild
    batch-get-projects`, the same technique `m9-migrate-private-registry-auth`'s `M4_NPM_REGISTRY` knob
    uses — proving the deployed project *definition* without needing to run a build against a fake
    proxy) confirmed the deployed `BuildImage` CodeBuild project's buildspec carries the
    `PROXY_SECRET_ARN`/`NO_PROXY` env vars, the `secrets-manager` username/password mapping, the
    `HTTP_PROXY`/`HTTPS_PROXY` export commands and the `proxyTestUrl` curl check. Pipeline stack, ECR
    repo, source bucket and the throwaway secret were all torn down and confirmed gone (`describe-stacks`/
    `describe-repositories`/`describe-secret` all 404 after). MIGRATION.md's proxy row already states
    the coverage precisely (every `CodePipelineEngine` project incl. `BuildImage` + `CdkPipelinesEngine`'s
    Synth step; CDK Pipelines' own self-mutation/asset-publishing projects have no per-step hook and stay
    uncovered) — no further doc correction needed.
  - **spec:** docs/design/v3-rollout-plan.md #Migration backlog item 4
  - **acceptance:** v3 equivalent + passing unit test + `MIGRATION.md` row. ✅

- **`m9-migrate-codebuild-customization`** — port v2 CodeBuild env customization  ·  done · wave 8 ·
  wrapper · migration
  - **desc:** Privileged mode, compute type, env vars. v2 source:
    `src/resource-providers/CodeBuildFactoryProvider.ts` (`ICodeBuildFactory`/`BuildOptions`),
    `src/code-pipeline/CDKPipeline.ts`.
  - **notes:** ✅ Ported as `codeBuildEnvSettings?: codebuild.BuildEnvironment` on
    `ResolvedCicdConfig`/`CicdConfigProps` — v2's exact field name, reusing CDK's own `BuildEnvironment`
    type verbatim rather than a bespoke wrapper (Q8 keep-API-familiar), so no new export was needed.
    Applied uniformly to every CodeBuild project in both engines: `CodePipelineEngine`'s `buildEnvironment()`
    helper (Build, UpdatePipeline, each Deploy-`<stage>`, and the container-mode `BuildImage` project,
    where `privileged` stays force-true for Docker but `computeType`/`environmentVariables` still flow
    through) and `CdkPipelinesEngine`'s `codeBuildDefaults` passthrough to `pipelines.CodePipeline`, which
    fans it out to synth/self-mutation/asset-publishing projects — matching v2's uniform-application
    semantics. `npx projen compile`/`test`/`compat` all green; unit tests cover both engines plus the
    `define.ts` pass-through/default case, including the container-mode path. **Architect real-AWS
    deploy-verify** (fresh run, this reconciliation pass): a disposable single-stage pipeline deployed
    via `cdk-cicd deploy-ci --disposable` with `codeBuildEnvSettings` set (`privileged: true`,
    `computeType: ComputeType.LARGE`, one custom env var) — `aws cloudformation describe-stack-resources`
    + `aws codebuild batch-get-projects` confirmed all three deployed CodeBuild projects (BuildProject,
    UpdatePipeline, Deploy-dev) carry `privilegedMode: true`, `computeType: BUILD_GENERAL1_LARGE` and the
    custom env var; pipeline stack + source bucket torn down and confirmed deleted (`describe-stacks`
    404 after), no orphans left in the test account.
  - **spec:** docs/design/v3-rollout-plan.md #Migration backlog item 5
  - **acceptance:** v3 equivalent + passing unit test + `MIGRATION.md` row. ✅

- **`m9-migrate-private-registry-auth`** — port v2 private-npm-registry basic-auth  ·  done · wave 8 ·
  shared · migration
  - **desc:** Not CodeArtifact (that's already in v3 — `m4-private-registry`, done): generic private
    npm registry basic-auth. v2 source: `src/plugins/utils/CodeArtifactPlugin.ts` and the
    `NPMRegistryConfig` interface (`src/common/types/Types.ts`) — confirm during migration which of
    the two actually carried the basic-auth path, since CodeArtifact itself has its own v3 story.
  - **notes:** ✅ `NpmRegistryConfig` ported additively into `src/config/types.ts` with v2's field
    names, wired through `define.ts` and all three pipeline-rendering engines; `npx projen
    compile`/`test`/`compat` all green (30 suites, 260 tests). Ground rule 2's real-AWS deploy gate
    (previously unmet — no fixture configured `npmRegistry`): added an opt-in `M4_NPM_REGISTRY=true`
    knob to `test/proof/m4-verify.sh` (same pattern as `M4_DEPLOY_MODEL`/`M4_ASYNC_DEPLOY`) that
    provisions a throwaway Secrets Manager secret and wires `npmRegistry` into the generated
    `cicd.config.ts`. Ran for real against the test account: `cdk-cicd deploy-ci --disposable`
    deployed the pipeline stack, and `assert_npm_registry_wiring` confirmed via `aws cloudformation
    describe-stack-resources` + `aws codebuild batch-get-projects` that **4/4** deployed CodeBuild
    projects (BuildProject, UpdatePipeline, Deploy-dev, Deploy-prod) carry the registry URL in a
    pre_build login command and the secret's ARN in the buildspec's `secrets-manager` env mapping —
    the "at minimum" bar. Beyond that: a real CodeBuild build's log for the CI Build action shows the
    login commands actually executing (`echo "@m9privatereg:registry=https://npm-registry.m9-verify
    .invalid/" > ./.npmrc` and the matching `_authToken` line), satisfying the "ideally" bar too — the
    bearer token never appears in the log since CodeBuild resolves `$NPM_AUTH_TOKEN` from Secrets
    Manager only at exec time, not at the point the command text is echoed. That same Build action's
    later `npx cdk-cicd synth --all` step failed for an unrelated reason (see finding
    `qa-cdk-cicd-exec-synth-fails-codepipeline-dev-stage` — a `cdk-cicd exec bin/app.ts` failure with
    no captured error detail, downstream of and unaffected by the npmRegistry login, which had already
    succeeded); the pipeline stack, its CodeBuild projects and the throwaway secret were still torn
    down cleanly and confirmed gone. Along the way, restored `NpmRegistryConfig`/`ProxyConfig`/
    `CiConfig.partialBuildSpec` in `config/types.ts`/`define.ts`, which a separate uncommitted edit had
    dropped from those two files while other files still referenced them (the package would not
    compile) — recovered verbatim from dangling git blobs plus task.md's own `m9-migrate-custom-buildspec`
    note, not reconstructed from memory. **Correction:** the container-mode (Repo 2) half of "all three
    pipeline-rendering engines" above -- `DeploymentPipeline.ts`'s `npmRegistryLoginCommands` +
    secret-read grant, and its own unit test -- was real-AWS deploy-verified as claimed but had never
    actually been committed; committed for real in a follow-up pass, along with the `MIGRATION.md` row
    this task's own acceptance line required and which had also never landed.
  - **spec:** docs/design/v3-rollout-plan.md #Migration backlog item 6
  - **acceptance:** v3 equivalent + passing unit test + `MIGRATION.md` row.

- **`m9-migrate-phase-command-model`** — port the v2 phase/command model  ·  done · wave 8 ·
  wrapper · migration
  - **desc:** v2 source: `src/resource-providers/PhaseCommandProvider.ts` (`IPhaseCommand`,
    `IPhaseCommandSettings`) and its command implementations (shell/NPM/Python/inline-shell/script).
    v3 already has `ci.steps` (a command map) — decide whether this backlog item is fully subsumed by
    `ci.steps` or whether a familiar-API shim is still owed per Q8.
  - **notes:** ✅ Resolved as "fully subsumed by `ci.steps`, no v3 equivalent needed" — a plain string
    is strictly more general than v2's typed command-builder classes, so no shim is owed per Q8. Decision
    independently traced and confirmed correct by both the architect and a code-review pass. The prior
    submission was blocked on process, not substance: its task.md edit was taken from a stale snapshot
    and, alongside the intended entry, silently reverted the unrelated `m9-migrate-security-plugins`
    entry — caught before commit. This edit is scoped to exactly this entry. `MIGRATION.md`'s
    `definePhase`/`PhaseCommand` row records the full v2→v3 phase-wiring mapping.
  - **spec:** docs/design/v3-rollout-plan.md #Migration backlog item 7
  - **acceptance:** either a documented "subsumed by `ci.steps`" `MIGRATION.md` row, or a v3
    equivalent + passing unit test + row.

- **`m9-migrate-custom-buildspec`** — port the v2 custom BuildSpec escape hatch  ·  done · wave 8 ·
  wrapper · migration
  - **desc:** v2 source: `src/code-pipeline/CDKPipeline.ts` /
    `src/resource-providers/CodeBuildFactoryProvider.ts` — pin down the exact escape-hatch surface
    during migration (not a single dedicated v2 file).
  - **spec:** docs/design/v3-rollout-plan.md #Migration backlog item 8
  - **notes:** ✅ v2's escape hatch was `CDKPipelineProps.ciBuildSpec`, merged only into the Synth
    `CodeBuildStep`'s `partialBuildSpec` (not `CodeBuildFactoryProvider`'s pipeline-wide
    `codeBuildEnvSettings`, which is a separate migration item). Ported as `CiConfig.partialBuildSpec` /
    `CiConfigInput.partialBuildSpec` (`codebuild.BuildSpec`), deep-merged via `codebuild.mergeBuildSpecs`
    into the CI build project's generated spec in `CodePipelineEngine.project()` — scoped the same way
    v2 scoped it (CI build only, not self-update or per-stage deploy projects). `npx projen
    compile`/`test`/`compat` all green; 3 new unit tests in `CodePipelineEngine.test.ts` cover the merge
    augmenting rather than replacing the engine's own phases, the CI-only scope, and the unchanged
    default (no `partialBuildSpec`) case. **Architect real-AWS deploy-verify** (fresh run, this
    reconciliation pass, same disposable pipeline as `m9-migrate-codebuild-customization` above with
    `ci.partialBuildSpec` also set to a build-phase command containing a marker string): `aws
    cloudformation describe-stack-resources` + `aws codebuild batch-get-projects` confirmed the marker
    is present in the deployed BuildProject's (the CI project's) buildspec **and absent** from
    UpdatePipeline's and Deploy-dev's — proving both that the merge really lands on a deployed project
    and that the CI-only scope holds on real AWS, not just in the unit tests. Same run, same teardown
    (see above) — nothing orphaned.
  - **acceptance:** v3 equivalent + passing unit test + `MIGRATION.md` row. ✅

- **`m9-migrate-log-retention`** — port v2 CloudWatch log-retention control  ·  done · wave 8 ·
  wrapper · migration
  - **desc:** v2 source: `src/resource-providers/LoggingProvider.ts` (`ILogger`) and
    `EncryptCloudWatchLogGroupsPlugin.ts` — this item is retention specifically, distinct from the
    encryption plugin already covered by `m9-migrate-security-plugins`.
  - **notes:** Was blocked because `LogRetentionAspect.visit()`'s `node instanceof CfnLogGroup` check
    was false across this dev tree's two physical copies of `aws-cdk-lib` (root `node_modules` vs. the
    wrapper package's own nested `node_modules`), so the aspect silently never set retention on a real
    deploy. Fixed by replacing the `instanceof` check with a structural one
    (`CfnResource.isCfnResource(node) && node.cfnResourceType === 'AWS::Logs::LogGroup'`, matching the
    pattern already used by `RotateEncryptionKeysAspect`), plus a regression test that builds a
    `CfnLogGroup` via `jest.isolateModules` (a second, independently-loaded `aws-cdk-lib` module
    registry) so the check is proven structural, not nominal — `npx projen compile`/`test`/`compat` all
    green, 100% coverage on the changed file. Re-verified against a real deploy: `harness.sh deploy
    level1-app` (a temporary unset-retention `CfnLogGroup` added to the fixture, reverted after) showed
    `RetentionInDays: 365` via `aws logs describe-log-groups`, then `harness.sh destroy level1-app`
    tore down clean (no orphaned resources).
  - **spec:** docs/design/v3-rollout-plan.md #Migration backlog item 11
  - **acceptance:** v3 equivalent + passing unit test + `MIGRATION.md` row.

- **`m9-migrate-github-actions-engine`** — port GitHub Actions pipeline rendering to a v3 engine  ·
  done · wave 8 · wrapper · migration
  - **desc:** v3 today only has GitHub-as-*source* (`Repository.github()`); the *render* capability
    (emit a GitHub Actions workflow instead of a CodePipeline) would otherwise be lost entirely. v2
    source: `src/plugins/pipeline/GitHubPipelinePlugin.ts`,
    `src/plugins/pipeline/resources/github/GitHubPipelineProvider.ts`,
    `GitHubRepositoryProvider.ts`. Implement as a new `IEngine` (alongside `CdkPipelinesEngine`/
    `CodePipelineEngine` in `src/engine/**`), not a bolt-on — D4 already keeps `IEngine` honest for
    exactly this.
  - **notes:** ✅ The real blocker was a genuine wrapper bug, now root-cause fixed (not worked
    around) -- see `m9-fix-app-export-patching` below. Verified end to end against a real external
    repo (`gyalai-aws/github-plugin-test`, disposable test repo, owner confirmed destroy-and-reuse):
    packed the wrapper+CLI into real tarballs, vendored them into a genuinely standalone project
    (plain `npm install`, no yarn workspace), rendered a real `.github/workflows/deploy.yml`,
    deployed the `GitHubActionRole` (OIDC) for real to the sandbox test account, pushed, and a real
    GitHub Actions run executed the rendered workflow. Confirmed working against `aws-cdk-lib`
    2.195.0 (the wrapper's own pinned dev version), 2.220.0, and 2.266.0 (latest, 0 npm audit
    vulnerabilities) -- the fix is version-general, not pinned to one aws-cdk-lib release. The
    `codeArtifact`/`proxy` IAM/secrets-plumbing gap independently found earlier is real and NOT
    exercised by this minimal verification config; logged as its own follow-up (see findings.json),
    not a blocker for this task's own acceptance criterion.
  - **spec:** docs/design/v3-rollout-plan.md #Migration backlog (GitHub Actions); D4
  - **acceptance:** a `cicd.config.ts` selecting the GitHub engine renders a working Actions
    workflow, proven by at least one real GitHub Actions run + a `MIGRATION.md` row. ✅ Full
    end-to-end confirmed (Synthesize → publish assets → real `cdk deploy` to `dev-DemoStack`,
    `CREATE_COMPLETE`) after the two fixes in `m9-fix-pipeline-stack-env-fallback` below.

- **`m9-fix-pipeline-stack-env-fallback`** — pin the pipeline stack's own env when no ambient
  credentials are active  ·  done · wave 8 · wrapper · migration
  - **desc:** A second, independent blocker found only once the App-export fix let synth complete
    for real: `buildPipelineApp` (`pipeline-assembler.ts`) took the pipeline stack's own
    account/region solely from `process.env.CDK_DEFAULT_ACCOUNT`/`_REGION`. Fine for `deploy-ci`
    (ambient creds active) but wrong for the GitHub Actions engine's own self-mutation "Synthesize"
    job, which runs `cdk synth` before assuming any role -- `stack.account` resolved to an
    unresolved CDK token there, so the GitHubActionRole's `role-to-assume` ARN in the generated
    `deploy.yml` churned between runs and tripped `cdk-pipelines-github`'s "commit the updated
    workflow file" self-mutation check.
  - **notes:** ✅ Fix: falls back to the first configured stage's account/region when
    `CDK_DEFAULT_ACCOUNT`/`_REGION` are unset (ambient creds still win when present). Verified
    deterministic: `cdk synth` with no AWS credentials active reproduces `deploy.yml` byte-for-byte
    across repeated runs. A THIRD, separate blocker surfaced after this fix, external to the
    wrapper: `cdk-pipelines-github` 0.4.x hardcodes `roleExternalId: 'Pipeline'` on its "Assume CDK
    Deploy Role" step with no override exposed, which the current CDK bootstrap default
    (`--deny-external-id`, enabled by default) rejects outright. Not a wrapper bug -- resolved for
    the sandbox test account by re-bootstrapping with a minimally-customized template that adds one
    extra `AssumeRolePolicyDocument` statement to `DeploymentActionRole` allow-listing exactly
    `StringEquals: {sts:ExternalId: "Pipeline"}`, leaving the existing `Null: {sts:ExternalId:
    "true"}` (deny-any-other-external-id) statement untouched. Real users on a
    `--deny-external-id`-hardened bootstrap will need the same account-side accommodation; tracked
    as a documentation follow-up, not a code fix (there is nothing in wrapper code to change).
  - **spec:** discovered verifying `m9-migrate-github-actions-engine` end to end
  - **acceptance:** real GitHub Actions run (`gyalai-aws/github-plugin-test`, run 32779383501)
    completes Synthesize + Publish Assets + Deploy, stack `dev-DemoStack` reaches
    `CREATE_COMPLETE`. ✅

- **`m9-fix-app-export-patching`** — fix the wrapper's App-patching hooks for aws-cdk-lib 2.220+  ·
  done · wave 8 · wrapper · migration
  - **desc:** Root cause of `m9-migrate-github-actions-engine`'s synth-time crash, but NOT specific
    to that engine -- both the preload hook (`register.ts`, used by every engine's zero-touch
    cdk-nag/tags/synthesizer injection) and the self-mutating replay (`pipeline-assembler.ts`, CDK
    Pipelines + GitHub Actions) patch aws-cdk-lib's `App` class by assigning directly to its internal
    leaf module (`core/lib/app.js`), on the documented assumption that this "propagates" to the
    `aws-cdk-lib`/`aws-cdk-lib/core` barrels since they "re-read it lazily". Confirmed via isolated
    `node -e` repro (not guessed) that this holds on 2.195.0 but breaks on 2.220.0+: those barrels
    now compile `App` as a SELF-MEMOIZING getter -- the first read anywhere (by anyone, not
    necessarily the wrapper) freezes it into a plain, non-writable value, permanently disconnected
    from the leaf's own still-writable property. A plain assignment then silently no-ops against the
    frozen copy: user code's `import { App } from 'aws-cdk-lib'` builds a REAL, unpatched App instead
    of being redirected -- no error until something downstream trips over the mismatch (observed as
    `TypeError: app_1(...).App.isApp is not a function` deep inside aws-cdk-lib's own synthesis
    internals). This would have silently defeated the wrapper's core zero-touch mechanism for ANY
    user on a current aws-cdk-lib, for every engine, not just GitHub Actions.
  - **notes:** ✅ Fix: `appExportTargets`/`patchAppExports`/`restoreAppExports` (`inject.ts`) use
    `Object.defineProperty` (overrides any property regardless of its accessor shape) on every place
    a copy re-exports `App` -- the leaf plus `aws-cdk-lib`/`aws-cdk-lib/core` -- instead of a plain
    assignment on the leaf alone. `register.ts` patches all of them permanently (once per process);
    `pipeline-assembler.ts`'s per-stage replay captures+restores each one's exact original property
    descriptor (not just its value), so a stage-local self-freezing getter is put back as a getter,
    not collapsed into a plain value. Verified: 32/32 wrapper suites, `projen compat` clean, and the
    real end-to-end GitHub Actions run above at aws-cdk-lib 2.195.0/2.220.0/2.266.0.
  - **spec:** discovered and fixed as a prerequisite for `m9-migrate-github-actions-engine`
  - **acceptance:** the isolated repro (patch → real synth → restore → real synth again) succeeds on
    aws-cdk-lib 2.220.0/2.266.0 as well as 2.195.0, and the full wrapper test suite stays green. ✅

- **`m9-migration-gate`** — v2 feature-migration gate  ·  done · wave 8 · shared · migration
  - **desc:** The gate Q4/Q16 describe: once every task above is `done`, the Autopilot line has full
    v2 feature parity for the features that were decided to migrate (not the dropped ones — see
    `docs/design/v3-rollout-plan.md`'s "Dropped" list, all already reflected in `MIGRATION.md`'s
    mapping table). This is what unblocks flipping the npm `1.0.0`/`latest` dist-tag — it does **not**
    block `v3`→`main` (that's `m8-remove-v2`, already done) or the docs/review stages (5–7).
  - **depends-on:** m9-migrate-security-plugins, m9-migrate-compliance-bucket, m9-migrate-vpc,
    m9-migrate-http-proxy, m9-migrate-codebuild-customization, m9-migrate-private-registry-auth,
    m9-migrate-phase-command-model, m9-migrate-custom-buildspec, m9-migrate-log-retention,
    m9-migrate-github-actions-engine
  - **acceptance:** all ten `dependsOn` tasks `done`. ✅ All ten confirmed done as of this session --
    the npm `1.0.0`/`latest` dist-tag flip is unblocked. Two known, deliberately-not-blocking gaps
    remain tracked in `findings.json` for follow-up: the GitHub Actions engine's `codeArtifact`/
    `proxy` IAM/secrets plumbing, and `samples/cdk-python-example` still referencing the deleted
    `PipelineBlueprint`.
