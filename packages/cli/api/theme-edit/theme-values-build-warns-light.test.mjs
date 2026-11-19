// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme build warns a [light, dark] pair with a half that is no color
 * (light-dark() takes colors only) and a pair half that reads a token nothing sets, as it warns
 * the same CSS written as text; and both judges read a var() name as CSS
 * reads one, letters beyond ASCII included.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;
const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);
const T = 240_000;

beforeAll(() => {
  cwd = makeLinkedFixture(
    'astryx-theme-values-build-warns-light-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string[]} args */
const json = args => {
  const r = spawnSync(process.execPath, [BIN, '--json', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
  });
  return {status: r.status, env: JSON.parse(r.stdout)};
};
/** @param {string} file @param {string[]} [more] */
const compile = (file, more = []) =>
  json(['experimental', 'theme', 'compile', file, ...more]);
/** @param {string} rel @param {string} text */
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(cwd, rel)), {recursive: true});
  fs.writeFileSync(path.join(cwd, rel), text);
};
/** A plain theme whose defineTheme input holds `fields` on line 4. @param {string} fields */
const plain = fields =>
  write(
    'plain/p.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';\nexport const pTheme = defineTheme({\n  name: 'p',\n  ${fields},\n});\n`,
  );
/** An editor theme's own source, its fields on line 7. @param {string} slug @param {string} fields @param {string} [imports] */
const own = (slug, fields, imports = '') =>
  write(
    `themes/${slug}/${slug}.theme.ts`,
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\n${imports}\nexport const ${slug}Theme = defineTheme({\n  extends: ${slug}Settings,\n  name: '${slug}',\n  ${fields},\n});\n`,
  );
/** @param {string} slug */
const compileOwn = slug => compile(`themes/${slug}/${slug}.theme.ts`);

/** @param {{env: any}} p */
const warned = p => JSON.stringify(p.env.data?.warnings ?? []);

describe('a [light, dark] pair', () => {
  it('with a half that is no color, or that reads no token, is warned', () => {
    for (const [fields, why] of [
      [
        "tokens: {'--radius-element': ['4px', '12px']}",
        'tokens.--radius-element (line 4): --radius-element gives a light half that is no color (4px)',
      ],
      [
        "tokens: {'--spacing-2': ['4px', '8px']}",
        'light-dark() takes colors only',
      ],
      [
        "tokens: {'--color-accent': ['var(--nope)', '#000']}",
        '--color-accent gives a light half that reads var(--nope), which no token sets',
      ],
      [
        "tokens: {'--color-accent': ['#fff', 'var(--nope)']}",
        '--color-accent gives a dark half that reads var(--nope)',
      ],
    ]) {
      plain(fields);
      const p = json(['theme', 'build', 'plain/p.ts']);
      expect(p.status, fields).toBe(0);
      expect(warned(p), fields).toContain(why);
    }
    plain("tokens: {'--color-accent': ['#fff', 'var(--color-text-primary)']}");
    expect(json(['theme', 'build', 'plain/p.ts']).env.data.warnings).toEqual(
      [],
    );
    // Any half that is no color, not sizes only; a color function, which
    // may be newer than the CSS data, is never judged.
    for (const [pair, why] of [
      ["['200ms', '400ms']", 'gives a light half that is no color (200ms)'],
      ["['#fff', 'Inter']", 'gives a dark half that is no color (Inter)'],
    ]) {
      plain(`tokens: {'--color-accent': ${pair}}`);
      expect(warned(json(['theme', 'build', 'plain/p.ts'])), pair).toContain(
        why,
      );
    }
    plain(
      "tokens: {'--color-accent': ['color-mix(in oklab, red, blue)', 'rgb(from red r g b)']}",
    );
    expect(json(['theme', 'build', 'plain/p.ts']).env.data.warnings).toEqual(
      [],
    );
  });

  it(
    'computed in the file is named as computed, and a theme it extends that does not hold it is not blamed',
    () => {
      write(
        'k/base.ts',
        "import {defineTheme} from '@astryxdesign/core/theme';\nexport const base = defineTheme({name: 'base'});\n",
      );
      write(
        'k/p.ts',
        "import {base} from './base';\nconst k = '--color-' + 'accent';\nexport default {\n  name: 'p',\n  extends: base,\n  tokens: {[k]: true as any},\n};\n",
      );
      expect(warned(json(['theme', 'build', 'k/p.ts']))).toContain(
        'tokens.--color-accent (not written in this file as it is: computed in it, or from a module it imports): ',
      );
    },
    T,
  );
});

describe('a var() name with a letter beyond ASCII', () => {
  it(
    'is read as CSS reads it, by theme build and the editor',
    async () => {
      const fields =
        "tokens: {'--café': 'red', '--color-accent': 'var(--café)'}";
      plain(fields);
      const p = json(['theme', 'build', 'plain/p.ts']);
      expect(p.status).toBe(0);
      expect(p.env.data.warnings).toEqual([]);
      await themeEditNew('k15', {cwd});
      own('k15', fields);
      expect(compileOwn('k15').status).toBe(0);
    },
    T,
  );
});
