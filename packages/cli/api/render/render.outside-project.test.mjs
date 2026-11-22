// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for render() (`astryx experimental export`): a page outside a project, and media queries asked in JavaScript.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {readSourceBlock} from '../../foundation/render/source-block.mjs';
import {CLI_DIR, PAGE, PNG, dir, put, useRenderFixture} from '../../test-utils/render-fixture.mjs';

useRenderFixture();

describe('render(): a page outside a project', () => {
  /** @type {string} */
  let away;
  const BIN = path.join(CLI_DIR, 'clients', 'cli', 'bin', 'astryx.mjs');

  /** @param {string} cwd @param {string[]} args */
  const runBin = (cwd, args) => {
    // A test runner's NODE_PATH would reach this repository's packages.
    const {NODE_PATH: _, ...env} = process.env;
    const run = spawnSync(process.execPath, [BIN, '--json', ...args], {cwd, env, encoding: 'utf8', timeout: 60_000});
    return {status: run.status, json: JSON.parse(run.stdout)};
  };

  beforeAll(() => {
    away = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-away-')));
  });

  afterAll(() => {
    fs.rmSync(away, {recursive: true, force: true});
  });

  it('uses a .js file that exists under the name as written, not the TypeScript file beside it', () => {
    const tree = path.join(away, 'own-js-exists');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'fmt.js'), "export const fmt = value => `js:${value}`;\n");
    fs.writeFileSync(path.join(tree, 'fmt.ts'), "export const fmt = (value: string): string => `ts:${value}`;\n");
    fs.writeFileSync(
      path.join(tree, 'page.tsx'),
      "import {fmt} from './fmt.js';\nexport default function Page() {\n  return <p>{fmt('128')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx', 'fmt.js']);
    const html = fs.readFileSync(path.join(tree, 'page.html'), 'utf8');
    expect(html).toContain('js:128');
    expect(readSourceBlock(html)).toMatchObject({found: true, source: {version: 1}});
  }, 60_000);

  it('loads the page\'s own modules imported TypeScript-style by .js names, and gives them back exactly', () => {
    const tree = path.join(away, 'own-ts-js');
    fs.mkdirSync(path.join(tree, 'parts'), {recursive: true});
    const files = {
      'parts/fmt.ts': "export const fmt = (value: string): string => `#${value}`;\n",
      'parts/later.tsx': 'export const Later = () => <p>Later</p>;\n',
      'parts/Kpi.tsx':
        "import {fmt} from './fmt.js';\nexport const loadLater = () => import('./later.js');\nexport function Kpi({label, value}: {label: string; value: string}) {\n  return <p>{label}: {fmt(value)}</p>;\n}\n",
      'page.tsx':
        "import {Kpi} from './parts/Kpi.js';\nexport default function Page() {\n  return <main><Kpi label=\"Signups\" value=\"128\" /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    };
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(tree, name), text);
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status, JSON.stringify(run.json)).toBe(0);
    expect([...run.json.data.files].sort()).toEqual(['page.tsx', 'parts/Kpi.tsx', 'parts/fmt.ts', 'parts/later.tsx']);
    expect(run.json.data).not.toHaveProperty('notCarried');
    const html = fs.readFileSync(path.join(tree, 'page.html'), 'utf8');
    expect(html).toContain('Signups: #128');
    // Earlier CLIs cannot follow a .js name to its TypeScript file, so the
    // file says a render format they do not read, and they name this CLI.
    expect(readSourceBlock(html)).toMatchObject({found: true, source: {version: 3}});
    expect(html).toContain('render format 3.');
    const back = runBin(tree, ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: true, format: 3});
    expect(back.json.data).not.toHaveProperty('missing');
    for (const [name, text] of Object.entries(files)) {
      expect(fs.readFileSync(path.join(tree, 'page-restored', name), 'utf8'), name).toBe(text);
    }
  }, 60_000);

  it('takes Astryx, React and StyleX from the copy the CLI runs with', () => {
    fs.writeFileSync(path.join(away, 'page.tsx'), PAGE);
    fs.writeFileSync(path.join(away, 'dot.png'), PNG);
    const run = runBin(away, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.stylesheets).toContain('@astryxdesign/core/astryx.css');
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('no-astryx-styles');
    const html = fs.readFileSync(path.join(away, 'page.html'), 'utf8');
    expect(html).toContain('Café ✓ report');
    expect(html).toContain('astryx-button');
    const back = runBin(away, ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.json.data.exact).toBe(true);
    expect(fs.readFileSync(path.join(away, 'page-restored', 'page.tsx'), 'utf8')).toBe(PAGE);
  }, 60_000);

  it('carries the modules a page imports from above its own folder, as a restore lays them out', () => {
    const tree = path.join(away, 'tree');
    fs.mkdirSync(path.join(tree, 'app/x'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'components'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'components/Banner.tsx'), 'export function Banner() {\n  return <p>Banner above the page</p>;\n}\n');
    fs.writeFileSync(path.join(tree, 'app/x/page.tsx'), "import {Banner} from '../../components/Banner';\nexport default function Page() {\n  return <main><Banner /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const run = runBin(tree, ['experimental', 'export', 'app/x/page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['app/x/page.tsx', 'components/Banner.tsx']);
    const back = runBin(tree, ['experimental', 'export', '--reverse', 'app/x/page.html']);
    expect(back.json.data).toMatchObject({exact: true, files: ['app/x/page-restored/app/x/page.tsx', 'app/x/page-restored/components/Banner.tsx']});
    // The note names the page by its path among the files it lists.
    const note = fs.readFileSync(path.join(tree, 'app/x/page.html'), 'utf8');
    expect(note).toContain('Page: app/x/page.tsx\n');
    expect(note).toContain('Carried files (2): app/x/page.tsx, components/Banner.tsx');
    expect(note).toContain('edit app/x/page.tsx there instead');
    // The page's own folder still holds the tsconfig.json and the public/
    // images it is rendered with.
    fs.mkdirSync(path.join(tree, 'site/public'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'site/tsconfig.json'), '{"compilerOptions": {"paths": {"@/*": ["./*"]}}}\n');
    fs.writeFileSync(path.join(tree, 'site/public/logo.png'), PNG);
    fs.writeFileSync(path.join(tree, 'site/Note.tsx'), 'export function Note() {\n  return <p>Note by alias</p>;\n}\n');
    fs.writeFileSync(path.join(tree, 'site/page.tsx'), "import {Note} from '@/Note';\nexport default function Page() {\n  return <main><Note /><img src=\"/logo.png\" alt=\"\" /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const site = runBin(tree, ['experimental', 'export', 'site/page.tsx']);
    expect(site.status).toBe(0);
    const siteHtml = fs.readFileSync(path.join(tree, 'site/page.html'), 'utf8');
    expect(siteHtml).toContain('Note by alias');
    expect(siteHtml).toContain('src="data:image/png;base64,');
    // A page that imports nothing above its own folder is named as it is
    // listed among the files.
    expect(siteHtml).toContain('Page: page.tsx\n');
  }, 60_000);

  it('names an imported *.config.json it does not carry in the warnings, the note and notCarried', () => {
    const tree = path.join(away, 'config-named');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'chart.config.json'), JSON.stringify({title: 'Sales', unit: 'USD'}));
    fs.writeFileSync(
      path.join(tree, 'page.tsx'),
      "import cfg from './chart.config.json';\nexport default function Page() {\n  return <h1>{cfg.title} in {cfg.unit}</h1>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    expect(run.json.data.notCarried).toEqual(['chart.config.json']);
    expect(run.json.data.warnings).toContainEqual({
      code: 'not-carried',
      message:
        "chart.config.json is not carried: its name reads as a tool's configuration, which experimental import never writes. The page shows it, but experimental import cannot give it back. If it holds the page's data, rename it, such as chart-data.json, to carry it. If a tool reads it, move the values the page reads into a file of its own, such as page-data.json.",
    });
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('not-embedded');
    const html = fs.readFileSync(path.join(tree, 'page.html'), 'utf8');
    expect(html).toContain('Sales in USD');
    const note = html.slice(0, html.indexOf('-->'));
    expect(note).toContain('Carried files (1): page.tsx\n  Not carried: chart.config.json (experimental import cannot give them back)\n');
    expect(note).not.toContain('come back exactly');
    expect(note).toContain('It also carries the source of the page, except the files named under "Not carried" below; experimental import gives back the rest.');
    const back = runBin(tree, ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: false, missing: ['chart.config.json']});
  }, 60_000);

  it('names every file it leaves out in the note and notCarried, whatever the reason', () => {
    const tree = path.join(away, 'left-out');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'rows.test.ts'), "export const rows = ['North', 'South'];\n");
    fs.writeFileSync(path.join(tree, 'fake.png'), 'console.log(1)\n');
    fs.writeFileSync(path.join(tree, 'chart.config.json'), JSON.stringify({title: 'Sales'}));
    fs.writeFileSync(
      path.join(tree, 'page.tsx'),
      "import {rows} from './rows.test';\nimport cfg from './chart.config.json';\nexport default function Page() {\n  return <main><h1>{cfg.title}</h1><p>{rows.join(' ')}</p><img src=\"fake.png\" alt=\"\" /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    expect([...run.json.data.notCarried].sort()).toEqual(['chart.config.json', 'fake.png', 'rows.test.ts']);
    const codes = run.json.data.warnings.map((/** @type {any} */ w) => w.code);
    expect(codes.filter((/** @type {string} */ c) => c === 'not-carried')).toHaveLength(1);
    expect(codes.filter((/** @type {string} */ c) => c === 'not-embedded')).toHaveLength(2);
    const html = fs.readFileSync(path.join(tree, 'page.html'), 'utf8');
    const note = html.slice(0, html.indexOf('-->'));
    const line = note.split('\n').find(l => l.trim().startsWith('Not carried:'));
    expect(line?.trim().replace(/^Not carried: | \(experimental import cannot give them back\)$/g, '').split(', ').sort()).toEqual([
      'chart.config.json',
      'fake.png',
      'rows.test.ts',
    ]);
    expect(note).not.toContain('come back exactly');
  }, 60_000);

  it('lists notCarried in the text output, as the reverse view lists missing', () => {
    const tree = path.join(away, 'config-named-text');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'chart.config.json'), JSON.stringify({title: 'Sales'}));
    fs.writeFileSync(path.join(tree, 'page.tsx'), "import cfg from './chart.config.json';\nexport default function Page() {\n  return <h1>{cfg.title}</h1>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const {NODE_PATH: _, ...env} = process.env;
    const run = spawnSync(process.execPath, [BIN, 'experimental', 'export', 'page.tsx'], {cwd: tree, env, encoding: 'utf8', timeout: 60_000});
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/notCarried\W+chart\.config\.json/);
    fs.renameSync(path.join(tree, 'chart.config.json'), path.join(tree, 'chart-data.json'));
    fs.writeFileSync(path.join(tree, 'page.tsx'), "import cfg from './chart-data.json';\nexport default function Page() {\n  return <h1>{cfg.title}</h1>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const renamed = spawnSync(process.execPath, [BIN, 'experimental', 'export', 'page.tsx'], {cwd: tree, env, encoding: 'utf8', timeout: 60_000});
    expect(renamed.status).toBe(0);
    expect(renamed.stdout).not.toContain('notCarried');
  }, 60_000);

  it('names a module the page imports from outside the folder it carries from', () => {
    const tree = path.join(away, 'outside-folder');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'lib'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'lib/helper.ts'), "export const south = 'South';\n");
    fs.writeFileSync(path.join(tree, 'lib/rows.ts'), "import {south} from './helper';\nexport const rows = ['North', south];\n");
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {rows} from '../lib/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    // The module it imports from there, and the one that module imports.
    expect(run.json.data.notCarried).toEqual(['../lib/rows.ts', '../lib/helper.ts']);
    expect(run.json.data.warnings).toContainEqual({
      code: 'not-embedded',
      message:
        "../lib/rows.ts is not carried: it is outside the folder the render carries from, and experimental import writes nothing outside it. The page shows it, but experimental import cannot give it back. Render from a folder that holds it, or move it into the page's folder.",
    });
    const html = fs.readFileSync(path.join(tree, 'page/page.html'), 'utf8');
    expect(html).toContain('North South');
    const note = html.slice(0, html.indexOf('-->'));
    expect(note).toContain('Not carried: ../lib/rows.ts, ../lib/helper.ts (experimental import cannot give them back)');
    expect(note).not.toContain('come back exactly');
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    // The import and the record name rows.ts, which is named once; the
    // record also names helper.ts, which only rows.ts imports.
    expect(back.json.data).toMatchObject({exact: false, missing: ['../lib/rows', '../lib/helper.ts']});
    // Rendered from the folder that holds both, the module is carried.
    const whole = runBin(tree, ['experimental', 'export', 'page/page.tsx', '--out', 'whole.html']);
    expect(whole.status).toBe(0);
    expect(whole.json.data).not.toHaveProperty('notCarried');
    expect(whole.json.data.files).toEqual(['page/page.tsx', 'lib/rows.ts', 'lib/helper.ts']);
  }, 60_000);

  it('names a folder the page imports from above the carried folder once on the way back', () => {
    const tree = path.join(away, 'outside-index');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'lib/rows'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'lib/rows/index.ts'), "export const rows = ['North', 'South'];\n");
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {rows} from '../lib/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.notCarried).toEqual(['../lib/rows/index.ts']);
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: false, missing: ['../lib/rows']});
  }, 60_000);

  it('names an extensionless JSON import the render leaves out once on the way back', () => {
    const tree = path.join(away, 'extensionless-json');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'site.config.json'), JSON.stringify({title: 'Sales'}));
    fs.writeFileSync(
      path.join(tree, 'page.tsx'),
      "import site from './site.config';\nexport default function Page() {\n  return <h1>{site.title}</h1>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.notCarried).toEqual(['site.config.json']);
    const back = runBin(tree, ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: false, missing: ['site.config']});
  }, 60_000);

  it('keeps a recorded JSON file that shares its stem with an imported module on the way back', () => {
    const tree = path.join(away, 'outside-stem-json');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'lib'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'lib/rows.json'), JSON.stringify(['North', 'South']));
    fs.writeFileSync(path.join(tree, 'lib/rows.ts'), "import data from './rows.json';\nexport const rows: string[] = data;\n");
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {rows} from '../lib/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect([...run.json.data.notCarried].sort()).toEqual(['../lib/rows.json', '../lib/rows.ts']);
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    // The import names rows.ts, the file it resolves to first; rows.json is
    // named by itself.
    expect([...back.json.data.missing].sort()).toEqual(['../lib/rows', '../lib/rows.json']);
  }, 60_000);

  it('keeps a recorded folder index beside a same-named module on the way back', () => {
    const tree = path.join(away, 'outside-stem-index');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'lib/rows'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'lib/rows/index.ts'), "export const south = 'South';\n");
    fs.writeFileSync(path.join(tree, 'lib/rows.ts'), "import {south} from './rows/index';\nexport const rows = ['North', south];\n");
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {rows} from '../lib/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect([...run.json.data.notCarried].sort()).toEqual(['../lib/rows.ts', '../lib/rows/index.ts']);
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect([...back.json.data.missing].sort()).toEqual(['../lib/rows', '../lib/rows/index.ts']);
  }, 60_000);

  it('keeps a recorded image that shares its stem with an imported module on the way back', () => {
    const tree = path.join(away, 'outside-stem');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'lib'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'lib/rows.tsx'), "export const Rows = () => <img src=\"../lib/rows.png\" alt=\"\" />;\n");
    fs.writeFileSync(path.join(tree, 'lib/rows.png'), PNG);
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {Rows} from '../lib/rows';\nexport default function Page() {\n  return <main><Rows /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect([...run.json.data.notCarried].sort()).toEqual(['../lib/rows.png', '../lib/rows.tsx']);
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect([...back.json.data.missing].sort()).toEqual(['../lib/rows', '../lib/rows.png']);
  }, 60_000);

  it('follows a TypeScript-style .js import in a module from outside the carried folder to its source', () => {
    const tree = path.join(away, 'outside-ts-js');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'lib'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'lib/helper.ts'), "export const south: string = 'South';\n");
    fs.writeFileSync(path.join(tree, 'lib/rows.ts'), "import {south} from './helper.js';\nexport const rows = ['North', south];\n");
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {rows} from '../lib/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(fs.readFileSync(path.join(tree, 'page/page.html'), 'utf8')).toContain('North South');
    expect(run.json.data.notCarried).toEqual(['../lib/rows.ts', '../lib/helper.ts']);
  }, 60_000);

  it('in a project, tells the reader to move a file from outside the project inside it', () => {
    const tree = path.join(away, 'outside-project');
    fs.mkdirSync(path.join(tree, 'app/src'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'shared'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'app/package.json'), JSON.stringify({name: 'app', private: true}));
    fs.writeFileSync(path.join(tree, 'shared/rows.ts'), "export const rows = ['North', 'South'];\n");
    fs.writeFileSync(
      path.join(tree, 'app/src/page.tsx'),
      "import {rows} from '../../shared/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'app/src'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.notCarried).toEqual(['../../shared/rows.ts']);
    expect(run.json.data.warnings).toContainEqual({
      code: 'not-embedded',
      message:
        "../../shared/rows.ts is not carried: it is outside the project's folder, which a render carries from, and experimental import writes nothing outside it. The page shows it, but experimental import cannot give it back. Move it inside the project's folder.",
    });
  }, 60_000);

  it('names a module the page imports through a path alias from outside the folder it carries from', () => {
    const tree = path.join(away, 'outside-alias');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'shared'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'shared/rows.ts'), "export const rows = ['North', 'South'];\n");
    fs.writeFileSync(
      path.join(tree, 'page/tsconfig.json'),
      JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@shared/*': ['../shared/*']}}}),
    );
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {rows} from '@shared/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    expect(run.json.data.notCarried).toEqual(['../shared/rows.ts']);
    expect(run.json.data.warnings).toContainEqual({
      code: 'not-embedded',
      message:
        "../shared/rows.ts is not carried: it is outside the folder the render carries from, and experimental import writes nothing outside it. The page shows it, but experimental import cannot give it back. Render from a folder that holds it, or move it into the page's folder.",
    });
    const html = fs.readFileSync(path.join(tree, 'page/page.html'), 'utf8');
    expect(html).toContain('North South');
    const note = html.slice(0, html.indexOf('-->'));
    expect(note).toContain('Not carried: ../shared/rows.ts (experimental import cannot give them back)');
    expect(note).not.toContain('come back exactly');
    // --reverse cannot resolve the alias, but the file records what the
    // render left out, so it names the module as missing.
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: false, missing: ['../shared/rows.ts']});
  }, 60_000);

  it('carries a JSON file and a stylesheet from above the page folder, and names an image from there as not carried', () => {
    const tree = path.join(away, 'above-folder');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'data'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'data/rows.json'), JSON.stringify(['North', 'South']));
    fs.writeFileSync(path.join(tree, 'data/site.css'), '.rows { color: teal; }\n');
    fs.writeFileSync(path.join(tree, 'data/dot.png'), PNG);
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import rows from '../data/rows.json';\nimport '../data/site.css';\nexport default function Page() {\n  return <p className=\"rows\">{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page/page.tsx', 'data/rows.json', 'data/site.css']);
    expect(run.json.data).not.toHaveProperty('notCarried');
    expect(run.json.data.warnings).toEqual([]);
    const html = fs.readFileSync(path.join(tree, 'page/page.html'), 'utf8');
    expect(html.slice(0, html.indexOf('-->'))).not.toContain('Not carried');
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: true, output: 'page-restored/page/page.tsx'});
    expect(back.json.data).not.toHaveProperty('missing');

    // An image the page shows from there is not carried (only the page's
    // folder's images are), so it is named.
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import rows from '../data/rows.json';\nexport default function Page() {\n  return <p><img src=\"../data/dot.png\" alt=\"\" />{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const shown = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx', '--out', 'shown.html']);
    expect(shown.status).toBe(0);
    expect(shown.json.data.files).toEqual(['page/page.tsx', 'data/rows.json']);
    expect(shown.json.data.notCarried).toEqual(['data/dot.png']);
    expect(shown.json.data.warnings.map((/** @type {any} */ w) => w.code)).toEqual(['not-embedded']);
  }, 60_000);

  it('names a Sass stylesheet the page imports as not carried', () => {
    const tree = path.join(away, 'sass-import');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'site.scss'), '$c: teal;\np { color: $c; }\n');
    fs.writeFileSync(path.join(tree, 'page.tsx'), "import './site.scss';\nexport default function Page() {\n  return <p>Sales</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.notCarried).toEqual(['site.scss']);
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).toEqual(['missing-asset']);
    const html = fs.readFileSync(path.join(tree, 'page.html'), 'utf8');
    const note = html.slice(0, html.indexOf('-->'));
    expect(note).toContain('Not carried: site.scss (experimental import cannot give them back)');
    expect(note).not.toContain('come back exactly');
    const back = runBin(tree, ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.json.data.exact).toBe(false);
    expect(back.json.data.missing).toEqual(['site.scss']);
  }, 60_000);

  it('carries a config-named file once renamed as its warning says, and gives it back exactly', () => {
    const tree = path.join(away, 'config-renamed');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'chart-data.json'), JSON.stringify({title: 'Sales', unit: 'USD'}));
    fs.writeFileSync(
      path.join(tree, 'page.tsx'),
      "import cfg from './chart-data.json';\nexport default function Page() {\n  return <h1>{cfg.title} in {cfg.unit}</h1>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx', 'chart-data.json']);
    expect(run.json.data).not.toHaveProperty('notCarried');
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('not-carried');
    const html = fs.readFileSync(path.join(tree, 'page.html'), 'utf8');
    expect(html).not.toContain('Not carried');
    expect(html).toContain('so the page can come back exactly.');
    const back = runBin(tree, ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: true, files: expect.arrayContaining(['page-restored/page.tsx', 'page-restored/chart-data.json'])});
    expect(back.json.data).not.toHaveProperty('missing');
  }, 60_000);

  it('shows a root-relative image from the public/ folder of the folder it runs in, and gives it back there', () => {
    const site = path.join(away, 'public-site');
    fs.mkdirSync(path.join(site, 'public/pics'), {recursive: true});
    fs.mkdirSync(path.join(site, 'src/pages/p'), {recursive: true});
    fs.writeFileSync(path.join(site, 'public/pics/shoe.png'), PNG);
    fs.writeFileSync(path.join(site, 'public/pics/bg.png'), PNG);
    fs.writeFileSync(path.join(site, 'src/pages/p/page.css'), '.hero { background: url(/pics/bg.png); }\n');
    fs.writeFileSync(
      path.join(site, 'src/pages/p/page.tsx'),
      "import './page.css';\nconst shoe = {src: '/pics/shoe.png'};\nexport default function Page() {\n  return <main className=\"hero\"><img src={shoe.src} alt=\"Shoe\" /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(site, ['experimental', 'export', 'src/pages/p/page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
    expect(run.json.data.files).toEqual(expect.arrayContaining(['public/pics/shoe.png', 'public/pics/bg.png']));
    const html = fs.readFileSync(path.join(site, 'src/pages/p/page.html'), 'utf8');
    const markup = html.slice(0, html.indexOf('<script'));
    expect(markup).toContain('alt="Shoe"');
    expect(markup).not.toMatch(/src="\/pics\//);
    expect(markup).toMatch(/<img src="data:image\/png;base64,/);
    expect(markup).not.toContain('url(/pics/bg.png)');
    const back = runBin(site, ['experimental', 'export', '--reverse', 'src/pages/p/page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data.exact).toBe(true);
    const restored = path.join(site, 'src/pages/p/page-restored');
    expect(fs.readFileSync(path.join(restored, 'public/pics/shoe.png'))).toEqual(PNG);
    expect(fs.readFileSync(path.join(restored, 'public/pics/bg.png'))).toEqual(PNG);
    // The restored folder renders the same page, with its images.
    const again = runBin(restored, ['experimental', 'export', 'src/pages/p/page.tsx']);
    expect(again.status).toBe(0);
    expect(again.json.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
  }, 120_000);

  it('reads a root-relative image only from public/: a path that climbs out of it, or a file not there, is named and left as is', () => {
    const site = path.join(away, 'public-climb');
    fs.mkdirSync(path.join(site, 'public'), {recursive: true});
    fs.writeFileSync(path.join(site, 'secret.png'), PNG);
    fs.writeFileSync(path.join(site, 'top.png'), PNG);
    fs.writeFileSync(
      path.join(site, 'page.tsx'),
      'export default function Page() {\n  return <main><img src="/../secret.png" alt="" /><img src="/top.png" alt="" /><img src="/gone.png" alt="" /></main>;\n}\nimport "@astryxdesign/core/astryx.css";\n',
    );
    const run = runBin(site, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    const missing = run.json.data.warnings.filter((/** @type {any} */ w) => w.code === 'missing-asset').map((/** @type {any} */ w) => w.message);
    expect(missing).toEqual([
      "/../secret.png was not found in public/, where a path from the site's root is read, so it is left as is and will not show.",
      "/top.png was not found in public/, where a path from the site's root is read, so it is left as is and will not show.",
      "/gone.png was not found in public/, where a path from the site's root is read, so it is left as is and will not show.",
    ]);
    const html = fs.readFileSync(path.join(site, 'page.html'), 'utf8');
    expect(html).not.toContain('data:image/png');
  }, 60_000);

  it('names public/ from the page\'s folder in a missing-image warning, also for a stylesheet in another folder', () => {
    const site = path.join(away, 'public-from-page');
    fs.mkdirSync(path.join(site, 'public'), {recursive: true});
    fs.mkdirSync(path.join(site, 'src/pages/p'), {recursive: true});
    fs.mkdirSync(path.join(site, 'src/styles'), {recursive: true});
    fs.writeFileSync(path.join(site, 'src/styles/a.css'), '.hero { background: url(/gone-bg.png); }\n');
    fs.writeFileSync(
      path.join(site, 'src/pages/p/page.tsx'),
      "import '../../styles/a.css';\nexport default function Page() {\n  return <main className=\"hero\"><img src=\"/gone.png\" alt=\"\" /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(site, ['experimental', 'export', 'src/pages/p/page.tsx']);
    expect(run.status).toBe(0);
    const missing = run.json.data.warnings.filter((/** @type {any} */ w) => w.code === 'missing-asset').map((/** @type {any} */ w) => w.message);
    expect(missing).toEqual(
      expect.arrayContaining([
        "/gone.png was not found in ../../../public/, where a path from the site's root is read, so it is left as is and will not show.",
        "/gone-bg.png was not found in ../../../public/, where a path from the site's root is read, so it is left as is and will not show.",
      ]),
    );
  }, 60_000);

  it('finishes when the folder it runs in is the filesystem root and no public/ is above the page', () => {
    const lone = path.join(away, 'from-root');
    fs.mkdirSync(lone, {recursive: true});
    const page = path.join(lone, 'page.tsx');
    fs.writeFileSync(page, 'export default function Page() {\n  return <main><img src="/none.png" alt="" /></main>;\n}\nimport "@astryxdesign/core/astryx.css";\n');
    const root = path.parse(lone).root;
    const run = runBin(root, ['experimental', 'export', path.relative(root, page), '--out', path.relative(root, path.join(lone, 'page.html'))]);
    expect(run.status).toBe(0);
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('missing-asset');
  }, 60_000);

  it('gives back exactly an image the page names with percent-escapes, from public/ and beside the page', () => {
    const site = path.join(away, 'escaped-names');
    fs.mkdirSync(path.join(site, 'public/pics'), {recursive: true});
    fs.mkdirSync(path.join(site, 'src'), {recursive: true});
    fs.writeFileSync(path.join(site, 'public/pics/a b.png'), PNG);
    fs.writeFileSync(path.join(site, 'src/c d.png'), PNG);
    fs.writeFileSync(
      path.join(site, 'src/page.tsx'),
      'export default function Page() {\n  return <main><img src="/pics/a%20b.png" alt="A" /><img src="./c%20d.png" alt="C" /></main>;\n}\nimport \'@astryxdesign/core/astryx.css\';\n',
    );
    const run = runBin(site, ['experimental', 'export', 'src/page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(expect.arrayContaining(['public/pics/a b.png', 'src/c d.png']));
    const back = runBin(site, ['experimental', 'export', '--reverse', 'src/page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data.exact).toBe(true);
    expect(back.json.data.missing).toBeUndefined();
  }, 120_000);

  it('carries and gives back exactly an image the page loads with import() on a click, its name as written', () => {
    const site = path.join(away, 'lazy-image');
    fs.mkdirSync(path.join(site, 'src'), {recursive: true});
    fs.writeFileSync(path.join(site, 'src/big.png'), PNG);
    fs.writeFileSync(path.join(site, 'src/Screen%20Shot.png'), PNG);
    fs.writeFileSync(
      path.join(site, 'src/page.tsx'),
      "import {useState} from 'react';\nexport default function Page() {\n  const [src, setSrc] = useState('');\n  return <main><button onClick={() => { import('./big.png').then(m => setSrc(m.default)); import('./Screen%20Shot.png'); }}>Show</button>{src ? <img src={src} alt=\"Big\" /> : null}</main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(site, ['experimental', 'export', 'src/page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(expect.arrayContaining(['big.png', 'Screen%20Shot.png']));
    const back = runBin(site, ['experimental', 'export', '--reverse', 'src/page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data.exact).toBe(true);
    expect(back.json.data.missing).toBeUndefined();
  }, 120_000);

  it('keeps a page in a folder named like ..x whole: a file above it stays out, and is named', () => {
    const tree = path.join(away, 'dots');
    fs.mkdirSync(path.join(tree, '..x'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'shared'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'shared/Banner.tsx'), 'export function Banner() {\n  return <p>Banner above</p>;\n}\n');
    fs.writeFileSync(path.join(tree, '..x/page.tsx'), "import {Banner} from '../shared/Banner';\nexport default function Page() {\n  return <main><Banner /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const run = runBin(tree, ['experimental', 'export', '..x/page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('not-embedded');
    const back = runBin(path.join(tree, '..x'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({mode: 'embedded', output: 'page-restored/page.tsx'});
  }, 60_000);

  describe('a served package whose subpath exports one condition', () => {
    /** @type {string} */
    let set;
    /** @type {string} */
    let page;
    beforeAll(() => {
      set = path.join(away, 'served-conditions');
      const nm = path.join(set, 'node_modules');
      for (const name of ['react', 'react-dom']) {
        const target = path.dirname(createRequire(path.join(CLI_DIR, '../core/package.json')).resolve(`${name}/package.json`));
        fs.mkdirSync(nm, {recursive: true});
        fs.cpSync(target, path.join(nm, name), {recursive: true, dereference: true});
      }
      const pkg = path.join(nm, 'demo-conditions');
      fs.mkdirSync(path.join(pkg, 'themes'), {recursive: true});
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({
          name: 'demo-conditions',
          type: 'module',
          exports: {
            './themes/demo': {import: './themes/demo.js'},
            './legacy': {require: './legacy.cjs'},
          },
        }),
      );
      fs.writeFileSync(path.join(pkg, 'themes', 'demo.js'), "export const label = 'from the import condition';\n");
      fs.writeFileSync(path.join(pkg, 'legacy.cjs'), "exports.label = 'from the require condition';\n");
      fs.mkdirSync(path.join(set, 'core'), {recursive: true});
      fs.writeFileSync(path.join(set, 'core', 'package.json'), '{"name":"@astryxdesign/core"}');
      page = path.join(away, 'served-conditions-page');
      fs.mkdirSync(page, {recursive: true});
    });
    /** @param {string} name @param {string} spec */
    const exportOf = async (name, spec) => {
      fs.writeFileSync(
        path.join(page, `${name}.jsx`),
        `import {label} from '${spec}';\nexport default function Page() {\n  return <p>{label}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n`,
      );
      const {renderPage} = await import('../../foundation/render/render-page.mjs');
      try {
        const rendered = await renderPage(path.join(page, `${name}.jsx`), {
          served: {dir: path.join(set, 'core'), integrations: ['demo-conditions']},
          markupOnly: true,
        });
        return {html: rendered.html};
      } catch (e) {
        return {code: /** @type {any} */ (e).code, message: /** @type {any} */ (e).message};
      }
    };

    it('loads a subpath exported only under import', async () => {
      const result = /** @type {any} */ (await exportOf('import-only', 'demo-conditions/themes/demo'));
      expect(result.code, JSON.stringify(result)).toBeUndefined();
      expect(result.html).toContain('from the import condition');
    }, 60_000);

    it('loads a subpath exported only under require as before', async () => {
      const result = /** @type {any} */ (await exportOf('require-only', 'demo-conditions/legacy'));
      expect(result.code, JSON.stringify(result)).toBeUndefined();
      expect(result.html).toContain('from the require condition');
    }, 60_000);

    it('keeps the answer for a subpath the package does not export', async () => {
      const result = /** @type {any} */ (await exportOf('missing', 'demo-conditions/themes/none'));
      expect(result).toEqual({
        code: 'ERR_RENDER_MISSING_DEPENDENCY',
        message: 'The page imports demo-conditions, which is not installed',
      });
    }, 60_000);
  });

  it('loads one React outside a project, even when the folder holds its own copy', () => {
    const sub = path.join(away, 'own-react');
    for (const name of ['react', 'react-dom']) {
      const target = path.dirname(createRequire(path.join(CLI_DIR, '../core/package.json')).resolve(`${name}/package.json`));
      fs.mkdirSync(path.join(sub, 'node_modules'), {recursive: true});
      fs.cpSync(target, path.join(sub, 'node_modules', name), {recursive: true, dereference: true});
    }
    fs.writeFileSync(
      path.join(sub, 'page.jsx'),
      "import {useState} from 'react';\nimport {TextInput} from '@astryxdesign/core';\nexport default function Page() {\n  const [v] = useState('typed');\n  return <TextInput label=\"Name\" value={v} onChange={() => {}} />;\n}\n",
    );
    const run = runBin(sub, ['experimental', 'export', 'page.jsx']);
    expect(run.status).toBe(0);
    expect(fs.readFileSync(path.join(sub, 'page.html'), 'utf8')).toContain('typed');
  }, 60_000);

  it('gives a library in the folder the same React, as CommonJS and as an ES module', () => {
    const sub = path.join(away, 'react-app');
    const nm = path.join(sub, 'node_modules');
    for (const name of ['react', 'react-dom']) {
      const target = path.dirname(createRequire(path.join(CLI_DIR, '../core/package.json')).resolve(`${name}/package.json`));
      fs.mkdirSync(nm, {recursive: true});
      fs.cpSync(target, path.join(nm, name), {recursive: true, dereference: true});
    }
    fs.mkdirSync(path.join(nm, 'hook-cjs'), {recursive: true});
    fs.writeFileSync(path.join(nm, 'hook-cjs', 'package.json'), '{"name":"hook-cjs","main":"index.js"}');
    fs.writeFileSync(path.join(nm, 'hook-cjs', 'index.js'), "const {useState} = require('react');\nexports.useCjs = () => useState('cjs-hook')[0];\n");
    fs.mkdirSync(path.join(nm, 'hook-esm'), {recursive: true});
    fs.writeFileSync(path.join(nm, 'hook-esm', 'package.json'), '{"name":"hook-esm","type":"module","exports":"./index.js"}');
    fs.writeFileSync(path.join(nm, 'hook-esm', 'index.js'), "import {useState} from 'react';\nexport const useEsm = () => useState('esm-hook')[0];\n");
    const body = "  const a = useCjs();\n  const b = useEsm();\n";
    fs.writeFileSync(
      path.join(sub, 'plain.jsx'),
      `import {useCjs} from 'hook-cjs';\nimport {useEsm} from 'hook-esm';\nexport default function Page() {\n${body}  return <p>{a} {b}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n`,
    );
    fs.writeFileSync(
      path.join(sub, 'core.jsx'),
      `import {useCjs} from 'hook-cjs';\nimport {useEsm} from 'hook-esm';\nimport {Button} from '@astryxdesign/core';\nexport default function Page() {\n${body}  return <Button label={a + ' ' + b} />;\n}\n`,
    );
    for (const page of ['plain', 'core']) {
      const run = runBin(sub, ['experimental', 'export', `${page}.jsx`]);
      expect(run.status).toBe(0);
      const html = fs.readFileSync(path.join(sub, `${page}.html`), 'utf8');
      expect(html).toContain('cjs-hook');
      expect(html).toContain('esm-hook');
    }
  }, 90_000);

  it('says the CLI runs without Core only for a render outside a project', async () => {
    const sub = path.join(away, 'no-core');
    for (const name of ['react', 'react-dom']) {
      const target = path.dirname(createRequire(path.join(CLI_DIR, '../core/package.json')).resolve(`${name}/package.json`));
      fs.mkdirSync(path.join(sub, 'node_modules'), {recursive: true});
      fs.cpSync(target, path.join(sub, 'node_modules', name), {recursive: true, dereference: true});
    }
    fs.writeFileSync(path.join(sub, 'page.jsx'), 'export default () => <p>no core</p>;\nimport "@astryxdesign/core/astryx.css";\n');
    // In a fresh process without the test runner's NODE_PATH, which would reach this repository's Core.
    const script = `
const {renderPage} = await import(${JSON.stringify(path.join(CLI_DIR, 'foundation/render/render-page.mjs'))});
const entry = ${JSON.stringify(path.join(sub, 'page.jsx'))};
const textOf = page => page.warnings.find(w => w.code === 'no-astryx-styles')?.message;
const inside = textOf(await renderPage(entry, {served: null, markupOnly: true}));
const outside = textOf(await renderPage(entry, {served: {dir: ${JSON.stringify(path.join(sub, 'no-such-core'))}, integrations: []}, markupOnly: true}));
console.log(JSON.stringify({inside, outside}));
`;
    const {NODE_PATH: _, ...env} = process.env;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {cwd: sub, env, encoding: 'utf8', timeout: 60_000});
    const {inside, outside} = JSON.parse(run.stdout.trim().split('\n').pop() ?? '{}');
    expect(inside).toBe('@astryxdesign/core is not installed where the page is, so the page has no Astryx styles; install it, or render from inside the project.');
    expect(outside).toContain('and the CLI runs without one');
  }, 60_000);

  it("compiles a page's StyleX that reads Core's theme variables, with the names Core's stylesheet defines", () => {
    const sub = path.join(away, 'tokens');
    fs.mkdirSync(sub, {recursive: true});
    fs.writeFileSync(
      path.join(sub, 'page.tsx'),
      [
        "import * as stylex from '@stylexjs/stylex';",
        "import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';",
        "import {Text} from '@astryxdesign/core/Text';",
        '',
        "const styles = stylex.create({box: {backgroundColor: colorVars['--color-background-surface'], padding: spacingVars['--spacing-2']}});",
        '',
        'export default function Page() {',
        '  return <div {...stylex.props(styles.box)}><Text>Themed box</Text></div>;',
        '}',
        '',
      ].join('\n'),
    );
    const run = runBin(sub, ['experimental', 'export', 'page.tsx']);
    expect(run.status, JSON.stringify(run.json)).toBe(0);
    const html = fs.readFileSync(path.join(sub, 'page.html'), 'utf8');
    const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    for (const name of ['--color-background-surface', '--spacing-2']) {
      expect(style).toContain(`var(${name})`);
      expect(style).toContain(`${name}:`);
    }
  }, 60_000);

  it('still names a package the CLI does not carry as not installed', () => {
    fs.writeFileSync(path.join(away, 'dep.jsx'), "import x from 'not-a-real-package-xyz';\nexport default () => <p>{String(x)}</p>;\nimport '@astryxdesign/core/astryx.css';\n");
    const run = runBin(away, ['experimental', 'export', 'dep.jsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
  }, 60_000);

  it('names every package the page and its own modules need in one refusal, with no install line outside a project', () => {
    fs.writeFileSync(
      path.join(away, 'many-deps.tsx'),
      "import {Chart} from './many-deps-chart';\nimport icon from '@not-real-xyz/icons/solid';\nimport type {T} from 'not-real-types-xyz';\nexport default () => <Chart icon={icon} />;\nimport '@astryxdesign/core/astryx.css';\n",
    );
    fs.writeFileSync(
      path.join(away, 'many-deps-chart.tsx'),
      "import {Line} from 'not-real-charts-xyz';\nimport fs from 'node:fs';\nexport const Chart = ({icon}: {icon: unknown}) => <Line icon={icon} fs={fs} />;\n",
    );
    const run = runBin(away, ['experimental', 'export', 'many-deps.tsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    // No package.json holds this folder, so an install would make it a
    // project: the message names the packages for the project that uses the
    // page, with no install line.
    expect(run.json.error).toBe(
      'The page imports @not-real-xyz/icons and not-real-charts-xyz, which are not installed. Install them in the project that uses this page.',
    );
    expect(run.json.suggestions ?? []).toEqual([]);
  }, 60_000);

  it('counts only imports a TypeScript module uses as values, and a missing package image with the rest', () => {
    fs.writeFileSync(
      path.join(away, 'used-deps.tsx'),
      "import {Metadata} from 'not-real-next-xyz';\nimport {unused} from 'not-real-unused-xyz';\nimport {size} from './used-deps-shapes';\nimport logo from 'not-real-brand-xyz/logo.png';\nimport mark from 'not-real-mark-xyz/mark.svg';\nexport const metadata: Metadata = {title: 'x'};\nexport default () => <img src={logo} data-mark={mark} width={size} alt=\"\" />;\nimport '@astryxdesign/core/astryx.css';\n",
    );
    fs.writeFileSync(
      path.join(away, 'used-deps-shapes.ts'),
      "import {Model} from 'not-real-model-xyz';\nexport type Shape = Model;\nexport const twice = (Model: number) => Model * 2;\nexport const size = 1;\n",
    );
    const run = runBin(away, ['experimental', 'export', 'used-deps.tsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    expect(run.json.error).toBe(
      'The page imports not-real-brand-xyz and not-real-mark-xyz, which are not installed. Install them in the project that uses this page.',
    );
  }, 60_000);

  it('counts every import of a JavaScript module, used or not, as JavaScript loads them all', () => {
    fs.writeFileSync(
      path.join(away, 'js-deps.jsx'),
      "import {unused} from 'not-real-unused-js-xyz';\nimport {Line} from 'not-real-line-js-xyz';\nexport default () => <Line />;\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(away, ['experimental', 'export', 'js-deps.jsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    expect(run.json.error).toBe(
      'The page imports not-real-line-js-xyz and not-real-unused-js-xyz, which are not installed. Install them in the project that uses this page.',
    );
  }, 60_000);

  it('counts a re-export of a package whose type the module also imports without `import type`', () => {
    fs.writeFileSync(
      path.join(away, 're-export-deps.tsx'),
      "import {Shape} from 'not-real-shapes-xyz';\nexport {make} from 'not-real-shapes-xyz';\nexport const shape: Shape | null = null;\nexport default () => <p>x</p>;\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(away, ['experimental', 'export', 're-export-deps.tsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    expect(run.json.error).toBe('The page imports not-real-shapes-xyz, which is not installed. Install it in the project that uses this page.');
  }, 60_000);

  it('names an Astryx package the package set does not hold with the rest, not one at a time', () => {
    fs.writeFileSync(
      path.join(away, 'unheld.tsx'),
      "import {Line} from 'not-real-charts-xyz';\nimport {x} from '@astryxdesign/not-a-real-package-xyz';\nexport default () => <Line x={x} />;\n",
    );
    const run = runBin(away, ['experimental', 'export', 'unheld.tsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    expect(run.json.error).toBe(
      'The page imports @astryxdesign/not-a-real-package-xyz and not-real-charts-xyz, which are not installed. Install them in the project that uses this page.',
    );
  }, 60_000);

  it("uses only the project's own packages inside a project", async () => {
    const {renderPage} = await import('../../foundation/render/render-page.mjs');
    const page = await renderPage(path.join(dir, 'page.tsx'), {
      served: {dir: path.join(away, 'no-such-core'), integrations: []},
    });
    expect(page.fromSet).toEqual([]);
    expect(page.stylesheets).toContain('@astryxdesign/core/astryx.css');
  }, 60_000);
});

describe('render(): media queries asked in JavaScript', () => {
  it("names each media query the page asks with Core's hook or matchMedia, and says to fold the layout with CSS", async () => {
    put(
      'screen-query.tsx',
      `import {useEffect, useState} from 'react';
import {useMediaQuery} from '@astryxdesign/core/hooks';
function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(window.matchMedia(\`(prefers-color-scheme: dark)\`).matches), []);
  return dark;
}
export default function Page() {
  const narrow = useMediaQuery('(max-width: 768px)');
  const alsoNarrow = useMediaQuery('(max-width: 768px)');
  const dark = useDark();
  return <main>{narrow && alsoNarrow ? 'One column' : 'Two columns'}{dark ? ' dark' : ''}</main>;
}
`,
    );
    const result = /** @type {any} */ (await render('screen-query.tsx', {cwd: dir}));
    const warnings = result.data.warnings.filter((/** @type {any} */ w) => w.code === 'screen-query');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toBe(
      "The page asks matchMedia('(prefers-color-scheme: dark)'), useMediaQuery('(max-width: 768px)') in JavaScript: this file paints the server answer first and asks again when its script runs, and a viewer that blocks scripts keeps the server answer. To fit every screen from the first paint, fold the layout with CSS: Grid columns={{minWidth}}, or a StyleX @media or @container style.",
    );
  }, 60_000);

  it("names the hook imported from Core's root entry, and an optional matchMedia call", async () => {
    put(
      'screen-query-root.tsx',
      `import {useEffect, useState} from 'react';
import {useMediaQuery} from '@astryxdesign/core';
export default function Page() {
  const wide = useMediaQuery('(min-width: 1024px)');
  const [motion, setMotion] = useState(true);
  useEffect(() => setMotion(!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches), []);
  return <main>{wide ? 'Wide' : 'Narrow'}{motion ? '' : ' still'}</main>;
}
`,
    );
    const result = /** @type {any} */ (await render('screen-query-root.tsx', {cwd: dir}));
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'screen-query');
    expect(warning?.message).toContain("The page asks useMediaQuery('(min-width: 1024px)'), matchMedia('(prefers-reduced-motion: reduce)') in JavaScript");
  }, 60_000);

  it("names the hook called through a namespace import of Core, and a call with no query, without failing the render", async () => {
    put(
      'screen-query-namespace.tsx',
      `import * as core from '@astryxdesign/core';
function never() {
  return [window.matchMedia?.(), matchMedia(), core.useMediaQuery()];
}
export default function Page() {
  const narrow = core.useMediaQuery('(max-width: 600px)');
  return <main>{narrow ? 'Narrow' : 'Wide'}{typeof never}</main>;
}
`,
    );
    const result = /** @type {any} */ (await render('screen-query-namespace.tsx', {cwd: dir}));
    expect(result.type).toBe('render.page');
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'screen-query');
    expect(warning?.message).toContain("The page asks matchMedia(), useMediaQuery(), useMediaQuery('(max-width: 600px)') in JavaScript");
  }, 60_000);

  it('says nothing for a page that asks no media query, or calls a function of its own named like the hook', async () => {
    put(
      'no-screen-query.tsx',
      `function useMediaQuery(query: string) {
  return query.length > 100;
}
export default function Page() {
  return <main>{useMediaQuery('(max-width: 768px)') ? 'narrow' : 'wide'}</main>;
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('no-screen-query.tsx', {cwd: dir}));
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('screen-query');
  }, 60_000);
});
