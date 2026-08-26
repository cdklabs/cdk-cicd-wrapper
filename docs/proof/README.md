# Milestone proofs

Recorded, narrated evidence that a milestone actually works — CLAUDE.md ground rule 4, decided in
`task.md` D3.

Each proof is a pair:

| File | What it is |
|---|---|
| `<demo>.cast` | **the source.** An [asciinema](https://asciinema.org) recording — plain text, diffs in review, replayable with `asciinema play`, and re-exportable at any size or speed. |
| `<demo>.mp4` | **the artifact.** What a reviewer watches without installing anything. Generated from the `.cast`; never edited by hand. |

## Why recordings aren't committed

D3 originally committed both files for every milestone (rationale: a maintainer or external
contributor could watch the proof straight from the repo). **Amended 2026-08-25**: `docs/proof/` is
now gitignored, so `record-demo.sh` still produces `.cast`/`.mp4` locally but new runs are no longer
checked in. **Amended again 2026-08-26**: the recordings through M4 that were still tracked from
before the first amendment were removed from git (kept on disk, not deleted) — none of `docs/proof/`'s
recordings live in the repository anymore, only this index does. Recording and reviewing a proof no
longer means growing the repo's binary history.

## Recording one

```bash
test/proof/record-demo.sh <demo-name> ["title"]
```

The demo scripts live in `test/proof/demos/`. They use the narration helpers in
`test/proof/narrate.sh`, which enforce the shape D3 asks for: an explanatory comment *before* every
command, and a reading pause so a viewer can keep up. Pace is `DEMO_PAUSE` seconds (default 2; set
`DEMO_PAUSE=0` to run a demo as a plain non-recorded check).

The pipeline is `demo script → asciinema → .cast → agg → .gif → ffmpeg → .mp4`; the intermediate gif
is discarded. `agg` and `ffmpeg` are not packaged for this environment and are installed per-user
into `~/.local/bin`:

```bash
curl -sSL -o ~/.local/bin/agg \
  https://github.com/asciinema/agg/releases/latest/download/agg-x86_64-unknown-linux-musl
chmod +x ~/.local/bin/agg
curl -sSL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz \
  | tar xJ --strip-components=1 -C ~/.local/bin --wildcards '*/ffmpeg' '*/ffprobe'
```

If either is unavailable, `record-demo.sh` still produces the `.cast` and exits non-zero — the
documented D3 fallback.

## Index

| Proof | Milestone | Shows |
|---|---|---|
| `recorder-selftest` | — (harness) | The recording pipeline itself: provenance of the commit being recorded, the toolchain versions, and what narration looks like. Exists so a milestone gate never discovers a broken exporter at the last minute. |
| `where-we-are` | — (catch-up) | A tour of the state after Wave 0 + M1: the curated jsii-safe public surface (verified against the assembly), the `AppConfig` config layer through the API a consumer calls (JSON/YAML parity, safe-by-default merge, typed fail-closed errors), and the 15-case teardown-guard test. Not a gate — makes no AWS calls; the first real-deploy proof comes with M2. |
| `m2-injection` | M2 (mechanism) | The runtime-injection story, live: Level-0 inertness (a stock app the wrapper never touches), then `cdk-cicd exec` injecting config + tags into an untouched app with **zero edits to `bin/`**, then a real esbuild bundle defeating the preload and being **caught** with the `CdkCicd.attach(app)` pointer. All `cdk synth`, no AWS creds. |
| `m2-deploy` | **M2 (demo #1)** | The M2 milestone proof: a **real deploy** to the test account. `level0-app` deploys inert and `level1-app` (via `cdk-cicd exec`) deploys injected — the differential shown on the real deployed template — then both are destroyed through the teardown guard, leaving nothing behind. Every AWS call redacted; no account id in the recording. |
| `m3-multiregion` | **M3 (milestone)** | The M3 deploy model on real AWS: one `cdk-cicd deploy --stage dev` builds once and rolls out to **two regions** (us-west-2 + us-west-1), asserted and destroyed; then the **drift rule refuses** a foreign-account deploy (`hardcoded-env-app`). Redacted; no account id. (The formal demo #2 is M4.) |
| `m4-pipeline` | **M4 (demo #2)** | The CodePipeline engine: from a tiny `cicd.config.ts` and **zero wrapper code in the app**, the engine renders ONE flat pipeline — Source → Build → a self-updating stage → one deploy action per stage, with a **fail-closed manual-approval gate** on non-dev stages — where v2's CDK Pipelines grew 100+ CodeBuild projects (this one has 4). Also shows the opt-in `asyncDeploy` Lambda that takes over the CloudFormation wait. A deterministic **local** render (no AWS, nothing left behind); the end-to-end proof on real AWS is `test/proof/m4-verify.sh`, which has passed in the default assembly-promotion model. |

Nothing in a proof may contain an AWS account id — see CLAUDE.md. Demos read the test account from
the gitignored `.env` and must mask it before printing.
