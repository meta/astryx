// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme build warns a misspelled field wherever the theme's sources
 * write its input (a const, a renamed defineTheme, a re-exported module);
 * a BigInt or a boxed string inside a part is warned by what Core writes,
 * and the build goes on (a value that holds itself stops it, at its line);
 * a TypeScript type assertion in a `.ts` theme keeps every line.
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
  cwd = makeLinkedFixture('astryx-theme-k42-values-', FIXTURE_PACKAGES);
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
    'is warned wherever the theme writes its input',
    () => {
      write(
        'f/a.ts',
        `${CORE}\nconst input = {\n  name: 'a',\n  component: {button: {base: {color: 'red'}}},\n};\nexport default defineTheme(input);\n`,
      );
      expect(warned(build('f/a.ts'))).toContain(
        'component (line 4): component is no field defineTheme takes, so the build reads nothing from it; did you mean components?',
      );
      write(
        'f/b.ts',
        `import {defineTheme as dt} from '@astryxdesign/core/theme';\nexport default dt({\n  name: 'b',\n  tokenz: {'--color-accent': '#f00'},\n});\n`,
      );
      expect(warned(build('f/b.ts'))).toContain(
        'tokenz (line 4): tokenz is no field defineTheme takes',
      );
      write(
        'f/real.ts',
        `${CORE}\nexport default defineTheme({\n  name: 'c',\n  component: {button: {base: {color: 'red'}}},\n});\n`,
      );
      write('f/c.ts', `export {default} from './real';\n`);
      expect(warned(build('f/c.ts'))).toContain(
        'component (in f/real.ts, line 4): component is no field defineTheme takes',
      );
      write(
        'f/d.ts',
        `${CORE}\nconst dark = {\n  tokenz: {'--color-accent': '#f00'},\n};\nexport default defineTheme({name: 'd', onDark: dark});\n`,
      );
      expect(warned(build('f/d.ts'))).toContain(
        'onDark.tokenz (line 3): tokenz is no field onDark takes',
      );
    },
    T,
  );
});

describe('a TypeScript type assertion in a .ts theme', () => {
  it(
    'keeps every warning at its line, and the field check',
    () => {
      write(
        'f/e.ts',
        `${CORE}\nconst n = <any>1;\nexport default defineTheme({\n  name: 'e',\n  component: {button: {base: {color: 'red'}}},\n  tokens: {'--color-accent': true as any},\n});\n`,
      );
      const w = warned(build('f/e.ts'));
      expect(w).toContain('component (line 5): ');
      expect(w).toContain('tokens.--color-accent (line 6): ');
      expect(w).not.toContain('not written in this file');
    },
    T,
  );
});

describe('a BigInt inside a part', () => {
  it(
    'is warned by what Core writes, and the build goes on; one that holds itself stops it at its line',
    () => {
      for (const [fields, why] of [
        [
          "components: {button: {base: {color: ['red', 10n] as any}}}",
          'color holds an array, which the build writes as JSON text ([\\"red\\",\\"10\\"])',
        ],
        [
          "components: {button: {base: {'@media (min-width: 1px)': {padding: 10n as any}}}}",
          'padding holds 10n, a BigInt, which the build writes as 10',
        ],
        [
          'components: {button: {base: {\'[data-size="sm"]\': {padding: 10n as any}}}}',
          'padding holds 10n, a BigInt, which the build writes as 10',
        ],
      ]) {
        plain(fields);
        const p = build('plain/p.ts');
        expect(p.status, fields).toBe(0);
        expect(warned(p), fields).toContain(why);
      }
      write(
        'f/loop.ts',
        `${CORE}\nconst loop: any = {};\nloop.self = loop;\nexport default defineTheme({\n  name: 'loop',\n  components: {button: {base: {color: [loop] as any}}},\n});\n`,
      );
      const p = build('f/loop.ts');
      expect(p.status).toBe(1);
      expect(p.env.code ?? p.env.error?.code).toBe('ERR_THEME_INVALID');
      expect(JSON.stringify(p.env)).toContain(
        'components.button.base.color (line 6): color holds an array that holds itself',
      );
    },
    T,
  );
});

describe('a boxed string', () => {
  it(
    'is written as its text, as a token, a pair half or a part value',
    () => {
      plain(
        "tokens: {'--radius-element': new String('4px') as any, '--color-accent': [new String('#fff'), '#000'] as any}",
      );
      expect(build('plain/p.ts').env.data.warnings).toEqual([]);
      plain(
        "components: {button: {base: {padding: new String('4px') as any}}}",
      );
      const p = build('plain/p.ts');
      expect(p.env.data.warnings).toEqual([]);
      expect(fs.readFileSync(path.join(cwd, 'plain/p.css'), 'utf8')).toContain(
        'padding: 4px',
      );
    },
    T,
  );
});

describe('a method field, a BigInt typography value, a symbol, or tokens that hold themselves', () => {
  it(
    'is warned, or stops the build at its line, never with a raw error',
    () => {
      write(
        'f/m.ts',
        `${CORE}\nexport default defineTheme({\n  name: 'm',\n  onLoad() {\n    return 1;\n  },\n  typography: {body: {family: 'Inter', weight: 600n as any}},\n});\n`,
      );
      const w = warned(build('f/m.ts'));
      expect(w).toContain(
        'onLoad (line 4): onLoad is no field defineTheme takes',
      );
      expect(w).toContain(
        "typography.body.weight (line 7): weight holds 600n, a BigInt, which is no CSS value: give it a CSS value in quotes, such as '600'",
      );
      for (const [file, text, why] of [
        [
          'f/s.ts',
          `${CORE}\nexport default defineTheme({\n  name: 's',\n  tokens: {'--color-accent': Symbol('x') as any},\n});\n`,
          'tokens.--color-accent (line 4): --color-accent holds a symbol, which has no text the build can write',
        ],
        [
          'f/o.ts',
          `${CORE}\nconst o: any = {'--color-accent': 'red'};\no.self = o;\nexport default defineTheme({\n  name: 'o',\n  tokens: o,\n});\n`,
          'self holds an object that holds itself, which has no text the build can write',
        ],
      ]) {
        write(file, text);
        const p = build(file);
        expect(p.status, file).toBe(1);
        expect(p.env.code ?? p.env.error?.code, file).toBe('ERR_THEME_INVALID');
        expect(JSON.stringify(p.env), file).toContain(why);
      }
    },
    T,
  );
});
