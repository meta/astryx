// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The legs a workflow job's matrix gives one event.
 * @input A matrix value from a parsed workflow; an event name.
 * @output That event's matrix values.
 * @position Workflow contract tests. A release-check runs wider legs than a
 *   pull request through one expression,
 *   `${{ fromJSON(github.event_name == 'workflow_dispatch' && '<JSON>' || '<JSON>') }}`
 *   (spec:AST-030 FR23); this reads it the way GitHub evaluates it. A plain
 *   list is the same for every event.
 */

const BY_EVENT =
  /^\$\{\{\s*fromJSON\(github\.event_name == 'workflow_dispatch' && '([^']*)' \|\| '([^']*)'\)\s*\}\}$/;

/**
 * @param {unknown} value a matrix key's value, e.g. `strategy.matrix.shard`
 * @param {string} event e.g. `workflow_dispatch` or `pull_request`
 * @returns {unknown[]}
 */
export function matrixFor(value, event) {
  if (Array.isArray(value)) return value;
  const match = BY_EVENT.exec(typeof value === 'string' ? value : '');
  if (!match) throw new Error(`Unrecognized matrix expression: ${value}`);
  return JSON.parse(event === 'workflow_dispatch' ? match[1] : match[2]);
}
