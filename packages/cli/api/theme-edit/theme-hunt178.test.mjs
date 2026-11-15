// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A pseudo key that is no single selector, and a part custom property
 * with capitals, are refused at their line by the editor and warned there by
 * the build, which writes what it wrote before;
 * a part variable set where its element shadows it (localTokens, another
 * part) is refused, and one read on its own part is readable; a pipe where
 * the stylesheet goes is refused on a fresh theme too; values read through
 * an imported object's member, a destructure or an imported function, and
 * an imported typography object, are blamed on their file; a null value
 * warns; a missing source is offered the source near its name.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {
  partCustomPropertyProblem,
  pseudoKeyProblem,
} from '../theme/build/style-keys.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt178-', FIXTURE_PACKAGES);
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
const posix = process.platform !== 'win32';

describe('a pseudo key read as a selector', () => {
  it('names what is left open, what is no selector and what is a list', () => {
    expect(pseudoKeyProblem(':nth-child(2n')).toContain(
      "leaves a parenthesis open, so the build writes a selector the browser reads on through the rules after it, and it drops them all; did you mean ':nth-child(2n)'?",
    );
    expect(pseudoKeyProblem(':hover/*')).toContain('leaves a comment open');
    expect(pseudoKeyProblem('::before"')).toContain('leaves a quote open');
    expect(pseudoKeyProblem(':is(:hover')).toContain(
      "did you mean ':is(:hover)'?",
    );
    expect(pseudoKeyProblem(':hover)')).toContain('is no selector');
    expect(pseudoKeyProblem(':hover {')).toContain('open');
    expect(pseudoKeyProblem(':hover,')).toContain('holds an empty selector');
    expect(pseudoKeyProblem(':hover, :focus-visible')).toContain(
      "so :focus-visible would style every element it matches in the app: give each its own key, ':hover': {…}, ':focus-visible': {…}",
    );
    for (const ok of [
      ':hover',
      '::before',
      ':hover::after',
      ':not(:disabled):hover',
      ':nth-child(2n+1 of .x)',
      ':has(> img)',
      ':is(:hover, :focus)',
      ':-webkit-autofill',
      '[data-x="a"]',
    ])
      expect(pseudoKeyProblem(ok), ok).toBeNull();
  });

  it(
    'warns a broken key at its line in a plain theme and theme build, writing what it wrote before, and refuses it in an editor theme',
    async () => {
      await themeEditNew('k2', {cwd});
      for (const [key, written] of [
        [':nth-child(2n', '.astryx-button:nth-child(2n {'],
        [':hover/*', '.astryx-button:hover/*'],
        [':is(:hover', '.astryx-button:is(:hover'],
        [':hover)', '.astryx-button:hover)'],
        [':hover, :focus', '.astryx-button:hover, :focus'],
      ]) {
        const fields = `components: {button: {base: {'${key}': {color: 'red'}}}}`;
        plain(fields);
        for (const args of [
          ['experimental', 'theme', 'compile', 'plain/p.ts'],
          ['theme', 'build', 'plain/p.ts'],
        ]) {
          fs.rmSync(path.join(cwd, 'plain/p.css'), {force: true});
          const p = json(args);
          expect(p.status, `${args[0]} ${key}`).toBe(0);
          expect(
            JSON.stringify(p.env.data.warnings),
            `${args[0]} ${key}`,
          ).toContain(
            JSON.stringify(
              `components.button.base.${key} (line 4): ${key} `,
            ).slice(1, -1),
          );
          expect(
            fs.readFileSync(path.join(cwd, 'plain/p.css'), 'utf8'),
            `${args[0]} ${key}`,
          ).toContain(written);
        }
        own('k2', fields);
        const e = compileOwn('k2');
        expect(e.status, key).toBe(1);
        expect(e.env.error, key).toContain(
          `components.button.base ${key} (line 7): ${key} `,
        );
      }
      own(
        'k2',
        "components: {button: {base: {':nth-child(2n)': {color: 'red'}}}}",
      );
      expect(compileOwn('k2').status).toBe(0);
    },
    T,
  );
});

describe('a custom property with capitals on a part', () => {
  it('names the name the build would write', () => {
    expect(partCustomPropertyProblem('--myColor')).toContain(
      'so it would set --my-color while var(--myColor) reads --myColor',
    );
    expect(partCustomPropertyProblem('--my-color')).toBeNull();
  });

  it(
    'is warned at its line by the build, which writes what it wrote before, and refused by the editor',
    async () => {
      await themeEditNew('k6', {cwd});
      const fields =
        "components: {button: {base: {'--myColor': 'blue', color: 'var(--myColor)'}}}";
      plain(fields);
      const p = compile('plain/p.ts');
      expect(p.status).toBe(0);
      expect(JSON.stringify(p.env.data.warnings)).toContain(
        'components.button.base.--myColor (line 4): --myColor has capitals',
      );
      expect(fs.readFileSync(path.join(cwd, 'plain/p.css'), 'utf8')).toContain(
        '--my-color: blue;',
      );
      own('k6', fields);
      const e = compileOwn('k6');
      expect(e.status).toBe(1);
      expect(e.env.error).toContain('--myColor has capitals');
      own(
        'k6',
        "components: {button: {base: {'--my-color': 'blue', color: 'var(--my-color)'}}}",
      );
      expect(compileOwn('k6').status).toBe(0);
    },
    T,
  );
});

