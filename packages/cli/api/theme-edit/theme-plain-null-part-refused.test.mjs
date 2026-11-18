// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A plain theme's null part is refused at its line, never a crash,
 * and a null value is warned there; null under a style key is named once;
 * style keys no element carries are warned; pseudo typos anywhere in a
 * selector are refused; a part variable in the page tokens is refused;
 * values read from another file are blamed on it; a pipe where an output
 * goes is refused at once; fonts: system emoji, Apple's interface faces, a
 * package's weight gaps, other font axes and weights between the hundreds;
 * --out names; a theme with no name is named so. Commands run in process
 * and pages render through the stand-in, so the file stays fast.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {fontsourceSuggestion} from './_settings.mjs';
import {oneSystemOf} from './_tables.mjs';
import {shownWeight} from './_preview.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The assertions are about builds, files and messages, not rendered pages:
// a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;
const T = 240_000;

beforeAll(() => {
  cwd = makeLinkedFixture(
    'astryx-theme-plain-null-part-refused-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

// The real program, in process: no Node start per command.
/** @param {string[]} args */
const json = async args => {
  const r = await runCli(['--json', ...args], {cwd});
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
/** An editor theme's own source. @param {string} slug @param {string} fields @param {string} [imports] */
const own = (slug, fields, imports = '') =>
  write(
    `themes/${slug}/${slug}.theme.ts`,
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\n${imports}\nexport const ${slug}Theme = defineTheme({\n  extends: ${slug}Settings,\n  name: '${slug}',\n  ${fields},\n});\n`,
  );
/** @param {string} slug */
const compileOwn = slug => compile(`themes/${slug}/${slug}.theme.ts`);
/** @param {string} rel */
const mkfifo = rel => {
  fs.rmSync(path.join(cwd, rel), {force: true});
  fs.mkdirSync(path.dirname(path.join(cwd, rel)), {recursive: true});
  return spawnSync('mkfifo', [path.join(cwd, rel)]).status === 0;
};
const posix = process.platform !== 'win32';

describe('a plain theme that gives null', () => {
  it(
    'refuses a null part or style key at its line, and writes nothing',
    async () => {
      for (const [fields, where, why] of [
        [
          'components: {button: null} as any',
          'components.button',
          "button holds null, which the build cannot read as a part's style keys",
        ],
        [
          'onDark: {components: {card: null}} as any',
          'onDark.components.card',
          "card holds null, which the build cannot read as a part's style keys",
        ],
        [
          'components: {button: {base: null}} as any',
          'components.button.base',
          'base holds null, which the build cannot read as a block of properties',
        ],
      ]) {
        plain(fields);
        const {status, env} = await compile('plain/p.ts');
        expect(status, fields).toBe(1);
        expect(env.code, fields).toBe('ERR_THEME_INVALID');
        expect(env.error, fields).toContain(`${where} (line 4): ${why}`);
        expect(fs.existsSync(path.join(cwd, 'plain/p.css')), fields).toBe(
          false,
        );
      }
    },
    T,
  );

  it(
    'builds a null value as it is, and warns it at its line',
    async () => {
      for (const [fields, where, written, why] of [
        [
          'components: {button: {base: {backgroundColor: null}}} as any',
          'components.button.base.backgroundColor',
          'background-color: null;',
          "null leaves it unset: the build writes it as it is (backgroundColor: null), which no browser reads, so the base theme's value stays",
        ],
        [
          "tokens: {'--color-accent': null} as any",
          'tokens.--color-accent',
          '--color-accent: null;',
          "a browser keeps that as the token's value, not the base theme's, so a property that reads --color-accent gets the word null: most act as if they were not set",
        ],
        [
          "tokens: {'--font-family-body': null} as any",
          'tokens.--font-family-body',
          '--font-family-body: null;',
          "a font family reads it as a font no system has, so its text shows in the browser's default font",
        ],
      ]) {
        plain(fields);
        const {status, env} = await compile('plain/p.ts');
        expect(status, fields).toBe(0);
        expect(JSON.stringify(env.data.warnings), fields).toContain(
          `${where} (line 4): `,
        );
        expect(JSON.stringify(env.data.warnings), fields).toContain(why);
        expect(
          fs.readFileSync(path.join(cwd, 'plain/p.css'), 'utf8'),
          fields,
        ).toContain(written);
      }
    },
    T,
  );
});

describe('an editor theme that gives null under a style key', () => {
  it(
    'names the null once, with a fix that is no null again',
    async () => {
      await themeEditNew('n3', {cwd});
      own('n3', 'components: {button: {base: null}} as any');
      const r = await compileOwn('n3');
      expect(r.env.error).toContain('gives a value the editor refuses');
      expect(r.env.error).toContain(
        'base holds null, which the build cannot read as a block: give it properties, such as base: {color: …}, or remove it',
      );
      expect(r.env.error).not.toContain('base: {base');
      // A null pseudo-class or at-rule builds no block: warned at its
      // line, as a plain theme's is.
      for (const key of [':hover', '@dark']) {
        own('n3', `components: {button: {base: {'${key}': null}}} as any`);
        const k = await compileOwn('n3');
        expect(k.status, key).toBe(0);
        expect(JSON.stringify(k.env.data.warnings), key).toContain(
          `${key} holds null, so the build writes no block for it`,
        );
      }
    },
    T,
  );
});

describe('style keys no element carries', () => {
  it(
    'warns a closed prop value and a pseudo-class written as a style key',
    async () => {
      plain(
        "components: {button: {'size:xxl': {color: 'red'}, ':hover': {color: 'blue'}, 'variant:primry': {color: 'green'}}}",
      );
      const {status, env} = await compile('plain/p.ts');
      expect(status).toBe(0);
      const warnings = JSON.stringify(env.data.warnings);
      expect(warnings).toMatch(
        /size takes sm, md, lg, and a theme cannot add a value to it, so \\"xxl\\" builds a selector nothing matches/,
      );
      expect(warnings).toContain("such as base: {':hover': {…}}");
      // A new variant is a theme's own, by design.
      expect(warnings).not.toContain('primry');
    },
    T,
  );
});

describe('pseudo typos past the first name', () => {
  it(
    'refuses each with the key corrected',
    async () => {
      await themeEditNew('n8', {cwd});
      for (const [key, fixed] of [
        ['::befor', '::before'],
        [':hover:focus-visble', ':hover:focus-visible'],
        [':not(:hovr)', ':not(:hover)'],
      ]) {
        own('n8', `components: {button: {base: {'${key}': {color: 'red'}}}}`);
        const r = await compileOwn('n8');
        expect(r.status, key).toBe(1);
        expect(r.env.error, key).toContain(`did you mean ${fixed}?`);
      }
      own('n8', "components: {button: {base: {hover: {color: 'red'}}}}");
      expect((await compileOwn('n8')).env.error).toContain(
        "a pseudo-class starts with a colon: write it as ':hover'",
      );
      own(
        'n8',
        "components: {button: {base: {'::before': {content: '\"x\"'}}}}",
      );
      expect((await compileOwn('n8')).status).toBe(0);
    },
    T,
  );
});

describe('values read from another file', () => {
  it(
    'blames the file that holds the value, for every import form',
    async () => {
      await themeEditNew('n9', {cwd});
      const bad = "\nexport const toks = {\n  '--color-accent': 'nope',\n};\n";
      write('themes/n9/shared.ts', bad);
      write('themes/n9/mid.ts', "export {toks} from './shared';\n");
      for (const [imports, value, file] of [
        ["import {toks} from './mid';", 'toks', bad],
        ["import * as s from './shared';", 's.toks', bad],
        [
          "import {toks} from './shared';",
          'toks',
          "\nconst toks = {\n  '--color-accent': 'nope',\n};\nexport {toks};\n",
        ],
      ]) {
        write('themes/n9/shared.ts', file);
        own('n9', `tokens: ${value}`, imports);
        const r = await compileOwn('n9');
        expect(r.env.error, imports).toContain(
          '(in themes/n9/shared.ts, line 3)',
        );
        expect(r.env.error, imports).toContain(
          'Change it in themes/n9/shared.ts',
        );
      }
      write(
        'themes/n9/brand.ts',
        "export const cardStyles = {base: {backgroundColor: '4px'}};\nexport const brand = '12px';\n",
      );
      own(
        'n9',
        'components: {card: cardStyles}',
        "import {cardStyles} from './brand';",
      );
      expect((await compileOwn('n9')).env.error).toContain(
        '(in themes/n9/brand.ts, line 1)',
      );
      own(
        'n9',
        "tokens: {'--color-accent': brand}",
        "import {brand} from './brand';",
      );
      expect((await compileOwn('n9')).env.error).toContain(
        '(in themes/n9/brand.ts, line 2)',
      );
    },
    T,
  );
});

describe('a part variable in the page tokens', () => {
  it(
    'is refused with the part-scoped line, and so is its typo',
    async () => {
      await themeEditNew('n13', {cwd});
      own('n13', "tokens: {'--button-focus-offset': '9px'}");
      const r = await compileOwn('n13');
      expect(r.env.error).toContain(
        "--button-focus-offset is a variable Button sets on its own element, so a value in the page's tokens never reaches it: set it on the part, components: {button: {base: {'--button-focus-offset': \"9px\"}}}",
      );
      own('n13', "tokens: {'--button-focus-ofset': '9px'}");
      expect((await compileOwn('n13')).env.error).toContain(
        'did you mean --button-focus-offset?',
      );
    },
    T,
  );
});

/**
 * Whether the installed Core reads a local token left undefined as not set
 * (a Core before that refuses it, and so does the build).
 */
const coreSkipsUndefinedLocal = await import('@astryxdesign/core/theme')
  .then(core => {
    try {
      core.defineTheme({name: 'probe', localTokens: {'--b': undefined}});
      return true;
    } catch {
      return false;
    }
  })
  .catch(() => false);

describe.skipIf(!coreSkipsUndefinedLocal)('local tokens left undefined', () => {
  it(
    'refuses localTokens: undefined by name, and builds a local token left undefined as not set',
    async () => {
      await themeEditNew('n11', {cwd});
      own('n11', 'localTokens: undefined');
      const root = await compileOwn('n11');
      expect(root.status).toBe(1);
      expect(root.env.error).toContain(
        'localTokens is undefined: omit the field or pass an object',
      );
      own('n11', "localTokens: {'--brand': 'red', '--brand-2': undefined}");
      expect((await compileOwn('n11')).status).toBe(0);
      expect(
        fs.readFileSync(path.join(cwd, 'themes/n11/n11.css'), 'utf8'),
      ).not.toContain('--brand-2');
    },
    T,
  );
});

describe.skipIf(!posix)('a named pipe where a file goes', () => {
  it(
    'is refused at once by compile, its check, --out and set',
    async () => {
      await themeEditNew('n6', {cwd});
      for (const [rel, args] of /** @type {Array<[string, string[]]>} */ ([
        ['themes/n6/n6.css', ['compile', 'themes/n6/n6.theme.ts']],
        [
          'src/themes/n6/n6.css',
          ['compile', 'themes/n6/n6.theme.ts', '--check'],
        ],
      ])) {
        expect(mkfifo(rel)).toBe(true);
        const r = await json(['experimental', 'theme', ...args]);
        expect(r.status, args.join(' ')).toBe(1);
        expect(r.env.error, args.join(' ')).toContain(
          `${rel} is a named pipe, not a file`,
        );
        fs.rmSync(path.join(cwd, rel));
      }
      expect(mkfifo('themes/n6/n6.css')).toBe(true);
      const set = await refusal(() =>
        themeEditSet('n6', 'corners', 'pill', {cwd}),
      );
      expect(set.message).toContain(
        'themes/n6/n6.css is a named pipe, not a file',
      );
      fs.rmSync(path.join(cwd, 'themes/n6/n6.css'));
      plain("tokens: {'--color-accent': 'red'}");
      expect(mkfifo('out/f.css')).toBe(true);
      const out = await compile('plain/p.ts', ['--out', 'out/f.css']);
      expect(out.env.error).toContain('out/f.css is a named pipe, not a file');
      fs.rmSync(path.join(cwd, 'out'), {recursive: true});
    },
    T,
  );
});

describe('--out', () => {
  it(
    'names a stylesheet for .css alone, and warns a ~ the shell did not expand while it writes in the project as before',
    async () => {
      plain("tokens: {'--color-accent': 'red'}");
      const r = await compile('plain/p.ts', ['--out', 'out/.css']);
      expect(JSON.stringify(r.env.data.warnings)).toContain(
        'give it a name such as out/p.css',
      );
      fs.rmSync(path.join(cwd, 'out'), {recursive: true, force: true});
      for (const args of [
        ['experimental', 'theme', 'compile', 'plain/p.ts', '--out', '~/x.css'],
        ['theme', 'build', 'plain/p.ts', '--out', '~/x.css'],
      ]) {
        const t = await json(args);
        expect(t.status, args[0]).toBe(0);
        const warnings = JSON.stringify(t.env.data.warnings);
        expect(warnings, args[0]).toContain(
          'starts with \\"~\\", which is not your home folder here',
        );
        expect(warnings, args[0]).toContain(path.join(cwd, '~', 'x.css'));
        expect(warnings, args[0]).toContain(
          `give it in full (${path.join(os.homedir(), 'x.css')})`,
        );
        expect(fs.existsSync(path.join(cwd, '~', 'x.css')), args[0]).toBe(true);
        fs.rmSync(path.join(cwd, '~'), {recursive: true, force: true});
      }
    },
    T,
  );
});

describe('a theme with no name', () => {
  it(
    'is named so, at its line',
    async () => {
      await themeEditNew('n15', {cwd});
      own('n15', 'tokens: {}');
      const src = path.join(cwd, 'themes/n15/n15.theme.ts');
      fs.writeFileSync(
        src,
        fs
          .readFileSync(src, 'utf8')
          .replace("name: 'n15',", 'name: undefined,'),
      );
      const r = await compileOwn('n15');
      expect(r.env.error).toContain(
        "is a theme with no name (line 6), and the build names the theme's files after it. Give defineTheme a name, such as name: 'n15'.",
      );
    },
    T,
  );
});

describe('fonts', () => {
  it('counts the system emoji fonts as the systems', () => {
    expect(oneSystemOf('Apple Color Emoji')).toBe(
      'Apple platforms (macOS, iOS and iPadOS)',
    );
    expect(oneSystemOf('Noto Color Emoji')).toBe('Android and ChromeOS');
    expect(fontsourceSuggestion('Apple Color Emoji')).toBe(null);
  });

  it(
    'tells an Apple interface face by its generic, never as one macOS ships by name',
    async () => {
      await themeEditNew('n12', {cwd});
      const r = await themeEditSet('n12', 'font', '"SF Mono", sans-serif', {
        cwd,
      });
      const notes = JSON.stringify(r.data.notes);
      expect(notes).toContain('Apple systems show it for ui-monospace');
      expect(notes).not.toContain('ships only on macOS');
      expect(notes).not.toContain('@fontsource/sf-mono');
    },
    T,
  );

  it(
    'offers an Apple interface face as its generic once, never twice',
    async () => {
      await themeEditNew('sfpro', {cwd});
      const r = await themeEditSet('sfpro', 'font', 'SF Pro', {cwd});
      const notes = JSON.stringify(r.data.notes);
      expect(notes).toContain('Apple systems show it for system-ui');
      expect(notes).not.toMatch(/system-ui, system-ui/);
    },
    T,
  );

  it('shows a weight as CSS font matching picks its face', () => {
    const faces = [400, 500, 600, 700];
    expect(shownWeight(800, faces)).toBe(700);
    expect(shownWeight(350, faces)).toBe(400);
    expect(shownWeight(450, faces)).toBe(500);
    expect(shownWeight(550, faces)).toBe(600);
    expect(shownWeight(650, faces)).toBe(700);
    expect(shownWeight(450, [400, 700])).toBe(400);
    expect(shownWeight(300, [400, 700])).toBe(400);
  });

  it(
    "names the base sheet's gaps for another axis and between the hundreds",
    async () => {
      const pkg = path.join(
        path.dirname(cwd),
        'node_modules/@astryxdesign/theme-neutral',
      );
      const meta = JSON.parse(
        fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'),
      );
      meta.exports['./fonts.css'] = './fonts.css';
      fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify(meta));
      fs.writeFileSync(
        path.join(pkg, 'fonts.css'),
        "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap');\n",
      );
      await themeEditNew('n14', {cwd, like: 'neutral'});
      await themeEditSet('n14', 'font', 'Fraunces, serif', {cwd});
      await themeEditSet('n14', '--font-weight-bold', '800', {cwd});
      let notes = JSON.stringify(
        (await themeEditShow('n14', {cwd})).data.notes,
      );
      expect(notes).toContain(
        'Fraunces is loaded by @astryxdesign/theme-neutral/fonts.css at 400, 500, 600, 700 only, so 800 shows as 700',
      );
      await themeEditSet('n14', '--font-weight-bold', '550', {cwd});
      notes = JSON.stringify((await themeEditShow('n14', {cwd})).data.notes);
      expect(notes).toContain('550 shows as 600');
      fs.rmSync(path.join(pkg, 'fonts.css'));
    },
    T,
  );

  it(
    "names an installed package's gaps and loads the faces its weights show",
    async () => {
      const pkg = path.join(
        path.dirname(cwd),
        'node_modules/@fontsource/lobster',
      );
      fs.mkdirSync(pkg, {recursive: true});
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({name: '@fontsource/lobster', version: '5.0.0'}),
      );
      const face =
        "@font-face {\n  font-family: 'Lobster';\n  src: url(./f.woff2);\n}\n";
      fs.writeFileSync(path.join(pkg, 'index.css'), face);
      fs.writeFileSync(path.join(pkg, '400.css'), face);
      await themeEditNew('n10', {cwd});
      await themeEditSet('n10', 'font', 'Lobster, cursive', {cwd});
      await themeEditSet('n10', '--font-weight-bold', '800', {cwd});
      const notes = JSON.stringify(
        (await themeEditShow('n10', {cwd})).data.notes,
      );
      expect(notes).toMatch(
        /Lobster is loaded by @fontsource\/lobster at 400 only, so [^"]*800 shows as 400/,
      );
      expect(notes).toContain(
        "a stylesheet for each face the theme's weights show",
      );
      fs.rmSync(pkg, {recursive: true});
    },
    T,
  );
});
