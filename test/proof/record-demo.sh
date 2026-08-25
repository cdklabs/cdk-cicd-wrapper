#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Record a narrated milestone demo and export it to mp4.
#
# Ground rule 4 in CLAUDE.md: key milestones ship a recorded, narrated proof.
# Decision D3 in task.md: asciinema is the recorder, mp4 is the delivered
# format, and the .cast is retained as the source.
#
#   demo script ──asciinema──> .cast ──agg──> .gif ──ffmpeg──> .mp4
#
# The .cast is the source of truth: it is plain text, diffs, and can be
# re-exported at any size. The mp4 is the artifact a human watches.
#
# Usage:
#   test/proof/record-demo.sh <demo-name> [title]
#
#   <demo-name>  a script in test/proof/demos/ (with or without the .sh suffix)
#   [title]      recording title; defaults to the demo name
#
# Environment:
#   DEMO_PAUSE   narration pace in seconds (default 2; see narrate.sh)
#   OUT_DIR      where artifacts land (default docs/proof)
#   COLS/LINES   recorded terminal size (default 100x30)
#   SKIP_MP4=1   stop after the .cast (fallback when agg/ffmpeg are missing)

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${HERE}/../.." && pwd)"

# agg and ffmpeg are installed per-user, outside any package manager.
export PATH="${HOME}/.local/bin:${PATH}"

DEMO_NAME="${1:-}"
if [ -z "${DEMO_NAME}" ]; then
  echo "usage: $0 <demo-name> [title]" >&2
  echo "available demos:" >&2
  ls -1 "${HERE}/demos" 2>/dev/null | sed 's/^/  /' >&2
  exit 2
fi
DEMO_NAME="${DEMO_NAME%.sh}"
DEMO_SCRIPT="${HERE}/demos/${DEMO_NAME}.sh"
[ -f "${DEMO_SCRIPT}" ] || { echo "ERROR: no such demo: ${DEMO_SCRIPT}" >&2; exit 2; }

TITLE="${2:-cdk-cicd-wrapper — ${DEMO_NAME}}"
OUT_DIR="${OUT_DIR:-${REPO_ROOT}/docs/proof}"
COLS="${COLS:-100}"
LINES="${LINES:-30}"

CAST="${OUT_DIR}/${DEMO_NAME}.cast"
GIF="${OUT_DIR}/${DEMO_NAME}.gif"
MP4="${OUT_DIR}/${DEMO_NAME}.mp4"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: '$1' not found on PATH. $2" >&2
    return 1
  }
}

require asciinema "Install it (pip install asciinema) or see docs.asciinema.org."

mkdir -p "${OUT_DIR}"

echo "==> recording ${DEMO_NAME} (${COLS}x${LINES}) -> ${CAST}"
# --command makes this non-interactive: asciinema allocates the pty, runs the
# demo to completion, and exits. That is what lets a milestone gate produce its
# own proof without a human driving a terminal.
asciinema rec \
  --quiet \
  --overwrite \
  --title "${TITLE}" \
  --idle-time-limit 2 \
  --cols "${COLS}" \
  --rows "${LINES}" \
  --command "bash ${DEMO_SCRIPT}" \
  "${CAST}"

echo "==> cast written: ${CAST} ($(wc -c <"${CAST}") bytes)"

if [ "${SKIP_MP4:-0}" = "1" ]; then
  echo "==> SKIP_MP4=1, stopping at the .cast"
  exit 0
fi

# agg/ffmpeg are optional: without them we still have the .cast, which is the
# documented fallback in task.md D3.
if ! require agg "Download the prebuilt binary from github.com/asciinema/agg/releases into ~/.local/bin." \
  || ! require ffmpeg "Download a static build from johnvansickle.com/ffmpeg into ~/.local/bin."; then
  echo "==> mp4 export unavailable; the .cast above is the deliverable." >&2
  exit 3
fi

echo "==> cast -> gif"
agg --theme asciinema --font-size 16 --speed 1 "${CAST}" "${GIF}"

echo "==> gif -> mp4"
# yuv420p + even dimensions are what makes the mp4 play in browsers and QuickTime.
ffmpeg -loglevel error -y -i "${GIF}" \
  -movflags +faststart \
  -pix_fmt yuv420p \
  -vf 'scale=trunc(iw/2)*2:trunc(ih/2)*2' \
  "${MP4}"

# The gif is only an intermediate; keeping it would double the committed size.
rm -f "${GIF}"

echo
echo "==> proof artifacts"
ls -lh "${CAST}" "${MP4}" | sed 's/^/    /'
