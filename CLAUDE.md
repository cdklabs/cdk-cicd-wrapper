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

## Writing CDK resources

Ground rules 1 and 2, made specific. Four checks before writing or changing a resource in
`packages/@cdklabs/cdk-cicd-wrapper/src/**` or a fixture — each because skipping it costs a real deploy
cycle, and a rolled-back stack is a slower teacher than five minutes of the CloudFormation reference.

1. **Dependencies and update semantics.** What must exist first, what the resource requires vs. accepts
   as optional, and above all *what an update does* — many properties are `Update requires: Replacement`,
   so an innocuous edit destroys and recreates. This repo already learned it the expensive way: a stack
   name that doesn't match Blueprint's makes a migration a new stack instead of an in-place update, and the
   stateful resource is recreated (`MIGRATION.md` §stack names, proven in
   `test/proof/migration-continuity.sh`, warned in `docs/content/workshops/zerotouch-pipeline/06-*.md`). Record
   replacement-triggering properties in a comment **where someone would edit them**, not in a doc.
2. **Name, title and description limits come from the reference, not from a guess.** Charsets and
   lengths, looked up. An EC2 description field allows only `a-zA-Z0-9`, spaces and
   `._-:/()#,@[]+=;{}!$*` — an apostrophe in a possessive fails the deploy *after* CloudFormation has
   started creating. Assume the toolchain will not catch it: this repo runs no `cdk synth --strict`
   (`--strict` here is only `jsii-rosetta` and `mkdocs build`), so there is no synth-time net at all.
   Where an error message and the property reference disagree on allowed characters, take the narrower
   set.
3. **Private by default, always.** Public access is never the default and never the convenient
   shortcut. When something is unreachable the answer is the private path — a VPC/interface endpoint
   plus an in-VPC client — not flipping a `public*` flag. Trading the network layer for IAM-only
   protection is a posture decision that belongs to a human. If you believe public access is genuinely
   required, **say so and stop**: don't implement it, and above all don't write a test that pins it — a
   test asserts the decision is settled, which claims authority you weren't given.
4. **No partial patching.** Fix the class in the construct, never the instance that happened to fail.
   One bad character is a symptom; the defect is patching a constraint without checking its siblings.
   Where a constraint covers a family of fields, assert it over the family — and make the assertion
   **fail on an empty set**, because a scan that inspected nothing reports clean. Hand-fixing deployed
   state is acceptable only against a full blocker (the IaC genuinely cannot express it), and then the
   blocker is written down as a parameter plus a documented human step, never left as tribal knowledge.

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

`node`/`yarn`/`npx` are **not on the default PATH**. Either enter `devbox shell`, or prepend a node bin
dir **after checking it exists on this machine** — the dir is per machine and per user, so never paste
one from another checkout or another session's notes:

```bash
# Prefer the node major CI builds on; fall back to the newest installed. Run from the repo root.
CI_MAJOR=$(grep -ho 'node-version: *"[0-9]*"' .github/workflows/*.yml | grep -o '[0-9]\+' | sort -n | tail -1)
NODE_BIN=$(ls -d "${NVM_DIR:-$HOME/.nvm}"/versions/node/v${CI_MAJOR:-*}.*/bin 2>/dev/null | sort -V | tail -1)
[ -x "$NODE_BIN/node" ] || NODE_BIN=$(ls -d "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin 2>/dev/null | sort -V | tail -1)
[ -x "$NODE_BIN/node" ] && export PATH="$NODE_BIN:$PATH" || echo 'no nvm node found — use devbox shell'
export NODE_OPTIONS=--max-old-space-size=6144   # jsii compile needs the headroom
```

The `SessionStart` hook (`.claude/hooks/preflight-toolchain.sh`) runs this check for you and reports
which of `node`/`yarn`/`jq`/`python3` resolve, plus a verified dir to prepend.

**Mind which node you get.** `.github/workflows/*.yml` build on node `24` and `lts/*`; `devbox.json`
pins `nodejs@18.19.1`, behind both — devbox is the reliable way to get `task` and `jq`, not a match for
CI's node. The preflight reads the pinned major out of the workflows and prefers a matching installed
node, saying so; when nothing matches it names what it found and flags that a local-only pass on
another major is weaker evidence than a CI run.

**Never put `PATH` in `.claude/settings.json` under `env`.** Values there are **not** interpolated —
`${PATH}` and `$PATH` arrive verbatim — so the entry *replaces* the session PATH instead of extending
it. A stale entry there (a hardcoded nvm dir from another machine) left every session with a PATH of
two non-existent directories, and every hook that resolves a binary by name died with exit 127
(`/bin/sh: bash: command not found`, `/bin/sh: python3: command not found`) on every prompt and every
tool call. PATH belongs in the shell you run commands in, not in committed settings.

Yarn 1 workspaces over two packages in `packages/@cdklabs/`:

| Package | Notes |
|---|---|
| `cdk-cicd-wrapper` | the constructs library — **jsii**, published to npm/PyPI/Maven/NuGet |
| `cdk-cicd-wrapper-cli` | the `cdk-cicd` CLI (`bin/cdk-cicd`), plain TS |

`cdk-cicd-wrapper-projen` was the third package; zero-touch removed it (task.md **D5**, package consolidation
3→2). Its migration path is `cicd.config.ts` + the `cdk-cicd` CLI — see `MIGRATION.md`.

## This repo is projen-managed

**Never hand-edit generated files.** Anything containing `~~ Generated by projen` is output, not
source — that includes every `package.json`, `tsconfig*.json`, `.eslintrc.json`, `.github/workflows/*`.

Source of truth is `.projenrc.ts` + `projenrc/*.ts` (`RootConfig`, `PipelineConfig`, `CLIConfig` — the
three `.projenrc.ts` instantiates). Change those, then regenerate:

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
- Samples in `samples/cdk-cicd-wrapper-example` and `samples/cdk-python-example` double as smoke tests — keep
  them working. They are what users copy. (`cdk-ts-example`, the Blueprint sample, was deleted
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
