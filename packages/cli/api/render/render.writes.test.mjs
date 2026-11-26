// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for render() (`astryx experimental export`): every write stays inside the current folder.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {PAGE, PNG, codeOf, dir, put, useRenderFixture} from '../../test-utils/render-fixture.mjs';

useRenderFixture();

describe('render(): every write stays inside the current folder', () => {
  it('refuses an embedded entry path that climbs out', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    fs.mkdirSync(path.join(dir, 'inner'), {recursive: true});
    put(
      'inner/entry.html',
      `<body><p class="astryx-text">x</p>${sourceBlock('../../../outside.tsx', [
        {path: '../../../outside.tsx', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')},
      ])}</body>`,
    );
    expect(await codeOf(() => render('inner/entry.html', {cwd: dir, reverse: true}))).toBe('ERR_PATH_TRAVERSAL');
    expect(fs.existsSync(path.join(dir, 'inner/outside.tsx'))).toBe(false);
  });

  it('gives back a page that imports from a parent folder, keeping the layout inside the current folder', async () => {
    put('tree/src/components/Footer.tsx', 'export function Footer() { return <p>Parent footer</p>; }\n');
    put(
      'tree/src/app/page.tsx',
      "import {Footer} from '../components/Footer';\nexport default function Page() { return <main><h1>Tree</h1><Footer /></main>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const cwd = path.join(dir, 'tree/src/app');
    const r = /** @type {any} */ (await render('page.tsx', {cwd}));
    expect(r.data.files).toEqual(['app/page.tsx', 'components/Footer.tsx']);
    // From the page's own folder, the neighbour would land outside it, beside
    // existing files: refused, naming a new folder to restore into.
    /** @type {any} */
    let refused;
    try {
      await render('page.html', {cwd, reverse: true, out: 'back.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(refused.message).toContain('--out restored/app/back.tsx');
    expect(fs.existsSync(path.join(cwd, 'back.tsx'))).toBe(false);
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true, out: 'restored/app/back.tsx'}));
    expect(back.data.files).toEqual(['restored/app/back.tsx', 'restored/components/Footer.tsx']);
    const again = /** @type {any} */ (await render('restored/app/back.tsx', {cwd}));
    expect(again.type).toBe('render.page');
    // From a folder that holds the whole tree, the page lands where asked.
    const up = path.join(dir, 'tree');
    const back2 = /** @type {any} */ (await render('src/app/page.html', {cwd: up, reverse: true, out: 'copy/app/page.tsx'}));
    expect(back2.data.output).toBe('copy/app/page.tsx');
    expect(back2.data.files).toEqual(['copy/app/page.tsx', 'copy/components/Footer.tsx']);
    // Into a folder with another name: each neighbour goes where the page's
    // own imports find it from there, and the page renders again.
    const renamed = /** @type {any} */ (
      await render('src/app/page.html', {cwd: up, reverse: true, out: 'src/reports/today/page.tsx'})
    );
    expect(renamed.data.output).toBe('src/reports/today/page.tsx');
    expect(renamed.data.files).toEqual(['src/reports/today/page.tsx', 'src/reports/components/Footer.tsx']);
    const rerendered = /** @type {any} */ (await render('src/reports/today/page.tsx', {cwd: up}));
    expect(rerendered.type).toBe('render.page');
  }, 60_000);

  it('resolves a tsconfig path alias', async () => {
    put('aliased/tsconfig.json', '{\n  // paths\n  "compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}},\n}\n');
    put('aliased/package.json', '{"name":"aliased","private":true}');
    put('aliased/src/Header.tsx', 'export function Header() { return <p>Aliased header</p>; }\n');
    put('aliased/src/page.tsx', "import {Header} from '@/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    put('aliased/src/bad.tsx', "import X from '@/nope';\nexport default function Page() { return <X />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('aliased/src/page.tsx', {cwd: dir}));
    expect(fs.readFileSync(path.join(dir, 'aliased/src/page.html'), 'utf8')).toContain('Aliased header');
    expect(r.data.files).toEqual(['page.tsx', 'Header.tsx']);
    expect(await codeOf(() => render('aliased/src/bad.tsx', {cwd: dir}))).toBe('ERR_FILE_NOT_FOUND');
  }, 60_000);

  it('reads the aliases of the referenced project that holds the page, behind a solution-style tsconfig.json', async () => {
    const vite = (/** @type {string} */ name) => {
      put(`${name}/package.json`, `{"name":"${name}","private":true}`);
      put(`${name}/tsconfig.json`, '{\n  "files": [],\n  "references": [{"path": "./tsconfig.app.json"}, {"path": "./tsconfig.node.json"}]\n}\n');
      put(`${name}/tsconfig.app.json`, '{\n  "compilerOptions": {"paths": {"@/*": ["./src/*"]}},\n  "include": ["src"],\n}\n');
      put(`${name}/tsconfig.node.json`, '{"compilerOptions": {"paths": {"@/*": ["./config/*"]}}, "include": ["vite.config.ts"]}\n');
    };
    vite('solution');
    put('solution/src/components/Header.tsx', 'export function Header() { return <p>Solution header</p>; }\n');
    put('solution/src/pages/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('solution/src/pages/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(['pages/page.tsx', 'components/Header.tsx']);
    expect(fs.readFileSync(path.join(dir, 'solution/src/pages/page.html'), 'utf8')).toContain('Solution header');
    // A project laid out the same way takes it back where its own alias points.
    vite('solution-to');
    fs.copyFileSync(path.join(dir, 'solution/src/pages/page.html'), path.join(dir, 'solution-to/page.html'));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'solution-to'), reverse: true, out: 'src/pages/page.tsx'}));
    expect(back.data).toMatchObject({exact: true, files: ['src/pages/page.tsx', 'src/components/Header.tsx']});
  }, 60_000);

  it('reads aliases through extends: a path without .json, a package, and a list whose later config wins', async () => {
    // A base config above the project: its baseUrl is read from its own folder.
    put('ext/tsconfig.base.json', '{"compilerOptions": {"baseUrl": "apps/web", "paths": {"@data/*": ["src/data/*"]}}}\n');
    put('ext/apps/web/package.json', '{"name":"web","private":true}');
    put('ext/apps/web/tsconfig.json', '{"extends": "../../tsconfig.base"}\n');
    put('ext/apps/web/src/data/rows.ts', "export const rows = ['North', 'South'];\n");
    put('ext/apps/web/src/pages/page.tsx', "import {rows} from '@data/rows';\nexport default function Page() { return <ul>{rows.map(r => <li key={r}>{r}</li>)}</ul>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const web = /** @type {any} */ (await render('ext/apps/web/src/pages/page.tsx', {cwd: dir}));
    expect(web.data.files).toEqual(['pages/page.tsx', 'data/rows.ts']);
    // A package's config, after one of the project's own: the later one wins,
    // and ${configDir} is the folder of the config the project reads.
    put('ext-pkg/package.json', '{"name":"ext-pkg","private":true}');
    put('ext-pkg/node_modules/@acme/tsconfig/package.json', '{"name":"@acme/tsconfig","version":"1.0.0"}');
    put('ext-pkg/node_modules/@acme/tsconfig/base.json', '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/ui/*"]}}}\n');
    put('ext-pkg/tsconfig.first.json', '{"compilerOptions": {"paths": {"@ui/*": ["./elsewhere/*"]}}}\n');
    put('ext-pkg/tsconfig.json', '{"extends": ["./tsconfig.first.json", "@acme/tsconfig/base.json"]}\n');
    put('ext-pkg/src/ui/Panel.tsx', 'export function Panel() { return <section>Panel from the package alias</section>; }\n');
    put('ext-pkg/src/page.tsx', "import {Panel} from '@ui/Panel';\nexport default function Page() { return <Panel />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const pkg = /** @type {any} */ (await render('ext-pkg/src/page.tsx', {cwd: dir}));
    expect(pkg.data.files).toEqual(['page.tsx', 'ui/Panel.tsx']);
    expect(fs.readFileSync(path.join(dir, 'ext-pkg/src/page.html'), 'utf8')).toContain('Panel from the package alias');
    // A package named alone: its tsconfig field, else its tsconfig.json,
    // never its code `main`.
    const config = '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/ui/*"]}}}\n';
    for (const [name, files, extendsName = name] of [
      ['js-main', {'package.json': '{"name":"js-main","version":"1.0.0","main":"index.js"}', 'index.js': 'module.exports = {};\n', 'tsconfig.json': config}],
      ['field', {'package.json': '{"name":"field","version":"1.0.0","main":"index.js","tsconfig":"./configs/base.json"}', 'index.js': 'module.exports = {};\n', 'configs/base.json': config}],
      // A package whose exports send "." to its config, or a pattern a subpath matches.
      ['dot', {'package.json': '{"name":"dot","version":"1.0.0","exports":{".":{"import":"./esm.json","require":"./configs/base.json"}}}', 'configs/base.json': config}],
      ['star', {'package.json': '{"name":"star","version":"1.0.0","exports":{"./*":"./configs/*.json"}}', 'configs/strict.json': config}, 'star/strict'],
      // Of two patterns, the one with the longer part before the `*` wins, as in Node.
      ['order', {'package.json': '{"name":"order","version":"1.0.0","exports":{"./*.json":"./wrong/*.json","./a*":"./right/a*"}}', 'right/ab.json': config, 'wrong/ab.json': '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/nowhere/*"]}}}\n'}, 'order/ab.json'],
    ]) {
      const root = `ext-${name}`;
      put(`${root}/package.json`, `{"name":"${root}","private":true}`);
      for (const [file, text] of Object.entries(files)) put(`${root}/node_modules/${name}/${file}`, text);
      put(`${root}/tsconfig.json`, `{"extends": "${extendsName}"}\n`);
      put(`${root}/src/ui/Panel.tsx`, 'export function Panel() { return <section>Panel</section>; }\n');
      put(`${root}/src/page.tsx`, "import {Panel} from '@ui/Panel';\nexport default function Page() { return <Panel />; }\nimport '@astryxdesign/core/astryx.css';\n");
      const r = /** @type {any} */ (await render(`${root}/src/page.tsx`, {cwd: dir}));
      expect(r.data.files, name).toEqual(['page.tsx', 'ui/Panel.tsx']);
    }
    // A config package read through a link: from where it really is, so a
    // package it extends in turn, and paths that climb out of it, resolve
    // from there; and a nearer copy without the config is passed by.
    const panel = 'export function Panel() { return <section>Panel</section>; }\n';
    const page = "import {Panel} from '@ui/Panel';\nexport default function Page() { return <Panel />; }\nimport '@astryxdesign/core/astryx.css';\n";
    put('ext-store/package.json', '{"name":"ext-store","private":true}');
    put('ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg/package.json', '{"name":"cfg","version":"1.0.0"}');
    put('ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg/tsconfig.json', '{"extends": "cfg-base"}\n');
    put('ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg-base/package.json', '{"name":"cfg-base","version":"1.0.0"}');
    put('ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg-base/tsconfig.json', '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/ui/*"]}}}\n');
    fs.symlinkSync(path.join(dir, 'ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg'), path.join(dir, 'ext-store/node_modules/cfg'), 'junction');
    put('ext-store/tsconfig.json', '{"extends": "cfg"}\n');
    put('ext-store/src/ui/Panel.tsx', panel);
    put('ext-store/src/page.tsx', page);
    const store = /** @type {any} */ (await render('ext-store/src/page.tsx', {cwd: dir}));
    expect(store.data.files).toEqual(['page.tsx', 'ui/Panel.tsx']);
    put('ext-ws/package.json', '{"name":"ext-ws","private":true}');
    put('ext-ws/packages/tsconfig/package.json', '{"name":"@acme/tsconfig","version":"1.0.0"}');
    put('ext-ws/packages/tsconfig/base.json', '{"compilerOptions": {"paths": {"@ui/*": ["../ui/src/*"]}}}\n');
    put('ext-ws/packages/ui/src/Panel.tsx', panel);
    put('ext-ws/apps/web/package.json', '{"name":"web","private":true}');
    fs.mkdirSync(path.join(dir, 'ext-ws/apps/web/node_modules/@acme'), {recursive: true});
    fs.symlinkSync(path.join(dir, 'ext-ws/packages/tsconfig'), path.join(dir, 'ext-ws/apps/web/node_modules/@acme/tsconfig'), 'junction');
    put('ext-ws/apps/web/tsconfig.json', '{"extends": "@acme/tsconfig/base"}\n');
    put('ext-ws/apps/web/src/page.tsx', page);
    // The alias leads out of the app, to the workspace package it names.
    await render('ext-ws/apps/web/src/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'ext-ws/apps/web/src/page.html'), 'utf8')).toContain('<section>Panel</section>');
    put('ext-near/package.json', '{"name":"ext-near","private":true}');
    put('ext-near/node_modules/shared-cfg/package.json', '{"name":"shared-cfg","version":"1.0.0"}');
    put('ext-near/node_modules/shared-cfg/tsconfig.json', '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/ui/*"]}}}\n');
    put('ext-near/app/package.json', '{"name":"app","private":true}');
    put('ext-near/app/node_modules/shared-cfg/package.json', '{"name":"shared-cfg","version":"0.1.0"}');
    put('ext-near/app/tsconfig.json', '{"extends": "shared-cfg"}\n');
    put('ext-near/app/src/ui/Panel.tsx', panel);
    put('ext-near/app/src/page.tsx', page);
    const near = /** @type {any} */ (await render('ext-near/app/src/page.tsx', {cwd: dir}));
    expect(near.data.files).toEqual(['page.tsx', 'ui/Panel.tsx']);
  }, 60_000);

  it('gives back a page that imports through an alias where this project\'s alias points', async () => {
    put('aliased-src/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('aliased-src/package.json', '{"name":"aliased-src","private":true}');
    put('aliased-src/src/components/Header.tsx', 'export function Header() { return <p>Alias header</p>; }\n');
    put(
      'aliased-src/src/app/page.tsx',
      "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    await render('aliased-src/src/app/page.tsx', {cwd: dir});
    // Another project with the same alias, and the guide's own command.
    put('aliased-to/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('aliased-to/package.json', '{"name":"aliased-to","private":true}');
    fs.copyFileSync(path.join(dir, 'aliased-src/src/app/page.html'), path.join(dir, 'aliased-to/page.html'));
    const cwd = path.join(dir, 'aliased-to');
    // The alias leads into an existing folder that lacks the file: its copy
    // goes in the page's layout, which from here is outside the folder the
    // restore creates, so it is refused with a new folder to use.
    put('aliased-to/src/keep.txt', 'existing\n');
    /** @type {any} */
    let refused;
    try {
      await render('page.html', {cwd, reverse: true, out: 'page.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(refused.suggestions?.[0]?.name).toBe('--out restored/app/page.tsx');
    expect(fs.existsSync(path.join(cwd, 'src/components'))).toBe(false);
    fs.rmSync(path.join(cwd, 'src'), {recursive: true});
    // Into a new folder the alias points into: the page and its import come back.
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true, out: 'src/app/page.tsx'}));
    expect(back.data.files).toEqual(['src/app/page.tsx', 'src/components/Header.tsx']);
    const again = /** @type {any} */ (await render('src/app/page.tsx', {cwd}));
    expect(again.type).toBe('render.page');
    expect(fs.readFileSync(path.join(cwd, 'src/app/page.html'), 'utf8')).toContain('Alias header');
    // Without the alias, the file comes back in the page's own layout inside
    // the new folder, and the result names the import and its file.
    put('no-alias/package.json', '{"name":"no-alias","private":true}');
    fs.copyFileSync(path.join(dir, 'aliased-src/src/app/page.html'), path.join(dir, 'no-alias/page.html'));
    const away = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'no-alias'), reverse: true}));
    expect(away.data).toMatchObject({
      exact: true,
      files: ['page-restored/app/page.tsx', 'page-restored/components/Header.tsx'],
      aliased: {
        config: 'tsconfig.json',
        paths: {'@/*': ['./page-restored/*']},
        imports: [{import: '@/components/Header', file: 'page-restored/components/Header.tsx'}],
      },
    });
    expect(fs.readFileSync(path.join(dir, 'no-alias/page-restored/components/Header.tsx'))).toEqual(
      fs.readFileSync(path.join(dir, 'aliased-src/src/components/Header.tsx')),
    );
  }, 60_000);

  it('restores an aliased page in its own project again and again', async () => {
    put('alias-home/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('alias-home/package.json', '{"name":"alias-home","private":true}');
    const header = 'export function Header() { return <p>Home header</p>; }\n';
    put('alias-home/src/components/Header.tsx', header);
    put('alias-home/src/app/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const cwd = path.join(dir, 'alias-home');
    await render('src/app/page.tsx', {cwd, out: 'page.html'});
    // The project's alias reaches the same file: the page uses it, and only the page is written.
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true}));
    expect(back.data).toMatchObject({exact: true, files: ['page-restored/app/page.tsx']});
    expect(back.data.aliased).toEqual({imports: [], sameAsProject: [{import: '@/components/Header', file: 'src/components/Header.tsx'}]});
    // Render it again, and give that back too.
    await render('page-restored/app/page.tsx', {cwd, out: 'page.html'});
    expect(fs.readFileSync(path.join(cwd, 'page.html'), 'utf8')).toContain('Home header');
    const twice = /** @type {any} */ (await render('page.html', {cwd, reverse: true}));
    // The new render carries the page from where it now sits, beside the project's file.
    expect(twice.data.files).toEqual(['page-restored-2/page-restored/app/page.tsx']);
    // The project's file changed since the render: the page's own copy comes
    // back in its layout, the result names the project's file, and the
    // `paths` lead the import to the copy first.
    put('alias-home/src/components/Header.tsx', 'export function Header() { return <p>Changed header</p>; }\n');
    const changed = /** @type {any} */ (await render('page.html', {cwd, reverse: true}));
    const copy = 'page-restored-3/src/components/Header.tsx';
    expect(changed.data.files).toEqual(['page-restored-3/page-restored/app/page.tsx', copy]);
    expect(changed.data.aliased).toEqual({
      config: 'tsconfig.json',
      paths: {'@/*': ['./src/*', './page-restored-3/src/*'], '@/components/Header': [`./${copy}`]},
      imports: [{import: '@/components/Header', file: copy}],
      differs: [
        {
          import: '@/components/Header',
          project: 'src/components/Header.tsx',
          exists: true,
          file: copy,
          projectWide: true,
          instead: [{file: 'page-restored-3/page-restored/app/page.tsx', import: '../../src/components/Header'}],
        },
      ],
    });
    expect(fs.readFileSync(path.join(cwd, copy), 'utf8')).toBe(header);
    expect(fs.readFileSync(path.join(cwd, 'src/components/Header.tsx'), 'utf8')).toContain('Changed header');
    put('alias-home/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: changed.data.aliased.paths}}));
    await render('page-restored-3/page-restored/app/page.tsx', {cwd, out: 'again.html'});
    expect(fs.readFileSync(path.join(cwd, 'again.html'), 'utf8')).toContain('Home header');
    // The aliased file is the same, but a file it imports changed in the
    // project: using the project's file would render the changed import, so
    // the page's copies of both come back.
    put('alias-deep/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('alias-deep/package.json', '{"name":"alias-deep","private":true}');
    put('alias-deep/src/components/Header.tsx', "import {mark} from './mark';\nexport function Header() { return <p>Deep header {mark}</p>; }\n");
    const mark = "export const mark = 'sent mark';\n";
    put('alias-deep/src/components/mark.ts', mark);
    put('alias-deep/src/app/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const deep = path.join(dir, 'alias-deep');
    await render('src/app/page.tsx', {cwd: deep, out: 'page.html'});
    // Unchanged: the page uses the project's files, and only the page is written.
    const same = /** @type {any} */ (await render('page.html', {cwd: deep, reverse: true}));
    expect(same.data.files).toEqual(['page-restored/app/page.tsx']);
    expect(same.data.aliased).toEqual({imports: [], sameAsProject: [{import: '@/components/Header', file: 'src/components/Header.tsx'}]});
    put('alias-deep/src/components/mark.ts', "export const mark = 'changed mark';\n");
    const below = /** @type {any} */ (await render('page.html', {cwd: deep, reverse: true}));
    expect(below.data.exact).toBe(true);
    expect(below.data.files).toEqual([
      'page-restored-2/app/page.tsx',
      'page-restored-2/components/Header.tsx',
      'page-restored-2/components/mark.ts',
    ]);
    expect(below.data.aliased.differs).toEqual([
      {
        import: '@/components/Header',
        project: 'src/components/Header.tsx',
        exists: true,
        file: 'page-restored-2/components/Header.tsx',
        changed: ['src/components/mark.ts'],
        projectWide: true,
        instead: [{file: 'page-restored-2/app/page.tsx', import: '../components/Header'}],
      },
    ]);
    expect(fs.readFileSync(path.join(deep, 'page-restored-2/components/mark.ts'), 'utf8')).toBe(mark);
    const {stdout} = await runCli(['experimental', 'export', '--reverse', 'page.html'], {cwd: deep});
    expect(stdout).toContain("is the same as the page's copy, but files it imports differ here (src/components/mark.ts)");
    expect(stdout).toContain('The "paths" below apply to the whole project');
    expect(stdout).toContain("in page-restored-3/app/page.tsx, import '../components/Header'");
    // The narrower fix, as the answer gives it: the restored page imports the copy by a relative path.
    const restoredPage = path.join(deep, 'page-restored-2/app/page.tsx');
    fs.writeFileSync(restoredPage, fs.readFileSync(restoredPage, 'utf8').replace("'@/components/Header'", "'../components/Header'"));
    await render('page-restored-2/app/page.tsx', {cwd: deep, out: 'narrow.html'});
    expect(fs.readFileSync(path.join(deep, 'narrow.html'), 'utf8')).toContain('sent mark');
  }, 90_000);

  it('gives the relative imports for a chain of restored copies, and for an alias whose file is not there', async () => {
    const config = '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n';
    put('alias-chain/tsconfig.json', config);
    put('alias-chain/package.json', '{"name":"alias-chain","private":true}');
    put('alias-chain/src/components/Icon.tsx', 'export function Icon() { return <i>sent icon</i>; }\n');
    put('alias-chain/src/components/Header.tsx', "import {Icon} from '@/components/Icon';\nexport function Header() { return <p>Chain header <Icon /></p>; }\n");
    put('alias-chain/src/app/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const cwd = path.join(dir, 'alias-chain');
    await render('src/app/page.tsx', {cwd, out: 'page.html'});
    // Both files the alias reaches changed in the project since the render.
    put('alias-chain/src/components/Icon.tsx', 'export function Icon() { return <i>changed icon</i>; }\n');
    put('alias-chain/src/components/Header.tsx', "import {Icon} from '@/components/Icon';\nexport function Header() { return <p>Changed header <Icon /></p>; }\n");
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true}));
    expect(back.data.files).toEqual(['page-restored/app/page.tsx', 'page-restored/components/Header.tsx', 'page-restored/components/Icon.tsx']);
    expect(back.data.aliased.differs).toEqual([
      {
        import: '@/components/Header',
        project: 'src/components/Header.tsx',
        exists: true,
        file: 'page-restored/components/Header.tsx',
        projectWide: true,
        instead: [{file: 'page-restored/app/page.tsx', import: '../components/Header'}],
      },
      {
        import: '@/components/Icon',
        project: 'src/components/Icon.tsx',
        exists: true,
        file: 'page-restored/components/Icon.tsx',
        projectWide: true,
        instead: [{file: 'page-restored/components/Header.tsx', import: './Icon'}],
      },
    ]);
    // Following every `instead`, the restored page renders the page's own copies, not the project's changed files.
    for (const {instead, import: spec} of back.data.aliased.differs) {
      for (const {file, import: relative} of instead) {
        const at = path.join(cwd, file);
        fs.writeFileSync(at, fs.readFileSync(at, 'utf8').replace(`'${spec}'`, `'${relative}'`));
      }
    }
    await render('page-restored/app/page.tsx', {cwd, out: 'narrow.html'});
    const narrow = fs.readFileSync(path.join(cwd, 'narrow.html'), 'utf8');
    expect(narrow).toContain('Chain header');
    expect(narrow).toContain('sent icon');
    expect(narrow).not.toContain('changed icon');
    expect(fs.readFileSync(path.join(cwd, 'tsconfig.json'), 'utf8')).toBe(config);
    // The alias is there but its file is not: the text names the whole-project reach and the relative import too.
    put('alias-gone/tsconfig.json', config);
    put('alias-gone/package.json', '{"name":"alias-gone","private":true}');
    put('alias-gone-src/tsconfig.json', config);
    put('alias-gone-src/package.json', '{"name":"alias-gone-src","private":true}');
    put('alias-gone-src/src/components/Header.tsx', 'export function Header() { return <p>Gone header</p>; }\n');
    put('alias-gone-src/src/app/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('alias-gone-src/src/app/page.tsx', {cwd: dir});
    fs.copyFileSync(path.join(dir, 'alias-gone-src/src/app/page.html'), path.join(dir, 'alias-gone/page.html'));
    const gone = path.join(dir, 'alias-gone');
    const missing = /** @type {any} */ (await render('page.html', {cwd: gone, reverse: true}));
    expect(missing.data.aliased.differs).toEqual([
      {
        import: '@/components/Header',
        project: 'src/components/Header.tsx',
        exists: false,
        file: 'page-restored/components/Header.tsx',
        projectWide: true,
        instead: [{file: 'page-restored/app/page.tsx', import: '../components/Header'}],
      },
    ]);
    const {stdout} = await runCli(['experimental', 'export', '--reverse', 'page.html'], {cwd: gone});
    expect(stdout).toContain('@/components/Header reaches src/components/Header.tsx in this project, which is not there');
    expect(stdout).toContain('The "paths" below apply to the whole project: with them, every file that imports @/components/Header gets the page\'s copy.');
    expect(stdout).toContain("in page-restored-2/app/page.tsx, import '../components/Header'");
    expect(fs.readFileSync(path.join(gone, 'tsconfig.json'), 'utf8')).toBe(config);
  }, 90_000);

  it('never edits a tsconfig.json: a reverse that needs an alias entry names the entry, the file it belongs in, and why', async () => {
    put('tsc-src/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('tsc-src/package.json', '{"name":"tsc-src","private":true}');
    put('tsc-src/src/components/Header.tsx', 'export function Header() { return <p>Sent header</p>; }\n');
    put('tsc-src/src/app/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('tsc-src/src/app/page.tsx', {cwd: dir});
    const sent = path.join(dir, 'tsc-src/src/app/page.html');
    // A project whose config has other aliases, with a comment and its own layout, that no tool may rewrite.
    const config = '{\n  // the project\'s own aliases\n  "compilerOptions": {"baseUrl": ".", "paths": {"$lib/*": ["./lib/*"]}},\n}\n';
    put('tsc-to/package.json', '{"name":"tsc-to","private":true}');
    put('tsc-to/tsconfig.json', config);
    fs.copyFileSync(sent, path.join(dir, 'tsc-to/page.html'));
    const cwd = path.join(dir, 'tsc-to');
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true}));
    expect(back.data.aliased).toEqual({
      config: 'tsconfig.json',
      paths: {'$lib/*': ['./lib/*'], '@/*': ['./page-restored/*']},
      imports: [{import: '@/components/Header', file: 'page-restored/components/Header.tsx'}],
    });
    expect(fs.readFileSync(path.join(cwd, 'tsconfig.json'), 'utf8')).toBe(config);
    const {stdout} = await runCli(['experimental', 'export', '--reverse', 'page.html'], {cwd});
    expect(stdout).toContain('through a path alias that does not reach it in this project');
    expect(stdout).toContain('set the "paths" of tsconfig.json');
    expect(stdout).toContain('"$lib/*": ["./lib/*"], "@/*": ["./page-restored-2/*"]');
    expect(fs.readFileSync(path.join(cwd, 'tsconfig.json'), 'utf8')).toBe(config);
    // The project's alias reaches a different file: that file and the config stay as they are, and the answer says why.
    const aliased = '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n';
    const own = 'export function Header() { return <p>Own header</p>; }\n';
    put('tsc-own/package.json', '{"name":"tsc-own","private":true}');
    put('tsc-own/tsconfig.json', aliased);
    put('tsc-own/src/components/Header.tsx', own);
    fs.copyFileSync(sent, path.join(dir, 'tsc-own/page.html'));
    const ownCwd = path.join(dir, 'tsc-own');
    const differs = /** @type {any} */ (await render('page.html', {cwd: ownCwd, reverse: true}));
    expect(differs.data.aliased.differs).toEqual([
      {
        import: '@/components/Header',
        project: 'src/components/Header.tsx',
        exists: true,
        file: 'page-restored/components/Header.tsx',
        projectWide: true,
        instead: [{file: 'page-restored/app/page.tsx', import: '../components/Header'}],
      },
    ]);
    expect(differs.data.aliased.config).toBe('tsconfig.json');
    const text = (await runCli(['experimental', 'export', '--reverse', 'page.html'], {cwd: ownCwd})).stdout;
    expect(text).toContain('@/components/Header reaches src/components/Header.tsx in this project, which differs from the copy the page carries');
    expect(text).toContain('every file that imports @/components/Header gets the page\'s copy instead of src/components/Header.tsx');
    expect(fs.readFileSync(path.join(ownCwd, 'tsconfig.json'), 'utf8')).toBe(aliased);
    expect(fs.readFileSync(path.join(ownCwd, 'src/components/Header.tsx'), 'utf8')).toBe(own);
  }, 60_000);

  it('names the paths for an alias import from a file that records none', async () => {
    put('alias-old/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('alias-old/package.json', '{"name":"alias-old","private":true}');
    put('alias-old/src/components/Header.tsx', 'export function Header() { return <p>Old header</p>; }\n');
    put('alias-old/src/app/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('alias-old/src/app/page.tsx', {cwd: dir});
    // A CLI before the alias record wrote the same block without it.
    const html = fs.readFileSync(path.join(dir, 'alias-old/src/app/page.html'), 'utf8');
    const open = '<script type="application/x-astryx-source">';
    const start = html.indexOf(open) + open.length;
    const end = html.indexOf('</script>', start);
    const block = JSON.parse(html.slice(start, end));
    expect(block.aliases).toBeDefined();
    delete block.aliases;
    const json = JSON.stringify(block).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
    put('alias-old-to/package.json', '{"name":"alias-old-to","private":true}');
    put('alias-old-to/page.html', html.slice(0, start) + json + html.slice(end));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'alias-old-to'), reverse: true}));
    expect(back.data).toMatchObject({
      exact: true,
      files: ['page-restored/app/page.tsx', 'page-restored/components/Header.tsx'],
      aliased: {config: 'tsconfig.json', paths: {'@/*': ['./page-restored/*']}, imports: [{import: '@/components/Header', file: 'page-restored/components/Header.tsx'}]},
    });
  }, 60_000);

  it('names the whole paths a page needs: every target of an alias, and the entries a config inherits', async () => {
    put('multi/package.json', '{"name":"multi","private":true}');
    put('multi/tsconfig.json', '{"compilerOptions": {"paths": {"@/*": ["./src/*", "./generated/*"]}}}\n');
    put('multi/src/components/Header.tsx', 'export function Header() { return <h1>Multi</h1>; }\n');
    put('multi/generated/api/client.ts', "export const client = 'generated client';\n");
    put(
      'multi/src/app/page.tsx',
      "import {Header} from '@/components/Header';\nimport {client} from '@/api/client';\nexport default function Page() { return <main><Header />{client}</main>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    await render('multi/src/app/page.tsx', {cwd: dir});
    // A project whose config takes its paths from the config it extends.
    put('multi-to/package.json', '{"name":"multi-to","private":true}');
    put('multi-to/tsconfig.base.json', '{"compilerOptions": {"paths": {"$lib/*": ["./lib/*"]}}}\n');
    put('multi-to/tsconfig.json', '{"extends": "./tsconfig.base.json"}\n');
    fs.copyFileSync(path.join(dir, 'multi/src/app/page.html'), path.join(dir, 'multi-to/multi.html'));
    const back = /** @type {any} */ (await render('multi.html', {cwd: path.join(dir, 'multi-to'), reverse: true}));
    expect(back.data).toMatchObject({exact: true});
    expect(back.data.aliased).toEqual({
      config: 'tsconfig.json',
      paths: {
        '$lib/*': ['./lib/*'],
        '@/*': ['./multi-restored/generated/*', './multi-restored/src/*'],
        '@/api/client': ['./multi-restored/generated/api/client.ts'],
        '@/components/Header': ['./multi-restored/src/components/Header.tsx'],
      },
      imports: [
        {import: '@/api/client', file: 'multi-restored/generated/api/client.ts'},
        {import: '@/components/Header', file: 'multi-restored/src/components/Header.tsx'},
      ],
    });
    // An alias whose first target overrides files of the second: the page
    // renders again with the override, once the printed paths are set.
    put('ov/package.json', '{"name":"ov","private":true}');
    put('ov/tsconfig.json', '{"compilerOptions": {"paths": {"@/*": ["./src/overrides/*", "./src/*"]}}}\n');
    put('ov/src/Zed.tsx', "export function Zed() { return <p>base Zed</p>; }\n");
    put('ov/src/overrides/Zed.tsx', "import {Zed as Base} from '../Zed';\nexport function Zed() { return <section>override <Base /></section>; }\n");
    put('ov/src/Apple.tsx', "export function Apple() { return <p>Apple</p>; }\n");
    put('ov/src/page.tsx', "import {Zed} from '@/Zed';\nimport {Apple} from '@/Apple';\nexport default function Page() { return <main><Apple /><Zed /></main>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('ov/src/page.tsx', {cwd: dir});
    put('ov-to/package.json', '{"name":"ov-to","private":true}');
    fs.copyFileSync(path.join(dir, 'ov/src/page.html'), path.join(dir, 'ov-to/ov.html'));
    const ov = /** @type {any} */ (await render('ov.html', {cwd: path.join(dir, 'ov-to'), reverse: true}));
    expect(ov.data.aliased.paths['@/Zed']).toEqual(['./ov-restored/overrides/Zed.tsx']);
    put('ov-to/tsconfig.json', JSON.stringify({compilerOptions: {paths: ov.data.aliased.paths}}));
    await render('ov-restored/page.tsx', {cwd: path.join(dir, 'ov-to'), out: 'again.html'});
    expect(fs.readFileSync(path.join(dir, 'ov-to/again.html'), 'utf8')).toContain('override');
  }, 60_000);

  it('gives back an aliased page where no alias of the project names its imports: in its own layout, naming the paths to add', async () => {
    const {sourceBlock: sourceBlockOf} = await import('../../foundation/render/source-block.mjs');
    put('alias-home/tsconfig.json', '{"compilerOptions": {"paths": {"@/*": ["./src/*"], "@members": ["./src/lib/members.ts"]}}}\n');
    put('alias-home/package.json', '{"name":"alias-home","private":true}');
    put('alias-home/src/components/Header.tsx', 'export function Header() { return <h1>Team</h1>; }\n');
    put('alias-home/src/lib/members.ts', "export const members = ['Ana', 'Bo'];\n");
    put(
      'alias-home/src/app/team/page.tsx',
      "import {Header} from '@/components/Header';\nimport {members} from '@members';\nexport default function Page() { return <main><Header />{members.join(', ')}</main>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    await render('alias-home/src/app/team/page.tsx', {cwd: dir});
    // Someone with only the HTML file, in a project with no tsconfig.json.
    const cwd = path.join(dir, 'alias-away');
    put('alias-away/package.json', '{"name":"alias-away","private":true}');
    fs.copyFileSync(path.join(dir, 'alias-home/src/app/team/page.html'), path.join(cwd, 'team.html'));
    const back = /** @type {any} */ (await render('team.html', {cwd, reverse: true}));
    expect(back.data).toMatchObject({
      mode: 'embedded',
      exact: true,
      output: 'team-restored/app/team/page.tsx',
      aliased: {
        config: 'tsconfig.json',
        paths: {'@/*': ['./team-restored/*'], '@members': ['./team-restored/lib/members.ts']},
        imports: [
          {import: '@/components/Header', file: 'team-restored/components/Header.tsx'},
          {import: '@members', file: 'team-restored/lib/members.ts'},
        ],
      },
    });
    for (const name of ['app/team/page.tsx', 'components/Header.tsx', 'lib/members.ts']) {
      expect(fs.readFileSync(path.join(cwd, 'team-restored', name))).toEqual(fs.readFileSync(path.join(dir, 'alias-home/src', name)));
    }
    const {stdout} = await runCli(['experimental', 'export', '--reverse', 'team.html'], {cwd});
    expect(stdout).toContain('set the "paths" of tsconfig.json (create it if it is not there) to: "@/*": ["./team-restored-2/*"], "@members": ["./team-restored-2/lib/members.ts"].');
    // The entries are written for the config TypeScript reads there, from
    // its baseUrl.
    put('alias-base/package.json', '{"name":"alias-base","private":true}');
    put('alias-base/tsconfig.json', '{"compilerOptions": {"baseUrl": "src"}}\n');
    fs.copyFileSync(path.join(dir, 'alias-home/src/app/team/page.html'), path.join(dir, 'alias-base/team.html'));
    const based = /** @type {any} */ (await render('team.html', {cwd: path.join(dir, 'alias-base'), reverse: true, out: 'src/team/app/team/page.tsx'}));
    expect(based.data.aliased).toMatchObject({config: 'tsconfig.json', paths: {'@/*': ['./team/*'], '@members': ['./team/lib/members.ts']}});
    // A record never remaps a package: a forged entry for `react` is not
    // followed, and the file it names is refused.
    put(
      'alias-away/forged-react.html',
      `<!doctype html><html><body><p class="astryx-text">x</p>${sourceBlockOf(
        'page.tsx',
        [
          {path: 'page.tsx', bytes: Buffer.from("import React from 'react';\nexport default function Page() { return React.createElement('p', null, 'x'); }\nimport '@astryxdesign/core/astryx.css';\n")},
          {path: 'lib/react.ts', bytes: Buffer.from('export default {};\n')},
        ],
        {aliases: {react: 'lib/react.ts'}},
      )}</body></html>`,
    );
    expect(await codeOf(() => render('forged-react.html', {cwd, reverse: true}))).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(fs.existsSync(path.join(cwd, 'forged-react-restored'))).toBe(false);
    // Nor a package's own subpath import, which its package.json may map.
    put(
      'alias-away/forged-hash.html',
      `<!doctype html><html><body><p class="astryx-text">x</p>${sourceBlockOf(
        'page.tsx',
        [
          {path: 'page.tsx', bytes: Buffer.from("import {u} from '#utils';\nexport default function Page() { return <p>{u}</p>; }\nimport '@astryxdesign/core/astryx.css';\n")},
          {path: 'lib/utils.ts', bytes: Buffer.from("export const u = 'x';\n")},
        ],
        {aliases: {'#utils': 'lib/utils.ts'}},
      )}</body></html>`,
    );
    expect(await codeOf(() => render('forged-hash.html', {cwd, reverse: true}))).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(fs.existsSync(path.join(cwd, 'forged-hash-restored'))).toBe(false);
    // A record entry that names no carried file counts for nothing.
    put(
      'alias-away/forged.html',
      `<!doctype html><html><body><p class="astryx-text">x</p>${sourceBlockOf(
        'page.tsx',
        [
          {path: 'page.tsx', bytes: Buffer.from("import {X} from '@/x';\nexport default function Page() { return <X />; }\nimport '@astryxdesign/core/astryx.css';\n")},
          {path: 'other.ts', bytes: Buffer.from('export const other = 1;\n')},
        ],
        {aliases: {'@/x': 'missing.ts'}},
      )}</body></html>`,
    );
    expect(await codeOf(() => render('forged.html', {cwd, reverse: true}))).toBe('ERR_RENDER_SOURCE_DAMAGED');
  }, 60_000);

  it('never writes through a symbolic link or over a protected file, even with --overwrite', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    const page = {path: 'page.tsx', bytes: Buffer.from("import './styles.css';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n")};
    const css = {path: 'styles.css', bytes: Buffer.from('.a{}\n')};
    put('prot/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, css])}</body>`);
    const cwd = path.join(dir, 'prot');
    // A symbolic link inside the folder, onto a file the refusal never named.
    put('prot/real.css', 'original\n');
    fs.mkdirSync(path.join(cwd, 'out'), {recursive: true});
    fs.symlinkSync(path.join(cwd, 'real.css'), path.join(cwd, 'out/styles.css'));
    expect(await codeOf(() => render('page.html', {cwd, reverse: true, out: 'out/page.tsx', overwrite: true}))).toBe(
      'ERR_PATH_TRAVERSAL',
    );
    expect(fs.readFileSync(path.join(cwd, 'real.css'), 'utf8')).toBe('original\n');
    // A generated file and an ignored file are never replaced.
    put('prot/alone.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [{path: 'page.tsx', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}])}</body>`);
    put('prot/gen/page.tsx', '// @generated\nexport default () => null;\nimport "@astryxdesign/core/astryx.css";\n');
    expect(await codeOf(() => render('alone.html', {cwd, reverse: true, out: 'gen/page.tsx', overwrite: true}))).toBe(
      'ERR_FILE_EXISTS',
    );
    expect(fs.readFileSync(path.join(cwd, 'gen/page.tsx'), 'utf8')).toContain('@generated');
    put('prot/.gitignore', 'ignored/\n');
    put('prot/ignored/page.tsx', 'mine\n');
    expect(await codeOf(() => render('alone.html', {cwd, reverse: true, out: 'ignored/page.tsx', overwrite: true}))).toBe(
      'ERR_FILE_EXISTS',
    );
    expect(fs.readFileSync(path.join(cwd, 'ignored/page.tsx'), 'utf8')).toBe('mine\n');
  });

  it('refuses a configuration file a received page imports from above it', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    for (const name of ['babel.config.json', 'jest.config.json', 'project.json']) {
      const page = {path: 'src/app/page.tsx', bytes: Buffer.from(`import c from '../../${name}';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n`)};
      put('cfg-above.html', `<body><p class="astryx-text">x</p>${sourceBlock('src/app/page.tsx', [page, {path: name, bytes: Buffer.from('{}')}])}</body>`);
      expect(await codeOf(() => render('cfg-above.html', {cwd: dir, reverse: true, out: 'cfg-above/src/app/page.tsx'}))).toBe(
        'ERR_RENDER_SOURCE_DAMAGED',
      );
      expect(fs.existsSync(path.join(dir, 'cfg-above', name))).toBe(false);
    }
  });

  it('restores a short alias import to the file it names', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('short-alias/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    const page = {path: 'page.tsx', bytes: Buffer.from("import {t} from '@/t';\nexport default () => t;\nimport '@astryxdesign/core/astryx.css';\n")};
    put('short-alias/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: 't.ts', bytes: Buffer.from("export const t = 'x';\n")}])}</body>`);
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'short-alias'), reverse: true, out: 'src/page.tsx'}));
    expect(back.data.files).toEqual(['src/page.tsx', 'src/t.ts']);
  });

  it('writes a page rebuilt from markup into a new folder by default', async () => {
    put('rebuilt-default/middleware.html', '<body><div class="astryx-stack"><p class="astryx-text">Hi</p></div></body>');
    const cwd = path.join(dir, 'rebuilt-default');
    const back = /** @type {any} */ (await render('middleware.html', {cwd, reverse: true}));
    expect(back.data.mode).toBe('rebuilt');
    expect(back.data.output).toBe('middleware-restored/page.tsx');
    expect(fs.existsSync(path.join(cwd, 'middleware.tsx'))).toBe(false);
  });

  it('inlines a stylesheet\'s own url()s from the stylesheet\'s folder', async () => {
    put('sheet-url/styles/bg.png', PNG);
    put('sheet-url/styles/page.css', '.hero { background: url("./bg.png"); }\n');
    put('sheet-url/page.tsx', "import './styles/page.css';\nexport default function Page() { return <div className=\"hero\">Hi</div>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('sheet-url/page.tsx', {cwd: dir}));
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
    expect(fs.readFileSync(path.join(dir, 'sheet-url/page.html'), 'utf8')).toContain('url("data:image/png;base64,');
  }, 60_000);

  it('carries images the page names by path, in markup and in a stylesheet, and gives them back', async () => {
    put('by-path/logo.png', PNG);
    put('by-path/styles/bg.png', PNG);
    put('by-path/styles/page.css', '.hero { background: url("./bg.png"); }\n');
    put('by-path/page.tsx', "import './styles/page.css';\nexport default function Page() { return <div className=\"hero\"><img src=\"./logo.png\" alt=\"\" /></div>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('by-path/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['page.tsx', 'styles/page.css', 'logo.png', 'styles/bg.png']));
    const back = /** @type {any} */ (await render('by-path/page.html', {cwd: dir, reverse: true, out: 'by-path-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    expect(back.data.files).toEqual(
      expect.arrayContaining(['by-path-back/page.tsx', 'by-path-back/logo.png', 'by-path-back/styles/bg.png']),
    );
    const again = /** @type {any} */ (await render('by-path-back/page.tsx', {cwd: dir}));
    expect(again.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
  }, 60_000);

  it('reads, counts and warns about only the font faces the page draws text with', async () => {
    const woff2 = (/** @type {string} */ tag) => Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(60, tag)]);
    put('font-cut/fonts/used-latin.woff2', woff2('a'));
    put('font-cut/fonts/used-greek.woff2', woff2('b'));
    put('font-cut/fonts/used-cyrillic.woff2', woff2('c'));
    put('font-cut/fonts/used-armenian.woff2', woff2('d'));
    put(
      'font-cut/fonts.css',
      [
        "@font-face { font-family: 'Used'; src: url(./fonts/used-latin.woff2) format('woff2'); unicode-range: U+0000-00FF; }",
        "@font-face { font-family: 'Used'; src: url(./fonts/used-greek.woff2) format('woff2'); unicode-range: U+0370-03FF; }",
        "@font-face { font-family: 'Used'; src: url(./fonts/used-cyrillic.woff2) format('woff2'); unicode-range: U+0400-045F; }",
        "@font-face { font-family: 'Used'; src: url(./fonts/used-armenian.woff2) format('woff2'); unicode-range: U+0530-058F; }",
        "@font-face { font-family: 'Never'; src: url(./fonts/gone.woff2) format('woff2'); }",
        "@font-face { font-family: 'Remote'; src: url(https://fonts.example.com/remote.woff2) format('woff2'); }",
        '.t { font-family: Used, sans-serif; }',
      ].join('\n'),
    );
    put(
      'font-cut/page.tsx',
      "import './fonts.css';\nimport {useState} from 'react';\nexport default function Page() {\n  const [later, setLater] = useState(false);\n  return <p className=\"t\" onClick={() => setLater(true)}>{later ? 'Привет' : 'Hello'}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const r = /** @type {any} */ (await render('font-cut/page.tsx', {cwd: dir}));
    const codes = r.data.warnings.map((/** @type {any} */ w) => w.code);
    expect(codes).not.toContain('missing-asset');
    expect(codes).not.toContain('remote-asset');
    // Latin draws the first paint and Cyrillic only after the click; React
    // DOM's own script holds Greek letters, so the Greek face stays too.
    expect(r.data.images).toBe(3);
    const html = fs.readFileSync(path.join(dir, 'font-cut/page.html'), 'utf8');
    expect(html.match(/@font-face/g)).toHaveLength(3);
    const back = /** @type {any} */ (await render('font-cut/page.html', {cwd: dir, reverse: true, out: 'font-cut-back/page.tsx'}));
    expect(back.data.files).toEqual(
      expect.arrayContaining([
        'font-cut-back/fonts.css',
        'font-cut-back/fonts/used-latin.woff2',
        'font-cut-back/fonts/used-greek.woff2',
        'font-cut-back/fonts/used-cyrillic.woff2',
      ]),
    );
  }, 60_000);

  it('reads a root-relative image from the public/ folder of a site that shares its project', async () => {
    put('shared-site/public/pics/shoe.png', PNG);
    put('shared-site/src/page.tsx', 'export default function Page() { return <img src="/pics/shoe.png" alt="Shoe" />; }\nimport "@astryxdesign/core/astryx.css";\n');
    const r = /** @type {any} */ (await render('shared-site/src/page.tsx', {cwd: dir}));
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
    expect(r.data.files).toEqual(['src/page.tsx', 'public/pics/shoe.png']);
    expect(fs.readFileSync(path.join(dir, 'shared-site/src/page.html'), 'utf8')).toMatch(/<img src="data:image\/png;base64,[^"]*" alt="Shoe"/);
  }, 60_000);

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'leaves out a named image it cannot read, and says so, instead of ending the render',
    async () => {
      put('locked-name/locked.png', PNG);
      put('locked-name/names.ts', "export const locked = './locked.png';\n");
      put('locked-name/page.tsx', "import {locked} from './names';\nexport default function Page() {\n  return <p>{locked.length}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
      fs.chmodSync(path.join(dir, 'locked-name/locked.png'), 0o000);
      try {
        const result = /** @type {any} */ (await render('locked-name/page.tsx', {cwd: dir}));
        expect(result.data.files).toEqual(['page.tsx', 'names.ts']);
        expect(result.data.warnings).toContainEqual({
          code: 'not-embedded',
          message: 'locked.png is named in names.ts but not carried in the file: it cannot be read (EACCES), so experimental import cannot give it back.',
        });
      } finally {
        fs.chmodSync(path.join(dir, 'locked-name/locked.png'), 0o644);
      }
    },
    60_000,
  );

  it('renders a page whose module names a path the system cannot look up', async () => {
    put('long-name/names.ts', `export const far = './${'a'.repeat(300)}.png';\n`);
    put('long-name/page.tsx', "import {far} from './names';\nexport default function Page() {\n  return <p>{far.length}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const result = /** @type {any} */ (await render('long-name/page.tsx', {cwd: dir}));
    expect(result.data.files).toEqual(['page.tsx', 'names.ts']);
  }, 60_000);

  it('leaves out a named image outside the folder that holds the carried files, so the layout stays', async () => {
    // A page under a tests/ folder: were the layout to move above it, its
    // module would land under tests/, which a render never carries.
    put('shared/far.png', PNG);
    put('up/tests/icons.ts', "export const icons = {far: '../../shared/far.png'};\n");
    put('up/tests/page.tsx', "import {icons} from './icons';\nexport default function Page() {\n  return <p>{Object.keys(icons).join(', ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const result = /** @type {any} */ (await render('up/tests/page.tsx', {cwd: dir}));
    expect(result.data.files).toEqual(['page.tsx', 'icons.ts']);
    const back = /** @type {any} */ (await render('up/tests/page.html', {cwd: dir, reverse: true, out: 'up-back/page.tsx'}));
    expect(back.data).toMatchObject({exact: true, files: ['up-back/page.tsx', 'up-back/icons.ts']});
  }, 60_000);

  it('leaves out a named image larger than a render carries, and says so', async () => {
    put('named-big/huge.png', Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]));
    put('named-big/icons.ts', "export const icons = {big: './huge.png'};\n");
    put('named-big/page.tsx', "import {icons} from './icons';\nexport default function Page() {\n  return <p>{Object.keys(icons).join(', ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const result = /** @type {any} */ (await render('named-big/page.tsx', {cwd: dir}));
    expect(result.data.files).not.toContain('huge.png');
    expect(result.data.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({code: 'not-embedded', message: expect.stringContaining('huge.png is named in icons.ts but not carried in the file: it is larger than 8 MB')}),
      ]),
    );
  }, 60_000);

  it('carries an image a module or a stylesheet names that the page did not show, and gives every file back', async () => {
    put('named/img/shown.png', PNG);
    put('named/img/other.png', PNG);
    put('named/img/unused-bg.png', PNG);
    put('named/icons.ts', "export const icons = {shown: './img/shown.png', other: './img/other.png'};\n");
    put('named/styles.css', '.used { color: red; }\n.unused { background: url("./img/unused-bg.png"); }\n');
    put('named/page.tsx', "import './styles.css';\nimport {icons} from './icons';\nexport default function Page() { return <img className=\"used\" src={icons.shown} alt=\"\" />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('named/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['img/shown.png', 'img/other.png', 'img/unused-bg.png']));
    const back = /** @type {any} */ (await render('named/page.html', {cwd: dir, reverse: true, out: 'named-back/page.tsx'}));
    expect(back.data).toMatchObject({exact: true});
    expect(back.data.missing).toBeUndefined();
    expect(fs.readFileSync(path.join(dir, 'named-back/img/other.png'))).toEqual(PNG);
  }, 60_000);

  it('gives back images named any way the render carried them', async () => {
    put('spell/logo.png', PNG);
    put('spell/images/bg.png', PNG);
    put('spell/pic.png', PNG);
    put('spell/tpl.png', PNG);
    put('spell/card.png', PNG);
    put('spell/styles.css', '.hero { background: url(images/bg.png); }\n');
    put('spell/data.json', '{"img": "pic.png"}\n');
    put('spell/components/Card.tsx', 'export function Card() { return <img src="card.png" alt="" />; }\n');
    put(
      'spell/page.tsx',
      [
        "import './styles.css';",
        "import data from './data.json';",
        "import {Card} from './components/Card';",
        "const name = 'tpl';",
        'export default function Page() {',
        '  return <div className="hero"><img src="logo.png" alt="" /><img src={data.img} alt="" /><img src={`./${name}.png`} alt="" /><Card /></div>;',
        '}',
        '', "import '@astryxdesign/core/astryx.css';",
      ].join('\n'),
    );
    const r = /** @type {any} */ (await render('spell/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['logo.png', 'images/bg.png', 'pic.png', 'tpl.png', 'card.png']));
    const back = /** @type {any} */ (await render('spell/page.html', {cwd: dir, reverse: true, out: 'spell-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    for (const f of ['logo.png', 'images/bg.png', 'pic.png', 'tpl.png', 'card.png']) {
      expect(fs.existsSync(path.join(dir, 'spell-back', f))).toBe(true);
    }
    const again = /** @type {any} */ (await render('spell-back/page.tsx', {cwd: dir}));
    expect(again.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
  }, 60_000);

  it('round-trips an image or font whose bytes and extension disagree', async () => {
    put('mismatch/photo.png', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]));
    put('mismatch/fonts/face.otf', Buffer.from([0, 1, 0, 0, 0, 10, 0, 128, 0, 3]));
    put('mismatch/styles.css', "@font-face { font-family: Face; src: url(fonts/face.otf); }\n.t { font-family: Face; }\n");
    put('mismatch/page.tsx', "import './styles.css';\nexport default function Page() { return <p className=\"t\"><img src=\"photo.png\" alt=\"\" />Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('mismatch/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['photo.png', 'fonts/face.otf']));
    const back = /** @type {any} */ (await render('mismatch/page.html', {cwd: dir, reverse: true, out: 'mismatch-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    expect(back.data.files).toEqual(expect.arrayContaining(['mismatch-back/photo.png', 'mismatch-back/fonts/face.otf']));
  }, 60_000);

  it('leaves out a path-named "image" whose bytes are not one, and says so', async () => {
    put('notimg/fake.png', 'console.log(1)\n');
    put('notimg/page.tsx', 'export default function Page() { return <img src="fake.png" alt="" />; }\nimport "@astryxdesign/core/astryx.css";\n');
    const r = /** @type {any} */ (await render('notimg/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(['page.tsx']);
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('not-embedded');
  }, 60_000);

  it('inlines style-attribute images in every url() form and keeps the element whole', async () => {
    put('styleattr/a.png', PNG);
    put('styleattr/b.png', PNG);
    put(
      'styleattr/page.tsx',
      [
        'export default function Page() {',
        '  return (',
        '    <div>',
        `      <div id="q" style={{backgroundImage: 'url("./a.png")'}}>Q</div>`,
        `      <div id="u" style={{backgroundImage: 'url(b.png)'}}>U</div>`,
        `      <div id="r" style={{backgroundImage: "url('https://example.com/x.png')"}}>R</div>`,
        '    </div>',
        '  );',
        '}',
        '', "import '@astryxdesign/core/astryx.css';",
      ].join('\n'),
    );
    const r = /** @type {any} */ (await render('styleattr/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'styleattr/page.html'), 'utf8');
    const {parseHtml} = await import('../../foundation/render/html-reader.mjs');
    /** @param {any} n @param {string} id @returns {any} */
    const byId = (n, id) => {
      if (n.attrs?.id === id) return n;
      for (const c of n.children ?? []) {
        const f = byId(c, id);
        if (f) return f;
      }
      return null;
    };
    const doc = parseHtml(html);
    expect(byId(doc, 'q').attrs.style).toContain('url("data:image/png;base64,');
    expect(byId(doc, 'u').attrs.style).toContain('url("data:image/png;base64,');
    expect(byId(doc, 'q').children[0].text).toBe('Q');
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('remote-asset');
    expect(r.data.files).toEqual(expect.arrayContaining(['a.png', 'b.png']));
    // The check names what the written file loads; it never stops the write.
    expect(r.data.checks.outside).toEqual(['https://example.com/x.png']);
    expect(r.data.checks.roundTrip).toEqual({exact: true, files: 3, differs: []});
    // The size parts add up to no more than the file.
    const {bytes, scriptBytes, cssBytes, markupBytes, sourceBytes} = r.data;
    expect(Math.min(scriptBytes, cssBytes, markupBytes, sourceBytes)).toBeGreaterThan(0);
    expect(scriptBytes + cssBytes + markupBytes + sourceBytes).toBeLessThanOrEqual(bytes);
    const cli = await runCli(['experimental', 'export', 'styleattr/page.tsx', '--out', 'styleattr/again.html'], {cwd: dir});
    expect(cli.status).toBe(0);
    expect(fs.existsSync(path.join(dir, 'styleattr/again.html'))).toBe(true);
    expect(cli.stdout).toMatch(/outside:\s+https:\/\/example\.com\/x\.png/);
    expect(cli.stdout).toContain('loads 1 reference from outside the file when it opens (outside, above), so it does not stand alone.');
    expect(cli.stdout).not.toContain('Share this one file');
    // A file beside the page the render leaves for the browser is from outside
    // the file too, not from the network; a reference that loads nothing is
    // not counted.
    put('relref/page.tsx', 'export default function Page() { return (<main><link rel="icon" href="./bg.png" /><iframe src="about:blank" title="x" /><h1>R</h1></main>); }\nimport "@astryxdesign/core/astryx.css";\n');
    const rel = await runCli(['experimental', 'export', 'relref/page.tsx'], {cwd: dir});
    expect(rel.status).toBe(0);
    expect(rel.stdout).toMatch(/^outside:\s+\.\/bg\.png$/m);
    expect(rel.stdout).toContain('loads 1 reference from outside the file when it opens (outside, above), so it does not stand alone.');
    expect(rel.stdout).not.toContain('about:blank');
  }, 60_000);

  it('warns that an SVG use of a file beside the page loads from outside the file, even when the source carries that file', async () => {
    put('beside/icons.svg', '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="check" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></symbol></svg>');
    put('beside/page.tsx', "import '@astryxdesign/core/astryx.css';\n" + 'export default function Page() { return <main><h1>Icons</h1><svg><use href="./icons.svg#check" /></svg></main>; }\n');
    const r = /** @type {any} */ (await render('beside/page.tsx', {cwd: dir}));
    expect(r.data.warnings.map((/** @type {any} */ w) => w.message)).toContain(
      'The page renders a <use> that loads ./icons.svg#check, which a sandboxed page cannot reach and which loads from outside the file; remove it from the page.',
    );
    expect(r.data.checks.outside).toEqual(['./icons.svg#check']);
  }, 60_000);

  it('notes the script on the bytes line only when the script is more than half the file', async () => {
    const NOTE = ' (most is the script: the page as a live app, with React and the packages it imports)';
    put('note/small.tsx', "import '@astryxdesign/core/astryx.css';\n" + 'export default function Page() { return <main><h1>Small</h1></main>; }\n');
    // An inlined image of about 2 MB makes the script less than half the file.
    put('note/big.png', Buffer.concat([PNG, Buffer.alloc(1_500_000, 7)]));
    put('note/big.tsx', "import '@astryxdesign/core/astryx.css';\n" + 'export default function Page() { return <main><h1>Big</h1><img src="./big.png" alt="" /></main>; }\n');
    for (const [page, noted] of /** @type {const} */ ([['note/small.tsx', true], ['note/big.tsx', false]])) {
      const cli = await runCli(['experimental', 'export', page], {cwd: dir});
      expect(cli.status, page).toBe(0);
      const line = cli.stdout.split('\n').find(l => l.startsWith('bytes:')) ?? '';
      expect(line.endsWith(NOTE), page).toBe(noted);
    }
  }, 120_000);

  it('carries a srcset of local images as data: URIs, and the file still stands alone', async () => {
    put('srcset/dot.png', PNG);
    put('srcset/dot2.png', PNG);
    put('srcset/page.tsx', 'export default function Page() { return (<main><h1>S</h1><img src="./dot.png" srcSet="./dot.png 1x, ./dot2.png 2x" alt="" /></main>); }\nimport "@astryxdesign/core/astryx.css";\n');
    const r = /** @type {any} */ (await render('srcset/page.tsx', {cwd: dir}));
    expect(fs.readFileSync(path.join(dir, 'srcset/page.html'), 'utf8')).toMatch(/srcset="data:image\/png;base64,[^"]+ 1x, data:image\/png;base64,[^"]+ 2x"/i);
    expect(r.data.checks.outside).toEqual([]);
  }, 60_000);

  it('names the element a style attribute sits on, caps the outside list in text, and prints an absolute output once', async () => {
    const imgs = Array.from({length: 12}, (_, i) => `<img src="https://img.example/${i}.png" alt="" />`).join('');
    put(
      'many/page.tsx',
      `export default function Page() { return (<main><div style={{backgroundImage: 'image-set("https://img.example/set.png" 1x)'}}>S</div>${imgs}</main>); }\nimport '@astryxdesign/core/astryx.css';\n`,
    );
    const r = /** @type {any} */ (await render('many/page.tsx', {cwd: dir}));
    expect(r.data.warnings.map((/** @type {any} */ w) => w.message)).toContain(
      'The page renders a <div> that loads https://img.example/set.png, which a sandboxed page cannot reach and which loads from outside the file; remove it from the page.',
    );
    expect(r.data.checks.outside).toHaveLength(13);
    // An --out outside the current folder is shown as its absolute path, once.
    const abs = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-abs-')), 'abs.html');
    const cli = await runCli(['experimental', 'export', 'many/page.tsx', '--out', abs], {cwd: dir});
    expect(cli.status).toBe(0);
    expect(cli.stdout).toMatch(/^outside:\s+.+, \.\.\. and 3 more( in \S+)?$/m);
    const line = cli.stdout.split('\n').find(l => l.startsWith(`${abs} (`));
    expect(line).toBeDefined();
    expect(line?.split(abs).length).toBe(2);
  }, 60_000);

  it('carries a stylesheet pulled in by @import and gives it back, and says when one is missing', async () => {
    put('imp/styles/main.css', "@import './parts/base.css';\n@import url('https://example.com/f.css');\n.m { color: red; }\n");
    put('imp/styles/parts/base.css', '.b { color: blue; background: url(./dot.png); }\n');
    put('imp/styles/parts/dot.png', PNG);
    put('imp/page.tsx', "import './styles/main.css';\nexport default function Page() { return <p className=\"m b\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('imp/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['styles/main.css', 'styles/parts/base.css', 'styles/parts/dot.png']));
    const html = fs.readFileSync(path.join(dir, 'imp/page.html'), 'utf8');
    expect(html).toContain('color: blue');
    expect(html).not.toContain('@import');
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('remote-asset');
    const back = /** @type {any} */ (await render('imp/page.html', {cwd: dir, reverse: true, out: 'imp-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    expect(back.data.files).toEqual(expect.arrayContaining(['imp-back/styles/parts/base.css']));
    // A file whose @import target it does not carry says so.
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('imp-missing.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [{path: 'page.tsx', bytes: Buffer.from("import './a.css';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n")}, {path: 'a.css', bytes: Buffer.from("@import './gone.css';\n")}])}</body>`);
    const partial = /** @type {any} */ (await render('imp-missing.html', {cwd: dir, reverse: true, out: 'imp-missing/page.tsx'}));
    expect(partial.data.exact).toBe(false);
    expect(partial.data.missing).toEqual(['gone.css']);
  }, 60_000);

  it('handles every kind of stylesheet import', async () => {
    // A font stylesheet that imports a remote one.
    put('kinds/fonts.css', "@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&display=swap');\n");
    put('kinds/legacy.css', '.legacy-btn { padding: 3px; }\n');
    put('kinds/main.css', "@import './fonts.css';\n@import './legacy.css' layer(reset);\n@import './print.css' print;\n@import '@astryxdesign/core/astryx.css';\n.k { color: red; }\n");
    put('kinds/print.css', '.p { color: black; }\n');
    put('kinds/page.tsx', "import './main.css';\nexport default function Page() { return <p className=\"k legacy-btn p\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('kinds/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'kinds/page.html'), 'utf8');
    expect(html).toMatch(/@layer reset\s*\{[^}]*\.legacy-btn/);
    expect(html).toMatch(/@media print\s*\{[^}]*\.p/);
    expect(html).not.toContain('@import');
    const codes = r.data.warnings.map((/** @type {any} */ w) => w.code);
    expect(codes).toContain('remote-asset');
    expect(r.data.warnings.some((/** @type {any} */ w) => w.message.includes('astryx.css'))).toBe(false);
    expect(r.data.files).not.toContain(expect.stringContaining('node_modules'));
    // The package import is neither carried nor missing when given back.
    const back = /** @type {any} */ (await render('kinds/page.html', {cwd: dir, reverse: true, out: 'kinds-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    // Sass is named, CSS Modules refused with a clear message.
    put('kinds/sass.tsx', "import './x.scss';\nexport default function Page() { return <p>Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const sass = /** @type {any} */ (await render('kinds/sass.tsx', {cwd: dir}));
    expect(sass.data.warnings.some((/** @type {any} */ w) => w.message.includes('x.scss'))).toBe(true);
    put('kinds/x.module.css', '.a { color: red; }\n');
    put('kinds/mod.tsx', "import styles from './x.module.css';\nexport default function Page() { return <p className={styles.a}>Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any} */
    let error;
    try {
      await render('kinds/mod.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_FAILED');
    expect(error.message).toContain('CSS Modules');
  }, 90_000);

  it('refuses any stylesheet imported as a value, inlines Core once, ignores commented imports, and names a broken stylesheet', async () => {
    put('more/x.module.scss', '.a { color: red; }\n');
    put('more/scssmod.tsx', "import styles from './x.module.scss';\nexport default function Page() { return <p className={styles.a}>Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any} */
    let error;
    try {
      await render('more/scssmod.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_FAILED');
    expect(error.message).toContain('x.module.scss');
    // A globals.css that imports Core: Core's rules once, listed once.
    put('more/plain.tsx', "export default function Page() { return <p className=\"astryx-text\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    put('more/globals.css', "@import '@astryxdesign/core/astryx.css';\n");
    put('more/withcore.tsx', "import './globals.css';\nexport default function Page() { return <p className=\"astryx-text\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const plain = /** @type {any} */ (await render('more/plain.tsx', {cwd: dir}));
    const withCore = /** @type {any} */ (await render('more/withcore.tsx', {cwd: dir}));
    // Within a few bytes (the emptied import line), not a second copy of Core.
    expect(Math.abs(withCore.data.cssBytes - plain.data.cssBytes)).toBeLessThan(16);
    expect(withCore.data.stylesheets.filter((/** @type {string} */ x) => x.endsWith('astryx.css'))).toHaveLength(1);
    // A commented-out import does not make a full restore partial.
    put('more/commented.css', "/* @import './gone.css'; */\n.c { color: red; }\n");
    put('more/commented.tsx', "import './commented.css';\nexport default function Page() { return <p className=\"c\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('more/commented.tsx', {cwd: dir});
    const back = /** @type {any} */ (await render('more/commented.html', {cwd: dir, reverse: true, out: 'more-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    // A stylesheet that is not CSS: a documented code, naming the file.
    put('more/broken.css', '.b { color: red;\n');
    put('more/broken.tsx', "import './broken.css';\nexport default function Page() { return <p className=\"b\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any} */
    let broken;
    try {
      await render('more/broken.tsx', {cwd: dir});
    } catch (e) {
      broken = e;
    }
    expect(broken?.code).toBe('ERR_RENDER_COMPILE');
    expect(broken.message).toContain('broken.css');
  }, 90_000);

  it('resolves aliased stylesheets and images, inlines a shared sheet once in first-import order, and names a broken @import', async () => {
    put('al/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('al/package.json', '{"name":"al","private":true}');
    put('al/src/styles/site.css', '.site { color: red; }\n');
    put('al/src/assets/logo.png', PNG);
    put('al/src/page.tsx', "import '@/styles/site.css';\nimport logo from '@/assets/logo.png';\nexport default function Page() { return <p className=\"site\"><img src={logo} alt=\"\" />Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('al/src/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'al/src/page.html'), 'utf8');
    expect(html).toContain('color: red');
    expect(html).toContain('data:image/png;base64,');
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
    // One sheet shared by two modules, a third sheet between them.
    put('order/shared.css', '.o { color: red; }\n');
    put('order/middle.css', '.o { color: blue; }\n');
    put('order/A.tsx', "import './shared.css';\nexport const A = () => null;\n");
    put('order/B.tsx', "import './middle.css';\nimport './shared.css';\nexport const B = () => null;\n");
    put('order/page.tsx', "import {A} from './A';\nimport {B} from './B';\nexport default function Page() { return <p className=\"o\"><A /><B />Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('order/page.tsx', {cwd: dir});
    const orderHtml = fs.readFileSync(path.join(dir, 'order/page.html'), 'utf8');
    expect(orderHtml.match(/color: red/g)).toHaveLength(1);
    expect(orderHtml.indexOf('color: red')).toBeLessThan(orderHtml.indexOf('color: blue'));
    // A broken @import target: the same documented code, naming both files.
    put('bad-imp/inner.css', '.x { color: red;\n');
    put('bad-imp/outer.css', "@import './inner.css';\n.y { color: blue; }\n");
    put('bad-imp/page.tsx', "import './outer.css';\nexport default function Page() { return <p className=\"x y\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any} */
    let error;
    try {
      await render('bad-imp/page.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_COMPILE');
    expect(error.message).toContain('inner.css');
    expect(error.message).toContain('outer.css');
    // A stylesheet import naming a missing file, directly or through an alias.
    for (const spec of ['./gone.css', '@/styles/gone.css']) {
      put('al/src/missing.tsx', `import '${spec}';\nexport default function Page() { return <p>Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n`);
      /** @type {any} */
      let missing;
      try {
        await render('al/src/missing.tsx', {cwd: dir});
      } catch (e) {
        missing = e;
      }
      expect(missing?.code).toBe('ERR_FILE_NOT_FOUND');
      expect(missing.message).toContain('gone.css');
    }
  }, 90_000);

  it('resolves tsconfig paths by TypeScript rules: exact keys, a star anywhere, targets in order', async () => {
    put(
      'tsp/tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@lib': ['./libsrc/index.ts'],
            '@lib/*': ['./libsrc/*'],
            '~*': ['./missing/*', './other/*'],
            'theme-*-x': ['./themes/*.ts'],
          },
        },
      }),
    );
    put('tsp/package.json', '{"name":"tsp","private":true}');
    put('tsp/libsrc/index.ts', "export const Lib = 'lib-index';\n");
    put('tsp/libsrc/button.tsx', "export const Button = () => <b>lib-button</b>;\n");
    put('tsp/other/util.ts', "export const util = 'second-target';\n");
    put('tsp/themes/blue.ts', "export const theme = 'mid-star';\n");
    put(
      'tsp/page.tsx',
      [
        "import {Lib} from '@lib';",
        "import {Button} from '@lib/button';",
        "import {util} from '~util';",
        "import {theme} from 'theme-blue-x';",
        'export default function Page() { return <p>{Lib} {util} {theme} <Button /></p>; }',
        '', "import '@astryxdesign/core/astryx.css';",
      ].join('\n'),
    );
    await render('tsp/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'tsp/page.html'), 'utf8');
    for (const text of ['lib-index', 'lib-button', 'second-target', 'mid-star']) expect(html).toContain(text);
  }, 60_000);

  it('loads a JSON file through any key shape, from the first target that has it, and gives it back', async () => {
    put('jsonp/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'~*': ['./lib/data/*'], 'cfg-*': ['./lib/missing/*', './lib/more/*']}}}));
    put('jsonp/package.json', '{"name":"jsonp","private":true}');
    put('jsonp/lib/data/cfg.json', '{"label":"first-target-json"}\n');
    put('jsonp/lib/more/extra.json', '{"label":"later-target-json"}\n');
    put(
      'jsonp/page.tsx',
      "import cfg from '~cfg.json';\nimport extra from 'cfg-extra.json';\nexport default function Page() { return <p>{cfg.label} {extra.label}</p>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const r = /** @type {any} */ (await render('jsonp/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['page.tsx', 'lib/data/cfg.json', 'lib/more/extra.json']));
    const html = fs.readFileSync(path.join(dir, 'jsonp/page.html'), 'utf8');
    expect(html).toContain('first-target-json');
    expect(html).toContain('later-target-json');
    // Back into a project with the same paths: each file goes where its alias points.
    fs.mkdirSync(path.join(dir, 'jsonp-to'), {recursive: true});
    put('jsonp-to/tsconfig.json', fs.readFileSync(path.join(dir, 'jsonp/tsconfig.json'), 'utf8'));
    put('jsonp-to/package.json', '{"name":"jsonp-to","private":true}');
    fs.copyFileSync(path.join(dir, 'jsonp/page.html'), path.join(dir, 'jsonp-to/page.html'));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'jsonp-to'), reverse: true, out: 'lib/app/page.tsx'}));
    // The file sent from the later target goes back under that target.
    expect(back.data.files).toEqual(expect.arrayContaining(['lib/data/cfg.json', 'lib/more/extra.json']));
  }, 60_000);

  it.each([
    ['folder names that end alike', ['./lib/app/*', './lib/webapp/*'], 'lib/webapp/Top.tsx', 'lib/webapp/Top.tsx'],
    ['targets that share their last folder', ['./lib/ui/src/*', './lib/icons/src/*'], 'lib/icons/src/Top.tsx', 'lib/icons/src/Top.tsx'],
    // Every embedded path is relative to the folder that holds them all, so
    // a page inside the later target names no target folder: the first wins.
    ['a page inside the later target', ['./lib/missing/*', './lib/src/*'], 'lib/src/Top.tsx', 'lib/missing/Top.tsx', 'lib/src/pages/page.tsx'],
  ])('gives back an aliased module by whole folder names: %s', async (name, targets, sentFrom, comesBack, pageAt = 'page.tsx') => {
    const base = `segments-${String(name).replace(/\W+/g, '-')}`;
    const paths = {compilerOptions: {baseUrl: '.', paths: {'@/*': targets}}};
    put(`${base}/tsconfig.json`, JSON.stringify(paths));
    put(`${base}/package.json`, '{"name":"segments","private":true}');
    put(`${base}/${sentFrom}`, "export const Top = () => <i>segment-top</i>;\n");
    put(`${base}/${pageAt}`, "import {Top} from '@/Top';\nexport default function Page() { return <p><Top /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render(`${base}/${pageAt}`, {cwd: dir});
    const html = `${base}/${pageAt.replace(/\.tsx$/, '.html')}`;
    fs.mkdirSync(path.join(dir, `${base}-to`), {recursive: true});
    put(`${base}-to/tsconfig.json`, JSON.stringify(paths));
    put(`${base}-to/package.json`, '{"name":"segments-to","private":true}');
    fs.copyFileSync(path.join(dir, html), path.join(dir, `${base}-to/page.html`));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, `${base}-to`), reverse: true, out: 'lib/zz/page.tsx'}));
    expect(back.data.files).toContain(comesBack);
  }, 60_000);

  it('gives back a folder an exact key names under the target it was sent from', async () => {
    const paths = {compilerOptions: {baseUrl: '.', paths: {'@cfg': ['./lib/a/settings', './lib/b/settings']}}};
    put('exactdir/tsconfig.json', JSON.stringify(paths));
    put('exactdir/package.json', '{"name":"exactdir","private":true}');
    put('exactdir/lib/b/settings/index.ts', "export const setting = 'from-b';\n");
    put('exactdir/page.tsx', "import {setting} from '@cfg';\nexport default function Page() { return <p>{setting}</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('exactdir/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'exactdir/page.html'), 'utf8')).toContain('from-b');
    fs.mkdirSync(path.join(dir, 'exactdir-to'), {recursive: true});
    put('exactdir-to/tsconfig.json', JSON.stringify(paths));
    put('exactdir-to/package.json', '{"name":"exactdir-to","private":true}');
    fs.copyFileSync(path.join(dir, 'exactdir/page.html'), path.join(dir, 'exactdir-to/page.html'));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'exactdir-to'), reverse: true, out: 'lib/zz/page.tsx'}));
    expect(back.data.files).toContain('lib/b/settings/index.ts');
    expect(back.data.files).not.toContain('lib/a/settings/index.ts');
  }, 60_000);

  it('resolves path aliases in modules outside the project folder, through every key and target', async () => {
    put(
      'sib/app/tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@scope/ui': ['../ui/src/index.tsx'],
            '@scope/tokens': ['../tokens/src/index.ts'],
            '@lib/*': ['../missing/*', '../lib/*'],
          },
        },
      }),
    );
    put('sib/app/package.json', '{"name":"sib-app","private":true}');
    put('sib/tokens/src/index.ts', "export const accent = 'token-accent';\n");
    put('sib/lib/util.ts', "export const util = 'later-target-util';\n");
    put(
      'sib/ui/src/index.tsx',
      "import {accent} from '@scope/tokens';\nimport {util} from '@lib/util';\nexport const Badge = () => <b>{accent} {util}</b>;\n",
    );
    put('sib/app/page.tsx', "import {Badge} from '@scope/ui';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('sib/app/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'sib/app/page.html'), 'utf8');
    expect(html).toContain('token-accent');
    expect(html).toContain('later-target-util');
  }, 60_000);

  it('gives the page and a sibling package one copy of a package the aliases place, even when a built copy is linked', async () => {
    const paths = {compilerOptions: {baseUrl: '.', paths: {'@scope/ui': ['../ui/src/index.tsx'], '@scope/tokens': ['../tokens/src/index.ts']}}};
    put('mono/app/tsconfig.json', JSON.stringify(paths));
    put('mono/app/package.json', '{"name":"mono-app","private":true}');
    put('mono/tokens/package.json', '{"name":"@scope/tokens","main":"dist/index.js"}');
    put('mono/tokens/src/index.ts', "import {createContext} from 'react';\nexport const Theme = createContext('default-theme');\n");
    put('mono/tokens/dist/index.js', "const {createContext} = require('react');\nexports.Theme = createContext('built-copy');\n");
    // The built package, linked into the sibling's node_modules as a workspace would.
    fs.mkdirSync(path.join(dir, 'mono/ui/node_modules/@scope'), {recursive: true});
    fs.symlinkSync(path.join(dir, 'mono/tokens'), path.join(dir, 'mono/ui/node_modules/@scope/tokens'), 'dir');
    put('mono/ui/src/index.tsx', "import {useContext} from 'react';\nimport {Theme} from '@scope/tokens';\nexport const Badge = () => <b>{useContext(Theme)}</b>;\n");
    put(
      'mono/app/page.tsx',
      "import {Theme} from '@scope/tokens';\nimport {Badge} from '@scope/ui';\nexport default function Page() { return <Theme.Provider value=\"page-theme\"><Badge /></Theme.Provider>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    await render('mono/app/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'mono/app/page.html'), 'utf8');
    expect(html).toContain('page-theme');
  }, 60_000);

  it('places an aliased subpath that a linked package does not export', async () => {
    put('expo/app/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@scope/ui': ['../ui/src/index.tsx'], '@scope/tokens/*': ['../tokens/src/*']}}}));
    put('expo/app/package.json', '{"name":"expo-app","private":true}');
    put('expo/tokens/package.json', '{"name":"@scope/tokens","exports":{".":"./dist/index.js"}}');
    put('expo/tokens/dist/index.js', "exports.red = 'built-red';\n");
    put('expo/tokens/src/colors.ts', "export const red = 'source-red';\n");
    fs.mkdirSync(path.join(dir, 'expo/ui/node_modules/@scope'), {recursive: true});
    fs.symlinkSync(path.join(dir, 'expo/tokens'), path.join(dir, 'expo/ui/node_modules/@scope/tokens'), 'dir');
    put('expo/ui/src/index.tsx', "import {red} from '@scope/tokens/colors';\nexport const Swatch = () => <i>{red}</i>;\n");
    put('expo/app/page.tsx', "import {Swatch} from '@scope/ui';\nexport default function Page() { return <p><Swatch /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('expo/app/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'expo/app/page.html'), 'utf8')).toContain('source-red');
  }, 60_000);

  it('compiles a sibling module with the TypeScript it can hold: type assertions and decorators', async () => {
    put('tsx-sib/app/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', experimentalDecorators: true, paths: {'@scope/store': ['../store/src/index.ts']}}}));
    put('tsx-sib/app/package.json', '{"name":"tsx-sib-app","private":true}');
    put(
      'tsx-sib/store/src/index.ts',
      "const raw: unknown = 'asserted-label';\nexport const label = <string>raw;\nfunction tag(target: any) { target.tagged = 'decorated-store'; }\n@tag\nexport class Store { static tagged: string; }\n",
    );
    put('tsx-sib/store/src/other.ts', "const raw: unknown = 'relative-label';\nexport const other = <string>raw;\n");
    put(
      'tsx-sib/app/page.tsx',
      "import {label, Store} from '@scope/store';\nimport {other} from '../store/src/other';\nexport default function Page() { return <p>{label} {(Store as any).tagged} {other}</p>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    await render('tsx-sib/app/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'tsx-sib/app/page.html'), 'utf8');
    expect(html).toContain('asserted-label');
    expect(html).toContain('decorated-store');
    expect(html).toContain('relative-label');
  }, 60_000);

  it('loads an installed package a prefix key names when the key places no file', async () => {
    put('pkgpre/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@scope/*': ['./src/*']}}}));
    put('pkgpre/package.json', '{"name":"pkgpre","private":true}');
    put('pkgpre/node_modules/@scope/realpkg/package.json', '{"name":"@scope/realpkg","main":"index.js"}');
    put('pkgpre/node_modules/@scope/realpkg/index.js', "exports.real = 'installed-package';\n");
    put('pkgpre/src/local.ts', "export {real} from '@scope/realpkg';\n");
    put('pkgpre/page.tsx', "import {real} from '@scope/realpkg';\nimport {real as again} from './src/local';\nexport default function Page() { return <p>{real} {again}</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('pkgpre/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'pkgpre/page.html'), 'utf8')).toContain('installed-package installed-package');
  }, 60_000);

  it('gives back a nested aliased module under the target it was sent from', async () => {
    const paths = {compilerOptions: {baseUrl: '.', paths: {'@/*': ['./lib/missing/*', './lib/src/*']}}};
    put('nested/tsconfig.json', JSON.stringify(paths));
    put('nested/package.json', '{"name":"nested","private":true}');
    put('nested/lib/src/c/Header.tsx', "export const Header = () => <b>nested-header</b>;\n");
    put('nested/lib/src/Top.tsx', "export const Top = () => <i>top-level</i>;\n");
    put('nested/page.tsx', "import {Header} from '@/c/Header';\nimport {Top} from '@/Top';\nexport default function Page() { return <p><Header /><Top /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('nested/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'nested/page.html'), 'utf8')).toContain('nested-header');
    fs.mkdirSync(path.join(dir, 'nested-to'), {recursive: true});
    put('nested-to/tsconfig.json', JSON.stringify(paths));
    put('nested-to/package.json', '{"name":"nested-to","private":true}');
    fs.copyFileSync(path.join(dir, 'nested/page.html'), path.join(dir, 'nested-to/page.html'));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'nested-to'), reverse: true, out: 'lib/app/page.tsx'}));
    expect(back.data.files).toEqual(expect.arrayContaining(['lib/src/c/Header.tsx', 'lib/src/Top.tsx']));
    expect(back.data.files).not.toEqual(expect.arrayContaining(['lib/missing/c/Header.tsx']));
  }, 60_000);

  it('names a package a catch-all key cannot place as not installed, and renders a page whose package stylesheet is missing with a warning', async () => {
    put('catchall2/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'*': ['./types/*']}}}));
    put('catchall2/package.json', '{"name":"catchall2","private":true}');
    put('catchall2/dep.tsx', "import x from 'not-a-real-package-xyz';\nexport default () => <p>{String(x)}</p>;\nimport '@astryxdesign/core/astryx.css';\n");
    expect(await codeOf(() => render('catchall2/dep.tsx', {cwd: dir}))).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    put('catchall2/sheet.tsx', "import 'not-a-real-package-xyz/style.css';\nexport default () => <p>styled</p>;\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('catchall2/sheet.tsx', {cwd: dir}));
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('missing-asset');
  }, 60_000);

  it('leaves relative and package imports alone under a catch-all paths key', async () => {
    put('catchall/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'*': ['./types/*']}}}));
    put('catchall/package.json', '{"name":"catchall","private":true}');
    // A decoy at baseUrl that `./Header` must not load.
    put('catchall/Header.tsx', "export const Header = () => <b>decoy</b>;\n");
    put('catchall/src/Header.tsx', "export const Header = () => <b>local-header</b>;\n");
    put('catchall/src/styles.css', '.c { color: red; }\n');
    put('catchall/src/logo.png', PNG);
    put(
      'catchall/src/page.tsx',
      [
        "import './styles.css';",
        "import '@astryxdesign/core/astryx.css';",
        "import logo from './logo.png';",
        "import {Header} from './Header';",
        'export default function Page() { return <p className="c"><img src={logo} alt="" /><Header /></p>; }',
        '',
      ].join('\n'),
    );
    const r = /** @type {any} */ (await render('catchall/src/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'catchall/src/page.html'), 'utf8');
    expect(html).toContain('local-header');
    expect(html).not.toContain('decoy');
    expect(html).toContain('color: red');
    expect(html).toContain('data:image/png;base64,');
    expect(r.data.stylesheets).toEqual(expect.arrayContaining(['@astryxdesign/core/astryx.css']));
  }, 60_000);

  it('gives back a file reached through a target with text before its star', async () => {
    put('starseg/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@icon/*': ['./icons/icon-*']}}}));
    put('starseg/package.json', '{"name":"starseg","private":true}');
    put('starseg/icons/icon-home.tsx', "export const Home = () => <i>home-icon</i>;\n");
    put('starseg/page.tsx', "import {Home} from '@icon/home';\nexport default function Page() { return <p><Home /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('starseg/page.tsx', {cwd: dir});
    fs.mkdirSync(path.join(dir, 'starseg-to'), {recursive: true});
    put('starseg-to/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@icon/*': ['./icons/icon-*']}}}));
    put('starseg-to/package.json', '{"name":"starseg-to","private":true}');
    fs.copyFileSync(path.join(dir, 'starseg/page.html'), path.join(dir, 'starseg-to/page.html'));
    const cwd = path.join(dir, 'starseg-to');
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true, out: 'icons/app/page.tsx'}));
    expect(back.data.files).toEqual(expect.arrayContaining(['icons/icon-home.tsx']));
  }, 60_000);

  it('refuses a rendered file whose source block was stripped, in its own words', async () => {
    put('stripped-own.html', '<!doctype html><html><head><meta name="generator" content="Astryx 0.7.5"></head><body><p>Hello</p></body></html>');
    /** @type {any} */
    let error;
    try {
      await render('stripped-own.html', {cwd: dir, reverse: true});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(error.message).toContain('rendered by Astryx');
    expect(error.message).not.toContain('not an Astryx page');
  });

  it('refuses a carried "image" whose bytes are not one', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('fake-img.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [{path: 'page.tsx', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}, {path: 'hook.png', bytes: Buffer.from('process.exit(1)\n')}])}</body>`);
    expect(await codeOf(() => render('fake-img.html', {cwd: dir, reverse: true, out: 'fake-img/page.tsx'}))).toBe(
      'ERR_RENDER_SOURCE_DAMAGED',
    );
  });

  it('rebuilds a quoted attribute as JSX that compiles', async () => {
    put(
      'quoted.html',
      '<body><div class="astryx-stack"><img src="data:image/png;base64,iVBORw0KGgo=" alt="say &quot;hi&quot; {now}"><a class="astryx-link" href="/x?a=&quot;b&quot;">Go</a></div></body>',
    );
    const back = /** @type {any} */ (await render('quoted.html', {cwd: dir, reverse: true, out: 'quoted/page.tsx'}));
    expect(back.data.mode).toBe('rebuilt');
    const source = fs.readFileSync(path.join(dir, 'quoted/page.tsx'), 'utf8');
    expect(source).toContain('alt={"say \\"hi\\" {now}"}');
    const again = /** @type {any} */ (await render('quoted/page.tsx', {cwd: dir}));
    expect(again.type).toBe('render.page');
  }, 60_000);

  it('never adds a file outside the page\'s own folder beside existing project files', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('plant/app/keep.txt', 'existing\n');
    for (const [spec, name] of [
      ['../../nodemon.json', 'nodemon.json'],
      ['../../jsr.json', 'jsr.json'],
      ['../../instrumentation', 'instrumentation.ts'],
      ['../middleware', 'src/middleware.ts'],
    ]) {
      const page = {path: 'src/app/page.tsx', bytes: Buffer.from(`import x from '${spec}';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n`)};
      put('plant/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('src/app/page.tsx', [page, {path: name, bytes: Buffer.from('{}')}])}</body>`);
      expect(
        await codeOf(() => render('page.html', {cwd: path.join(dir, 'plant'), reverse: true, out: 'app/page.tsx', overwrite: true})),
      ).toMatch(/ERR_PATH_TRAVERSAL|ERR_RENDER_SOURCE_DAMAGED/);
      expect(fs.existsSync(path.join(dir, 'plant', path.basename(name)))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'plant/app/page.tsx'))).toBe(false);
    }
  });

  it('writes all or nothing: a failure part-way leaves nothing behind', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    // The second file's name is longer than a file system allows, so its
    // write fails after the page's has been staged.
    const long = 'C'.repeat(300);
    const page = {path: 'app/page.tsx', bytes: Buffer.from(`import {C} from './components/${long}';\nexport default () => <C />;\nimport '@astryxdesign/core/astryx.css';\n`)};
    const comp = {path: `app/components/${long}.tsx`, bytes: Buffer.from('export const C = () => null;\n')};
    put('atomic/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('app/page.tsx', [page, comp])}</body>`);
    expect(await codeOf(() => render('page.html', {cwd: path.join(dir, 'atomic'), reverse: true, out: 'out/page.tsx'}))).toBe(
      'ERR_WRITE_FAILED',
    );
    expect(fs.readdirSync(path.join(dir, 'atomic'))).toEqual(['page.html']);
  });



  it('restores an exact alias import to the file it names', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('exact-alias/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@theme": ["./src/theme.ts"]}}}\n');
    const page = {path: 'page.tsx', bytes: Buffer.from("import {t} from '@theme';\nexport default () => t;\nimport '@astryxdesign/core/astryx.css';\n")};
    put('exact-alias/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: 'theme.ts', bytes: Buffer.from("export const t = 'x';\n")}])}</body>`);
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'exact-alias'), reverse: true, out: 'src/page.tsx'}));
    expect(back.data.files).toEqual(['src/page.tsx', 'src/theme.ts']);
  });

  it('keeps every neighbour inside the one folder the restore creates', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('depth/app/layout.tsx', 'existing\n');
    const page = {path: 'restored/report.tsx', bytes: Buffer.from("import r from '../app/report-export/route';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n")};
    put('depth/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('restored/report.tsx', [page, {path: 'app/report-export/route.ts', bytes: Buffer.from('export {};\n')}])}</body>`);
    /** @type {any} */
    let refused;
    try {
      await render('page.html', {cwd: path.join(dir, 'depth'), reverse: true, out: 'restored/report.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(fs.existsSync(path.join(dir, 'depth/app/report-export'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'depth/restored'))).toBe(false);
    // The suggested folder works.
    const suggestion = refused.suggestions[0].name.replace('--out ', '');
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'depth'), reverse: true, out: suggestion}));
    expect(back.data.mode).toBe('embedded');
  });

  it('refuses test, spec and story files a received page imports', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    for (const name of [
      'report.test.ts',
      'report.spec.tsx',
      'Report.stories.tsx',
      '__tests__/r.ts',
      'report-test.mjs',
      'report_test.mjs',
      'test-report.mjs',
      'test.mjs',
      'test/helper.mjs',
      'test-report.ts',
      'report_test.mts',
      'test.cts',
      'test/helper.ts',
      'spec.ts',
      'test.tsx',
      'report.benchmark.ts',
      'report_test.tsx',
      'tests/helper.js',
      'spectest.js',
      'testtest.ts',
    ]) {
      const page = {path: 'page.tsx', bytes: Buffer.from(`import './${name.replace(/\.(tsx?|[mc]?[jt]s)$/, '')}';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n`)};
      put('tests-in.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: name, bytes: Buffer.from('export {};\n')}])}</body>`);
      expect(await codeOf(() => render('tests-in.html', {cwd: dir, reverse: true, out: 'tests-in/page.tsx'}))).toBe(
        'ERR_RENDER_SOURCE_DAMAGED',
      );
    }
  });

  it('never names the page as a file a test runner picks up', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('runner/report.test.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.mjs', [{path: 'page.mjs', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}])}</body>`);
    const cwd = path.join(dir, 'runner');
    // The page's name never comes from the received file's name.
    const back = /** @type {any} */ (await render('report.test.html', {cwd, reverse: true}));
    expect(back.data.output).toBe('report.test-restored/page.mjs');
    expect(await codeOf(() => render('report.test.html', {cwd, reverse: true, out: 'test/page.mjs'}))).toBe('ERR_INVALID_ARGUMENT');
    expect(await codeOf(() => render('report.test.html', {cwd, reverse: true, out: 'page.cy.mjs'}))).toBe('ERR_INVALID_ARGUMENT');
    put('runner/spec.html', `<body><p class="astryx-text">x</p>${sourceBlock('report.cy.ts', [{path: 'report.cy.ts', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}])}</body>`);
    expect(await codeOf(() => render('spec.html', {cwd, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    // Ordinary names that only contain such words still come back.
    put('runner/results.html', `<body><p class="astryx-text">x</p>${sourceBlock('stories/test-results.tsx', [{path: 'stories/test-results.tsx', bytes: Buffer.from("import d from '../mock-data';\nexport default () => d;\nimport '@astryxdesign/core/astryx.css';\n")}, {path: 'mock-data.ts', bytes: Buffer.from('export default 1;\n')}])}</body>`);
    // Where a file lands counts, not only its name in the file.
    expect(await codeOf(() => render('results.html', {cwd, reverse: true, out: 'tests/stories/test-results.tsx'}))).toMatch(
      /ERR_INVALID_ARGUMENT|ERR_RENDER_SOURCE_DAMAGED/,
    );
    expect(fs.existsSync(path.join(cwd, 'tests'))).toBe(false);
    const ok = /** @type {any} */ (await render('results.html', {cwd, reverse: true}));
    expect(ok.data.files).toEqual(['results-restored/stories/test-results.tsx', 'results-restored/mock-data.ts']);
  });


  it('judges where a file lands from the project root, not the current folder', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('rooted-runner/package.json', '{"name":"rr","private":true}');
    put('rooted-runner/test/fixtures/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.mjs', [{path: 'page.mjs', bytes: Buffer.from("import './helper.mjs';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n")}, {path: 'helper.mjs', bytes: Buffer.from('export {};\n')}])}</body>`);
    const cwd = path.join(dir, 'rooted-runner/test/fixtures');
    expect(await codeOf(() => render('page.html', {cwd, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    expect(fs.readdirSync(cwd)).toEqual(['page.html']);
  });

  it('judges a nested package under a test folder from the repository root', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    fs.mkdirSync(path.join(dir, 'repo-root/.git'), {recursive: true});
    put('repo-root/package.json', '{"name":"repo","private":true}');
    put('repo-root/test/fixtures/app/package.json', '{"name":"app","private":true}');
    put('repo-root/test/fixtures/app/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.mjs', [{path: 'page.mjs', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}])}</body>`);
    const cwd = path.join(dir, 'repo-root/test/fixtures/app');
    expect(await codeOf(() => render('page.html', {cwd, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    expect(fs.readdirSync(cwd).sort()).toEqual(['package.json', 'page.html']);
  });

  it('warns about a <script> or a loading <link> the page renders', async () => {
    put('scripted/page.tsx', 'export default function Page() { return <main><link rel="stylesheet" href="https://example.com/x.css" /><script dangerouslySetInnerHTML={{__html: "1"}} /><p>Hi</p></main>; }\nimport "@astryxdesign/core/astryx.css";\n');
    const r = /** @type {any} */ (await render('scripted/page.tsx', {cwd: dir}));
    const codes = r.data.warnings.map((/** @type {any} */ w) => w.code);
    expect(codes).toContain('page-script');
    expect(codes).toContain('remote-asset');
  }, 60_000);

  it('judges the page by where it lands, on both paths', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    fs.mkdirSync(path.join(dir, 'land/.git'), {recursive: true});
    // A page saved as test.tsx comes back under another name with --out.
    put('land/named.html', `<body><p class="astryx-text">x</p>${sourceBlock('test.tsx', [{path: 'test.tsx', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}])}</body>`);
    const cwd = path.join(dir, 'land');
    expect(await codeOf(() => render('named.html', {cwd, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    const back = /** @type {any} */ (await render('named.html', {cwd, reverse: true, out: 'demo/page.tsx'}));
    expect(back.data.output).toBe('demo/page.tsx');
    // A page rebuilt from markup inside __tests__/ is refused too.
    put('land/src/__tests__/stripped.html', '<body><div class="astryx-stack"><p class="astryx-text">Hi</p></div></body>');
    expect(
      await codeOf(() => render('stripped.html', {cwd: path.join(cwd, 'src/__tests__'), reverse: true})),
    ).toBe('ERR_INVALID_ARGUMENT');
    expect(fs.readdirSync(path.join(cwd, 'src/__tests__'))).toEqual(['stripped.html']);
  });

  it('refuses --title with --reverse', async () => {
    expect(await codeOf(() => render('page.html', {cwd: dir, reverse: true, title: 'x'}))).toBe('ERR_INVALID_ARGUMENT');
  });

  it('keeps a received title out of the rebuilt code', async () => {
    put('evil-title.html', '<html><head><title>x\rprocess.exit(7)\u2028//</title></head><body><div class="astryx-stack"><p class="astryx-text">Hi</p></div></body></html>');
    await render('evil-title.html', {cwd: dir, reverse: true, out: 'evil-title/page.tsx'});
    const first = fs.readFileSync(path.join(dir, 'evil-title/page.tsx'), 'utf8').split(/\r\n|\r|\n|\u2028|\u2029/)[0];
    expect(first).toContain('process.exit(7)');
    expect(first.startsWith('//')).toBe(true);
  });

  it('never adds a neighbour to an existing folder, a project root included', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('rooted/package.json', '{"name":"rooted","private":true}');
    for (const name of ['instrumentation.ts', 'middleware.ts', 'nodemon.json']) {
      const spec = `./${name.replace(/\.ts$/, '')}`;
      const page = {path: 'page.tsx', bytes: Buffer.from(`import x from '${spec}';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n`)};
      put('rooted/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: name, bytes: Buffer.from('{}')}])}</body>`);
      expect(
        await codeOf(() => render('page.html', {cwd: path.join(dir, 'rooted'), reverse: true, out: 'page.tsx', overwrite: true})),
      ).toMatch(/ERR_PATH_TRAVERSAL|ERR_RENDER_SOURCE_DAMAGED/);
      expect(fs.existsSync(path.join(dir, 'rooted', name))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'rooted/page.tsx'))).toBe(false);
    }
    // Without --out, everything comes back into a new folder named after the file given.
    put('rooted/shared.html', `<body><p class="astryx-text">x</p>${sourceBlock('instrumentation.ts', [{path: 'instrumentation.ts', bytes: Buffer.from('export function register() {}\n')}])}</body>`);
    const back = /** @type {any} */ (await render('shared.html', {cwd: path.join(dir, 'rooted'), reverse: true}));
    expect(back.data.output).toBe('shared-restored/instrumentation.ts');
  });

  it('replaces an existing output only when a render wrote it, and never an ignored one', async () => {
    put('fwd/page.tsx', PAGE);
    fs.copyFileSync(path.join(dir, 'dot.png'), path.join(dir, 'fwd/dot.png'));
    put('fwd/mine.html', '<p>hand-written</p>\n');
    const cwd = path.join(dir, 'fwd');
    expect(await codeOf(() => render('page.tsx', {cwd, out: 'mine.html'}))).toBe('ERR_FILE_EXISTS');
    expect(fs.readFileSync(path.join(cwd, 'mine.html'), 'utf8')).toBe('<p>hand-written</p>\n');
    await render('page.tsx', {cwd});
    const again = /** @type {any} */ (await render('page.tsx', {cwd}));
    expect(again.type).toBe('render.page');
    put('fwd/.gitignore', 'page.html\n');
    expect(await codeOf(() => render('page.tsx', {cwd}))).toBe('ERR_FILE_EXISTS');
  }, 120_000);

  it('refuses a received file that lists one path twice', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    const page = {path: 'page.tsx', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')};
    put('twice.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: 'page.tsx', bytes: Buffer.from("import './instrumentation';\n")}, {path: 'instrumentation.ts', bytes: Buffer.from('export {};\n')}])}</body>`);
    expect(await codeOf(() => render('twice.html', {cwd: dir, reverse: true, out: 'twice-out/page.tsx'}))).toBe(
      'ERR_RENDER_SOURCE_DAMAGED',
    );
    expect(fs.existsSync(path.join(dir, 'twice-out'))).toBe(false);
  });

  it('reports ERR_WRITE_FAILED when the output cannot be written', async () => {
    fs.mkdirSync(path.join(dir, 'a-folder.html'), {recursive: true});
    expect(await codeOf(() => render('page.tsx', {cwd: dir, out: 'a-folder.html'}))).toBe('ERR_WRITE_FAILED');
  }, 60_000);

  it('writes to an absolute --out in another folder, and never replaces a file there that a render did not write', async () => {
    const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-elsewhere-')));
    try {
      const out = path.join(elsewhere, 'share', 'page.html');
      const result = /** @type {any} */ (await render('page.tsx', {cwd: dir, out}));
      expect(result.data.output).toBe(out);
      expect(fs.readFileSync(out, 'utf8')).toContain('<meta name="generator" content="Astryx');
      // A render again replaces the file a render wrote.
      await render('page.tsx', {cwd: dir, out});
      const other = path.join(elsewhere, 'notes.html');
      fs.writeFileSync(other, '<p>mine</p>');
      expect(await codeOf(() => render('page.tsx', {cwd: dir, out: other}))).toBe('ERR_FILE_EXISTS');
      expect(fs.readFileSync(other, 'utf8')).toBe('<p>mine</p>');
    } finally {
      fs.rmSync(elsewhere, {recursive: true, force: true});
    }
  }, 120_000);

  it('refuses a symbolic link at an absolute --out, and leaves the file it points to', async () => {
    const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-elsewhere-')));
    try {
      const target = path.join(elsewhere, 'precious.html');
      fs.writeFileSync(target, '<meta name="generator" content="Astryx 0.0.0"><p>kept</p>');
      const link = path.join(elsewhere, 'page.html');
      fs.symlinkSync(target, link);
      expect(await codeOf(() => render('page.tsx', {cwd: dir, out: link}))).toBe('ERR_PATH_TRAVERSAL');
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe('<meta name="generator" content="Astryx 0.0.0"><p>kept</p>');
    } finally {
      fs.rmSync(elsewhere, {recursive: true, force: true});
    }
  }, 120_000);

  it('refuses a relative --out outside the current folder, saying an absolute path works', async () => {
    let error;
    try {
      await render('page.tsx', {cwd: dir, out: '../escaped.html'});
    } catch (e) {
      error = /** @type {any} */ (e);
    }
    expect(error?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(error?.message).toContain('or name an absolute path');
  });

  it('refuses --out outside the current folder, and a write through a symlink that leaves it', async () => {
    expect(await codeOf(() => render('page.tsx', {cwd: dir, out: '../escaped.html'}))).toBe('ERR_PATH_TRAVERSAL');
    expect(await codeOf(() => render('page.html', {cwd: dir, reverse: true, out: '../escaped.tsx'}))).toBe(
      'ERR_PATH_TRAVERSAL',
    );
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-outside-')));
    try {
      fs.symlinkSync(outside, path.join(dir, 'link-out'));
      expect(
        await codeOf(() => render('page.html', {cwd: dir, reverse: true, out: 'link-out/page.tsx'})),
      ).toBe('ERR_PATH_TRAVERSAL');
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });
});
