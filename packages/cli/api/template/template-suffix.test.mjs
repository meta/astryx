// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The canonical `.doc.{mjs,ts,js}` suffix is discovered identically
 * to the released `.template.{ts,mjs,js}` compatibility suffix.
 *
 * New authoring writes `.doc.mjs`, the canonical typed descriptor. Stable
 * 0.6.0 already accepted `.template.*`, so these tests
 * keep that family as a compatibility input and assert equivalent discovery +
 * scaffolding.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {template, findShowcase, findRelatedBlocks} from './template.mjs';

let tmpDir;
let originalCwd;

function makeConsumer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-template-suffix-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    `export default { integrations: ['@acme/widgets'] };\n`,
  );
  return dir;
}

function installWidgets(consumerDir) {
  const pkgDir = path.join(consumerDir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(path.join(pkgDir, 'templates'), {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '2.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    `export default { templates: './templates' };\n`,
  );
  return pkgDir;
}

/**
 * Write a template-spec file (default-export a stamped `type: 'page' | 'block'`
 * object) plus its same-stem `.tsx` source under the templates root.
 * @param {string} pkgDir
 * @param {string} id
 * @param {{kind: 'page'|'block', suffix: string}} opts
 */
function writeTemplate(pkgDir, id, {kind, suffix}) {
  const docPath = path.join(pkgDir, 'templates', `${id}${suffix}`);
  fs.mkdirSync(path.dirname(docPath), {recursive: true});
  fs.writeFileSync(
    docPath,
    `export default {type: '${kind}', name: '${id} name', description: '${id} desc'};\n`,
  );
  fs.writeFileSync(
    path.join(pkgDir, 'templates', `${id}.tsx`),
    `export default function ${id.replace(/[^a-zA-Z0-9]/g, '')}() { return null; }\n`,
  );
}

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = makeConsumer();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('integration templates: canonical .doc.* plus released .template.* compatibility', () => {
  for (const suffix of ['.doc.mjs', '.doc.ts', '.template.mjs']) {
    it(`discovers + lists a page template authored as ${suffix}`, async () => {
      const pkgDir = installWidgets(tmpDir);
      writeTemplate(pkgDir, 'pricing', {kind: 'page', suffix});

      const result = await template(undefined, {list: true, cwd: tmpDir});
      const entry = result.data.find(t => t.id === 'pricing');
      expect(entry).toBeTruthy();
      expect(entry.type).toBe('page');
      expect(entry.package).toBe('@acme/widgets');
      expect(entry.name).toBe('pricing name');
      expect(entry.description).toBe('pricing desc');
    });

    it(`scaffolds a page template authored as ${suffix}`, async () => {
      const pkgDir = installWidgets(tmpDir);
      writeTemplate(pkgDir, 'pricing', {kind: 'page', suffix});

      const result = await template('pricing', {
        targetPath: './dest',
        cwd: tmpDir,
      });
      expect(result.type).toBe('template.copy');
      expect(result.data.fileName).toBe('page.tsx');
      expect(fs.existsSync(path.join(tmpDir, 'dest', 'page.tsx'))).toBe(true);
    });

    it(`scaffolds a nested block template authored as ${suffix}`, async () => {
      const pkgDir = installWidgets(tmpDir);
      writeTemplate(pkgDir, 'marketing/hero', {kind: 'block', suffix});

      const result = await template('marketing/hero', {
        targetPath: './dest',
        cwd: tmpDir,
      });
      expect(result.type).toBe('template.copy');
      expect(result.data.fileName).toBe('hero.tsx');
      expect(fs.existsSync(path.join(tmpDir, 'dest', 'hero.tsx'))).toBe(true);
    });
  }

  it('treats canonical .doc.mjs and released .template.ts identically (same shape)', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'gauge', {kind: 'block', suffix: '.template.ts'});
    writeTemplate(pkgDir, 'chip', {kind: 'block', suffix: '.doc.mjs'});

    const result = await template(undefined, {list: true, cwd: tmpDir});
    const gauge = result.data.find(t => t.id === 'gauge');
    const chip = result.data.find(t => t.id === 'chip');

    // Both discovered, both blocks, both from the same package, both ready.
    for (const entry of [gauge, chip]) {
      expect(entry).toBeTruthy();
      expect(entry.type).toBe('block');
      expect(entry.package).toBe('@acme/widgets');
    }
    // Field-by-field parity apart from the (intentionally different) id/name.
    expect(gauge.type).toBe(chip.type);
    expect(gauge.package).toBe(chip.package);
  });
  it('lists both same-stem specs and reads the id as ambiguous', async () => {
    for (const [first, second] of [
      ['.doc.mjs', '.template.ts'],
      ['.doc.ts', '.doc.mjs'],
    ]) {
      const pkgDir = installWidgets(tmpDir);
      fs.rmSync(path.join(pkgDir, 'templates'), {recursive: true, force: true});
      writeTemplate(pkgDir, 'pricing', {kind: 'page', suffix: first});
      writeTemplate(pkgDir, 'pricing', {kind: 'page', suffix: second});

      const result = await template(undefined, {list: true, cwd: tmpDir});
      expect(
        result.data.filter(entry => entry.id === 'pricing'),
        `${first} + ${second}`,
      ).toHaveLength(2);
      await expect(
        template('pricing', {cwd: tmpDir}),
        `${first} + ${second}`,
      ).rejects.toMatchObject({code: 'ERR_AMBIGUOUS_TEMPLATE'});
    }
  });
});

