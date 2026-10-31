#!/usr/bin/env bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# Prints the pull request's merge base with origin/<base-ref>, deepening the
# fetched history once when the shallow checkout does not reach it. Prints
# nothing, with a workflow warning, when it still cannot find one. Shared by
# the CI steps that compare a pull request with its merge base.
#
# usage: merge-base.sh <base-ref> <what the caller skips without one>
set -uo pipefail
base_ref="$1"
skipped="$2"
if ! sha=$(git merge-base "origin/$base_ref" HEAD 2>/dev/null); then
  git fetch --deepen=200 origin "$base_ref:refs/remotes/origin/$base_ref" >/dev/null 2>&1 || true
  if ! sha=$(git merge-base "origin/$base_ref" HEAD 2>/dev/null); then
    echo "::warning::no merge base within the fetched history; skipping $skipped" >&2
    exit 0
  fi
fi
echo "$sha"
