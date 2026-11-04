#!/usr/bin/env bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# Runs one command of a CI step that runs several, inside a named log group.
# When the command fails, an error annotation names it, so a passing summary
# from an earlier command never reads as the step's result.
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
echo "::group::${label}"
if [ -n "$out" ]; then
  "$@" > "$out"
else
  "$@"
fi
status=$?
echo "::endgroup::"
if [ "$status" -ne 0 ]; then
  echo "::error title=${label} failed::${label} exited with status ${status}. Its output is in the \"${label}\" group of this step's log."
fi
exit "$status"
