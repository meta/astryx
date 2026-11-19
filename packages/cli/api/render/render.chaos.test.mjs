// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What happens to a rendered file on its way, and what `--reverse`
 * answers for each: a copy a mailer, a minifier, an editor, a merge or a cut
 * download made. The page comes back exactly, `edited` saying whether its
 * markup changed, or the file is refused with nothing written. A file is
 * never rebuilt from part of a page without saying so.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {makeLinkedFixture, removeLinkedFixture} from '../../test-utils/linked-fixture.mjs';

/** @type {string} */
let dir;
/** @type {string} */
let html;

/** @param {string} name @param {string | Buffer} content */
const put = (name, content) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return file;
};

// A 1×1 PNG.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cf00000301010018dd8db40000000049454e44ae426082',
  'hex',
);

/** The page, and every file it carries, by its path in the page's folder. */
const FILES = {
  'page.tsx': `import {Heading, Text} from '@astryxdesign/core/Text';
import {Kpi} from './sections/Kpi';
import rows from './data/rows.json';
import logo from './logo.png';
import './page.css';

export default function Report() {
  return (
    <main className="report">
      <Heading level={1}>Quarterly report</Heading>
      <img src={logo} alt="" />
      <Text>Revenue grew in every region this quarter.</Text>
      {rows.map(row => (
        <Kpi key={row.label} label={row.label} value={row.value} />
      ))}
    </main>
  );
}
`,
  'sections/Kpi.tsx': `import {Text} from '@astryxdesign/core/Text';

export function Kpi({label, value}: {label: string; value: string}) {
  return (
    <section>
      <Text>{label}</Text>
      <Text>{value}</Text>
    </section>
  );
}
`,
  'data/rows.json': '[{"label": "North", "value": "1.2M"}, {"label": "South", "value": "0.9M"}]\n',
  'page.css': '.report { letter-spacing: 1px; }\n',
};

/** Where the embedded source block starts in the rendered file. */
const blockAt = () => html.indexOf('<script type="application/x-astryx-source"');

/**
 * Each copy, and what --reverse answers for it: `back` for a page that comes
 * back exactly (`edited` as given), or the code of a refusal that writes
 * nothing.
 * @type {[string, () => string, {back: true, edited: boolean, stylesEdited?: boolean} | {code: string} | {rebuilt: true}][]}
 */
const COPIES = [
  ['with CRLF line ends', () => html.replace(/\n/g, '\r\n'), {back: true, edited: false}],
  ['with a byte order mark', () => `\uFEFF${html}`, {back: true, edited: false}],
  ['with every comment taken out', () => html.replace(/<!--[\s\S]*?-->/g, ''), {back: true, edited: false}],
  [
    'with its script tag rewritten by a minifier',
    () => html.replace('<script type="application/x-astryx-source">', '<script data-kind=source type=application/x-astryx-source>'),
    {back: true, edited: false},
  ],
  ['with its tags in capitals', () => html.replace('<script type="application/x-astryx-source">', '<SCRIPT TYPE="APPLICATION/X-ASTRYX-SOURCE">').replace(/<\/script>(?=[^]*$)/, '</SCRIPT>'), {back: true, edited: false}],
  ['with a word changed', () => html.replace('Revenue grew', 'Revenue rose'), {back: true, edited: true}],
  ['with a style changed', () => html.replace(/letter-spacing:\s*1px/, 'letter-spacing:2px'), {back: true, edited: true, stylesEdited: true}],
  ['with an edit that leaves a comment open', () => html.replace('</h1>', '</h1><!-- check this'), {back: true, edited: true}],
  ['cut inside its embedded source', () => html.slice(0, blockAt() + 200), {code: 'ERR_RENDER_SOURCE_DAMAGED'}],
  ['cut before its embedded source', () => html.slice(0, blockAt() - 40), {code: 'ERR_RENDER_SOURCE_DAMAGED'}],
  [
    'left with merge conflict markers',
    () => {
      const lines = html.split('\n');
      const at = lines.findIndex(line => line.includes('application/x-astryx-source'));
      return [...lines.slice(0, at), '<<<<<<< HEAD', lines[at], '=======', lines[at], '>>>>>>> theirs', ...lines.slice(at + 1)].join('\n');
    },
    {code: 'ERR_RENDER_SOURCE_DAMAGED'},
  ],
  [
    'with one character of its source changed',
    () => {
      const at = html.indexOf('"base64":"') + 20;
      return html.slice(0, at) + (html[at] === 'A' ? 'B' : 'A') + html.slice(at + 1);
    },
    {code: 'ERR_RENDER_SOURCE_DAMAGED'},
  ],
  ['with its embedded source taken out', () => html.slice(0, blockAt()) + html.slice(html.indexOf('</script>', blockAt()) + '</script>'.length), {rebuilt: true}],
];

beforeAll(async () => {
  dir = makeLinkedFixture('astryx-render-chaos-', ['@astryxdesign', '@stylexjs', 'react', 'react-dom']);
  for (const [name, text] of Object.entries(FILES)) put(`report/${name}`, text);
  put('report/logo.png', PNG);
  await render('report/page.tsx', {cwd: dir});
  html = fs.readFileSync(path.join(dir, 'report/page.html'), 'utf8');
}, 60_000);

afterAll(() => {
  removeLinkedFixture(dir);
});

describe('render --reverse: a rendered file after its trip', () => {
  it.each(COPIES)('a copy %s', async (name, copy, expected) => {
    const slug = name.replace(/[^a-z0-9]+/gi, '-');
    put(`copies/${slug}.html`, copy());
    const out = `back/${slug}`;
    if ('code' in expected) {
      /** @type {any} */
      let refused;
      try {
        await render(`copies/${slug}.html`, {cwd: dir, reverse: true, out: `${out}/page.tsx`});
      } catch (e) {
        refused = e;
      }
      expect(refused?.code).toBe(expected.code);
      expect(fs.existsSync(path.join(dir, out))).toBe(false);
      return;
    }
    const back = /** @type {any} */ (await render(`copies/${slug}.html`, {cwd: dir, reverse: true, out: `${out}/page.tsx`})).data;
    if ('rebuilt' in expected) {
      expect(back.mode).toBe('rebuilt');
      expect(back.exact).toBe(false);
      return;
    }
    expect(back).toMatchObject({mode: 'embedded', exact: true, edited: expected.edited});
    if (expected.stylesEdited) expect(back.stylesEdited).toBe(true);
    for (const name of [...Object.keys(FILES), 'logo.png']) {
      expect(fs.readFileSync(path.join(dir, out, name)), name).toEqual(fs.readFileSync(path.join(dir, 'report', name)));
    }
  }, 60_000);

  it('gives the page back from a copy moved to another folder under another name', async () => {
    put('elsewhere/deep/Quarterly Report (final).html', html);
    const back = /** @type {any} */ (await render('elsewhere/deep/Quarterly Report (final).html', {cwd: dir, reverse: true})).data;
    expect(back).toMatchObject({mode: 'embedded', exact: true, edited: false, output: 'elsewhere/deep/Quarterly Report (final)-restored/page.tsx'});
  }, 60_000);
});
