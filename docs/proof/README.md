# Milestone proofs

Recorded, narrated evidence that a milestone actually works — CLAUDE.md ground rule 4, decided in
`task.md` D3.

Each proof is a pair:

| File | What it is |
|---|---|
| `<demo>.cast` | **the source.** An [asciinema](https://asciinema.org) recording — plain text, diffs in review, replayable with `asciinema play`, and re-exportable at any size or speed. |
| `<demo>.mp4` | **the artifact.** What a reviewer watches without installing anything. Generated from the `.cast`; never edited by hand. |

## Why both are committed

The `.cast` is the record of what happened and is small enough to review as text. The `.mp4` is
regenerable from it, but committing it means a maintainer or an external contributor can watch the
proof straight from the repo — which is the point of the ground rule. Terminal recordings compress
well (roughly 20 KB per second of video), so this stays cheap. If a demo ever gets long enough for
the mp4 to be awkward, drop the mp4 and keep the `.cast`.

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

Nothing in a proof may contain an AWS account id — see CLAUDE.md. Demos read the test account from
the gitignored `.env` and must mask it before printing.
