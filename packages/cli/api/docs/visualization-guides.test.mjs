// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Check palette and chart-styling guide discovery, focused reads, and renderer-guide links. */
import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {docs} from './docs.mjs';
import {docs as palette} from '../../assets/docs/tree/choosing-data-colors.doc.mjs';
import {docs as styling} from '../../assets/docs/tree/chart-styling.doc.mjs';
import {docs as renderer} from '../../assets/docs/tree/data-colors-in-renderers.doc.mjs';
import {namespacePage} from '../../../../apps/docsite/scripts/docs-pages.mjs';

const SLOW = 30_000;

describe('visualization palette and styling guides', () => {
  it(
    'keeps delivery first and puts palette and styling in the same namespace',
    async () => {
      const res = await docs('visualization');
      const children = res.data.slots.flatMap(slot => slot.children);
      expect(children.map(c => c.route)).toEqual([
        'visualization/data-colors-in-renderers',
        'visualization/choosing-data-colors',
        'visualization/chart-styling',
      ]);
    },
    SLOW,
  );

  it(
    'reads every new section directly and through its namespace',
    async () => {
      for (const guide of [palette, styling]) {
        for (const section of guide.sections) {
          const direct = await docs(`visualization/${guide.name}`, section.id);
          expect(direct.type).toBe('docs.detail.section');
          expect(direct.data.title).toBe(section.title);
          const viaNamespace = await docs('visualization', section.id);
          expect(viaNamespace.data.content).toEqual(direct.data.content);
        }
      }
    },
    SLOW,
  );

  it(
    'puts both guides on the visualization docsite page with redirecting slugs',
    async () => {
      const result = await namespacePage(docs, 'visualization');
      expect(result.page.topic).toBe('visualization');
      const titles = result.page.sections.map(section => section.title);
      expect(titles).toEqual([
        ...renderer.sections.map(s => s.title),
        ...palette.sections.map(s => s.title),
        ...styling.sections.map(s => s.title),
      ]);
      expect(result.redirects['visualization-choosing-data-colors']).toBe(
        '/docs/visualization#match-the-color-scale-to-the-data',
      );
      expect(result.redirects['visualization-chart-styling']).toBe(
        '/docs/visualization#match-each-chart-part-to-an-existing-role',
      );
    },
    SLOW,
  );

  it('lists every canonical data token without inventing a palette family', () => {
    const source = readFileSync(
      new URL('../../../core/src/theme/dataTokens.stylex.ts', import.meta.url),
      'utf8',
    );
    const canonical = [...source.matchAll(/'(--color-data-[a-z0-9-]+)':/g)].map(
      match => match[1],
    );
    const documented = new Set(
      JSON.stringify(palette).match(/--color-data-[a-z0-9-]+/g),
    );
    expect(canonical).toHaveLength(56);
    expect([...documented].sort()).toEqual(canonical.sort());
    expect(palette.sections.map(section => section.id)).toEqual([
      'match-color-to-data',
      'data-color-sets',
      'categorical-token-reference',
      'use-a-sequential-ramp',
      'reference-token-semantics',
      'semantic-data-colors',
      'diverging-data-colors',
      'spectrum-data-colors',
      'heatmap-data-colors',
      'sequential-use-cases',
      'keep-color-readable',
    ]);
    const overview = JSON.stringify(palette.sections[1]);
    expect(overview).toContain(
      'not additional token families or approved palette defaults',
    );
    expect(overview).toContain('Themes can replace either value');
  });

  it('keeps the native ramp direction and exact composed recipes explicit', () => {
    const section = id => palette.sections.find(item => item.id === id);
    const codeTokens = (id, index = 0) => {
      const code = section(id).content.filter(block => block.type === 'code')[
        index
      ].code;
      return [...code.matchAll(/'(--color-data-[a-z0-9-]+)'/g)].map(
        match => match[1],
      );
    };
    const stops = (hue, order) =>
      order.map(stop => `--color-data-${hue}-${stop}`);
    const lightToDark = [1, 2, 3, 4, 5];
    const darkToLight = [5, 4, 3, 2, 1];
    const ramps = section('use-a-sequential-ramp').content.find(
      block => block.type === 'table',
    );
    expect(ramps.rows.map(row => row.slice(1))).toEqual(
      [
        'blue',
        'teal',
        'purple',
        'pink',
        'orange',
        'shamrock',
        'red',
        'yellow',
        'gray',
      ].map(hue => stops(hue, lightToDark).map(token => `\`${token}\``)),
    );
    expect(codeTokens('categorical-token-reference')).toEqual([
      '--color-data-categorical-blue',
      '--color-data-categorical-orange',
      '--color-data-purple-4',
      '--color-data-pink-4',
      '--color-data-blue-4',
      '--color-data-categorical-teal',
      '--color-data-purple-3',
      '--color-data-pink-5',
      '--color-data-categorical-cyan',
      '--color-data-purple-5',
      '--color-data-categorical-brown',
    ]);
    expect(codeTokens('diverging-data-colors')).toEqual([
      ...stops('orange', darkToLight),
      '--color-data-gray-1',
      ...stops('blue', lightToDark),
    ]);
    expect(codeTokens('diverging-data-colors', 1)).toEqual([
      ...stops('pink', darkToLight),
      '--color-data-gray-1',
      ...stops('shamrock', lightToDark),
    ]);
    const spectrum = codeTokens('spectrum-data-colors');
    expect(spectrum).toEqual([
      '--color-data-yellow-1',
      '--color-data-shamrock-1',
      '--color-data-shamrock-2',
      '--color-data-shamrock-2',
      '--color-data-teal-3',
      '--color-data-blue-3',
      '--color-data-categorical-blue',
      '--color-data-blue-4',
      '--color-data-blue-5',
      '--color-data-blue-5',
    ]);
    expect(new Set(spectrum).size).toBe(8);
    const semantic = section('semantic-data-colors');
    expect(
      semantic.content.find(block => block.type === 'table').rows[1][1],
    ).toBe('`--color-data-yellow-4`');
    expect(JSON.stringify(semantic)).toContain(
      'not a categorical yellow token or an approved warning default',
    );
    const heatmap = JSON.stringify(section('heatmap-data-colors'));
    expect(heatmap).toContain('25%, 37.5%, 50%, 62.5%, 75%, 87.5%, and 100%');
    expect(heatmap).toContain('fill only, not to the whole cell and its text');
    expect(heatmap).toContain('Transparency blends with the real surface');
  });

  it('links renderer delivery to the two styling decisions without duplicating its code', () => {
    const text = JSON.stringify(renderer.sections[0]);
    expect(text).toContain('{@link generic:choosing-data-colors}');
    expect(text).toContain('{@link generic:chart-styling}');
    expect(text).not.toContain(
      'Which token suits which part of a chart is not covered yet',
    );
    expect(renderer.sections.map(s => s.id)).toEqual([
      'choose-a-path',
      'use-datavars',
      'use-raw-css-variables',
      'draw-canvas-with-resolved-colors',
      'configure-vega-lite',
    ]);
  });

  it('separates data order, unavailable values, UI-label defaults, and example emphasis', () => {
    const p = JSON.stringify(palette);
    const s = JSON.stringify(styling);
    expect(p).toContain('count === null');
    expect(p).toContain('not zero');
    expect(p).toContain('not the chart’s bin order');
    expect(s).toContain('Text type=\\"label\\"');
    expect(s).toContain('defaults to primary');
    expect(s).toContain('not a change to those component defaults');
    expect(s).toContain(
      "const labelColor = colorVars['--color-text-secondary']",
    );
    expect(s).toContain('content={RevenueDetails}');
    expect(s).toContain('Use HoverCard’s background token');
    expect(s).toContain("background: colorVars['--color-background-surface']");
    expect(s).toContain('--color-border-emphasized');
  });
});
