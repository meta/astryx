// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A family member named by short words is found by them spelled out:
 * "vertical stack" is VStack, whose own description says so, and a member whose
 * name is its head word after single letters is a match for that head word.
 * The same holds for any integration's members, which no learned weights know.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {search} from './search.mjs';

const SLOW = 60_000;

describe('family members found by their spelled-out names', () => {
  it.each([
    ['vertical stack', 'VStack'],
    ['horizontal stack', 'HStack'],
  ])('`%s` ranks %s first', async (query, name) => {
    const {results} = (await search(query)).data;
    expect(results[0], JSON.stringify(results.slice(0, 3))).toMatchObject({
      domain: 'component',
      name,
    });
  });

  it('`stack` keeps Stack first and lists VStack and HStack', async () => {
    const {results} = (await search('stack')).data;
    expect(results[0]).toMatchObject({domain: 'component', name: 'Stack'});
    const top = results.slice(0, 8).map(r => r.name);
    expect(top).toContain('VStack');
    expect(top).toContain('HStack');
  });

  it('only a single-letter word is spelled out', async () => {
    // "without" begins with "With" but spells out no letter of the name.
    const {results} = (await search('checkbox list without end content')).data;
    expect(results[0]?.reason).not.toMatch(/spelled out/);
  });

  it('a longer query keeps Stack first', async () => {
    // Stack in VStack counts as a keyword hit only when it is the whole query.
    const {results} = (await search('vertical stack of cards')).data;
    expect(results[0]).toMatchObject({domain: 'component', name: 'Stack'});
  });

  it("a longer query does not lift a head word's members", async () => {
    const {results} = (await search('stack direction')).data;
    const top = results.slice(0, 3).map(r => r.name);
    expect(top).not.toContain('VStack');
    expect(top).not.toContain('HStack');
  });

  it('a word the description does not spell out is no name', async () => {
    const {results} = (await search('visual stack')).data;
    expect(results[0]?.name).not.toBe('VStack');
  });
});

describe("an integration's family members (cold start)", () => {
  /** @type {string} */
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-family-members-'));
    const pkg = path.join(dir, 'node_modules', '@acme', 'grids');
    fs.mkdirSync(path.join(pkg, 'components'), {recursive: true});
    fs.mkdirSync(
      path.join(dir, 'node_modules', '@astryxdesign', 'core', 'src'),
      {
        recursive: true,
      },
    );
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"consumer"}');
    fs.writeFileSync(
      path.join(dir, 'astryx.config.mjs'),
      "export default { integrations: ['@acme/grids'] };\n",
    );
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      '{"name":"@acme/grids","version":"1.0.0"}',
    );
    fs.writeFileSync(
      path.join(pkg, 'astryx.integration.mjs'),
      "export default { components: './components' };\n",
    );
    for (const [name, description] of [
      ['VGrid', 'Vertical grid for arranging tiles in columns.'],
      ['HGrid', 'Horizontal grid for arranging tiles in rows.'],
    ]) {
      fs.writeFileSync(
        path.join(pkg, 'components', `${name}.doc.mjs`),
        `export default {
          type: 'component',
          name: '${name}',
          usage: {description: '${description}'},
          props: [],
        };\n`,
      );
      fs.writeFileSync(
        path.join(pkg, 'components', `${name}.tsx`),
        `export function ${name}() { return null; }\n`,
      );
    }
  });
  afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

  it.each([
    ['vertical grid', 'VGrid'],
    ['horizontal grid', 'HGrid'],
  ])(
    '`%s` ranks %s first',
    async (query, name) => {
      const {results} = (await search(query, {cwd: dir, type: 'component'}))
        .data;
      expect(results[0], JSON.stringify(results.slice(0, 3))).toMatchObject({
        name,
      });
    },
    SLOW,
  );
});
