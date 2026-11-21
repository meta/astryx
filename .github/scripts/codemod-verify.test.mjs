// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {
  ALLOW_LABEL,
  baseVersion,
  changedFiles,
  formatFiles,
  report,
} from './codemod-verify.mjs';

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

describe('consumer paths with shell characters', () => {
  // A route group, a dollar sign, a space and a backtick: a shell string
  // would break on each, and the file would be skipped as new.
  const changed = [
    'apps/sandbox/src/app/(raw)/page.tsx',
    'apps/sandbox/src/$cost.tsx',
    'apps/sandbox/src/two words.tsx',
    'apps/sandbox/src/tick`tock.tsx',
  ];
  const added = 'apps/sandbox/src/(new) $one.tsx';

  it('lists every changed path and reads each one at the base', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-verify-'));
    try {
      const git = (/** @type {string[]} */ ...args) =>
        execFileSync('git', args, {cwd: dir, encoding: 'utf8'});
      const write = (
        /** @type {string} */ file,
        /** @type {string} */ text,
      ) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
        fs.writeFileSync(path.join(dir, file), text);
      };
      git('init', '-q');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'test');
      git('config', 'commit.gpgsign', 'false');
      for (const file of changed) write(file, 'base\n');
      git('add', '-A');
      git('commit', '-qm', 'base');
      const base = git('rev-parse', 'HEAD').trim();
      for (const file of changed) write(file, 'changed\n');
      write(added, 'new\n');
      git('add', '-A');
      git('commit', '-qm', 'change');

      expect(changedFiles(base, {cwd: dir}).sort()).toEqual(
        [...changed, added].sort(),
      );
      for (const file of changed)
        expect(baseVersion(base, file, {cwd: dir}), file).toBe('base\n');
      expect(baseVersion(base, added, {cwd: dir})).toBeNull();
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('formatting codemod output', () => {
  it('formats a file whose name a shell would expand, and only that file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-format-'));
    try {
      // Under bash, `a{b,c}.mjs` expands to `ab.mjs ac.mjs`.
      const file = path.join(dir, 'a{b,c}.mjs');
      const other = path.join(dir, 'ab.mjs');
      fs.writeFileSync(file, 'const  x = {a:1}\n');
      fs.writeFileSync(other, 'const  y = {b:2}\n');
      formatFiles([file]);
      expect(fs.readFileSync(file, 'utf8')).toBe('const x = { a: 1 };\n');
      expect(fs.readFileSync(other, 'utf8')).toBe('const  y = {b:2}\n');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
