// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The editor judges a source by the theme a build loads (its name
 * and the theme it extends); --out names its default output only as the
 * same file; fonts follow every family the build writes; the app copy
 * never carries a module that cannot load; compile says in JSON what the
 * copy write did, builds a linked source under its own path, and names
 * the Fontsource package for an editor theme's fonts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt112-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');
/** @param {string[]} args @param {string} [at] */
const cli = (args, at = cwd) =>
  spawnSync(process.execPath, [BIN, ...args], {cwd: at, encoding: 'utf8'});
const compile = (/** @type {string[]} */ ...args) =>
  cli(['experimental', 'theme', 'compile', ...args]);
const compileJson = (/** @type {string[]} */ ...args) =>
  JSON.parse(
    cli(['--json', 'experimental', 'theme', 'compile', ...args]).stdout,
  );
/** @param {string} slug @param {string} body @param {string} [imports] */
const writeSource = (slug, body, imports) =>
  fs.writeFileSync(
    path.join(cwd, `themes/${slug}/${slug}.theme.ts`),
    `import {defineTheme} from '@astryxdesign/core/theme';\n${imports ?? `import {${slug}Settings} from './${slug}.settings';`}\n${body}\n`,
  );

/** A stand-in installed @fontsource package; returns its remover. */
const installFont = (
  /** @type {string} */ name,
  /** @type {string} */ family,
) => {
  const pkg = path.join(path.dirname(cwd), `node_modules/@fontsource/${name}`);
  fs.mkdirSync(pkg, {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({
      name: `@fontsource/${name}`,
      version: '5.0.0',
      exports: {
        '.': './index.css',
        './index.css': './index.css',
        './package.json': './package.json',
      },
    }),
  );
  fs.writeFileSync(
    path.join(pkg, 'index.css'),
    `@font-face {\n  font-family: '${family}';\n  src: url(./f.woff2);\n}\n`,
  );
  return () => fs.rmSync(pkg, {recursive: true, force: true});
};

describe('the theme a build loads is judged, not its text', () => {
  it('a later spread or a repeated key that replaces the settings is refused, and nothing is written', async () => {
    await themeEditNew('x1', {cwd});
    const before = read('themes/x1/x1.css');
    for (const body of [
      "const other = defineTheme({name: 'other', tokens: {}});\nconst o = {extends: other};\nexport const x1Theme = defineTheme({extends: x1Settings, name: 'x1', ...o});",
      "const other = defineTheme({name: 'other', tokens: {}});\nexport const x1Theme = defineTheme({extends: x1Settings, name: 'x1', extends: other} as any);",
    ]) {
      writeSource('x1', body);
      const r = compile('themes/x1/x1.theme.ts');
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toContain('no longer extends x1Settings');
      await expect(
        themeEditSet('x1', 'corners', 'pill', {cwd}),
      ).rejects.toThrow('no longer extends x1Settings');
    }
    expect(read('themes/x1/x1.css')).toBe(before);
  }, 240_000);

  it('a spread const holding extends and name, and a namespace import of the settings, are accepted', async () => {
    await themeEditNew('x2', {cwd});
    writeSource(
      'x2',
      "const base = {extends: x2Settings, name: 'x2'} as const;\nexport const x2Theme = defineTheme({...base, tokens: {'--radius-element': '3px'}});",
    );
    expect(compile('themes/x2/x2.theme.ts').status).toBe(0);
    await themeEditSet('x2', 'corners', 'pill', {cwd});
    writeSource(
      'x2',
      "export const x2Theme = defineTheme({extends: S.x2Settings, name: 'x2'});",
      "import * as S from './x2.settings';",
    );
    expect(compile('themes/x2/x2.theme.ts').status).toBe(0);
  }, 240_000);

  it('with a helper theme read first, the refusal names the export a build reads and how to make it read the theme', async () => {
    await themeEditNew('x5', {cwd});
    writeSource(
      'x5',
      "export const a = defineTheme({extends: x5Settings, name: 'y'});\nexport const x5Theme = defineTheme({extends: x5Settings, name: 'x5'});",
    );
    const r = compile('themes/x5/x5.theme.ts');
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('reads its export a');
    expect(r.stdout + r.stderr).toContain('export default x5Theme');
    expect(r.stdout + r.stderr).not.toContain('Put back the import');
  }, 240_000);
});

describe('--out names the default output only as the same file', () => {
  it('a name that differs in case, and a folder form of the stylesheet, are refused before anything is written', async () => {
    await themeEditNew('x3', {cwd});
    const css = read('themes/x3/x3.css');
    const js = read('themes/x3/x3.js');
    const caseSensitive = !fs.existsSync(path.join(cwd, 'themes/x3/X3.CSS'));
    for (const out of [
      ...(caseSensitive ? ['themes/x3/X3.css', 'themes/x3/x3.CSS'] : []),
      'themes/x3/x3.css/',
    ]) {
      const r = compile('themes/x3/x3.theme.ts', '--out', out);
      expect(r.status, out).not.toBe(0);
      expect(r.stdout + r.stderr, out).toContain("in x3's own folder");
    }
    expect(read('themes/x3/x3.css')).toBe(css);
    expect(read('themes/x3/x3.js')).toBe(js);
    expect(
      compile('themes/x3/x3.theme.ts', '--out', 'themes/x3/x3.css').status,
    ).toBe(0);
  }, 240_000);
});

describe('fonts follow every family the build writes', () => {
  it("a part's own font loads in the app copy once installed, and is named with its install line until then", async () => {
    await themeEditNew('x6', {cwd});
    const missing = await themeEditSet('x6', 'font-family', 'Lora', {
      cwd,
      on: 'button',
    });
    expect(missing.data.notes.join(' ')).toContain('@fontsource/lora');
    const remove = installFont('lora', 'Lora');
    try {
      expect(compile('themes/x6/x6.theme.ts').status).toBe(0);
      expect(read('src/themes/x6/x6.fonts.css')).toContain(
        '@fontsource/lora/index.css',
      );
    } finally {
      remove();
    }
  }, 240_000);

  it("compile names an editor theme's font package, in the runner form, in text and JSON", async () => {
    await themeEditNew('x10', {cwd});
    await themeEditSet('x10', 'font', 'geist', {cwd});
    const json = compileJson('themes/x10/x10.theme.ts');
    const notice = JSON.stringify(json.data.notices);
    expect(notice).toContain('@fontsource/geist-sans');
    expect(notice).not.toContain('astryx docs');
    const full = compile('themes/x10/x10.theme.ts', '--detail', 'full');
    expect(full.stdout).toContain('@fontsource/geist-sans');
    expect(full.stdout).not.toContain('fonts.googleapis.com');
  }, 240_000);
});

describe('every suggested compile passes the same checks', () => {
  it('from a subfolder, the guess for a backslash path is the compile from the app root, and it runs', async () => {
    await themeEditNew('xg', {cwd});
    const sub = path.join(cwd, 'src');
    fs.mkdirSync(sub, {recursive: true});
    const env = JSON.parse(
      cli(
        [
          '--json',
          'experimental',
          'theme',
          'compile',
          '..\\themes\\xg\\xg.theme.ts',
        ],
        sub,
      ).stdout,
    );
    const way = env.suggestions[0].name;
    expect(way).toMatch(/^cd \.\. && .*compile themes\/xg\/xg\.theme\.ts$/);
    const command = way.replace(/^cd \.\. && /, '');
    expect(
      cli(command.slice(command.indexOf('experimental')).split(' ')).status,
    ).toBe(0);
  }, 240_000);
});

describe('the app copy and the app module', () => {
  it('a module that imports a file beside the theme keeps the copy as it was, and the check says why', async () => {
    await themeEditNew('x12', {cwd});
    fs.writeFileSync(
      path.join(cwd, 'themes/x12/icons.mjs'),
      'export default {};\n',
    );
    writeSource(
      'x12',
      "export const x12Theme = defineTheme({extends: x12Settings, name: 'x12', icons: myIcons});",
      "import {x12Settings} from './x12.settings';\nimport myIcons from './icons.mjs';",
    );
    compile('themes/x12/x12.theme.ts');
    expect(read('src/themes/x12/x12.js')).not.toContain('./icons.mjs');
    const check = compileJson('themes/x12/x12.theme.ts', '--check');
    expect(check.data.upToDate).toBe(false);
    expect(check.data.appCopyStale).toContain('imports ./icons.mjs');
  }, 240_000);

  it("compile's JSON says what the copy write did: the files of a first write, and what kept it back", async () => {
    await themeEditNew('x13', {cwd});
    fs.rmSync(path.join(cwd, 'src/themes/x13'), {recursive: true, force: true});
    const first = compileJson('themes/x13/x13.theme.ts');
    expect(first.data.appCopy.wrote).toContain('src/themes/x13/x13.css');
    const copy = path.join(cwd, 'src/themes/x13');
    writeSource(
      'x13',
      "export const x13Theme = defineTheme({extends: x13Settings, name: 'x13', tokens: {'--radius-element': '9px'}});",
    );
    fs.chmodSync(copy, 0o555);
    try {
      const kept = compileJson('themes/x13/x13.theme.ts');
      if (process.getuid?.() !== 0)
        expect(kept.data.appCopyStale).toContain('not writable');
    } finally {
      fs.chmodSync(copy, 0o755);
    }
  }, 240_000);

  it('after theme add, a change of mode names theme add, which writes the app module again', async () => {
    await themeEditNew('x9', {cwd});
    await themeEditSet('x9', 'mode', 'light-only', {cwd});
    expect(cli(['theme', 'add', 'x9']).status).toBe(0);
    const r = await themeEditSet('x9', 'mode', 'both', {cwd});
    const note = r.data.notes.join(' ');
    expect(note).toContain('`theme add x9`');
    expect(note).not.toContain("if the app's <Theme> was given");
  }, 240_000);

  it('a source named through a folder link builds under its own path, and the check passes', async () => {
    await themeEditNew('x14', {cwd});
    fs.mkdirSync(path.join(cwd, 'ln'), {recursive: true});
    fs.symlinkSync(
      path.join(cwd, 'themes/x14'),
      path.join(cwd, 'ln/x14dir'),
      'dir',
    );
    try {
      expect(compile('ln/x14dir/x14.theme.ts').status).toBe(0);
      expect(read('themes/x14/x14.css')).toContain(
        'Source: themes/x14/x14.theme.ts',
      );
      expect(compile('themes/x14/x14.theme.ts', '--check').status).toBe(0);
    } finally {
      fs.rmSync(path.join(cwd, 'ln'), {recursive: true, force: true});
    }
  }, 240_000);
});
