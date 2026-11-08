#!/usr/bin/env bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# The typecheck job's commands for a pull request head that predates the root
# `pnpm typecheck` script.
#
# The typecheck job checks out the PR head, while its steps come from the merge
# commit. A head cut before `pnpm typecheck` existed has no such script, and
# its packages' own `typecheck` scripts do not yet cover their docs, so
# `pnpm typecheck` there would either fail or check less than the job did.
# This runs the job's previous command list against that head instead. It is
# frozen: new checks go into a package's `typecheck` script, never here.
# Delete it once no open pull request predates `pnpm typecheck`.
#
# The job loads this from the merge commit, since such a head lacks it.
set -euo pipefail

pnpm -F @astryxdesign/core typecheck:docs
pnpm -F @astryxdesign/lab typecheck:docs
pnpm -F @astryxdesign/charts typecheck:docs
pnpm -F @astryxdesign/richtext typecheck:docs
pnpm -F @astryxdesign/vega typecheck:docs
pnpm -F @astryxdesign/cli typecheck:template-docs
pnpm -F @astryxdesign/cli typecheck:strict
pnpm -F @astryxdesign/storybook typecheck
pnpm -F @astryxdesign/core typecheck
pnpm -F @astryxdesign/lab typecheck
pnpm -F @astryxdesign/charts typecheck
pnpm -F @astryxdesign/richtext typecheck
pnpm -F @astryxdesign/vega typecheck
pnpm -F @astryxdesign/a11y-spec typecheck
pnpm -F @astryxdesign/native typecheck
pnpm -F @astryxdesign/native build
pnpm -F @astryxdesign/native typecheck:types
