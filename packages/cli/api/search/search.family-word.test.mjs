// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A query naming a family lists the first three members its family doc
 * names, after the family's own entry: the family doc names them, so
 * this holds with no component of the family's name (Chat) and for any
 * integration's family, which no learned weights know.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {search} from './search.mjs';

const SLOW = 60_000;

/** @param {{name: string, reason: string}[]} results */
const members = results =>
  results.filter(r => /^member of /.test(r.reason)).map(r => r.name);

describe('a family word lists its first members', () => {
  it('`table` keeps Table first and lists three of its members', async () => {
    const {results} = (await search('table')).data;
    expect(results[0]).toMatchObject({domain: 'component', name: 'Table'});
    expect(members(results)).toHaveLength(3);
  });

  it('`chat` lists Chat members though no Chat component exists', async () => {
    const {results} = (await search('chat')).data;
    const top = results.slice(0, 5).map(r => r.name);
    expect(top.filter(n => n.startsWith('Chat')).length).toBeGreaterThan(0);
    expect(members(results)).toHaveLength(3);
  });
});

describe('a family word keeps its members ahead of passing doc sections', () => {
  it('`selector` lists SelectorOption before any doc section', async () => {
    const {results} = (await search('selector')).data;
    const member = results.findIndex(r => r.name === 'SelectorOption');
    const section = results.findIndex(r => r.domain === 'doc');
    expect(member).toBeGreaterThan(-1);
    expect(member).toBeLessThan(5);
    if (section !== -1) expect(section).toBeGreaterThan(member);
  });
});

describe('a synonym of a family name names no family', () => {
  it.each(['message', 'messages'])(
    '`%s` lists no member above the entries that declare it',
    async query => {
      const {results} = (await search(query)).data;
      const top = results.slice(0, 5);
      expect(top.some(r => /^member of /.test(r.reason))).toBe(false);
    },
  );
});

describe("an integration's family (cold start)", () => {
  /** @type {string} */
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-family-word-'));
    const pkg = path.join(dir, 'node_modules', '@acme', 'plots');
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
      "export default { integrations: ['@acme/plots'] };\n",
    );
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      '{"name":"@acme/plots","version":"1.0.0","main":"components/Plot.tsx"}',
    );
    fs.writeFileSync(
      path.join(pkg, 'astryx.integration.mjs'),
      "export default { components: './components' };\n",
    );
    const names = ['Plot', 'PlotAxis', 'PlotLegend', 'PlotLine', 'PlotTooltip'];
    // A member with a doc of its own, which the family doc names by name.
    fs.writeFileSync(
      path.join(pkg, 'components', 'PlotTitle.doc.mjs'),
      `export default {
        type: 'component',
        name: 'PlotTitle',
        usage: {description: 'The title above a plot.'},
        props: [],
      };\n`,
    );
    fs.writeFileSync(
      path.join(pkg, 'components', 'PlotTitle.tsx'),
      'export function PlotTitle() {\n  return null;\n}\n',
    );
    fs.writeFileSync(
      path.join(pkg, 'components', 'Plot.doc.mjs'),
      `export default {
        type: 'component',
        name: 'Plot',
        import: '@acme/plots',
        usage: {description: 'A plot of data series.'},
        props: [],
        components: ${JSON.stringify([
          ...names.slice(0, 1).map(name => ({
            name,
            usage: {description: `The ${name} part of a plot.`},
            props: [],
          })),
          {name: 'PlotTitle'},
          ...names.slice(1).map(name => ({
            name,
            usage: {description: `The ${name} part of a plot.`},
            props: [],
          })),
        ])},
      };\n`,
    );
    fs.writeFileSync(
      path.join(pkg, 'components', 'Plot.tsx'),
      names.map(n => `export function ${n}() {\n  return null;\n}\n`).join(''),
    );
  });
  afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

  it(
    '`plot` lists the first three members its doc names, after Plot',
    async () => {
      const {results} = (await search('plot', {cwd: dir, type: 'component'}))
        .data;
      // The first three members the doc lists, one with a doc of its own.
      expect(results[0]).toMatchObject({name: 'Plot'});
      expect(
        results
          .slice(1, 4)
          .map(r => r.name)
          .sort(),
      ).toEqual(['PlotAxis', 'PlotLegend', 'PlotTitle']);
    },
    SLOW,
  );
});
