// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-run-scripts-parse.test.mjs
 * @input Every workflow under .github/workflows and every composite action
 *   under .github/actions
 * @output Fails when a step's bash `run:` script does not parse
 * @position Contract test for the repository's GitHub Actions scripts
 *   (spec:AST-030 FR11)
 *
 * A script that does not parse fails its step on every run that reaches it,
 * whatever the pull request changes. A common cause is an apostrophe in a
 * comment or message inside a single-quoted `bash -c '...'` body: it closes
 * the quote early, and the rest of the body becomes shell syntax.
 *
 * Each `run:` script runs through `bash -n`, which parses without executing,
 * and so does each single-quoted script it hands to `bash -c '...'` or
 * `sh -c '...'`. `${{ ... }}` expressions are replaced with a plain word
 * first, the way the runner substitutes them before bash sees the script.
 * Steps whose `shell:` is not bash are skipped.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const githubDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/** Workflow and composite-action files, relative to the repository root. */
function workflowFiles() {
  const workflows = fs
    .readdirSync(path.join(githubDir, 'workflows'))
    .filter(name => /\.ya?ml$/.test(name))
    .map(name => path.join('workflows', name));
  const actions = fs
    .readdirSync(path.join(githubDir, 'actions'), {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .flatMap(entry =>
      ['action.yml', 'action.yaml']
        .map(name => path.join('actions', entry.name, name))
        .filter(file => fs.existsSync(path.join(githubDir, file))),
    );
  return [...workflows, ...actions];
}

/**
 * Every bash `run:` script in one file, labelled by job (or action) and step.
 *
 * @param {string} file path relative to .github
 * @returns {{label: string, script: string}[]}
 */
function runScripts(file) {
  const doc = yaml.parse(fs.readFileSync(path.join(githubDir, file), 'utf8'));
  /** @type {[string, any[], string | undefined][]} */
  const stepLists = [];
  for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
    const jobShell = /** @type {any} */ (job)?.defaults?.run?.shell;
    stepLists.push([
      jobId,
      /** @type {any} */ (job)?.steps ?? [],
      jobShell ?? doc?.defaults?.run?.shell,
    ]);
  }
  if (Array.isArray(doc?.runs?.steps)) {
    stepLists.push(['(action)', doc.runs.steps, undefined]);
  }
  /** @type {{label: string, script: string}[]} */
  const out = [];
  for (const [owner, steps, defaultShell] of stepLists) {
    steps.forEach((step, index) => {
      if (typeof step?.run !== 'string') return;
      const shell = String(step.shell ?? defaultShell ?? 'bash');
      if (!/^bash\b/.test(shell)) return;
      const label = `${file} › ${owner} › ${step.name ?? step.id ?? `step ${index + 1}`}`;
      const script = step.run.replace(/\$\{\{[\s\S]*?\}\}/g, 'EXPR');
      out.push({label, script});
      // A single-quoted body cannot contain a quote, so it ends at the next one.
      let nested = 0;
      for (const match of script.matchAll(
        /\b(?:ba)?sh\s+(?:-\w+\s+)*-c\s+'([^']*)'/g,
      )) {
        nested += 1;
        out.push({
          label: `${label} › inner script ${nested}`,
          script: match[1],
        });
      }
    });
  }
  return out;
}

const scripts = workflowFiles().flatMap(runScripts);

describe('workflow run scripts', () => {
  it('finds the scripts it checks', () => {
    expect(scripts.length).toBeGreaterThan(50);
  });

  it.each(scripts.map(({label, script}) => [label, script]))(
    '%s parses as bash',
    (_label, script) => {
      const result = spawnSync('bash', ['-n'], {
        input: script,
        encoding: 'utf8',
      });
      expect(result.stderr.trim()).toBe('');
      expect(result.status).toBe(0);
    },
  );
});
