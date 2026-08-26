#!/bin/bash
# SessionStart preflight: report which toolchain interpreters actually resolve on this machine's PATH,
# and hand back a prepend directory chosen ONLY from candidates that exist and really contain node.
#
# Why this exists: `.claude/settings.json` used to pin `env.PATH` to a hardcoded nvm bin dir. Claude
# Code does NOT interpolate `${PATH}`/`$PATH` in `env` -- the value arrives verbatim -- so that entry
# REPLACED the session PATH with two non-existent directories. Every hook that resolves an executable
# by name then failed with exit 127 (`/bin/sh: bash: command not found`, `/bin/sh: python3: command not
# found`) on every prompt and every tool call. Test the path, then print it; never set it blind.
#
# This is the one hook that has to survive exactly that state, so it uses NOTHING from PATH: an absolute
# interpreter, and only shell builtins (printf, case, [[, parameter expansion) -- no sort/tail/sed/jq.
# A preflight that shells out to coreutils cannot report that coreutils is unreachable. Always exits 0.
set -u

missing=''
for tool in node yarn jq; do
  command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
done

# Accept either interpreter name -- `python3` is the common case, but `python` is what
# resolves on some machines/containers. There's no directory-encoded version to parse off
# the resolved path (unlike node below), so the version has to be queried by running it.
py_bin=''
for cand in python3 python; do
  command -v "$cand" >/dev/null 2>&1 && { py_bin="$cand"; break; }
done
py_ok='no'
if [[ -n "$py_bin" ]]; then
  py_ver="$("$py_bin" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null)"
  py_major="${py_ver%%.*}"
  py_minor="${py_ver#*.}"
  if (( ${py_major:-0} > 3 || (${py_major:-0} == 3 && ${py_minor:-0} >= 12) )); then py_ok='yes'; fi
fi
[[ "$py_ok" == 'yes' ]] || missing="$missing python3.12+"

# What major does CI build on? Read it out of the workflows rather than hardcoding a number that goes
# stale the moment CI bumps. Pure builtins: `read` on a file, glob matching via `case`. `lts/*` carries
# no major, so it is skipped; the highest pinned major wins.
ci_major=''
for wf in "${CLAUDE_PROJECT_DIR:-$PWD}"/.github/workflows/*.yml; do
  [[ -r "$wf" ]] || continue
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      *node-version:*)
        v="${line#*node-version:}"
        v="${v//[\"\' ]/}"                 # strip quotes and spaces
        v="${v%%.*}"                       # "24.1" -> "24"
        case "$v" in
          ''|*[!0-9]*) continue ;;         # skips lts/*, latest, ${{ ... }}
        esac
        if [[ -z "$ci_major" || $v -gt $ci_major ]]; then ci_major="$v"; fi ;;
    esac
  done < "$wf"
done

# A candidate counts only if it exists AND holds an executable node. Preference order: a major matching
# CI first (a local pass on CI's major is the evidence that counts), then newest installed, compared on
# zero-padded numeric components so v9 does not sort above v20.
node_bin=''
best_key=''
ci_bin=''
ci_key=''
for cand in "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin "$HOME"/.nvm/versions/node/*/bin; do
  [[ -x "$cand/node" ]] || continue
  ver="${cand%/bin}"; ver="${ver##*/}"; ver="${ver#v}"
  IFS=. read -r major minor patch _ <<<"$ver"
  key=''
  for part in "${major:-0}" "${minor:-0}" "${patch:-0}"; do
    part="${part%%[!0-9]*}"
    printf -v padded '%05d' "${part:-0}"
    key="$key$padded"
  done
  if [[ -z "$best_key" || "$key" > "$best_key" ]]; then best_key="$key"; node_bin="$cand"; fi
  # Highest patch within CI's major.
  if [[ -n "$ci_major" && "${major:-}" == "$ci_major" ]]; then
    if [[ -z "$ci_bin" || "$key" > "$ci_key" ]]; then ci_key="$key"; ci_bin="$cand"; fi
  fi
done
node_from_ci_major='no'
if [[ -n "$ci_bin" ]]; then node_bin="$ci_bin"; node_from_ci_major='yes'; fi
if [[ -z "$node_bin" ]]; then
  for cand in \
    "${CLAUDE_PROJECT_DIR:-$PWD}/.devbox/nix/profile/default/bin" \
    /opt/homebrew/bin \
    /usr/local/bin
  do
    if [[ -x "$cand/node" ]]; then node_bin="$cand"; break; fi
  done
fi

# The literal text below contains no " or \, so $node_bin is the only value that could break the JSON.
# Rather than shell out to escape it, drop a pathological path from the message -- the advice to run
# `devbox shell` is still correct, and emitting invalid JSON here would silently kill the hook.
case "$node_bin" in *'"'*|*'\'*) node_bin='' ;; esac

if [[ -z "$missing" ]]; then
  msg='Toolchain preflight: node, yarn and jq resolve on PATH, and python 3.12+ is available. Nothing to do.'
else
  msg="Toolchain preflight: not on PATH ->$missing."
  if [[ -n "$node_bin" ]]; then
    msg="$msg Verified toolchain dir on this machine: $node_bin -- prepend it (PATH=DIR:\$PATH)"
    msg="$msg in the shell you run commands in, per CLAUDE.md Toolchain."
    if [[ "$node_from_ci_major" == 'yes' ]]; then
      msg="$msg This one matches the node major CI builds on ($ci_major)."
    elif [[ -n "$ci_major" ]]; then
      msg="$msg NOTE: no installed node matches CI's major ($ci_major), so a local-only pass here is"
      msg="$msg weaker evidence than a CI run."
    fi
  else
    msg="$msg No usable node bin dir in the usual places, so enter devbox shell instead"
    msg="$msg (devbox.json pins the toolchain)."
  fi
  msg="$msg Do NOT add PATH to .claude/settings.json env: values there are not interpolated, so it"
  msg="$msg replaces the session PATH and breaks every hook with exit 127."
fi

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$msg"
exit 0
