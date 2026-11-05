#!/usr/bin/env bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# Runs one command of a CI step that runs several, inside a named log group.
# When the command fails, an error annotation names it, so a passing summary
# from an earlier command never reads as the step's result. The failure lines
# (Vitest's FAIL, AssertionError and Error: lines, at most 30) follow the
# group, and the annotation names the first failing file and line, so the
# step view shows the cause without unfolding the group.
#
#   run-named.sh "<label>" [--stdout <file>] -- <command> [args...]
#
# With --stdout, the command's standard output goes to <file>; its standard
# error stays in the log.
set -u
label=$1
shift
out=
if [ "${1:-}" = --stdout ]; then
  out=$2
  shift 2
fi
if [ "${1:-}" = -- ]; then shift; fi
log=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/run-named.XXXXXX")
trap 'rm -f "$log"' EXIT
echo "::group::${label}"
if [ -n "$out" ]; then
  { "$@" > "$out"; } 2>&1 | tee "$log" >&2
else
  "$@" 2>&1 | tee "$log"
fi
status=${PIPESTATUS[0]}
echo "::endgroup::"
if [ "$status" -ne 0 ]; then
  # Colour codes would hide the patterns and garble the annotation.
  plain=$(sed $'s/\x1b\\[[0-9;]*m//g' "$log")
  failures=$(grep -E '( FAIL |AssertionError|Error:)' <<< "$plain" | head -n 30)
  where=$(grep -oE '❯ [^ ]+:[0-9]+:[0-9]+' <<< "$plain" | head -n 1 | sed 's/^❯ //')
  if [ -n "$failures" ]; then
    echo "${label} failed. Its failure lines:"
    echo "$failures"
  fi
  # A workflow command needs % escaped, and must stay on one line.
  escape() { sed -e 's/%/%25/g' -e 's/\r/%0D/g' | tr -d '\n'; }
  first=$(grep -m1 -E '( FAIL |AssertionError|Error:)' <<< "$plain" | sed 's/^ *//' | escape)
  location=
  if [ -n "$where" ]; then
    file=${where%:*}; file=${file%:*}
    line=${where%:*}; line=${line##*:}
    location="file=${file},line=${line},"
  fi
  message="${label} exited with status ${status}."
  [ -n "$first" ] && message="${message} First failure: ${first}"
  echo "::error ${location}title=${label} failed::${message} Its output is in the \"${label}\" group of this step's log."
fi
exit "$status"
