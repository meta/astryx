// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {ALLOW_LABEL, report} from './codemod-verify.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = yaml.parse(
  fs.readFileSync(
    path.join(root, '.github/workflows/codemod-verify.yml'),
    'utf8',
  ),
);
const job = workflow.jobs['verify-codemods'];
const verify = job.steps.find(step => step.id === 'verify');

// Only this trusted workflow's expressions are evaluated, against a pull
// request event built from the options.
function evaluate(
  expression,
  {
    action = 'synchronize',
    label,
    labels = [],
    draft = false,
    fork = false,
  } = {},
) {
  const code = expression
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    // GitHub's object filter: `labels.*.name` lists the labels' names.
    .replace(
      /contains\(github\.event\.pull_request\.labels\.\*\.name, '([^']+)'\)/g,
      "github.event.pull_request.labels.some(each => each.name === '$1')",
    )
    .replace(/format\('([^']*)\{0\}', ([^)]+)\)/g, "('$1' + $2)");
  return Function(
    'github',
    `return (${code});`,
  )({
    event_name: 'pull_request',
    repository: 'meta/astryx',
    run_id: 42,
    event: {
      action,
      label: label ? {name: label} : undefined,
      pull_request: {
        number: 8690,
        draft,
        labels: labels.map(name => ({name})),
        head: {repo: {full_name: fork ? 'someone/astryx' : 'meta/astryx'}},
      },
    },
  });
}

describe('the allow-manual-edit owner exception', () => {
  const mismatchDetails = [
    {file: 'apps/storybook/src/A.stories.tsx', diffLines: 4},
    {file: 'e2e/b.spec.ts', diffLines: 1, issues: 'missing removals: 1'},
  ];

  it('passes with the label, and still lists every mismatch', () => {
    const lines = [];
    const code = report({
      matches: 3,
      mismatchDetails,
      allowed: true,
      log: line => lines.push(line),
    });
    const output = lines.join('\n');
    expect(code).toBe(0);
    expect(output).toContain(
      'apps/storybook/src/A.stories.tsx (4 lines differ)',
    );
    expect(output).toContain('e2e/b.spec.ts (missing removals: 1)');
    expect(output).toContain(`allowed by ${ALLOW_LABEL} (owner exception)`);
  });

  it('fails without the label', () => {
    const lines = [];
    const code = report({
      matches: 3,
      mismatchDetails,
      allowed: false,
      log: line => lines.push(line),
    });
    expect(code).toBe(1);
    expect(lines.join('\n')).not.toContain('owner exception');
  });

  it('passes when the codemods reproduce every change', () => {
    expect(
      report({matches: 2, mismatchDetails: [], allowed: false, log: () => {}}),
    ).toBe(0);
  });

  it('starts no run on a label: the label takes effect on the next push or a draft-and-ready toggle', () => {
    expect(workflow.on.pull_request.types).toEqual([
      'opened',
      'synchronize',
      'reopened',
      'ready_for_review',
    ]);
    expect(workflow.concurrency.group).toBe(
      'codemod-verify-${{ github.event.pull_request.number }}',
    );
  });

  it("keeps a fork's and a draft's runs as before", () => {
    expect(evaluate(job.if, {fork: true})).toBe(false);
    expect(evaluate(job.if, {fork: true, labels: ['ci:run']})).toBe(true);
    expect(evaluate(job.if, {draft: true})).toBe(false);
  });

  it('tells the check whether the pull request carries the label', () => {
    const allow = verify.env.ALLOW_MANUAL_EDIT;
    expect(evaluate(allow, {labels: [ALLOW_LABEL]})).toBe(true);
    expect(evaluate(allow, {labels: ['ci:run']})).toBe(false);
    // Without the label, the next run fails again.
    expect(evaluate(allow, {labels: []})).toBe(false);
  });
});
