#!/usr/bin/env bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# Prints the pull request's merge base with origin/<base-ref>, fetching the
# base and HEAD 200 commits deeper each time, up to <deepens> times (once by
# default), when the shallow checkout does not reach it. Prints
# nothing, with a workflow warning, when it still cannot find one. Shared by
# the CI steps that compare a pull request with its merge base.
#
# usage: merge-base.sh <base-ref> <what the caller skips without one> [deepens]
set -uo pipefail
base_ref="$1"
skipped="$2"
deepens="${3:-1}"
fetch_error=""
for ((i = 0; i < deepens; i++)); do
  if sha=$(git merge-base "origin/$base_ref" HEAD 2>/dev/null); then
    echo "$sha"
    exit 0
  fi
  # Each ref on its own fetch, 200 commits past what it already has: git 2.56
  # deepened only HEAD when one --deepen fetch named both, and left the base
  # at one commit.
  have_base=$(git rev-list --count "origin/$base_ref" 2>/dev/null || echo 0)
  have_head=$(git rev-list --count HEAD)
  fetch_error=$(git fetch -q --depth=$((have_base + 200)) origin \
    "$base_ref:refs/remotes/origin/$base_ref" 2>&1) || true
  head_error=$(git fetch -q --depth=$((have_head + 200)) origin \
    "$(git rev-parse HEAD)" 2>&1) ||
    fetch_error="${fetch_error:+$fetch_error; }$head_error"
done
if ! sha=$(git merge-base "origin/$base_ref" HEAD 2>/dev/null); then
  echo "::warning::no merge base within the fetched history; skipping $skipped${fetch_error:+ (last fetch: ${fetch_error//$'\n'/ })}" >&2
  exit 0
fi
echo "$sha"
