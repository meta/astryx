// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file accessibility-audit.test.mjs
 * Pins the --components and Storybook-index contracts of the a11y audit CLI.
 * An explicitly empty component set is the only zero-work success. Missing or
 * malformed Storybook input must fail without leaving a success-shaped report.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(SCRIPTS_DIR, 'accessibility-audit.js');
const BASELINE = path.resolve(SCRIPTS_DIR, '..', 'a11y-baseline.json');

function runAudit(args, setup) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-audit-'));
  const output = path.join(dir, 'report.json');
  try {
    setup?.(dir, output);
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--output', output, ...args],
      {cwd: dir, encoding: 'utf8'},
    );
    const report = fs.existsSync(output)
      ? JSON.parse(fs.readFileSync(output, 'utf8'))
      : null;
    return {...result, report};
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

describe('accessibility-audit --components contract', () => {
  it('audits nothing only when --components is explicitly empty', () => {
    const result = runAudit([
      '--components',
      '',
      '--baseline',
      BASELINE,
      '--fail-on-new',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No components to audit');
    expect(result.report.components).toEqual({});
    expect(result.report.summary.totalViolations).toBe(0);
  });

  it('fails closed when the all-stories audit has no Storybook build', () => {
    const result = runAudit([], (_dir, output) => {
      fs.writeFileSync(output, '{"summary":{"totalViolations":0}}');
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Storybook build not found');
    expect(result.report).toBeNull();
  });

  it('fails closed when selected components have no Storybook build', () => {
    const result = runAudit(['--components', 'Text,Heading']);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('Text, Heading');
    expect(result.stderr).toContain('Storybook build not found');
    expect(result.report).toBeNull();
  });

  it.each([
    ['empty', {entries: {}}],
    [
      'docs-only',
      {
        entries: {
          'core-button--docs': {
            id: 'core-button--docs',
            title: 'Core/Button',
            type: 'docs',
          },
        },
      },
    ],
  ])('fails closed when the Storybook index is %s', (_name, index) => {
    const result = runAudit([], dir => {
      const storybook = path.join(dir, 'apps/storybook/dist');
      fs.mkdirSync(storybook, {recursive: true});
      fs.writeFileSync(path.join(storybook, 'index.json'), JSON.stringify(index));
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Storybook index contains no runnable story entries',
    );
    expect(result.report).toBeNull();
  });

  it('fails closed before routing when the Storybook index is invalid', () => {
    const result = runAudit(['--components', 'core/Button'], dir => {
      const storybook = path.join(dir, 'apps/storybook/dist');
      fs.mkdirSync(storybook, {recursive: true});
      fs.writeFileSync(path.join(storybook, 'index.json'), '{not json');
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Could not read Storybook index');
    expect(result.stderr).not.toContain('No owned Storybook stories resolved');
    expect(result.report).toBeNull();
  });
});
