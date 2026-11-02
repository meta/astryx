// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The template.copy receipt discloses replaced demo media and demo
 * content. Templates are picked by what their source contains, not by slug, so
 * catalog renames do not break the suite.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {template, discoverTemplates} from '../template.mjs';
import {templateCopy} from './copy.mjs';
import {templateShow} from '../show/show.mjs';
import {templateSkeleton} from '../skeleton/skeleton.mjs';
import {DEMO_CONTENT_MODULE} from '../../../foundation/discovery/template-adapter.mjs';

const SLOW = 60_000;
const FIXTURE_REF = /\/template-assets\/[\w.-]+\.(\w+)/g;
const VIDEO = new Set(['mp4', 'webm', 'mov', 'ogv', 'm4v']);

/** @param {string} filePath */
const fixtureRefs = filePath =>
  [...fs.readFileSync(filePath, 'utf-8').matchAll(FIXTURE_REF)].map(m =>
    m[1].toLowerCase(),
  );

/**
 * @param {(refs: string[]) => boolean} predicate
 * @param {'page' | 'block'} type
 */
async function findTemplate(type, predicate) {
  const all = /** @type {Array<{dirName: string, type: string, filePath: string}>} */ (
    await discoverTemplates()
  );
  const ids = new Map();
  for (const t of all) ids.set(t.dirName, (ids.get(t.dirName) ?? 0) + 1);
  const found = all.find(
    t =>
      t.type === type &&
      ids.get(t.dirName) === 1 &&
      fs.existsSync(t.filePath) &&
      predicate(fixtureRefs(t.filePath)),
  );
  if (!found) throw new Error(`no ${type} template matches`);
  return {id: found.dirName, refs: fixtureRefs(found.filePath)};
}

describe('template.copy receipt — replaced demo media', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmpl-receipt-'));
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  it('counts every demo image a page template carried, and leaves none behind', async () => {
    const {id, refs} = await findTemplate(
      'page',
      r => r.length > 0 && r.every(ext => !VIDEO.has(ext)),
    );
    const res = await template(id, {targetPath: './dest', cwd: dir});
    expect(res.type).toBe('template.copy');
    expect(res.data.demoMediaReplaced).toBe(refs.length);
    expect(
      fs.readFileSync(path.join(dir, 'dest', 'page.tsx'), 'utf-8'),
    ).not.toContain('/template-assets/');
  }, SLOW);

  it('counts a demo video in a block template', async () => {
    const {id, refs} = await findTemplate('block', r => r.some(ext => VIDEO.has(ext)));
    const res = await template(id, {targetPath: './dest', cwd: dir});
    expect(res.data.demoMediaReplaced).toBe(refs.length);
  }, SLOW);

  it('reports 0 when the template carries no demo media', async () => {
    const {id} = await findTemplate('page', r => r.length === 0);
    const res = await template(id, {targetPath: './dest', cwd: dir});
    expect(res.data.demoMediaReplaced).toBe(0);
  }, SLOW);
});

describe('template.copy receipt — replaced demo content', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmpl-receipt-'));
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  const SOURCE =
    "import {Card} from '@astryxdesign/core/Card';\n" +
    `import {PlayingCardContents} from '${DEMO_CONTENT_MODULE}';\n\n` +
    'export default function CardDemo() {\n' +
    '  return <Card><PlayingCardContents rank="Q" suit="hearts" /></Card>;\n' +
    '}\n';

  /** @returns {any} a resolved block whose source carries demo content */
  function demoBlock() {
    const filePath = path.join(dir, 'src', 'CardDemo.tsx');
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, SOURCE);
    return {dirName: 'CardDemo', type: 'block', filePath, description: ''};
  }

  it('counts each demo-content element and writes the placeholder, not the demo import', () => {
    const res = templateCopy(demoBlock(), {targetPath: './dest', cwd: dir});
    expect(res.data.demoContentReplaced).toBe(1);
    expect(res.data.demoMediaReplaced).toBe(0);
    const written = fs.readFileSync(
      path.join(dir, 'dest', 'CardDemo.tsx'),
      'utf-8',
    );
    expect(written).toContain('<Card><Text>Card content</Text></Card>');
    expect(written).toContain("import {Text} from '@astryxdesign/core/Text';");
    expect(written).not.toContain(DEMO_CONTENT_MODULE);
    expect(written).not.toContain('PlayingCardContents');
  });

  it('show returns the same source the copy writes, with the same count', () => {
    const match = demoBlock();
    const shown = templateShow(match);
    templateCopy(match, {targetPath: './dest', cwd: dir});
    expect(shown.data.demoContentReplaced).toBe(1);
    expect(shown.data.source).toBe(
      fs.readFileSync(path.join(dir, 'dest', 'CardDemo.tsx'), 'utf-8'),
    );
  });

  const PAGE_SOURCE =
    "import {Card} from '@astryxdesign/core/Card';\n" +
    "import {Badge} from '@astryxdesign/core/Badge';\n" +
    `import {PlayingCardContents} from '${DEMO_CONTENT_MODULE}';\n\n` +
    'export default function CardDemo() {\n' +
    '  return (\n' +
    '    <Card padding={4}>\n' +
    '      <Badge label="New" />\n' +
    '      <PlayingCardContents rank="Q" suit="hearts" />\n' +
    '    </Card>\n' +
    '  );\n' +
    '}\n';

  /** @returns {any} a resolved page whose source carries demo content */
  function demoPage() {
    const filePath = path.join(dir, 'src', 'CardPage.tsx');
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, PAGE_SOURCE);
    return {dirName: 'CardPage', type: 'page', filePath, description: ''};
  }

  it('show lists the components of the source it returns, not the demo content it replaced', () => {
    const {data} = templateShow(demoPage());
    expect(data.source).not.toContain('PlayingCardContents');
    expect(data.components).toEqual(['Badge', 'Card']);
  });

  it('skeleton lists, and lays out, the components of the replaced source', () => {
    const {data} = templateSkeleton(demoPage(), []);
    expect(data.components).toEqual(['Badge', 'Card']);
    expect(data.skeleton).not.toContain('PlayingCardContents');
    expect(data.skeleton).toContain('<Card padding={4}>');
  });

  /** @returns {any} a resolved page that writes its own `Text` beside demo content */
  function demoPageWithOwnText() {
    const filePath = path.join(dir, 'src', 'OwnTextPage.tsx');
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    const source = `import {Text} from './Text';\n${PAGE_SOURCE}`;
    fs.writeFileSync(filePath, source.replace('/>\n', '/>\n      <Text>Note</Text>\n'));
    return {dirName: 'OwnTextPage', type: 'page', filePath, description: ''};
  }

  it('show and skeleton list the canonical name, not the placeholder alias, when the file writes Text', () => {
    const match = demoPageWithOwnText();
    const shown = templateShow(match).data;
    expect(shown.source).toContain("import {Text as AstryxText} from '@astryxdesign/core/Text';");
    expect(shown.components).toEqual(['Badge', 'Card']);
    expect(templateSkeleton(match, []).data.components).toEqual(['Badge', 'Card']);
  });

  it('reports 0 for a catalog template that carries no demo content', async () => {
    const {id} = await findTemplate('page', r => r.length === 0);
    const res = await template(id, {targetPath: './dest', cwd: dir});
    expect(res.data.demoContentReplaced).toBe(0);
  }, SLOW);
});
