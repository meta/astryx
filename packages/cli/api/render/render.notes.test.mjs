// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for what a rendered file tells the next reader by itself: the
 * notes at its top and end, the record in its embedded source, what a
 * reverse reports about edits made after the render, and how a CLI meets a
 * newer render format.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {readSourceBlock, recordedText, renderedMarkupOf, sha256, SOURCE_TYPE} from '../../foundation/render/source-block.mjs';
import {textEdits} from '../../foundation/render/markup-edits.mjs';
import {cliVersion} from '../../foundation/integrations/cli-peer-version.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {makeLinkedFixture, removeLinkedFixture} from '../../test-utils/linked-fixture.mjs';

/** @type {string} */
let dir;

/** @param {string} name @param {string | Buffer} content */
const put = (name, content) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return file;
};

/** @param {string} name */
const read = name => fs.readFileSync(path.join(dir, name), 'utf8');

/** @param {() => Promise<unknown>} fn */
async function errorOf(fn) {
  try {
    await fn();
  } catch (e) {
    return /** @type {any} */ (e);
  }
  return null;
}

const PAGE = `import {Heading, Text} from '@astryxdesign/core/Text';
import {Kpi} from './sections/Kpi';

export default function Report() {
  return (
    <main>
      <Heading level={1}>Q3 report</Heading>
      <Text>Revenue grew in every region.</Text>
      <Kpi label="Users" value="100" />
      <Kpi label="Uptime" value="99%" />
    </main>
  );
}
`;

const KPI = `import {Heading, Text} from '@astryxdesign/core/Text';

export function Kpi({label, value}: {label: string; value: string}) {
  return (
    <div>
      <Text>{label}</Text>
      <Heading level={2}>{value}</Heading>
    </div>
  );
}
`;

/** @type {string} */
let html;

beforeAll(async () => {
  dir = makeLinkedFixture('astryx-render-notes-', ['@astryxdesign', '@stylexjs', 'react', 'react-dom', 'recharts']);
  put('src/report.tsx', PAGE);
  put('src/sections/Kpi.tsx', KPI);
  await render('src/report.tsx', {cwd: dir, out: 'report.html'});
  html = read('report.html');
}, 60_000);

afterAll(() => {
  removeLinkedFixture(dir);
});

/** Edit the markup of a rendered file the way a person might. @param {string} source @param {(body: string) => string} change */
const editBody = (source, change) => {
  const body = source.indexOf('<body>');
  return source.slice(0, body) + change(source.slice(body));
};

