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
const interpolate = (text, options) =>
  text.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, expression) =>
    String(evaluate(expression, options)),
  );

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

  it('runs again when a maintainer adds or removes the label', () => {
    expect(workflow.on.pull_request.types).toEqual(
      expect.arrayContaining(['labeled', 'unlabeled']),
    );
    for (const action of ['labeled', 'unlabeled'])
      expect(evaluate(job.if, {action, label: ALLOW_LABEL}), action).toBe(true);
    expect(evaluate(job.if)).toBe(true);
  });

  it('skips the job for any other label, ci:run included, and never cancels a check in progress', () => {
    for (const label of ['ci:run', 'ci:run-visual', 'needs-design']) {
      expect(evaluate(job.if, {action: 'labeled', label}), label).toBe(false);
      expect(
        interpolate(workflow.concurrency.group, {action: 'labeled', label}),
      ).toBe('codemod-verify-8690-other-label-42');
    }
    // The label's own events and pushes share the pull request's group.
    expect(interpolate(workflow.concurrency.group)).toBe('codemod-verify-8690');
    expect(
      interpolate(workflow.concurrency.group, {
        action: 'labeled',
        label: ALLOW_LABEL,
      }),
    ).toBe('codemod-verify-8690');
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
    // Removing the label re-runs the check without it, so it fails again.
    expect(evaluate(allow, {action: 'unlabeled', label: ALLOW_LABEL})).toBe(
      false,
    );
  });
});
