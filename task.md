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
  them; if the environment blocks install, fall back to `.cast` and flag it.
- **D4 — Deferred scope** ✅ Container two-repo mode + GitHub Actions engine are iteration 2. Keep
  `IEngine` honest so they slot in without a rewrite.
- **D5 — Package consolidation (3→2)** ✅ Retire `@cdklabs/cdk-cicd-wrapper-projen` (v3 `cdk-cicd
  configure` replaces it; deprecate then remove at the major). CLI stays its own package but depends
  on the wrapper (one install). Do NOT fold the CLI into the jsii package (multi-language bloat). The
  repo's own projen build stays.
- **D-deploy — Synth at deploy time** ✅ Promoted unit is code+pinned deps (sha/image digest), not a
  baked assembly; synth runs at deploy against the injected config, for both the CodePipeline engine
  and Docker mode. Docker image is config-agnostic (no `cdk.out` baked), runs offline.
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
- **`harness-publish-loop`** — CodeArtifact publish/install round trip  ·  todo · wave 0 · infra · test
  - **desc:** Prove the real install path: publish to CodeArtifact, install from a clean dir.
  - **acceptance:** `task codeartifact:publish` then `npm install @cdklabs/cdk-cicd-wrapper` from
    CodeArtifact in a temp dir imports cleanly. (M1 may use a workspace link; M2+ must use this.)
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
- **`harness-verify`** — Phase-0 exit gate  ·  todo · wave 0 · test
  - **depends-on:** harness-aws-lifecycle, harness-recorder, harness-fixtures
  - **acceptance:** one command deploys a trivial fixture to us-west-2, asserts it, destroys it, and
    emits a `.cast`.

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
- **`m2-bundled-diagnostic`** — bundled/ESM diagnostic  ·  todo · wave 2 · wrapper · feature
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
- **`m3-config-discovery`** — cicd.config.ts/.yaml discovery  ·  todo · wave 3 · cli · feature
  - **depends-on:** m3-definecicd
- **`m3-synth`** — per-(stage×region) deploy-time synth  ·  todo · wave 3 · cli · feature
  - **desc:** Synth into `cdk.out/<stage>/<region>` at deploy time against the target config;
    `cdk-cicd synth --all` for CI validation only.
  - **depends-on:** m2-exec
- **`m3-drift-check`** — drift check  ·  todo · wave 3 · cli · feature
  - **desc:** Read each stack's `aws://acct/region` from assembly `manifest.json`. Agnostic = OK;
    region mismatch = **warn**; account mismatch = **error + abort that stage**.
  - **spec:** D-deploy; D3-Q9          - **depends-on:** m3-synth
  - **acceptance:** fires correctly on `hardcoded-env-app`.
- **`m3-forced-roles`** — forced deploy/CFN roles  ·  todo · wave 3 · cli · feature
  - **desc:** Thread configured roles through synth + deploy (`--role-arn`, cdk-assets overrides).
  - **depends-on:** m3-synth
- **`m3-deploy`** — cdk-cicd deploy --stage  ·  todo · wave 3 · cli · feature
  - **desc:** Synth the stage against its config at deploy time, then deploy (assets via cdk-assets).
    Promoted unit is code+deps (sha), not a prebuilt assembly.
  - **depends-on:** m3-synth
- **`m3-verify`** — M3 gate  ·  todo · wave 3 · shared · test
  - **depends-on:** m3-deploy, m3-drift-check, harness-aws-lifecycle
  - **acceptance:** one stage → 2 regions deploys to us-west-2 + us-west-1 from the same build,
    asserted + destroyed; drift rule fires on the hardcoded fixture.

## Wave 4 — CodePipeline engine (M4)  *(v2 parity bar; demo #2)*

- **`m4-iengine`** — IEngine interface  ·  todo · wave 4 · wrapper · feature
  - **desc:** Engine-neutral so iteration-2 engines slot in (D4).          - **spec:** D4
- **`m4-codepipeline`** — CodePipelineEngine  ·  todo · wave 4 · wrapper · feature
  - **desc:** ONE synth project + ONE deploy action per stage. The "100+ projects" fix — measure the
    CodeBuild project count, don't assert it in prose.
  - **depends-on:** m4-iengine, m3-deploy