describe('external showcase blocks: canonical .doc.* plus released .template.* compatibility', () => {
  /**
   * Create a consumer whose @test/ext package contributes two showcase blocks,
   * one authored with released `Foo.template.ts` and one with canonical `Bar.doc.mjs`.
   */
  function makeShowcaseFixture() {
    // Symlink the real core package (needed by findCoreDir during discovery).
    const realCoreDir = path.resolve(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'core',
    );
    const coreDir = path.join(tmpDir, 'packages', 'core');
    fs.mkdirSync(path.dirname(coreDir), {recursive: true});
    fs.symlinkSync(realCoreDir, coreDir);

    const extDir = path.join(tmpDir, 'node_modules', '@test', 'ext');
    const blocksDir = path.join(extDir, 'blocks', 'components');

    // Foo showcase — released .template.ts compatibility input.
    const fooDir = path.join(blocksDir, 'Foo');
    fs.mkdirSync(fooDir, {recursive: true});
    fs.writeFileSync(
      path.join(fooDir, 'FooShowcase.template.ts'),
      `export default {\n` +
        `  type: 'block',\n` +
        `  name: 'Foo — Showcase',\n` +
        `  description: 'Foo showcase.',\n` +
        `  isShowcase: true,\n` +
        `  aspectRatio: 16 / 9,\n` +
        `  componentsUsed: ['Foo'],\n` +
        `};\n`,
    );
    fs.writeFileSync(
      path.join(fooDir, 'FooShowcase.tsx'),
      "'use client';\nexport default function FooShowcase() { return <div>Foo</div>; }",
    );

    // Bar showcase — canonical .doc.mjs (historical named export).
    const barDir = path.join(blocksDir, 'Bar');
    fs.mkdirSync(barDir, {recursive: true});
    fs.writeFileSync(
      path.join(barDir, 'BarShowcase.doc.mjs'),
      `export const doc = {\n` +
        `  type: 'block',\n` +
        `  name: 'Bar — Showcase',\n` +
        `  description: 'Bar showcase.',\n` +
        `  isReady: true,\n` +
        `  isShowcase: true,\n` +
        `  aspectRatio: 4 / 3,\n` +
        `  componentsUsed: ['Bar', 'Chip'],\n` +
        `};\n`,
    );
    fs.writeFileSync(
      path.join(barDir, 'BarShowcase.tsx'),
      "'use client';\nexport default function BarShowcase() { return <div>Bar</div>; }",
    );

    fs.writeFileSync(
      path.join(extDir, 'package.json'),
      JSON.stringify({
        name: '@test/ext',
        astryx: {
          docs: './src',
          category: 'Common',
          blocks: './blocks/components',
        },
      }),
    );
    fs.mkdirSync(path.join(extDir, 'src'), {recursive: true});
  }

  it('findShowcase resolves a .template.ts external block by directory name', async () => {
    makeShowcaseFixture();
    const result = await findShowcase('Foo', tmpDir);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Foo — Showcase');
    expect(result.filePath).toContain('FooShowcase.tsx');
  });

  it('findShowcase resolves a canonical .doc.mjs external block by componentsUsed', async () => {
    makeShowcaseFixture();
    const result = await findShowcase('Bar', tmpDir);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Bar — Showcase');
  });

  it('findShowcase prefers the showcase that names the component in exampleFor', async () => {
    makeShowcaseFixture();
    // Bar's showcase also uses Chip; Chip's own showcase sits in a folder
    // that does not carry its name and says so only through exampleFor.
    const dir = path.join(
      tmpDir,
      'node_modules',
      '@test',
      'ext',
      'blocks',
      'components',
      'Gallery',
    );
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'ChipCard.doc.mjs'),
      "export default {type: 'block', name: 'Chip — Card', description: 'Chip showcase.', category: 'Test - Showcases', exampleFor: 'Chip', isShowcase: true, componentsUsed: ['Chip']};\n",
    );
    fs.writeFileSync(
      path.join(dir, 'ChipCard.tsx'),
      "'use client';\nexport default function ChipCard() { return <div>Chip</div>; }",
    );
    const result = await findShowcase('Chip', tmpDir);
    expect(result?.name).toBe('Chip — Card');
  });

  it('findRelatedBlocks finds both suffix families', async () => {
    makeShowcaseFixture();
    const foo = await findRelatedBlocks('Foo', tmpDir);
    expect(foo.map(b => b.dirName)).toContain('FooShowcase');
    const chip = await findRelatedBlocks('Chip', tmpDir);
    expect(chip.map(b => b.dirName)).toContain('BarShowcase');
  });
});
