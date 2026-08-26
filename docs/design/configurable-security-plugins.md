# Task: Configurable security plugins for plain `cdk deploy`

## Problem

`applyWrapper()` (`packages/@cdklabs/cdk-cicd-wrapper/src/runtime/inject.ts`) applies a
hard-coded set of default-on security Aspects (AwsSolutionsChecks, LogRetentionAspect,
EncryptBucketOnTransitAspect, EncryptSNSTopicOnTransitAspect, RotateEncryptionKeysAspect,
DisablePublicIPAssignmentForEC2Aspect). It runs in exactly two entry points:

1. the `-r register.js` preload, armed by `cdk-cicd exec` (the `cdk.json` `app` command), and
2. the explicit `CdkCicd.attach(app)` escape hatch.

A plain `cdk deploy` whose `app` command does **not** route through `cdk-cicd exec` and whose
`bin/` does **not** call `CdkCicd.attach(app)` gets **none** of these Aspects. There is also no
way for a user to add their own Aspects/plugins, or to opt out of the built-in ones — the list
is a literal inside `applyWrapper`.

## Goals

1. The wrapper's security plugins apply during a normal deploy when the app opts in via the
   documented `bin/` entry point (`CdkCicd.attach(app)`), including an opt-out.
2. The plugin set is configurable: users select/override the built-in list and register their
   own custom plugins.

## Non-goals (this PR)

- A new clean preload launcher for true zero-touch on a stock `bin/`. `cdk-cicd exec` already
  works in-repo, so zero-touch is not blocked; the launcher is a follow-up (see Open questions).
- Fixing the CLI's published `^0.0.0` wrapper dependency (harmless in-repo, unrelated, its own PR).
- Changing the six Aspects' behaviour.

## Design

### Plugin identity

Every plugin has a `{ name: string; version: string }`. Built-ins are registered under stable
names in an internal **plugin registry** (name -> Aspect constructor/factory). This gives config
(which travels as JSON through CDK context and cannot carry live objects) a way to name a plugin.

### Two transport channels, one model

- **`cicd.config.ts`** (serializable, reaches both the preload path and `attach`): a
  `plugins?: PluginRef[]` field where `PluginRef = { name, version }`.
  - **omitted** -> the current default set (unchanged behaviour).
  - **`[]`** -> opt out of all default plugins.
  - **non-empty list** -> **completely overrides** the default set; only the listed plugins apply.
  - A listed name the registry does not know is a **custom** plugin: it MUST have a matching
    `CdkCicd.addPlugin(...)` registration in `bin/`, else synth fails with an actionable error
    naming the plugin.
- **`bin/`** (`CdkCicd.addPlugin`, carries a real Aspect instance):
  `CdkCicd.addPlugin(app, aspect: IAspect, ref: PluginRef)` registers a custom plugin instance
  and its `{name, version}`. Also `CdkCicd.attach(app, { plugins?: PluginRef[]; skipDefaults?: boolean })`
  so the same override/opt-out is expressible in code for bundled/ESM apps.

### Resolution rules (single source of truth, unit-tested pure function)

`resolvePlugins({ configPlugins?, registered, defaults }) -> IAspect[]`:
- `configPlugins === undefined` -> `defaults`.
- `configPlugins === []` -> `[]`.
- otherwise -> map each `PluginRef` to an instance: built-in name -> registry factory; unknown
  name -> the instance registered via `addPlugin` matching that name; no match -> throw.
- version is recorded/inventoried; a mismatch between config-declared version and a registered
  custom plugin's version is a synth-time warning (not fatal) — record the divergence.

### Files touched

- `src/runtime/inject.ts` — replace the hard-coded `Aspects.of(app).add(...)` block with
  `resolvePlugins(...)`; add the registry + `resolvePlugins` (pure, exported for tests).
- `src/runtime/attach.ts` — `attach(app, options?)`, new static `addPlugin(app, aspect, ref)`.
- `src/config/define.ts` + `src/config/types.ts` — add `plugins?: PluginRef[]` to input + resolved
  config; `PluginRef` struct (jsii-modeled).
- `src/index.ts` — export `PluginRef` (and any new public type).
- Docs: sample `cicd.config.ts`, sub-project README plugin section.

## SDLC steps

1. **Issue** — file on `github.com/cdklabs/cdk-cicd-wrapper` (public upstream). One issue, this feature.
2. **Design** — this doc is the design; refine `resolvePlugins` contract + registry names before code.
3. **Implement** — branch `feat/configurable-security-plugins` off freshly-fetched `origin/main`.
   Conventional commits. TDD: write `resolvePlugins` tests first (they are pure).
4. **Test** —
   - Unit: `resolvePlugins` (undefined/empty/override/custom-missing/version-mismatch),
     `attach`/`addPlugin`, registry completeness (every default is registered).
   - Deploy: a purpose-built sample app of meaningful complexity (API Gateway + Lambda +
     DynamoDB + SNS topic) deployed with `gyalai-Admin` to a sandbox, proving the SNS HTTPS-only
     policy and bucket/key aspects fire on a normal deploy. **Account IDs/ARNs treated as secret.**
5. **Proof** — a **visual before/after HTML report** (KiroCrew artifact): side-by-side
   "resources each Aspect adds" cards, the SNS `NoHTTPSubscriptions`/`aws:SecureTransport` policy
   statement highlighted, resource-count deltas as a small chart, and a short readable code
   snippet of the `cicd.config.ts` plugin block + the `bin/` `addPlugin` call. Annotated deploy
   console screenshots go to artifacts only (not the PR). No plain text template diff.
6. **PR** — to public upstream. Embed the visual report / sanitized snippets in the PR body;
   verify no secrets (account IDs, ARNs, secret ARNs). If unsure a proof leaks, it goes to
   KiroCrew artifacts only, not the PR.
7. **Review** — request Milan's review; do not merge.

## Open questions (for review)

- **O1**: Include the clean preload launcher (true zero-touch on stock `bin/`) in this PR, or
  follow-up? Spec currently: follow-up.
- **O2**: `skipDefaults` flag vs relying solely on `plugins: []` for opt-out. Spec currently:
  support both (`[]` in config, `skipDefaults` in `attach` options for code ergonomics).
