#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Proves the recorder pipeline itself works end to end, so a milestone gate can
# rely on it rather than discovering at the last minute that mp4 export is
# broken. This is the acceptance check for `harness-recorder` in task.md.
#
# Deliberately cheap: no AWS calls, no builds. Record it with
#   test/proof/record-demo.sh recorder-selftest

. "$(dirname "$0")/../narrate.sh"

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "${REPO_ROOT}"

step "Where this recording came from"
say "Every proof states its own provenance, so a viewer can tell which commit"
say "they are looking at and whether the tree was dirty when it was recorded."
run git rev-parse --abbrev-ref HEAD
run git rev-parse --short HEAD
say "An empty listing below means a clean tree; anything listed was uncommitted."
run_sh 'git status --porcelain | head -20'

step "The recording toolchain"
say "asciinema captures the terminal, agg turns the .cast into frames, and"
say "ffmpeg packages those frames as the mp4 that gets attached to the milestone."
run_sh 'asciinema --version'
run_sh 'agg --version'
run_sh 'ffmpeg -version | head -1'

step "What narration looks like"
say "Every command in a demo is preceded by lines like this one, and the pace is"
say "set by DEMO_PAUSE so the viewer has time to read before the command runs."
note "DEMO_PAUSE=${DEMO_PAUSE}s for this recording."
say "Commands themselves are echoed in green with a \$ prompt, exactly as a"
say "person would have typed them."
run node --version

outro "Recorder verified — cast + mp4 are produced by test/proof/record-demo.sh."