- **`m4-support-resources`** — lazy support resources  ·  todo · wave 4 · wrapper · feature
  - **desc:** Encryption key, compliance/log bucket, SSM provisioned only when referenced via DI;
    de-singletoned `ResourceContext`.
  - **depends-on:** m4-iengine
- **`m4-approval-selfupdate`** — approvals + deploy-ci  ·  todo · wave 4 · cli · feature
  - **desc:** Manual approval gates; `cdk-cicd deploy-ci` provisions + self-updates the pipeline.
  - **depends-on:** m4-codepipeline
- **`m4-ci-checks`** — default-on CI checks via CLI  ·  todo · wave 4 · cli · feature
  - **desc:** validate/audit/license/security run by the CLI in CI — fresh project passes with no
    npm-script surgery.
- **`m4-verify`** — M4 gate  ·  todo · wave 4 · shared · test
  - **depends-on:** m4-codepipeline, m4-support-resources, m4-approval-selfupdate, m4-ci-checks
  - **acceptance:** `deploy-ci` provisions a working pipeline in the test account; a commit flows
    dev→prod with approval; **CodeBuild project count recorded and compared to v2**; full teardown.
    **Recorded demo #2.**

## Wave 5 — Migration (M5)

- **`m5-migration-doc`** — MIGRATION.md v2→v3  ·  todo · wave 5 · docs · docs
  - **spec:** `docs/design/v3-devops-experience.md` #v2 → v3 mapping
- **`m5-codemod`** — cdk-cicd migrate codemod  ·  todo · wave 5 · cli · feature
  - **desc:** Rewrite mechanical `PipelineBlueprint.builder()...synth(app)` into `cicd.config.ts` +
    `cdk.json` app command.          - **depends-on:** m3-definecicd
- **`m5-sample-migrate`** — migrate the TS sample  ·  todo · wave 5 · infra · migration
  - **desc:** Move `samples/cdk-ts-example` to the v3 shape as a living smoke test; keep a v2 copy
    until the flip.          - **depends-on:** m4-verify
- **`m5-deprecate-projen`** — deprecate the projen product (D5a)  ·  todo · wave 5 · projen · chore
  - **desc:** Mark `@cdklabs/cdk-cicd-wrapper-projen` deprecated; document that `cdk-cicd configure` +
    `cicd.config.ts` replaces it; migration note. Keeps publishing until the major (see m8-remove-v2).
    Rework the sample's `.projenrc.ts`.          - **spec:** D5

## Wave 6 — Iteration 2 (designed, deferred)

- **`m6-container`** — Container two-repo mode  ·  todo · wave 6 · cli · feature
  - **desc:** `BuildImage.docker` (repo 1 build/push of a **config-agnostic** image = code + vendored
    npm deps, no `cdk.out`, runs offline) + `defineDeployment` / `deploy --from-image` (repo 2 synths
    in-container against its config, then deploys). S3 artifact store default + ECR/OCI.
  - **spec:** `docs/design/v3-devops-experience.md` #Level 2          - **depends-on:** m4-verify
  - **notes:** offline guarantee = complete deterministic dep closure at image build (no runtime fetch).
- **`m7-gha`** — GitHub Actions engine  ·  todo · wave 6 · wrapper · feature
  - **desc:** Render from the model directly (replaces v2 buildspec reverse-engineering).
  - **depends-on:** m4-iengine
- **`spike-python-hook`** — Python injection path  ·  todo · wave 6 · wrapper · spike
  - **desc:** Is the import hook acceptable in Python, or is `CdkCicd.attach(app)` the primary path?
    (jsii can't ship a Python import hook cleanly.) Written outcome.
- **`spike-naming`** — CLI/API naming pass  ·  todo · wave 6 · shared · spike
  - **desc:** `deploy-ci` vs `bootstrap-ci`; `exec` vs `synth`; `defineCICD`/`defineDeployment`.

## Wave 7 — The v3 major (breaking)

- **`m8-remove-v2`** — Remove v2 + the projen product  ·  todo · wave 7 · shared · migration · breaking
  - **desc:** Delete v2 (`PipelineBlueprint`) and `@cdklabs/cdk-cicd-wrapper-projen` — **only** once
    parity + migration are proven and the deprecation period has elapsed.
  - **depends-on:** m4-verify, m5-migration-doc, m5-codemod, m5-deprecate-projen
  - **notes:** `npx projen compat` will flag the break — expected here, not before.
