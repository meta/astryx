#!/usr/bin/env bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# Runs one command of a CI step that runs several, inside a named log group.
# When the command fails, an error annotation names it, so a passing summary
# from an earlier command never reads as the step's result. Its failure lines
# (from Vitest's failure report: FAIL, AssertionError and Error: lines, at
# most 30) follow the group, so the step view shows the cause without
# unfolding the group. Vitest's own annotations name each file and line.
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
  # Colour codes would hide the patterns. A line starting with :: is a
  # workflow command (Vitest's own annotations): echoing it again would
  # annotate the failure twice.
  plain=$(sed $'s/\x1b\\[[0-9;]*m//g' "$log" | grep -v '^::' || true)
  # Vitest's failure report follows its "Failed Tests" banner; a passing
  # test's console output before it can hold "Error:" too.
  report=$(awk '/Failed Tests [0-9]+/ { found = 1 } found' <<< "$plain")
  if [ -n "$report" ]; then
    failures=$(grep -E '^ ?FAIL |AssertionError|Error:' <<< "$report" | head -n 30 || true)
    tests=$(grep -cE '^ ?FAIL ' <<< "$report" || true)
  else
    failures=$(grep -E '( FAIL |AssertionError|Error:)' <<< "$plain" | head -n 30 || true)
    tests=0
  fi
  message="${label} exited with status ${status}."
  if [ -n "$failures" ]; then
    echo "${label} failed. Its failure lines:"
    echo "$failures"
    if [ "$tests" -gt 0 ]; then
      message="${label} exited with status ${status}; ${tests} failing test(s), listed after the \"${label}\" group. Vitest's annotations name each file and line."
    else
      message="${message} Its failure lines follow the \"${label}\" group."
    fi
  fi
  echo "::error title=${label} failed::${message} Its output is in the \"${label}\" group of this step's log."
fi
exit "$status"
