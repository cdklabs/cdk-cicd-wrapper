# cdk-cicd-wrapper — agent working notes

`@cdklabs/cdk-cicd-wrapper` wraps a user's AWS CDK project with CI/CD (CodePipeline today).
Public repo under `cdklabs` — **treat every push as externally visible**.

Current initiative, milestones, and open decisions live in `task.md`; design specs in `docs/design/`.
This file is deliberately version-agnostic — keep release-specific detail out of it.

## How to work here

Four principles, adapted from the [Karpathy guidelines](https://github.com/multica-ai/andrej-karpathy-skills)
(MIT). They bias toward caution over speed — apply judgment on trivial edits, not the full ceremony.

**1. Think before coding.** Don't assume, don't hide confusion, surface tradeoffs. State assumptions
out loud. Where a request has competing readings, lay them out instead of quietly picking one; where a
simpler route exists, argue for it. If something is genuinely unclear, stop and name the specific
unclear point rather than inventing an answer. In this repo that has teeth: `task.md` tracks open
decisions as explicit `D<n>` blockers, and work stops at the blocker rather than guessing past it.

**2. Simplicity first.** The minimum code that solves the stated problem — no unrequested features, no
abstraction for a single call site, no speculative configurability, no error handling for cases that
can't occur. Gut check: would an experienced engineer call this overcomplicated? When working from a
broad design doc, build the milestone in front of you, not the one three milestones out.

**3. Surgical changes.** Touch only what the task requires; clean up only your own mess. Leave
neighbouring code, comments, and formatting alone, and match the surrounding style even where you'd
write it differently. Point out unrelated dead code — don't delete it. Do remove imports or variables
*your* edit orphaned. Every changed line should trace back to the request. Two hard rules compound
here: the published API keeps working (§Ground rules), and generated files are never hand-edited
(§projen).

**4. Goal-driven execution.** Define success criteria, then loop until verified. Turn "fix the bug"
into a failing test that must pass, "add validation" into tests for the invalid inputs. For multi-step
work, open with a short numbered plan pairing each step to its verification. The gate in §Ground rules
is exactly this loop — a task is not done until its gate is green.

## Ground rules

From the maintainer; these override convenience.

1. **Additive before destructive.** New capability ships *alongside* what is already published, not in
   place of it. The current public API keeps building and passing tests. Removals wait for a major
   release, with a migration guide and a deprecation period. `npx projen compat` is the tripwire.
2. **Nothing untested reaches GitHub.** A change passes build → unit tests → **real AWS deploy** →
   teardown before it is pushed. Harness and per-milestone gates live in `task.md`.
3. **Minimise wrapper code in the user's app.** Zero-touch is the default face; an explicit opt-in API
   is the documented fallback for cases where implicit injection cannot work. Every symbol we require
   in a user's `bin/` is a migration cost we own forever.
4. **Key milestones ship a recorded, narrated proof** — `test/proof/record-demo.sh <demo>` records a
   demo script from `test/proof/demos/` and exports **mp4** (`.cast` kept as the source) into
   `docs/proof/`. Write demos with the `test/proof/narrate.sh` helpers (`step`/`say`/`run`/`note`);
   they make the explanatory-comment-before-every-command rule structural rather than a convention.
   Never put an AWS account id in a demo.
5. **Commit continuously to the working branch.** One commit per completed, verified unit of work —
   never a single fat commit at the end, because the maintainer reviews the *evolution* of the work on
   the branch, not just its final state. Work on a feature branch, never `main`. Committing is not
   pushing: rule 2 still gates `git push`, so local commits accumulate on the branch until the
   milestone gate is green. Never `--no-verify` (see §Conventions).
6. **Every unit of work gets a review pass** before it is committed, delegated to a review agent
   rather than self-reviewed inline. Each finding is dispositioned exactly one of two ways: **fixed
   now** if it is a defect in the code under review, or **appended to `findings.json`** if it is out
   of scope. Nothing is silently dropped. So the loop per unit of work is: implement → verify →
   review → disposition findings → commit.

## Task board

`task.md` (repo root) is the living, schema-driven board of planned work, governed by
`.claude/schemas/tasks.schema.json`. Each task is a uniform record (`id`, `title`, `description`,
`component`, `type`, `wave`, `status`, + optional `spec`/`dependsOn`/`acceptance`/`produces`/
`breaking`/`owner`/`notes`). Tasks in the same **wave** have no dependency on each other and run in
parallel; `dependsOn` is the only ordering signal — keep it minimal (independence is the goal). A task
is `done` only when its `acceptance` check is green. Append tasks and flip `status` in place; don't
delete finished ones. The board is not tied to any one initiative.

## Findings file

`findings.json` (repo root) is the shared, machine-readable log of things noticed but **deliberately
not fixed in the session that found them**. When implementation surfaces a side-effect, an unrelated
defect, or a follow-up that is out of scope for the task in hand, principle 3 (surgical changes) says
don't fix it inline — **append a finding instead**, so a later session picks it up rather than
re-discovering it. This is the durable companion to `task.md`: `task.md` holds planned work; `findings.json`
holds incidental discoveries.

- Schema: `.claude/schemas/findings.schema.json` (JSON Schema, restricted to the subset Claude's
  Structured Outputs supports — an agent can be constrained to it directly when emitting a finding).
- Append; don't rewrite. `id` is the dedupe key (`producer` + short kebab slug, no counter) — check
  for a collision before writing. Resolving a finding means flipping `status` to `resolved`/`wontfix`
  in place, never deleting it, so history stays visible.
- Axes: `component` (`wrapper`/`cli`/`projen`/`shared`/`infra`), `layer` (`static`/`dynamic`/`production`),
  `producer` (`qa`/`code-review`/`migration`/`planning`). See the schema for what each value means here.
- `high` severity is a strong signal to the next reader, not a merge gate — nothing in CI reads this file.
- **This file is committed and public** (repo root, `cdklabs`). Never put anything sensitive in a
  finding — no credentials/tokens, no AWS account IDs or ARNs, no internal-only URLs or hostnames.
  Describe the *shape* of an issue, not secret values; reference code by path/line, not by pasting env.

## Toolchain (read this first)

`node`/`yarn`/`npx` are **not on the default PATH**. Either enter `devbox shell`, or prepend:

```bash
export PATH=/home/gyalai/.nvm/versions/node/v24.19.0/bin:$PATH   # node v24.19.0, yarn 1.22.22
export NODE_OPTIONS=--max-old-space-size=6144                    # jsii compile needs the headroom
```

Yarn 1 workspaces over three packages in `packages/@cdklabs/`:

| Package | Notes |
|---|---|
| `cdk-cicd-wrapper` | the constructs library — **jsii**, published to npm/PyPI/Maven/NuGet |
| `cdk-cicd-wrapper-cli` | the `cdk-cicd` CLI (`bin/cdk-cicd`), plain TS |
| `cdk-cicd-wrapper-projen` | projen project types, plain TS |

## This repo is projen-managed

**Never hand-edit generated files.** Anything containing `~~ Generated by projen` is output, not
source — that includes every `package.json`, `tsconfig*.json`, `.eslintrc.json`, `.github/workflows/*`.

Source of truth is `.projenrc.ts` + `projenrc/*.ts` (`RootConfig`, `PipelineConfig`, `CLIConfig`,
`ProjenConfig`). Change those, then regenerate:

```bash
npx projen          # regenerate; must be re-run after touching .projenrc.ts or projenrc/
```

Because `cdk-cicd-wrapper` is jsii, its public API is multi-language. Exported types must stay
jsii-compatible: no TS generics/unions in exported signatures, no structural types, interfaces for
data (`I`-prefixed for behavioural), `readonly` props. `npx projen compat` guards API breaks.

## Commands

```bash
npm run build         # projen build: compile (jsii) + lint + test + package.  Slow — log it and tail.
npm run test          # jest across all three workspaces
npm run lint
npm run validate      # + validate:fix
npm run license       # + --fix
npm run security-scan
npx projen compat     # jsii API-compatibility check
```

Build output is large and slow; capture it rather than streaming:

```bash
npm run build > /tmp/build.log 2>&1; tail -30 /tmp/build.log
```

`Taskfile.yml` wraps the common loops: `task build`, `task fix`, `task before-commit`, `task refresh`
(reinstall + projen after a clean), `task docs:local`. `task` itself is only on PATH inside devbox.

Per-package work is faster than a root build:

```bash
cd packages/@cdklabs/cdk-cicd-wrapper && npx projen compile   # or: npx projen test
```

## Conventions

- **Conventional commits**, enforced by commitlint via husky `commit-msg`. `feat:`/`fix:` drive
  releases; use `feat!:` or a `BREAKING CHANGE:` footer for API breaks.
- Husky runs `pre-commit`, `commit-msg`, `pre-push` — do not bypass with `--no-verify`.
- Prettier + eslint; run `task fix` rather than reformatting by hand.
- Tests live in each package's `test/`, mirroring `src/`. `test/integration/` holds the heavier ones.
- Samples in `samples/cdk-v3-example` and `samples/cdk-python-example` double as smoke tests — keep
  them working. They are what users copy. (`cdk-ts-example`, the Blueprint/v2 sample, was deleted
  alongside the projen product in `m8-remove-v2` — it lives on, untouched, on `legacy-blueprint`.)

## AWS / test account

Deployment testing uses a dev/sandbox account, role `Admin`, regions `us-west-2` (primary) and
`us-west-1` (multi-region cases). **Account ids never go in committed source** — they live in the
gitignored `.env` as `CDK_CICD_TEST_ACCOUNT` (+ `CDK_CICD_TEST_REGION_PRIMARY`/`_SECONDARY`).
Credentials: obtain AWS credentials for `$CDK_CICD_TEST_ACCOUNT` (role `Admin`) via your preferred
mechanism — environment variables, a shared-config/SSO profile, or your org's credential tool — then
`test/proof/harness.sh creds` asserts the resolved identity matches.

Test fixtures are tagged `cdk-cicd-wrapper-test` + a run id, and **only** tagged stacks may ever
be destroyed. CodeArtifact publish/test-install loop already exists: `task codeartifact:login`,
`task codeartifact:publish` (see `Taskfile.codeartifact.yml`).
