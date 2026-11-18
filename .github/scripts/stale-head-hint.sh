#!/usr/bin/env bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# Explains a failed interaction leg on a head older than the base branch: it
# names each base-branch commit since the merge base that changed a spec the
# leg ran, the harness's sources or the interaction config, which the head
# does not have. The base is the branch's tip now, not the run's merge
# commit, so a re-run also sees a fix that landed after the run started.
# Prints workflow warnings, or one line saying there is nothing newer.
#
# usage: stale-head-hint.sh <base-ref> <the leg's planned spec list>
set -uo pipefail
base_ref="$1"
plan="$2"
here="$(cd "$(dirname "$0")" && pwd)"

git fetch -q --no-tags --filter=blob:none --depth=50 origin \
  "$base_ref:refs/remotes/origin/$base_ref" "$(git rev-parse HEAD)" || true
mb=$(bash "$here/merge-base.sh" "$base_ref" 'the stale-head hint' 10)
if [ -z "$mb" ]; then
  exit 0
fi
mapfile -t specs < "$plan"
# A path counts when this leg's plan lists it, when it is the interaction
# config, or when it is a harness source: not a unit test, a fixture, a doc or
# a harness spec the plan does not list.
newer=$(git log --format='commit %h %s' --name-only "$mb..origin/$base_ref" -- \
  "${specs[@]}" internal/interaction-harness/src/ playwright.interaction.config.ts |
  awk -v plan="$plan" '
    BEGIN { while ((getline line < plan) > 0) if (line != "") planned[line] = 1 }
    /^commit / { print; next }
    $0 == "" { next }
    planned[$0] || $0 == "playwright.interaction.config.ts" { print; next }
    /^internal\/interaction-harness\/src\// && !/\.test\.ts$/ && !/\.fixture\.ts$/ && !/\.md$/ && !/\.browser\.spec\.ts$/ { print }
  ')
if ! awk '/^commit /{c=1;next} c&&NF{f=1} END{exit !f}' <<< "$newer"; then
  echo "$base_ref has no newer change to this leg's specs or the harness."
  exit 0
fi
awk -v base="$base_ref" '
  # A workflow command reads "%" as an escape, so the subject is escaped once
  # for the commit, not again for each file it changed.
  /^commit / { sha = $2; $1 = ""; $2 = ""; subject = substr($0, 3); gsub(/%/, "%25", subject); next }
  NF && shown < 5 {
    printf "::warning title=Update your branch before debugging::%s changed on %s in %s (%s), which this head does not have. Update the branch onto %s and re-run: a test whose file changed on %s gets an update, not a retry.\n", $0, base, sha, subject, base, base
    shown++
  }
' <<< "$newer"
