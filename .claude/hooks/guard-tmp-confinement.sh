#!/usr/bin/env bash
# PreToolUse guard: keep scratch writes inside the repo's .gitignored .tmp/, never in system temp.
# State in /tmp is invisible to git and lost between machines. WRITE-shaped only:
#   - Write/Edit/NotebookEdit whose path is under system temp -> deny.
#   - Bash write verbs (cp/mv/mkdir/touch/tee/install/rsync/ln/truncate, dd of=), output redirects
#     (>, >>), and mktemp without a repo template targeting system temp -> deny.
# READS of system temp and `rm` there stay allowed. Commands are split on ; | & so a path is judged
# only against its own simple command; obfuscated writes (eval/xargs) are out of scope.
set -uo pipefail

# Preflight before doing any work: this guard reads its payload with jq, so without jq it cannot judge
# a single tool call and would fail open silently on every one of them. Say so once, visibly, instead.
if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' '{"systemMessage":"tmp-confinement guard is OFF: jq did not resolve on PATH, so the hook cannot read its payload. Scratch writes are unguarded until jq is available (devbox.json pins jq 1.7.1). See .claude/hooks/preflight-toolchain.sh."}'
  exit 0
fi

input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")
ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"

deny() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

HINT="Use the repo scratch dir instead: \$CLAUDE_PROJECT_DIR/.tmp/ (e.g. mktemp -p \"\$CLAUDE_PROJECT_DIR/.tmp\")."

# The repo root wins: a path inside $ROOT is never "system temp", even if the repo is checked out
# under /tmp. $TMPDIR resolves into these roots (macOS: /var/folders, with /private prefixes).
is_system_tmp() {
  case "$1" in "$ROOT"/*|"$ROOT") return 1 ;; esac
  case "$1" in
    /tmp/*|/tmp|/private/tmp/*|/private/tmp|\
    /var/tmp/*|/var/tmp|/private/var/tmp/*|/private/var/tmp|\
    /var/folders/*|/private/var/folders/*) return 0 ;;
  esac
  return 1
}

case "$tool" in
  Write|Edit|NotebookEdit)
    fp=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$input")
    [ -z "$fp" ] && exit 0
    is_system_tmp "$fp" && deny "Blocked (tmp confinement): '$fp' is in system temp. $HINT"
    exit 0 ;;
  Bash) ;;
  *) exit 0 ;;
esac

cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
[ -z "${cmd// /}" ] && exit 0

# Expand $TMPDIR spellings so `> $TMPDIR/x` is judged like the literal path.
expanded="$cmd"
if [ -n "${TMPDIR:-}" ]; then
  expanded="${expanded//\$TMPDIR/${TMPDIR%/}}"
  expanded="${expanded//\$\{TMPDIR\}/${TMPDIR%/}}"
  expanded="${expanded//\$\{TMPDIR:-\/tmp\}/${TMPDIR%/}}"
else
  expanded="${expanded//\$\{TMPDIR:-\/tmp\}//tmp}"
  expanded="${expanded//\$TMPDIR//tmp}"
  expanded="${expanded//\$\{TMPDIR\}//tmp}"
fi

set -f  # tokenize without glob expansion
subs=$(printf '%s' "$expanded" | tr '|&;' '\n\n\n')
while IFS= read -r sub; do
  sub="${sub#"${sub%%[![:space:]]*}"}"
  [ -z "$sub" ] && continue

  # Output redirects into system temp (>, >>, optional fd digit), judged per sub-command.
  if grep -Eq '[0-9]?>>?[[:space:]]*(/private)?/(tmp|var/tmp|var/folders)(/|[[:space:]]|$)' <<<"$sub"; then
    deny "Blocked (tmp confinement): output redirect into system temp in: ${sub}. $HINT"
  fi

  # mktemp: safe only when pointed inside the repo (repo template, or -p/--tmpdir with a repo path).
  if grep -Eq '(^|[[:space:]=(`])mktemp([[:space:]]|$|\)|`)' <<<"$sub"; then
    mk_args="$(printf '%s' "$sub" | sed -E 's/^.*(^|[[:space:]=(`])mktemp//; s/[)`].*$//' | tr -d '"\\'"'")"
    safe=no
    set -- $mk_args
    while [ $# -gt 0 ]; do
      case "$1" in
        -p|--tmpdir)
          case "${2:-}" in "$ROOT"/*|"$ROOT"|\$CLAUDE_PROJECT_DIR*|\${CLAUDE_PROJECT_DIR}*) safe=yes ;; esac
          shift ;;
        --tmpdir=*)
          case "${1#--tmpdir=}" in "$ROOT"/*|"$ROOT"|\$CLAUDE_PROJECT_DIR*|\${CLAUDE_PROJECT_DIR}*) safe=yes ;; esac ;;
        -*) : ;;
        *)  case "$1" in "$ROOT"/*|.tmp/*|./.tmp/*|\$CLAUDE_PROJECT_DIR*|\${CLAUDE_PROJECT_DIR}*) safe=yes ;; esac ;;
      esac
      shift
    done
    [ "$safe" != "yes" ] && deny "Blocked (tmp confinement): mktemp defaults to system temp. $HINT"
    continue
  fi

  set -- $sub
  [ $# -eq 0 ] && continue
  verb="$1"
  case "$verb" in
    cp|mv|mkdir|touch|tee|install|rsync|ln|truncate)
      shift
      for tok in "$@"; do
        case "$tok" in -*) continue ;; esac
        is_system_tmp "$tok" && deny "Blocked (tmp confinement): '$verb' targeting system temp '$tok'. $HINT"
      done ;;
    dd)
      shift
      for tok in "$@"; do
        case "$tok" in
          of=*) is_system_tmp "${tok#of=}" && deny "Blocked (tmp confinement): dd writing to system temp '${tok#of=}'. $HINT" ;;
        esac
      done ;;
    *) continue ;;
  esac
done <<< "$subs"

exit 0
