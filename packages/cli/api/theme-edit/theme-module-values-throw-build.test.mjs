// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme module whose own values throw when read (a `tokens` getter,
 * a Proxy) gets one answer from every editor command: the build's refusal
 * of the load, never a stack trace or ERR_UNKNOWN.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;
const I = "import {defineTheme} from '@astryxdesign/core/theme';";

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-module-values-throw-build-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} rel @param {string} text */
const write = (rel, text) =>
  fs.writeFileSync(path.join(cwd, 'themes/t', rel), text);

describe('a theme whose tokens getter throws', () => {
  it(
    'is refused by compile, in text and --json, as the build refuses it',
    async () => {
      const source = path.join(cwd, 'themes/t/t.theme.ts');
      const was = fs.readFileSync(source, 'utf8');
      fs.writeFileSync(
        source,
        `${I}\nimport {tSettings} from './t.settings';\nexport const tTheme = defineTheme({extends: tSettings, name: 't', get tokens() { throw new Error('getter-boom'); }});\n`,
      );
      try {
        for (const json of [false, true]) {
          const r = await runCli(
            [
              'experimental',
              'theme',
              'compile',
              'themes/t/t.theme.ts',
              ...(json ? ['--json'] : []),
            ],
            cwd,
          );
          expect(r.status, r.stdout + r.stderr).toBe(1);
          const text = r.stdout + r.stderr;
          expect(text).toContain('getter-boom');
          expect(text).not.toContain('ERR_UNKNOWN');
          expect(text).not.toMatch(/^\s+at /m);
          if (json) expect(JSON.parse(r.stdout).code).toBe('ERR_THEME_LOAD');
        }
      } finally {
        fs.writeFileSync(source, was);
      }
    },
    T,
  );
});
