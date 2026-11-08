// Copyright (c) Meta Platforms, Inc. and affiliates.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/storybook/rtl-audit/rtl-audit.mjs',
);

function runWithIndex(indexContent, {env = {}, timeout} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-audit-cli-'));
  const storybook = path.join(dir, 'storybook');
  const output = path.join(dir, 'rtl-audit-report.json');
  fs.mkdirSync(storybook, {recursive: true});
  if (indexContent !== null) {
    fs.writeFileSync(path.join(storybook, 'index.json'), indexContent);
  }
  // A previous successful result must never satisfy validation after this run.
  fs.writeFileSync(
    output,
    JSON.stringify({
      scope: {packages: ['charts'], filters: []},
      completion: {
        plannedComponentScans: 1,
        completedComponentScans: 1,
        plannedStoryScans: 1,
        completedPositionalScans: 1,
        completedDecorationScans: 1,
      },
      coverage: {total: 1},
    }),
  );
  try {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--storybook-dir',
        storybook,
        '--output',
        output,
        '--packages',
        'charts',
        '--concurrency',
        '1',
      ],
      {
        encoding: 'utf8',
        env: {...process.env, ...env},
        timeout,
      },
    );
    return {...result, reportExists: fs.existsSync(output)};
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

describe('RTL audit CLI input completion', () => {
  it.each([
    ['missing', null, 'cannot read index.json'],
    ['malformed', '{not json', 'cannot read index.json'],
    ['empty', '{"entries":{}}', 'no runnable audited stories'],
  ])(
    'fails a %s index and removes stale report output',
    (_name, index, message) => {
      const result = runWithIndex(index);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(message);
      expect(result.reportExists).toBe(false);
    },
  );

  it('rejects an index with no runnable story for the requested package', () => {
    const result = runWithIndex(
      JSON.stringify({
        entries: {
          'core-button--default': {
            id: 'core-button--default',
            title: 'Core/Button',
            type: 'story',
          },
        },
      }),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'no runnable stories resolved for charts scope',
    );
    expect(result.reportExists).toBe(false);
  });

  it('closes the story server when Chromium cannot launch', () => {
    const result = runWithIndex(
      JSON.stringify({
        entries: {
          'charts-legend--default': {
            id: 'charts-legend--default',
            title: 'Charts/ChartLegend',
            type: 'story',
          },
        },
      }),
      {
        env: {
          PLAYWRIGHT_BROWSERS_PATH: path.join(
            os.tmpdir(),
            'missing-playwright-browsers',
          ),
        },
        timeout: 5000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('browserType.launch');
    expect(result.reportExists).toBe(false);
  });
});