describe('part variables Core sets on its own element', () => {
  it(
    'refuses one in localTokens and on another part, and reads one on its own part',
    async () => {
      await themeEditNew('k5', {cwd});
      own('k5', "localTokens: {'--button-focus-offset': '9px'}");
      const local = compileOwn('k5');
      expect(local.status).toBe(1);
      expect(local.env.error).toContain(
        "--button-focus-offset is a variable Button sets on its own element, so a value in the page's localTokens never reaches it: set it on the part, components: {button: {base: {'--button-focus-offset': \"9px\"}}}",
      );
      // A name of the theme's own that only resembles one stays its own.
      own('k5', "localTokens: {'--button-focus-ofset': '9px'}");
      expect(compileOwn('k5').status).toBe(0);
      own('k5', "components: {card: {base: {'--button-focus-offset': '9px'}}}");
      const card = compileOwn('k5');
      expect(card.status).toBe(1);
      expect(card.env.error).toContain(
        '--button-focus-offset is a variable Button sets on its own element, so a value on card never reaches it: set it on the part, components: {button: {base: {\'--button-focus-offset\': "9px"}}}',
      );
      for (const read of [
        "outlineOffset: 'var(--button-focus-offset)'",
        "':focus-visible': {outlineOffset: 'calc(var(--button-focus-offset) * 2)'}",
      ]) {
        own('k5', `components: {button: {base: {${read}}}}`);
        const r = compileOwn('k5');
        expect(r.status, read).toBe(0);
      }
    },
    T,
  );
});

describe.skipIf(!posix)(
  'a named pipe where a fresh theme keeps its stylesheet',
  () => {
    it(
      'is refused by set in a new process, never a failed module load',
      async () => {
        await themeEditNew('k1', {cwd});
        const css = path.join(cwd, 'themes/k1/k1.css');
        fs.rmSync(css);
        expect(spawnSync('mkfifo', [css]).status).toBe(0);
        const r = json([
          'experimental',
          'theme',
          'editor',
          'set',
          'k1',
          'corners',
          'pill',
        ]);
        expect(r.status).toBe(1);
        expect(r.env.code).toBe('ERR_FILE_EXISTS');
        expect(r.env.error).toContain('themes/k1/k1.css is a named pipe');
        fs.rmSync(css);
      },
      T,
    );
  },
);

describe('values read from another file through an expression', () => {
  it(
    "blames a member of an imported object, a destructure of one and an imported function's return on that file",
    async () => {
      await themeEditNew('k4', {cwd});
      write(
        'themes/k4/shared.ts',
        "export const all = {\n  toks: {'--color-accent': 'nope'},\n};\nexport function make() {\n  return {'--color-accent': 'nope'};\n}\n",
      );
      for (const [imports, fields, line] of [
        ["import {all} from './shared';", 'tokens: all.toks', 2],
        [
          "import {all} from './shared';\nconst {toks} = all;",
          'tokens: toks',
          2,
        ],
        ["import {make} from './shared';", 'tokens: make()', 5],
      ]) {
        own('k4', String(fields), String(imports));
        const r = compileOwn('k4');
        expect(r.status, String(fields)).toBe(1);
        expect(r.env.error, String(fields)).toContain(
          `(in themes/k4/shared.ts, line ${line})`,
        );
        expect(r.env.error, String(fields)).toContain(
          'Change it in themes/k4/shared.ts',
        );
      }
    },
    T,
  );

  it(
    'blames an imported typography object on its file',
    async () => {
      await themeEditNew('k12', {cwd});
      write(
        'themes/k12/brand.ts',
        "export const T = {body: {weight: 'bold-ish'}};\n",
      );
      for (const [imports, fields] of [
        ["import {T} from './brand';", 'typography: T'],
        ["import * as B from './brand';", 'typography: B.T'],
      ]) {
        own('k12', fields, imports);
        const r = compileOwn('k12');
        expect(r.status, fields).toBe(1);
        expect(r.env.error, fields).toContain(
          '(in themes/k12/brand.ts, line 1)',
        );
        expect(r.env.error, fields).toContain(
          'Change it in themes/k12/brand.ts',
        );
      }
    },
    T,
  );
});

describe("a null value in an editor theme's own file", () => {
  it(
    'builds as it is with a warning at its line, and show and set still work',
    async () => {
      await themeEditNew('k10', {cwd});
      for (const [fields, where] of [
        [
          'components: {card: {base: {padding: null}}} as any',
          'components.card.base.padding (line 7): padding holds null',
        ],
        [
          "tokens: {'--color-accent': null} as any",
          'tokens.--color-accent (line 7): --color-accent holds null',
        ],
      ]) {
        own('k10', fields);
        const r = compileOwn('k10');
        expect(r.status, fields).toBe(0);
        expect(JSON.stringify(r.env.data.warnings), fields).toContain(where);
        await themeEditShow('k10', {cwd});
        const set = await themeEditSet('k10', 'corners', 'pill', {cwd});
        expect(JSON.stringify(set), fields).not.toContain('not checked');
      }
    },
    T,
  );
});

describe('a missing theme source near the one that exists', () => {
  it(
    'is offered that source, never called a generated file',
    async () => {
      await themeEditNew('k9', {cwd});
      for (const file of [
        'themes/k9/k9.theme',
        'themes/k9/k9.them.ts',
        'themes/k9/k9.theme.tsx',
        'themes/k9/K9.theme.ts',
      ]) {
        const r = compile(file);
        expect(r.status, file).toBe(1);
        expect(r.env.error, file).not.toContain('generated file');
        expect(JSON.stringify(r.env), file).toContain(
          'experimental theme compile themes/k9/k9.theme.ts',
        );
      }
    },
    T,
  );
});
