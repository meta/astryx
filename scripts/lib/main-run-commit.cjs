// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The commit a Main run tested.
 *
 * @input  a workflow run of deploy.yml from the GitHub REST API
 * @output the commit the run names, or null
 * @position shared by the release-check receipt and the skipped-test alarm
 */

'use strict';

/**
 * The commit a Main run names (`Main validation of <sha>`, a dispatch with
 * `sha`), or null. A run without one tests main's tip when it starts, which
 * can be later than its event's commit, so it is no record of any commit
 * (spec:AST-030 FR21, FR22).
 *
 * @param {{display_title?: string}} run
 * @returns {string | null}
 */
function testedSha(run) {
  return (
    /^Main validation of ([0-9a-f]{40})$/.exec(run.display_title ?? '')?.[1] ??
    null
  );
}

module.exports = {testedSha};
