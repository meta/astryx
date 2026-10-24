#!/usr/bin/env bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# Lets a pr-a11y step run against a PR head that predates its spec file.
#
# Not run directly: pr-a11y sources it into every later step through
# BASH_ENV. A PR step's body comes from the merge commit, but pr-a11y checks
# out the PR head. A contract step added on main after the PR branched names a
# spec file that head does not have, and Playwright fails the step with "No
# tests found".
#
# This wraps `pnpm exec playwright test`: spec files absent from the checkout
# are dropped from the command with a notice, and a step left with none passes
# without running Playwright. Every other pnpm command runs unchanged. The
# routing tests keep main's steps pointing at spec files that exist, so only an
# older head skips anything; rebasing it runs the new contract.
#
# The job loads this from the merge commit (github.sha) its steps come from,
# since an older PR head does not have it and the PR's recorded base can lag
# main.

pnpm() {
  if [ "${1-}" = exec ] && [ "${2-}" = playwright ] && [ "${3-}" = test ]; then
    local arg
    local kept=0
    local dropped=0
    local args=()
    for arg in "${@:4}"; do
      case "$arg" in
        -*) ;;
        *.spec.ts | *.spec.tsx | *.spec.js | *.spec.mjs)
          if [ ! -e "$arg" ]; then
            echo "::notice title=Spec not in this PR head::${arg} is not in this pull request's head; rebase onto main to run it."
            dropped=$((dropped + 1))
            continue
          fi
          kept=$((kept + 1))
          ;;
      esac
      args+=("$arg")
    done
    if [ "$dropped" -gt 0 ] && [ "$kept" -eq 0 ]; then
      echo "None of this step's spec files is in the PR head; nothing to run."
      return 0
    fi
    set -- exec playwright test "${args[@]}"
  fi
  command pnpm "$@"
}
