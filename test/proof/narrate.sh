#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Narration helpers for recorded milestone demos.
#
# A milestone proof is watched, not read, so every command has to be explained
# *before* it runs and the viewer needs time to read the explanation. Sourcing
# this file gives a demo script four verbs that enforce that shape:
#
#   step "Deploy the fixture"     section header
#   say  "why we do this"         explanatory comment + reading pause
#   run  cdk deploy ...           echo the command, then execute it
#   note "observation"            call out something in the output above
#
# Pace is controlled by DEMO_PAUSE (seconds, default 2). Set DEMO_PAUSE=0 when
# running a demo as a plain test so it costs nothing.
#
# Usage:
#   . "$(dirname "$0")/../narrate.sh"

set -euo pipefail

DEMO_PAUSE="${DEMO_PAUSE:-2}"

# Colours are only emitted to a terminal; asciinema records a pty, so they land
# in the .cast, while `bash demo.sh > file` stays clean.
if [ -t 1 ]; then
  _C_STEP=$'\033[1;36m' # bold cyan
  _C_SAY=$'\033[0;90m'  # grey
  _C_CMD=$'\033[1;32m'  # bold green
  _C_NOTE=$'\033[1;33m' # bold yellow
  _C_OFF=$'\033[0m'
else
  _C_STEP='' _C_SAY='' _C_CMD='' _C_NOTE='' _C_OFF=''
fi

_step_no=0

# Reading pause. Scaled by how much text was just printed.
pause() {
  local factor="${1:-1}"
  if [ "${DEMO_PAUSE}" != "0" ]; then
    sleep "$(awk -v p="${DEMO_PAUSE}" -v f="${factor}" 'BEGIN{print p*f}')"
  fi
}

# Section header: "── 3. Deploy the fixture ──"
step() {
  _step_no=$((_step_no + 1))
  printf '\n%s──────────────────────────────────────────────────────────────%s\n' "${_C_STEP}" "${_C_OFF}"
  printf '%s %d. %s%s\n' "${_C_STEP}" "${_step_no}" "$*" "${_C_OFF}"
  printf '%s──────────────────────────────────────────────────────────────%s\n' "${_C_STEP}" "${_C_OFF}"
  pause 0.75
}

# The explanatory comment that must precede every command (see task.md D3).
say() {
  printf '%s# %s%s\n' "${_C_SAY}" "$*" "${_C_OFF}"
  pause
}

# Echo the command as the viewer would type it, then run it.
run() {
  printf '%s$ %s%s\n' "${_C_CMD}" "$*" "${_C_OFF}"
  pause 0.5
  "$@"
}

# Same as `run` but the command is a shell string (pipes, redirects, subshells).
run_sh() {
  printf '%s$ %s%s\n' "${_C_CMD}" "$1" "${_C_OFF}"
  pause 0.5
  bash -c "$1"
}

# Draw attention to something in the output that was just produced.
note() {
  printf '%s→ %s%s\n' "${_C_NOTE}" "$*" "${_C_OFF}"
  pause
}

# Closing frame, so the recording does not end mid-scroll.
outro() {
  printf '\n%s%s%s\n' "${_C_STEP}" "${1:-Done.}" "${_C_OFF}"
  pause 2
}
