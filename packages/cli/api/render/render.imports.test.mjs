// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for render() (`astryx experimental export`): what a page imports, imports with a query, and ordinary files named like configuration.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {renderedMarkupOf} from '../../foundation/render/source-block.mjs';
import {CLI_DIR, PNG, dir, put, useRenderFixture} from '../../test-utils/render-fixture.mjs';

useRenderFixture();

describe('render(): what a page imports', () => {
  /**
   * A built theme package: its module and the stylesheet that scopes its tokens.
   * @param {string} name the package and theme name
   * @param {string} css
   * @param {string} [extra] more of the module, such as a colorModes export
   */
  const themePackage = (name, css, extra = '') => {
    put(`node_modules/@acme/${name}/package.json`, JSON.stringify({name: `@acme/${name}`, version: '1.0.0', type: 'module', main: 'index.js'}));
    put(`node_modules/@acme/${name}/index.js`, `export const theme = {name: '${name}', __built: true, tokens: {}};\n${extra}`);
    put(`node_modules/@acme/${name}/theme.css`, css);
  };
  /** @param {string} name */
  const themedPage = name =>
    `import {Theme} from '@astryxdesign/core/theme';
import {theme} from '@acme/${name}';
import '@acme/${name}/theme.css';
export default function Page() {
  return (<Theme theme={theme}><main><h1>Saved notes</h1></main></Theme>);
}
`;

  it('keeps a light-only theme light in a dark viewer: light scheme and the theme\'s page color on the document', async () => {
    themePackage('retro', '[data-astryx-theme="retro"]{--color-background-body:#c0c0c0;--color-text-primary:#000}');
    put('retro/page.tsx', themedPage('retro'));
    await render('retro/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'retro/page.html'), 'utf8');
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).toContain(':where(:root){color-scheme:light;background-color:var(--color-background-body)}');
    expect(html).not.toContain(':root{color-scheme:light dark}');
  }, 60_000);

  it('reads the colorModes of a theme package whose stylesheet sits beside a nested package.json', async () => {
    put('node_modules/@acme/split/package.json', JSON.stringify({name: '@acme/split', version: '1.0.0', main: 'dist/index.js'}));
    put('node_modules/@acme/split/dist/package.json', JSON.stringify({type: 'module'}));
    put('node_modules/@acme/split/dist/index.js', "export const theme = {name: 'split', __built: true, tokens: {}};\nexport const colorModes = ['light'];\n");
    put('node_modules/@acme/split/dist/theme.css', '[data-astryx-theme="split"]{--color-background-body:var(--brand-page)}');
    put('split/page.tsx', `import {Theme} from '@astryxdesign/core/theme';
import {theme} from '@acme/split';
import '@acme/split/dist/theme.css';
export default function Page() {
  return (<Theme theme={theme}><main><h1>Saved notes</h1></main></Theme>);
}
`);
    await render('split/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'split/page.html'), 'utf8')).toContain('<meta name="color-scheme" content="light">');
  }, 60_000);

  it('reads the colorModes of a theme package linked in from outside node_modules', async () => {
    put('linked-src/linked/package.json', JSON.stringify({name: '@acme/linked', version: '1.0.0', type: 'module', main: 'index.js'}));
    put('linked-src/linked/index.js', "export const theme = {name: 'linked', __built: true, tokens: {}};\nexport const colorModes = ['light'];\n");
    put('linked-src/linked/theme.css', '[data-astryx-theme="linked"]{--color-background-body:var(--brand-page)}');
    fs.mkdirSync(path.join(dir, 'node_modules/@acme'), {recursive: true});
    fs.symlinkSync(path.join(dir, 'linked-src/linked'), path.join(dir, 'node_modules/@acme/linked'), 'dir');
    put('linked/page.tsx', themedPage('linked'));
    await render('linked/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'linked/page.html'), 'utf8')).toContain('<meta name="color-scheme" content="light">');
  }, 60_000);

  it('reads a built theme whose stylesheet the page reaches through an @import in its own CSS', async () => {
    put('via-import/retro.js', "export const theme = {name: 'retro', __built: true, tokens: {}};\n");
    put('via-import/retro.css', '[data-astryx-theme="retro"]{--color-background-body:#c0c0c0;--color-text-primary:#000}');
    put('via-import/app.css', "@import './retro.css';\nmain { margin: 0; }\n");
    put('via-import/page.tsx', `import {Theme} from '@astryxdesign/core/theme';
import {theme} from './retro.js';
import './app.css';
export default function Page() {
  return (<Theme theme={theme}><main><h1>Saved notes</h1></main></Theme>);
}
`);
    await render('via-import/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'via-import/page.html'), 'utf8')).toContain('<meta name="color-scheme" content="light">');
  }, 60_000);

  it('keeps both schemes when the page imports the theme\'s stylesheet for one scheme only', async () => {
    put('via-media/retro.js', "export const theme = {name: 'retro', __built: true, tokens: {}};\n");
    put('via-media/retro.css', '[data-astryx-theme="retro"]{--color-background-body:#c0c0c0;--color-text-primary:#000}');
    put('via-media/app.css', "@import './retro.css' (prefers-color-scheme: light);\n");
    put('via-media/page.tsx', `import {Theme} from '@astryxdesign/core/theme';
import {theme} from './retro.js';
import './app.css';
export default function Page() {
  return (<Theme theme={theme}><main><h1>Saved notes</h1></main></Theme>);
}
`);
    await render('via-media/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'via-media/page.html'), 'utf8')).toContain('<meta name="color-scheme" content="light dark">');
  }, 60_000);

  it('keeps both schemes when an outer import scopes the theme\'s stylesheet to one scheme', async () => {
    put('via-chain/retro.js', "export const theme = {name: 'retro', __built: true, tokens: {}};\n");
    put('via-chain/retro.css', '[data-astryx-theme="retro"]{--color-background-body:#c0c0c0;--color-text-primary:#000}');
    put('via-chain/entry.css', "@import './retro.css';\n");
    put('via-chain/app.css', "@import './entry.css' (prefers-color-scheme: dark);\n");
    put('via-chain/page.tsx', `import {Theme} from '@astryxdesign/core/theme';
import {theme} from './retro.js';
import './app.css';
export default function Page() {
  return (<Theme theme={theme}><main><h1>Saved notes</h1></main></Theme>);
}
`);
    await render('via-chain/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'via-chain/page.html'), 'utf8')).toContain('<meta name="color-scheme" content="light dark">');
  }, 60_000);

  it('keeps both schemes in a markup-only render, where the theme editor shows each mode itself', async () => {
    const {renderPage} = await import('../../foundation/render/render-page.mjs');
    const page = await renderPage(path.join(dir, 'retro/page.tsx'), {cwd: dir, markupOnly: true});
    expect(page.html).toContain('<meta name="color-scheme" content="light dark">');
    expect(page.html).not.toContain('background-color:var(--color-background-body)}');
  }, 60_000);

  it('follows a theme\'s colorModes export over its stylesheet: one mode, and both modes', async () => {
    themePackage('night', '[data-astryx-theme="night"]{--color-background-body:light-dark(#fff,#111)}', "export const colorModes = ['dark'];\n");
    put('night/page.tsx', themedPage('night'));
    await render('night/page.tsx', {cwd: dir});
    const night = fs.readFileSync(path.join(dir, 'night/page.html'), 'utf8');
    expect(night).toContain('<meta name="color-scheme" content="dark">');
    expect(night).toContain(':where(:root){color-scheme:dark;background-color:var(--color-background-body)}');
    // Its stylesheet alone would read as light only; the export says both.
    themePackage('pair', '[data-astryx-theme="pair"]{--color-background-body:#c0c0c0;--color-text-primary:#000}', "export const colorModes = ['light', 'dark'];\n");
    put('pair/page.tsx', themedPage('pair'));
    await render('pair/page.tsx', {cwd: dir});
    const pair = fs.readFileSync(path.join(dir, 'pair/page.html'), 'utf8');
    expect(pair).toContain('<meta name="color-scheme" content="light dark">');
    expect(pair).not.toContain('background-color:var(--color-background-body)}');
  }, 60_000);

  it('keeps a two-mode theme\'s scheme as before', async () => {
    themePackage('duo', '[data-astryx-theme="duo"]{--color-background-body:light-dark(#fff,#111)}');
    put('duo/page.tsx', themedPage('duo'));
    await render('duo/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'duo/page.html'), 'utf8');
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain(':root{color-scheme:light dark}:root[data-theme="light"]{color-scheme:light}:root[data-theme="dark"]{color-scheme:dark}');
    expect(html).not.toContain('background-color:var(--color-background-body)}');
  }, 60_000);

  it('reads themes built with theme build: light page colors are light only, a fonts or accent theme keeps both modes', async () => {
    const themes = {
      retro: "'--color-background-body': '#c0c0c0', '--color-background-surface': '#c0c0c0', '--color-text-primary': '#000000'",
      serif: "'--font-family-body': 'Georgia, serif'",
      accent: "'--color-accent': '#c2185b'",
    };
    /** @type {Record<string, string>} */
    const scheme = {};
    for (const [name, tokens] of Object.entries(themes)) {
      put(`built/${name}/${name}.ts`, `import {defineTheme} from '@astryxdesign/core/theme';\nexport const ${name}Theme = defineTheme({name: '${name}', tokens: {${tokens}}});\n`);
      const built = spawnSync(process.execPath, [path.join(CLI_DIR, 'clients/cli/bin/astryx.mjs'), 'theme', 'build', `built/${name}/${name}.ts`], {cwd: dir, encoding: 'utf8', timeout: 60_000});
      expect(built.status, built.stderr).toBe(0);
      put(
        `built/${name}/page.tsx`,
        `import {Theme} from '@astryxdesign/core/theme';
import {${name}Theme} from './${name}.js';
import './${name}.css';
export default function Page() {
  return (<Theme theme={${name}Theme}><main><h1>Saved notes</h1></main></Theme>);
}
`,
      );
      await render(`built/${name}/page.tsx`, {cwd: dir});
      scheme[name] = /<meta name="color-scheme" content="([^"]*)">/.exec(fs.readFileSync(path.join(dir, `built/${name}/page.html`), 'utf8'))?.[1] ?? '';
    }
    expect(scheme).toEqual({retro: 'light', serif: 'light dark', accent: 'light dark'});
  }, 240_000);

  it('reads the dark-only Gothic theme, built with theme build, as dark only', async () => {
    fs.cpSync(path.join(CLI_DIR, 'assets/templates/themes/gothic'), path.join(dir, 'gothic'), {recursive: true});
    // The template's icons come from lucide-react, which the theme package lists.
    const lucide = path.dirname(createRequire(path.join(CLI_DIR, '../themes/gothic/package.json')).resolve('lucide-react/package.json'));
    fs.mkdirSync(path.join(dir, 'gothic/node_modules'), {recursive: true});
    fs.symlinkSync(lucide, path.join(dir, 'gothic/node_modules/lucide-react'), 'junction');
    const built = spawnSync(process.execPath, [path.join(CLI_DIR, 'clients/cli/bin/astryx.mjs'), 'theme', 'build', 'gothic/gothicTheme.ts'], {cwd: dir, encoding: 'utf8', timeout: 120_000});
    expect(built.status, built.stderr).toBe(0);
    put(
      'gothic/page.tsx',
      `import {Theme} from '@astryxdesign/core/theme';
import {gothicTheme} from './gothic.js';
import './gothic.css';
export default function Page() {
  return (<Theme theme={gothicTheme}><main><h1>Saved notes</h1></main></Theme>);
}
`,
    );
    await render('gothic/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'gothic/page.html'), 'utf8');
    expect(html).toContain('<meta name="color-scheme" content="dark">');
    expect(html).toContain(':where(:root){color-scheme:dark;background-color:var(--color-background-body)}');
  }, 240_000);

  it('inlines an imported theme stylesheet, embeds local CSS, JSON and images, and gives them all back', async () => {
    put('node_modules/@acme/theme/package.json', JSON.stringify({name: '@acme/theme', version: '1.0.0'}));
    put('node_modules/@acme/theme/theme.css', ':root{--acme-brand:#123456}.acme-unused{color:red}');
    put('site/local.css', '.site-title{letter-spacing:2px}');
    put('site/data.json', JSON.stringify({title: 'From JSON'}));
    put('site/dot.png', PNG);
    put(
      'site/page.tsx',
      `import '@acme/theme/theme.css';
import './local.css';
import data from './data.json';
import dot from './dot.png';
export default function Page() {
  return (<main><h1 className="site-title">{data.title}</h1><img src={dot} alt="" /><a href="https://example.com/docs">Docs</a></main>);
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('site/page.tsx', {cwd: dir}));
    expect(result.data.stylesheets).toContain('@acme/theme/theme.css');
    expect(result.data.files).toEqual(expect.arrayContaining(['page.tsx', 'local.css', 'data.json', 'dot.png']));
    // A plain link loads nothing, so it is not a remote-asset warning.
    expect(result.data.warnings.filter((/** @type {any} */ w) => w.code === 'remote-asset')).toEqual([]);
    const html = fs.readFileSync(path.join(dir, 'site/page.html'), 'utf8');
    expect(html).toContain('--acme-brand:#123456');
    expect(html).not.toContain('.acme-unused');
    expect(html).toContain('letter-spacing:2px');
    expect(html).toContain('From JSON');
    fs.copyFileSync(path.join(dir, 'site/page.html'), path.join(dir, 'moved.html'));
    const back = /** @type {any} */ (await render('moved.html', {cwd: dir, reverse: true, out: 'moved/page.tsx'}));
    expect(back.data.files.sort()).toEqual(
      ['moved/data.json', 'moved/dot.png', 'moved/local.css', 'moved/page.tsx'].sort(),
    );
    for (const name of ['page.tsx', 'local.css', 'data.json', 'dot.png']) {
      expect(fs.readFileSync(path.join(dir, 'moved', name))).toEqual(fs.readFileSync(path.join(dir, 'site', name)));
    }
    // The moved copy renders the same page again.
    const again = /** @type {any} */ (await render('moved/page.tsx', {cwd: dir}));
    expect(fs.readFileSync(path.join(dir, 'moved/page.html'), 'utf8')).toContain('From JSON');
    expect(again.type).toBe('render.page');
  }, 60_000);

  /**
   * An ES module package of three files: `src/index.js` re-exports a badge
   * that imports its label by a relative path.
   * @param {string} at the package folder, from the test folder
   * @param {string} name
   */
  const putLinkedPackage = (at, name) => {
    put(`${at}/package.json`, JSON.stringify({name, version: '1.0.0', type: 'module', exports: {'.': './src/index.js'}}));
    put(`${at}/src/index.js`, "export {Badge} from './parts/badge.js';\n");
    put(`${at}/src/parts/badge.js`, "import {jsx} from 'react/jsx-runtime';\nimport {label} from './label.js';\nexport function Badge() { return jsx('strong', {children: label}); }\n");
    put(`${at}/src/parts/label.js`, `export const label = '${name} badge text';\n`);
  };
  /** @param {string} link the link, from the test folder @param {string} target the folder it names, from the test folder */
  const linkFolder = (link, target) => {
    fs.mkdirSync(path.dirname(path.join(dir, link)), {recursive: true});
    fs.symlinkSync(path.join(dir, target), path.join(dir, link), 'junction');
  };
  /**
   * Render a page, give the file back inside the same project, and render the
   * restored page again: the same markup both times.
   * @param {string} page the page, from the test folder
   */
  const roundTrip = async page => {
    const first = /** @type {any} */ (await render(page, {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, page.replace(/\.tsx$/, '.html')), 'utf8');
    const restored = path.join(path.dirname(page), 'restored', path.basename(page)).split(path.sep).join('/');
    const back = /** @type {any} */ (await render(page.replace(/\.tsx$/, '.html'), {cwd: dir, reverse: true, out: restored}));
    await render(restored, {cwd: dir});
    const again = fs.readFileSync(path.join(dir, restored.replace(/\.tsx$/, '.html')), 'utf8');
    return {first, back, markup: renderedMarkupOf(html), againMarkup: renderedMarkupOf(again)};
  };

  it('treats a package linked from a folder in the project as a package: the file carries the page, and gives it back exactly', async () => {
    // `npm link`: node_modules links to a folder that the project holds.
    put('npm-link/package.json', '{"name":"npm-link","private":true}');
    putLinkedPackage('npm-link/vendor/badge', '@acme/linked');
    linkFolder('npm-link/node_modules/@acme/linked', 'npm-link/vendor/badge');
    put('npm-link/page.tsx', "import {Badge} from '@acme/linked';\nexport default function Page() { return <p><Badge /> after</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    // A `file:` dependency, installed as a link to its folder.
    put('file-dep/package.json', JSON.stringify({name: 'file-dep', private: true, dependencies: {'@acme/local': 'file:./libs/local'}}));
    putLinkedPackage('file-dep/libs/local', '@acme/local');
    linkFolder('file-dep/node_modules/@acme/local', 'file-dep/libs/local');
    put('file-dep/page.tsx', "import {Badge} from '@acme/local';\nexport default function Page() { return <p><Badge /> after</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    for (const [page, name] of [['npm-link/page.tsx', '@acme/linked'], ['file-dep/page.tsx', '@acme/local']]) {
      const {first, back, markup, againMarkup} = await roundTrip(page);
      expect(first.data.files).toEqual(['page.tsx']);
      expect(markup).toContain(`${name} badge text`);
      expect(back.data.exact).toBe(true);
      expect(back.data.files).toEqual([path.join(path.dirname(page), 'restored/page.tsx').split(path.sep).join('/')]);
      expect(againMarkup).toBe(markup);
    }
  }, 120_000);

  it('carries the files of a linked folder that the page imports by a relative path, as its own', async () => {
    put('rel-link/package.json', '{"name":"rel-link","private":true}');
    putLinkedPackage('rel-link/vendor/badge', '@acme/rel');
    put('rel-link/vendor/badge/src/parts/badge.css', '.rel-badge { letter-spacing: 4px; }');
    put(
      'rel-link/vendor/badge/src/parts/badge.js',
      "import {jsx} from 'react/jsx-runtime';\nimport {label} from './label.js';\nimport './badge.css';\nexport function Badge() { return jsx('strong', {className: 'rel-badge', children: label}); }\n",
    );
    linkFolder('rel-link/node_modules/@acme/rel', 'rel-link/vendor/badge');
    put('rel-link/page.tsx', "import {Badge} from './vendor/badge/src/index.js';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const {first, back, markup, againMarkup} = await roundTrip('rel-link/page.tsx');
    expect([...first.data.files].sort()).toEqual(
      ['page.tsx', 'vendor/badge/src/index.js', 'vendor/badge/src/parts/badge.css', 'vendor/badge/src/parts/badge.js', 'vendor/badge/src/parts/label.js'].sort(),
    );
    expect(markup).toContain('@acme/rel badge text');
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
  }, 120_000);

  it('carries the files of a linked folder that the page imports through a path alias', async () => {
    put('alias-link/package.json', '{"name":"alias-link","private":true}');
    put('alias-link/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@/*': ['./*']}}}));
    putLinkedPackage('alias-link/vendor/badge', '@acme/aliased');
    linkFolder('alias-link/node_modules/@acme/aliased', 'alias-link/vendor/badge');
    put('alias-link/page.tsx', "import {Badge} from '@/vendor/badge/src/index.js';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const {first, back, markup, againMarkup} = await roundTrip('alias-link/page.tsx');
    expect([...first.data.files].sort()).toEqual(
      ['page.tsx', 'vendor/badge/src/index.js', 'vendor/badge/src/parts/badge.js', 'vendor/badge/src/parts/label.js'].sort(),
    );
    expect(markup).toContain('@acme/aliased badge text');
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
    // Outside the project, the file still gives back every file the page imports.
    fs.copyFileSync(path.join(dir, 'alias-link/page.html'), path.join(dir, 'alias-link-moved.html'));
    const moved = /** @type {any} */ (await render('alias-link-moved.html', {cwd: dir, reverse: true, out: 'alias-link-moved/page.tsx'}));
    expect(moved.data.missing ?? []).toEqual([]);
    expect(moved.data.files).toEqual(expect.arrayContaining(['alias-link-moved/vendor/badge/src/index.js']));
  }, 120_000);

  it('carries the stylesheets of a linked folder that a carried module reaches after the package loaded', async () => {
    put('late-link/package.json', '{"name":"late-link","private":true}');
    putLinkedPackage('late-link/vendor/kit', '@acme/late');
    put('late-link/vendor/kit/src/parts/badge.css', '.late-badge { letter-spacing: 5px; }');
    put('late-link/vendor/kit/src/parts/label.css', '.late-label { word-spacing: 6px; }');
    put(
      'late-link/vendor/kit/src/parts/badge.js',
      "import {jsx} from 'react/jsx-runtime';\nimport {label} from './label.js';\nimport './badge.css';\nexport function Badge() { return jsx('strong', {className: 'late-badge late-label', children: label}); }\n",
    );
    put('late-link/vendor/kit/src/parts/label.js', "import './label.css';\nexport const label = '@acme/late badge text';\n");
    linkFolder('late-link/node_modules/@acme/late', 'late-link/vendor/kit');
    // The package loads first, by its name; then the page's own module reaches
    // two of its files by their paths.
    put('late-link/own.js', "import './vendor/kit/src/parts/badge.css';\nimport {label} from './vendor/kit/src/parts/label.js';\nexport const own = `own ${label}`;\n");
    put(
      'late-link/page.tsx',
      "import {Badge} from '@acme/late';\nimport {own} from './own.js';\nexport default function Page() { return <p><Badge /> {own}</p>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const {first, back, markup, againMarkup} = await roundTrip('late-link/page.tsx');
    expect([...first.data.files].sort()).toEqual(
      ['own.js', 'page.tsx', 'vendor/kit/src/parts/badge.css', 'vendor/kit/src/parts/label.css', 'vendor/kit/src/parts/label.js'].sort(),
    );
    expect(markup).toContain('own @acme/late badge text');
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
  }, 120_000);

  it("carries a linked folder's stylesheet that a carried stylesheet imports, whichever imported it first", async () => {
    put('share-link/package.json', '{"name":"share-link","private":true}');
    putLinkedPackage('share-link/vendor/kit', '@acme/share');
    put('share-link/vendor/kit/src/parts/tokens.css', '.share-badge { letter-spacing: 7px; }');
    put('share-link/vendor/kit/src/parts/badge.css', "@import './tokens.css';\n.share-badge { word-spacing: 1px; }");
    put('share-link/vendor/kit/src/parts/more.css', '.share-more { letter-spacing: 8px; }');
    put('share-link/vendor/kit/src/parts/theme.css', "@import './more.css';\n");
    put(
      'share-link/vendor/kit/src/parts/badge.js',
      "import {jsx} from 'react/jsx-runtime';\nimport {label} from './label.js';\nimport './badge.css';\nexport function Badge() { return jsx('strong', {className: 'share-badge share-more', children: label}); }\n",
    );
    linkFolder('share-link/node_modules/@acme/share', 'share-link/vendor/kit');
    // The package's own stylesheet imports tokens.css first; then the page's
    // own stylesheet imports it too, and the page reaches theme.css by its path.
    put('share-link/app.css', "@import './vendor/kit/src/parts/tokens.css';\n");
    put('share-link/own.js', "import './app.css';\nimport './vendor/kit/src/parts/theme.css';\nexport const own = 'own';\n");
    put(
      'share-link/page.tsx',
      "import {Badge} from '@acme/share';\nimport {own} from './own.js';\nexport default function Page() { return <p><Badge /> {own}</p>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const {first, back, markup, againMarkup} = await roundTrip('share-link/page.tsx');
    expect([...first.data.files].sort()).toEqual(
      ['app.css', 'own.js', 'page.tsx', 'vendor/kit/src/parts/more.css', 'vendor/kit/src/parts/theme.css', 'vendor/kit/src/parts/tokens.css'].sort(),
    );
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
  }, 120_000);

  it('leaves out a project file that only a linked package imports, as one of the package', async () => {
    put('reach-out/package.json', '{"name":"reach-out","private":true}');
    putLinkedPackage('reach-out/vendor/kit', '@acme/reach');
    put('reach-out/shared/util.js', "export const suffix = 'from shared';\n");
    put(
      'reach-out/vendor/kit/src/parts/badge.js',
      "import {jsx} from 'react/jsx-runtime';\nimport {label} from './label.js';\nimport {suffix} from '../../../../shared/util.js';\nexport function Badge() { return jsx('strong', {children: `${label} ${suffix}`}); }\n",
    );
    linkFolder('reach-out/node_modules/@acme/reach', 'reach-out/vendor/kit');
    put('reach-out/page.tsx', "import {Badge} from '@acme/reach';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const {first, back, markup, againMarkup} = await roundTrip('reach-out/page.tsx');
    expect(first.data.files).toEqual(['page.tsx']);
    expect(first.data.notCarried ?? []).toEqual([]);
    expect(markup).toContain('@acme/reach badge text from shared');
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
  }, 120_000);

  it('treats a workspace package that another linked package links in as a package too', async () => {
    put('ws-nest/package.json', JSON.stringify({name: 'ws-nest', private: true, workspaces: ['packages/*']}));
    putLinkedPackage('ws-nest/packages/utils', '@acme/nest-utils');
    putLinkedPackage('ws-nest/packages/ui', '@acme/nest-ui');
    put(
      'ws-nest/packages/ui/src/parts/badge.js',
      "import {jsx} from 'react/jsx-runtime';\nimport {label} from '@acme/nest-utils/src/parts/label.js';\nexport function Badge() { return jsx('strong', {children: `ui ${label}`}); }\n",
    );
    put(
      'ws-nest/packages/utils/package.json',
      JSON.stringify({name: '@acme/nest-utils', version: '1.0.0', type: 'module', exports: {'.': './src/index.js', './src/parts/label.js': './src/parts/label.js'}}),
    );
    // pnpm links a workspace dependency into the package's own node_modules.
    linkFolder('ws-nest/node_modules/@acme/nest-ui', 'ws-nest/packages/ui');
    linkFolder('ws-nest/packages/ui/node_modules/@acme/nest-utils', 'ws-nest/packages/utils');
    put('ws-nest/src/page.tsx', "import {Badge} from '@acme/nest-ui';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const {first, back, markup, againMarkup} = await roundTrip('ws-nest/src/page.tsx');
    expect(first.data.files).toEqual(['page.tsx']);
    expect(markup).toContain('ui @acme/nest-utils badge text');
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
  }, 120_000);

  it("carries an image that only a linked package's module names, for the script to draw later", async () => {
    put('late-img/package.json', '{"name":"late-img","private":true}');
    put('late-img/public/pics/late.png', PNG);
    putLinkedPackage('late-img/vendor/kit', '@acme/late-img');
    put(
      'late-img/vendor/kit/src/parts/badge.js',
      "import {jsx} from 'react/jsx-runtime';\nimport {useEffect, useState} from 'react';\nexport function Badge() {\n  const [on, setOn] = useState(false);\n  useEffect(() => setOn(true), []);\n  return on ? jsx('img', {src: '/pics/late.png', alt: 'later'}) : jsx('span', {children: 'before the script'});\n}\n",
    );
    linkFolder('late-img/node_modules/@acme/late-img', 'late-img/vendor/kit');
    put('late-img/page.tsx', "import {Badge} from '@acme/late-img';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const {first, back} = await roundTrip('late-img/page.tsx');
    expect(first.data.files).toEqual(['page.tsx', 'public/pics/late.png']);
    const html = fs.readFileSync(path.join(dir, 'late-img/page.html'), 'utf8');
    // The script draws the image from the file's own data, not from its path.
    const scriptAt = html.lastIndexOf('<script type="module">');
    expect(scriptAt).toBeGreaterThan(0);
    expect(html.slice(scriptAt)).not.toMatch(/["'`]\/pics\/late\.png["'`]/);
    expect(back.data.exact).toBe(true);
  }, 120_000);

  it("keeps a linked package's styles, JSON and images in the page, and carries only the images its script reads", async () => {
    put('link-assets/package.json', '{"name":"link-assets","private":true}');
    putLinkedPackage('link-assets/vendor/kit', '@acme/kit');
    put('link-assets/vendor/kit/src/parts/logo.png', PNG);
    put('link-assets/vendor/kit/src/parts/data.json', '{"count": 7}');
    put('link-assets/vendor/kit/src/parts/badge.css', "@import './tokens.css';\n.kit-badge { letter-spacing: 3px; }");
    put('link-assets/vendor/kit/src/parts/tokens.css', '.kit-badge { word-spacing: 2px; }');
    put(
      'link-assets/vendor/kit/src/parts/badge.js',
      "import {jsx, jsxs} from 'react/jsx-runtime';\nimport {label} from './label.js';\nimport logo from './logo.png';\nimport data from './data.json';\nimport './badge.css';\nexport function Badge() { return jsxs('strong', {className: 'kit-badge', children: [jsx('img', {src: logo, alt: ''}), label, ' ', data.count]}); }\n",
    );
    linkFolder('link-assets/node_modules/@acme/kit', 'link-assets/vendor/kit');
    put('link-assets/page.tsx', "import {Badge} from '@acme/kit';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const {first, back, markup, againMarkup} = await roundTrip('link-assets/page.tsx');
    expect(first.data.files).toEqual(['page.tsx', 'vendor/kit/src/parts/logo.png']);
    const html = fs.readFileSync(path.join(dir, 'link-assets/page.html'), 'utf8');
    expect(html).toMatch(/\.kit-badge ?\{ ?letter-spacing: ?3px/);
    expect(html).toMatch(/word-spacing: ?2px/);
    expect(markup).toContain('@acme/kit badge text 7');
    expect(markup).toContain('data:image/png;base64,');
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
  }, 120_000);

  it('treats a workspace package linked inside the project as a package, and keeps the layouts that work today', async () => {
    // A workspace whose root is the project: its package is linked in node_modules.
    put('ws-root/package.json', JSON.stringify({name: 'ws-root', private: true, workspaces: ['packages/*']}));
    putLinkedPackage('ws-root/packages/ui', '@acme/ws-ui');
    linkFolder('ws-root/node_modules/@acme/ws-ui', 'ws-root/packages/ui');
    put('ws-root/src/page.tsx', "import {Badge} from '@acme/ws-ui';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    // A pnpm workspace app: the package is outside the app's project.
    put('ws-app/pnpm-workspace.yaml', "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
    putLinkedPackage('ws-app/packages/ui', '@acme/app-ui');
    put('ws-app/apps/web/package.json', JSON.stringify({name: 'web', private: true, dependencies: {'@acme/app-ui': 'workspace:*'}}));
    linkFolder('ws-app/apps/web/node_modules/@acme/app-ui', 'ws-app/packages/ui');
    put('ws-app/apps/web/page.tsx', "import {Badge} from '@acme/app-ui';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    // The pnpm store layout: node_modules links into node_modules/.pnpm.
    put('pnpm-store/package.json', '{"name":"pnpm-store","private":true}');
    putLinkedPackage('pnpm-store/node_modules/.pnpm/@acme+stored@1.0.0/node_modules/@acme/stored', '@acme/stored');
    linkFolder('pnpm-store/node_modules/@acme/stored', 'pnpm-store/node_modules/.pnpm/@acme+stored@1.0.0/node_modules/@acme/stored');
    put('pnpm-store/page.tsx', "import {Badge} from '@acme/stored';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    // A CommonJS package and an ES module package, installed as folders.
    put('cjs-pkg/package.json', '{"name":"cjs-pkg","private":true}');
    put('cjs-pkg/node_modules/acme-cjs/package.json', JSON.stringify({name: 'acme-cjs', version: '1.0.0', main: './lib/index.js'}));
    put('cjs-pkg/node_modules/acme-cjs/lib/index.js', "exports.Badge = require('./badge.js').Badge;\n");
    put('cjs-pkg/node_modules/acme-cjs/lib/badge.js', "const {jsx} = require('react/jsx-runtime');\nexports.Badge = function Badge() { return jsx('strong', {children: 'acme-cjs badge text'}); };\n");
    put('cjs-pkg/page.tsx', "import {Badge} from 'acme-cjs';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    put('esm-pkg/package.json', '{"name":"esm-pkg","private":true}');
    putLinkedPackage('esm-pkg/node_modules/@acme/esm', '@acme/esm');
    put('esm-pkg/page.tsx', "import {Badge} from '@acme/esm';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    for (const [page, text] of [
      ['ws-root/src/page.tsx', '@acme/ws-ui badge text'],
      ['ws-app/apps/web/page.tsx', '@acme/app-ui badge text'],
      ['pnpm-store/page.tsx', '@acme/stored badge text'],
      ['cjs-pkg/page.tsx', 'acme-cjs badge text'],
      ['esm-pkg/page.tsx', '@acme/esm badge text'],
    ]) {
      const {first, back, markup, againMarkup} = await roundTrip(page);
      expect(first.data.files).toEqual(['page.tsx']);
      expect(markup).toContain(text);
      expect(back.data.exact).toBe(true);
      expect(againMarkup).toBe(markup);
    }
  }, 180_000);

  it('uses an explicit --title', async () => {
    const r = /** @type {any} */ (await render('page.tsx', {cwd: dir, out: 'titled.html', title: 'Q3 <report>'}));
    expect(r.data.output).toBe('titled.html');
    expect(fs.readFileSync(path.join(dir, 'titled.html'), 'utf8')).toContain('<title>Q3 &lt;report&gt;</title>');
  }, 60_000);
});

describe('render(): imports with a query, as Vite gives them', () => {
  it('gives ?raw the file text, ?inline a stylesheet text, ?url an image address, and gives the files back', async () => {
    put('queries/notes.css', '.note { color: teal; --note-marker: 1; }\n');
    put('queries/dot.png', PNG);
    put('queries/data.json', '{"a": 1}\n');
    put(
      'queries/page.tsx',
      "import sheet from './notes.css?inline';\nimport text from './data.json?raw';\nimport * as whole from './data.json?raw';\nimport {default as named} from './data.json?raw';\nimport dot from './dot.png?url';\nexport default function Page() {\n  return <main><pre className=\"note\">{sheet}</pre><pre>{text}</pre><pre>{whole.default === text && named === text ? 'every import gets the text' : 'no'}</pre><img src={dot} alt=\"\" /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const result = /** @type {any} */ (await render('queries/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'queries/page.html'), 'utf8');
    expect(html).toContain('.note { color: teal; --note-marker: 1; }');
    expect(html).toContain('every import gets the text');
    expect(html).toContain('{&quot;a&quot;: 1}');
    expect(html).toContain('src="data:image/png;base64,');
    // A stylesheet imported with ?inline is text, not a sheet of the page:
    // the class it styles is used, and no rule of it is in the page's styles.
    expect(html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1]).not.toContain('--note-marker');
    expect(result.data.files.sort()).toEqual(['data.json', 'dot.png', 'notes.css', 'page.tsx']);
    const back = /** @type {any} */ (await render('queries/page.html', {cwd: dir, reverse: true, out: 'queries-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
  }, 60_000);

  it('loads a file with any other query as it loads without one: an image as its address, a module as itself', async () => {
    put('queries/w.ts', "export const label = 'from the worker module';\n");
    put(
      'queries/others.tsx',
      "import a from './dot.png?w=400';\nimport b from './dot.png?no-inline';\nimport c from './dot.png?url&inline';\nimport * as w from './w.ts?worker';\nexport default function Page() {\n  return <main><img src={a} alt=\"\" /><img src={b} alt=\"\" /><img src={c} alt=\"\" /><p>{w.label}</p></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const result = /** @type {any} */ (await render('queries/others.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'queries/others.html'), 'utf8');
    expect(html.match(/src="data:image\/png;base64,/g)).toHaveLength(3);
    expect(html).toContain('from the worker module');
    expect(result.data.files.sort()).toEqual(['dot.png', 'others.tsx', 'w.ts']);
  }, 60_000);
});

describe('render(): ordinary files named like configuration', () => {
  it('carries modules and JSON data named config or ending in rc, and gives them back exactly', async () => {
    put('names/config.ts', "export const site = {title: 'Named config'};\n");
    put('names/lib/arc.ts', "export const arc = 'an arc';\n");
    put('names/data/chart-config.json', '{"series": ["North", "South"]}\n');
    put('names/data/config.json', '{"footer": "From config.json"}\n');
    put(
      'names/page.tsx',
      "import {site} from './config';\nimport {arc} from './lib/arc';\nimport chart from './data/chart-config.json';\nimport config from './data/config.json';\nexport default function Page() {\n  return <main><h1>{site.title}</h1><p>{arc} {chart.series.join(' ')} {config.footer}</p></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const result = /** @type {any} */ (await render('names/page.tsx', {cwd: dir}));
    expect(result.data.files.sort()).toEqual(['config.ts', 'data/chart-config.json', 'data/config.json', 'lib/arc.ts', 'page.tsx']);
    expect(result.data.warnings.filter((/** @type {any} */ w) => w.code === 'not-embedded')).toEqual([]);
    // Format 1 readers refuse these names, so the file says format 2.
    const back = /** @type {any} */ (await render('names/page.html', {cwd: dir, reverse: true, out: 'names-back/page.tsx'}));
    expect(back.data).toMatchObject({exact: true, format: 2});
    for (const name of ['config.ts', 'lib/arc.ts', 'data/chart-config.json', 'data/config.json']) {
      expect(fs.readFileSync(path.join(dir, 'names-back', name))).toEqual(fs.readFileSync(path.join(dir, 'names', name)));
    }
  }, 60_000);
});
