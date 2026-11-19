// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Theme inputs written in unusual ways: theme build warns a
 * misspelled field in a theme a `let` is reassigned to or a dynamic import
 * loads, a Map given as tokens, an object with no text form as a token, and
 * a BigInt type-scale base, at the field and never with Node's own text;
 * the editor reads a boxed token as the text the build writes.
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
  cwd = makeLinkedFixture('astryx-theme-unusual-inputs-', FIXTURE_PACKAGES);
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

const CORE = "import {defineTheme} from '@astryxdesign/core/theme';";
/** @param {string} rel */
const build = rel => json(['theme', 'build', rel]);
/** @param {{env: any}} p */
const warned = p => JSON.stringify(p.env.data?.warnings ?? []);

describe('a misspelled field', () => {
  it(
    'is warned in a theme a let is reassigned to, or a dynamic import loads',
    () => {
      write(
        'u/r.ts',
        `let a: any = {};\na = {\n  name: 'r',\n  tokenz: {'--color-accent': 'red'},\n};\nexport default a;\n`,
      );
      expect(warned(build('u/r.ts'))).toContain(
        'tokenz (line 4): tokenz is no field defineTheme takes',
      );
      write(
        'u/in.ts',
        `export const input = {\n  name: 'd',\n  tokenz: {'--color-accent': 'red'},\n};\n`,
      );
      write(
        'u/d.ts',
        `const m = await import('./in');\nexport default m.input;\n`,
      );
      expect(warned(build('u/d.ts'))).toContain(
        'tokenz (in u/in.ts, line 3): tokenz is no field defineTheme takes',
      );
    },
    T,
  );
});

describe('tokens given as a Map', () => {
  it('are warned once: the build reads an object’s own keys', () => {
    plain("tokens: new Map([['--color-accent', 'red']]) as any");
    const p = build('plain/p.ts');
    expect(p.status).toBe(0);
    const w = p.env.data.warnings.filter((/** @type {string} */ x) =>
      x.includes('holds a Map'),
    );
    expect(w).toEqual([
      expect.stringContaining(
        'tokens (line 4): tokens holds a Map, whose entries the build does not read',
      ),
    ]);
  });
});

describe('an object with no text form as a token', () => {
  it('stops the build at its field, never with Node’s own text', () => {
    plain("tokens: {'--color-accent': Object.create(null)}");
    const p = build('plain/p.ts');
    expect(p.status).toBe(1);
    const text = JSON.stringify(p.env);
    expect(text).toContain(
      'tokens.--color-accent (line 4): --color-accent holds an object with no text form',
    );
    expect(text).not.toContain('Cannot convert object to primitive value');
  });
});

describe('a BigInt type-scale base in a plain theme', () => {
  it(
    'is warned at its field, and the build goes on',
    () => {
      write(
        'u/s.ts',
        `export default {\n  name: 's',\n  typography: {scale: {base: 16n as any}},\n};\n`,
      );
      const p = build('u/s.ts');
      expect(p.status).toBe(0);
      expect(warned(p)).toContain('typography.scale.base (line 3): ');
      expect(warned(p)).not.toContain('Cannot mix BigInt');
    },
    T,
  );
});

describe('a boxed token in the editor', () => {
  it(
    'is read as the text the build writes',
    async () => {
      await themeEditNew('bx', {cwd});
      own('bx', "tokens: {'--color-accent': new String('red') as any}");
      expect(compileOwn('bx').status).toBe(0);
    },
    T,
  );
});