describe('a rendered file describes itself', () => {
  it('keeps the charset and generator metas in the first bytes, then opens a note on lines of its own', () => {
    expect(html.indexOf('<meta charset="utf-8">')).toBeLessThan(1024);
    expect(html.indexOf(`<meta name="generator" content="Astryx ${cliVersion()}">`)).toBeGreaterThan(0);
    expect(html.indexOf('<meta name="generator"')).toBeLessThan(4096);
    const lines = html.split('\n');
    expect(lines[0]).toBe(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="generator" content="Astryx ${cliVersion()}">`,
    );
    expect(lines[1]).toBe('<!--');
  });

  it('names what made it, what it carries, and the commands that give the page back and render it again', () => {
    const note = html.slice(html.indexOf('<!--'), html.indexOf('-->') + 3);
    const run = `npx @astryxdesign/cli@${cliVersion()}`;
    expect(note).toContain(`astryx experimental render, @astryxdesign/cli ${cliVersion()}, render format 1.`);
    expect(note).toContain('Page: src/report.tsx');
    expect(note).toContain('Carried files (2): report.tsx, sections/Kpi.tsx');
    expect(note).toMatch(/Rendered with: @astryxdesign\/core \d+\.\d+\.\d+\S*, react \d/);
    expect(note).toContain(`${run} experimental render --reverse report.html`);
    expect(note).toContain('This writes report-restored/report.tsx and the files it imports');
    expect(note).toContain(`${run} experimental render report-restored/report.tsx --out report.html`);
    expect(note).toMatch(/npx @astryxdesign\/cli upgrade --from \S+ --path report-restored --apply/);
    expect(note).toContain('edit src/report.tsx there instead');
    expect(note).toContain(`to keep the note, update that CLI first:\n         npm install --save-dev @astryxdesign/cli@${cliVersion()}`);
    // The note names no tag a search for the block would also find.
    expect(note).not.toContain('x-astryx-source');
    // The note never ends or nests a comment early.
    expect(note.slice(4, -3)).not.toMatch(/-->|<!--/);
  });

  it('never spells the opening tag of the embedded block outside the block, so every CLI finds the block', () => {
    expect(html.split(`<script type="${SOURCE_TYPE}"`)).toHaveLength(2);
    const block = readSourceBlock(html);
    expect(block.found && 'source' in block).toBe(true);
  });

  it('records the CLI, the page, the packages and the markup in the embedded source, still render format 1', () => {
    const block = readSourceBlock(html);
    if (!block.found || !('source' in block)) throw new Error('no source');
    const {source} = block;
    expect(source.version).toBe(1);
    expect(source.cli).toBe(cliVersion());
    expect(source.page).toBe('src/report.tsx');
    expect(Object.keys(source.packages ?? {})).toEqual(expect.arrayContaining(['@astryxdesign/core', 'react', 'react-dom']));
    expect(recordedText(source.markup ?? {})).toEqual({
      title: 'Q3 report',
      runs: ['Q3 report', 'Revenue grew in every region.', 'Users', '100', 'Uptime', '99%'],
    });
    // The record keeps the text encoded: a find-and-replace over the page's
    // text changes only the markup.
    expect(html.split('Revenue grew in every region.')).toHaveLength(2);
    expect(source.markup?.sha256).toBe(sha256(/** @type {string} */ (renderedMarkupOf(html))));
  });

  it('ends with a short note after the embedded source', () => {
    const lines = html.trimEnd().split('\n');
    expect(lines.at(-1)).toBe('</body></html>');
    expect(lines.at(-2)).toBe(
      `<!-- Astryx render: the block above is the source of the page (render format 1), as JSON; each file is base64 with its SHA-256. Get it back: npx @astryxdesign/cli@${cliVersion()} experimental render --reverse report.html -->`,
    );
  });

  it('puts an explicit title in the render-again command, and names packages to install outside a project', async () => {
    put('charts/trend.tsx', `import {LineChart, Line} from 'recharts';\nexport default function Trend() {\n  return <LineChart width={200} height={100} data={[{v: 1}, {v: 2}]}><Line dataKey="v" /></LineChart>;\n}\n`);
    await render('charts/trend.tsx', {cwd: dir, title: "Team's trend"});
    const page = read('charts/trend.html');
    expect(page).toContain("experimental render trend-restored/trend.tsx --out trend.html --title 'Team'\\''s trend'");
    expect(page).toMatch(/npm install recharts@\d+\.\d+\.\d+/);
  });

  it('renders the same bytes again from the same source', async () => {
    await render('src/report.tsx', {cwd: dir, out: 'report-again.html'});
    expect(read('report-again.html').replace(/report-again/g, 'report')).toBe(html);
  });
});

describe('render --reverse says what changed after the render', () => {
  it('reports the format, the CLI and the packages, and no edits for a file as rendered', async () => {
    const result = /** @type {any} */ (await render('report.html', {cwd: dir, reverse: true, out: 'as-rendered/report.tsx'}));
    expect(result.data).toMatchObject({mode: 'embedded', exact: true, format: 1, renderedBy: cliVersion(), edited: false, stylesEdited: false});
    expect(result.data.packages).toEqual(expect.arrayContaining([expect.stringMatching(/^@astryxdesign\/core@\d/)]));
    expect(result.data.edits).toBeUndefined();
  });

  it('names each text edit with where the old text sits in the restored source, and restores the page as rendered', async () => {
    put('edited.html', editBody(html, body => body.replace('Q3 report', 'Q4 report').replace('>100<', '>120<')));
    const result = /** @type {any} */ (await render('edited.html', {cwd: dir, reverse: true, out: 'edited-back/report.tsx'}));
    expect(result.data.edited).toBe(true);
    expect(result.data.edits).toEqual([
      {was: 'Q3 report', now: 'Q4 report', file: 'edited-back/report.tsx', line: 7},
      {was: '100', now: '120', file: 'edited-back/report.tsx', line: 9},
    ]);
    expect(read('edited-back/report.tsx')).toBe(PAGE);
    expect(read('edited-back/sections/Kpi.tsx')).toBe(KPI);
  });

  it('reports text added and removed after the render, and an edit with no text change', async () => {
    put('added.html', editBody(html, body => body.replace('</main>', '<p>Footnote</p></main>').replace('Revenue grew in every region.', '')));
    const added = /** @type {any} */ (await render('added.html', {cwd: dir, reverse: true, out: 'added-back/report.tsx'}));
    expect(added.data.edits).toEqual([
      {was: 'Revenue grew in every region.', now: null, file: 'added-back/report.tsx', line: 8},
      {was: null, now: 'Footnote'},
    ]);
    put('attrs.html', editBody(html, body => body.replace('<main', '<main data-note="x"')));
    const attrs = /** @type {any} */ (await render('attrs.html', {cwd: dir, reverse: true, out: 'attrs-back/report.tsx'}));
    expect(attrs.data).toMatchObject({edited: true, stylesEdited: false, edits: []});
  });

  it('still names the change after a find-and-replace over the whole file', async () => {
    put('replaced.html', html.split('Revenue grew in every region.').join('Revenue grew in most regions.'));
    const result = /** @type {any} */ (await render('replaced.html', {cwd: dir, reverse: true, out: 'replaced-back/report.tsx'}));
    expect(result.data.edits).toEqual([
      {was: 'Revenue grew in every region.', now: 'Revenue grew in most regions.', file: 'replaced-back/report.tsx', line: 8},
    ]);
  });

  it('lists a title that changed with its heading once', async () => {
    put('heading.html', html.replace('<title>Q3 report</title>', '<title>Q4 report</title>').replace('>Q3 report<', '>Q4 report<'));
    const result = /** @type {any} */ (await render('heading.html', {cwd: dir, reverse: true, out: 'heading-back/report.tsx'}));
    expect(result.data.edits).toEqual([{was: 'Q3 report', now: 'Q4 report', file: 'heading-back/report.tsx', line: 7}]);
  });

  it('reports a changed title first, and changed styles', async () => {
    put('restyled.html', html.replace('<title>Q3 report</title>', '<title>Q3 report (final)</title>').replace(':root{color-scheme:light dark}', ':root{color-scheme:light dark;accent-color:teal}'));
    const result = /** @type {any} */ (await render('restyled.html', {cwd: dir, reverse: true, out: 'restyled-back/report.tsx'}));
    expect(result.data).toMatchObject({edited: true, stylesEdited: true});
    expect(result.data.edits).toEqual([{was: 'Q3 report', now: 'Q3 report (final)', file: 'restyled-back/report.tsx', line: 7}]);
  });

  it('reads a file from an older CLI: the version from its generator meta, and no record of packages or markup', async () => {
    const block = readSourceBlock(html);
    if (!block.found || !('source' in block)) throw new Error('no source');
    const {version, entry, files} = block.source;
    const old = html
      .replace(/\n<!--[\s\S]*?-->\n/, '')
      .replace(/<script type="application\/x-astryx-source">[\s\S]*?<\/script>/, () =>
        `<script type="${SOURCE_TYPE}">${JSON.stringify({version, entry, files})}</script>`,
      )
      .replace(`content="Astryx ${cliVersion()}"`, 'content="Astryx 0.7.12"');
    put('old.html', old);
    const result = /** @type {any} */ (await render('old.html', {cwd: dir, reverse: true, out: 'old-back/report.tsx'}));
    expect(result.data).toMatchObject({mode: 'embedded', exact: true, format: 1, renderedBy: '0.7.12'});
    expect(result.data).not.toHaveProperty('packages');
    expect(result.data).not.toHaveProperty('edited');
    expect(read('old-back/report.tsx')).toBe(PAGE);
  });

  it('refuses a file that ends inside its embedded source, instead of rebuilding it from the markup', async () => {
    put('cut.html', html.slice(0, html.indexOf('"files":') + 200));
    const error = await errorOf(() => render('cut.html', {cwd: dir, reverse: true}));
    expect(error?.code).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(error?.message).toContain('cut short');
  });

  it('refuses a newer render format, naming the CLI that wrote it, and writes nothing', async () => {
    const future = html.replace(
      /<script type="application\/x-astryx-source">[\s\S]*?<\/script>/,
      () => `<script type="${SOURCE_TYPE}">${JSON.stringify({version: 2, cli: '9.1.0', entry: 'report.tsx', parts: []})}</script>`,
    );
    put('future.html', future);
    const error = await errorOf(() => render('future.html', {cwd: dir, reverse: true}));
    expect(error?.code).toBe('ERR_RENDER_NEWER_FORMAT');
    expect(error?.message).toContain('render format 2, written by @astryxdesign/cli 9.1.0');
    expect(error?.suggestions?.[0]?.name).toBe('npx @astryxdesign/cli@9.1.0 experimental render --reverse future.html');
    expect(fs.existsSync(path.join(dir, 'future-restored'))).toBe(false);
  });

  it('refuses a received file whose CLI version is not a semantic version, so no printed command carries it', async () => {
    for (const [name, version] of [['crafted-new', 2], ['crafted-one', 1]]) {
      const crafted = html.replace(
        /<script type="application\/x-astryx-source">[\s\S]*?<\/script>/,
        () => `<script type="${SOURCE_TYPE}">${JSON.stringify({version, cli: '9.1.0 && touch pwned', entry: 'report.tsx', files: []})}</script>`,
      );
      put(`${name}.html`, crafted);
      const error = await errorOf(() => render(`${name}.html`, {cwd: dir, reverse: true}));
      expect(error?.code).toBe('ERR_RENDER_SOURCE_DAMAGED');
      expect(error?.message).toContain('not a release version');
      expect(JSON.stringify(error)).not.toContain('pwned');
      expect(fs.existsSync(path.join(dir, `${name}-restored`))).toBe(false);
    }
    // A newer format with no CLI version suggests the latest CLI.
    put('unnamed.html', html.replace(/<script type="application\/x-astryx-source">[\s\S]*?<\/script>/, () => `<script type="${SOURCE_TYPE}">${JSON.stringify({version: 2, entry: 'report.tsx'})}</script>`));
    const unnamed = await errorOf(() => render('unnamed.html', {cwd: dir, reverse: true}));
    expect(unnamed?.code).toBe('ERR_RENDER_NEWER_FORMAT');
    expect(unnamed?.suggestions?.[0]?.name).toBe('npx @astryxdesign/cli@latest experimental render --reverse unnamed.html');
    put('crafted-gen.html', html.replace(`content="Astryx ${cliVersion()}"`, 'content="Astryx 1.0.0; touch pwned"').replace(/"cli":"[^"]*",/, ''));
    const result = /** @type {any} */ (await render('crafted-gen.html', {cwd: dir, reverse: true, out: 'crafted-gen-back/report.tsx'}));
    expect(result.data).not.toHaveProperty('renderedBy');
  });

  it('quotes a page name a received file chose, in every command it prints', async () => {
    const page = Buffer.from("import {k} from './k';\nexport default function Page() {\n  return <p>{k}</p>;\n}\n");
    const k = Buffer.from("export const k = 'value';\n");
    const file = (/** @type {string} */ p, /** @type {Buffer} */ b) => ({path: p, sha256: sha256(b), base64: b.toString('base64')});
    const block = (/** @type {string} */ folder) =>
      `<!doctype html><html><head><meta charset="utf-8"><meta name="generator" content="Astryx 0.7.15"></head><body><p>value</p><script type="${SOURCE_TYPE}">${JSON.stringify({version: 1, entry: 'page.tsx', files: [file(`${folder}/page.tsx`, page), file(`${folder}/k.ts`, k)]})}</script></body></html>`;
    // Restored by default: the page lands under its own folder name.
    put('named.html', block('a; touch pwned'));
    const restored = await runCli(['experimental', 'render', '--reverse', 'named.html'], dir);
    expect(restored.status).toBe(0);
    expect(restored.stdout).toMatch(/^Render it again: .*experimental render 'named-restored\/a; touch pwned\/page\.tsx' --out named\.html$/m);
    expect(fs.existsSync(path.join(dir, 'pwned'))).toBe(false);
    // Refused into a folder that exists: the suggested --out is quoted too.
    fs.mkdirSync(path.join(dir, 'existing'), {recursive: true});
    const refused = await errorOf(() => render('named.html', {cwd: dir, reverse: true, out: 'existing/page.tsx'}));
    expect(refused?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(refused?.suggestions?.[0]?.name).toMatch(/^--out 'restored(-\d+)?\/a; touch pwned\/page\.tsx'$/);
  });

  it('reads a title that looks like tags as text: an untouched file is not edited, and old readers find the block', async () => {
    const title = '<style>x</style><title>y</title> & "q"';
    await render('src/report.tsx', {cwd: dir, out: 'tags.html', title});
    const tags = read('tags.html');
    const note = tags.slice(tags.indexOf('<!--'), tags.indexOf('-->') + 3);
    expect(note).not.toMatch(/<style|<title|<script/i);
    expect(note).toContain('The page was rendered with --title; step 1 prints the command with it.');
    // The block a released CLI finds: the last opening tag, up to the next closing one.
    const released = [...tags.matchAll(/<script\s+type=["']application\/x-astryx-source["'][^>]*>([\s\S]*?)<\/script>/gi)].at(-1);
    expect(() => JSON.parse(released?.[1] ?? '')).not.toThrow();
    const back = /** @type {any} */ (await render('tags.html', {cwd: dir, reverse: true, out: 'tags-back/report.tsx'}));
    expect(back.data).toMatchObject({edited: false, stylesEdited: false, title});
    const {stdout} = await runCli(['experimental', 'render', '--reverse', 'tags.html', '--out', 'tags-back-2/report.tsx'], dir);
    expect(stdout).toContain(`--out tags.html --title '<style>x</style><title>y</title> & "q"'`);
    // A long title edit is clipped like any other.
    put('long-title.html', tags.replace(/<title>[^<]*<\/title>/, `<title>${'w'.repeat(400)}</title>`));
    const long = /** @type {any} */ (await render('long-title.html', {cwd: dir, reverse: true, out: 'long-back/report.tsx'}));
    expect(long.data.edits[0].now).toHaveLength(300);
  });

  it('leaves an untouched file unedited when its stylesheet text or its page folder looks like HTML', async () => {
    put('odd/<body>/page.tsx', `import './look.css';\nexport default function Page() {\n  return <p className="tagged">Tagged</p>;\n}\n`);
    put('odd/<body>/look.css', '.tagged::before { content: "</head><body><!-- x -->"; }\n');
    await render('odd/<body>/page.tsx', {cwd: dir, out: 'odd.html'});
    const odd = read('odd.html');
    // The render keeps the stylesheet's text (it only escapes a comment
    // opener), and the note names the page's folder.
    expect(odd).toContain('content: "</head><body>');
    expect(odd).toContain('Page: odd/<body>/page.tsx');
    const back = /** @type {any} */ (await render('odd.html', {cwd: dir, reverse: true, out: 'odd-back/page.tsx'}));
    expect(back.data).toMatchObject({exact: true, edited: false, stylesEdited: false});
  });

  it('keeps every path in the note relative to the project: no folder above it, user or host name', () => {
    expect(html).not.toContain(path.dirname(dir));
    expect(html).not.toContain(os.homedir());
    expect(html).not.toContain(os.hostname());
  });

  it('quotes every path and the title in the command that renders the page again', async () => {
    put('Q3 final.html', html);
    const {stdout, status} = await runCli(['experimental', 'render', '--reverse', 'Q3 final.html', '--out', 'odd back/report.tsx'], dir);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Render it again: .*experimental render 'odd back\/report\.tsx' --out 'Q3 final\.html'$/m);
    await render('src/report.tsx', {cwd: dir, out: 'titled.html', title: "Ops' review"});
    const titled = await runCli(['experimental', 'render', '--reverse', 'titled.html', '--out', 'titled-back/report.tsx'], dir);
    expect(titled.stdout).toMatch(/^title:\s+Ops' review$/m);
    expect(titled.stdout).toMatch(/--out titled\.html --title 'Ops'\\''\s?review'$/m);
  });

  it('prints the changes and the command that renders the page again', async () => {
    put('typo.html', editBody(html, body => body.replace('Q3 report', 'Q3 reprot')));
    const {stdout, status} = await runCli(['experimental', 'render', '--reverse', 'typo.html', '--out', 'typo-back/report.tsx'], dir);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^edited:\s+true$/m);
    expect(stdout).toMatch(/^stylesEdited:\s+false$/m);
    expect(stdout).toContain('Changed after the render');
    expect(stdout).toMatch(/was:\s+Q3 report\nnow:\s+Q3 reprot\nfile:\s+typo-back\/report\.tsx\nline:\s+7/);
    expect(stdout).toMatch(/Render it again: .*experimental render typo-back\/report\.tsx --out typo\.html/);
  });
});

describe('render carries every module the page reaches', () => {
  it('carries a type-only import and a plain ES module Node loads itself, so the page comes back whole', async () => {
    put('reach/page.tsx', `import type {Row} from './types';
import {rows} from './rows.js';
import '../sheets/site.scss';

const all: Row[] = rows;
export default function Page() {
  return <ul>{all.map(r => <li key={r.a}>{r.a}</li>)}</ul>;
}
`);
    put('reach/types.ts', 'export type Row = {a: string};\n');
    put('reach/rows.js', "export const rows = [{a: 'one'}, {a: 'two'}];\n");
    put('sheets/site.scss', '$x: 1px;\n');
    const result = /** @type {any} */ (await render('reach/page.tsx', {cwd: dir}));
    expect(result.data.files).toEqual(expect.arrayContaining(['page.tsx', 'types.ts', 'rows.js']));
    expect(result.data.files.some((/** @type {string} */ f) => f.endsWith('.scss'))).toBe(false);
    // The Sass file gets its one warning, and no second one for not being carried.
    expect(result.data.warnings.filter((/** @type {any} */ w) => w.message.includes('site.scss'))).toHaveLength(1);
    // Every module comes back; the Sass file a render never carries is named.
    const back = /** @type {any} */ (await render('reach/page.html', {cwd: dir, reverse: true, out: 'reach-back/page.tsx'}));
    expect(back.data.files).toEqual(expect.arrayContaining(['reach-back/types.ts', 'reach-back/rows.js']));
    expect(back.data).toMatchObject({exact: false, missing: ['../sheets/site.scss']});
  });
});

describe('text edits', () => {
  it('pairs replaced runs, keeps the order, and caps the list', () => {
    expect(textEdits(['a', 'b', 'c'], ['a', 'B', 'c'])).toEqual({edits: [{was: 'b', now: 'B'}], more: 0});
    expect(textEdits(['a', 'b'], ['a', 'b', 'c'])).toEqual({edits: [{was: null, now: 'c'}], more: 0});
    const many = Array.from({length: 80}, (_, i) => `row ${i}`);
    const {edits, more} = textEdits(many, many.map(t => `${t}!`));
    expect(edits).toHaveLength(50);
    expect(more).toBe(30);
  });
});
