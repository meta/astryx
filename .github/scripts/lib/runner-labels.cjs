// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file runner-labels.cjs
 * @input A workflow job (its `runs-on` and matrix)
 * @output Every runner label the job can resolve to, and the set of GitHub's
 *   standard hosted runner labels
 * @position Shared by ci-free-runners.test.mjs (every job runs on a standard
 *   runner unless allowed) and lib/ci-impact.js (the PR report's runner
 *   classes), so both read a job's runners the same way.
 */

/** GitHub's standard hosted runner labels. */
const STANDARD_RUNNERS = new Set([
  'ubuntu-latest',
  'ubuntu-slim',
  'ubuntu-24.04',
  'ubuntu-22.04',
  'ubuntu-24.04-arm',
  'ubuntu-22.04-arm',
  'macos-latest',
  'macos-15',
  'macos-14',
  'windows-latest',
]);

/**
 * Every runner label a job can resolve to. Matrix values include `include`
 * entries; an expression of the shape `cond && 'a' || 'b'` yields both
 * labels. Anything that does not resolve (`${{ vars.X }}`, `${{ inputs.X }}`,
 * `${{ vars.X || 'ubuntu-latest' }}`, a computed matrix) is returned raw, so
 * a caller can tell it is unknown rather than read it as standard.
 */
function labelsOf(job) {
  const runsOn = job?.['runs-on'];
  if (runsOn == null) return [];
  const labels = [];
  for (const value of [runsOn].flat().map(String)) {
    const matrix = /^\$\{\{\s*matrix\.([a-zA-Z0-9_-]+)\s*\}\}$/.exec(value);
    if (matrix) {
      const key = matrix[1];
      const m = job.strategy?.matrix;
      const found =
        m && typeof m === 'object'
          ? [
              ...[m[key] ?? []].flat(),
              ...[m.include ?? []].flat().map(entry => entry?.[key]),
              // A computed include can add any runner: fail closed.
              ...(typeof m.include === 'string' ? [value] : []),
            ]
              .filter(item => item != null)
              .map(String)
          : [];
      labels.push(...(found.length > 0 ? found : [value]));
    } else if (value.includes('${{')) {
      const pair =
        /^\$\{\{\s*([^|]+?)\s*&&\s*'([^']+)'\s*\|\|\s*'([^']+)'\s*\}\}$/.exec(
          value,
        );
      labels.push(...(pair ? [pair[2], pair[3]] : [value]));
    } else {
      labels.push(value);
    }
  }
  return labels;
}

/** Whether a label is an expression `labelsOf` could not resolve. */
function isUnresolved(label) {
  return String(label).includes('${{');
}

module.exports = {STANDARD_RUNNERS, labelsOf, isUnresolved};
