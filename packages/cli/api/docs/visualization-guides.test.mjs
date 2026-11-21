// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Check visualization guide reads and the separate color-set page. */
import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {docs} from './docs.mjs';
import {docs as palette} from '../../assets/docs/tree/choosing-data-colors.doc.mjs';
import colorSets from '../../assets/docs/tree/color-sets-reference.doc.mjs';
import {docs as styling} from '../../assets/docs/tree/chart-styling.doc.mjs';
import {docs as renderer} from '../../assets/docs/tree/data-colors-in-renderers.doc.mjs';
import {rootNamespacePages} from '../../../../apps/docsite/scripts/docs-pages.mjs';

const SLOW = 30_000;

describe('visualization palette and styling guides', () => {
  it(
    'keeps delivery first and lists Color sets as a child namespace',
    async () => {
      const res = await docs('visualization');
      const children = res.data.slots.flatMap(slot => slot.children);
      expect(
        children.filter(c => c.kind === 'generic').map(c => c.route),
      ).toEqual([
        'visualization/data-colors-in-renderers',
        'visualization/choosing-data-colors',
        'visualization/chart-styling',
      ]);
      expect(
        children.find(c => c.route === 'visualization/color-sets')?.kind,
      ).toBe('namespace');
    },
    SLOW,
  );

  it(
    'reads each guide section directly and through its namespace',
    async () => {
      for (const [guide, namespace] of [
        [palette, 'visualization'],
        [styling, 'visualization'],
        [colorSets, 'visualization/color-sets'],
      ]) {
        for (const section of guide.sections) {
          const direct = await docs(
            `${namespace}/${guide === colorSets ? 'reference' : guide.name}`,
            section.id,
          );
          expect(direct.type).toBe('docs.detail.section');
          expect(direct.data.title).toBe(section.title);
          const throughNamespace = await docs(namespace, section.id);
          expect(throughNamespace.data.content).toEqual(direct.data.content);
        }
      }
    },
    SLOW,
  );

  it(
    'gives Color sets its own page under Data visualization without duplicating it',
    async () => {
      const result = await rootNamespacePages(docs, 'visualization');
      expect(result.root.page.topic).toBe('visualization');
      expect(result.root.page.sections.map(section => section.title)).toEqual([
        ...renderer.sections.map(s => s.title),
        ...palette.sections.map(s => s.title),
        ...styling.sections.map(s => s.title),
      ]);
      expect(result.root.redirects['visualization-choosing-data-colors']).toBe(
        '/docs/visualization#match-the-color-scale-to-the-data',
      );
      expect(result.root.redirects['visualization-chart-styling']).toBe(
        '/docs/visualization#match-each-chart-part-to-an-existing-role',
      );
      expect(result.nested).toHaveLength(1);
      expect(result.nested[0].page).toMatchObject({
        topic: 'visualization-color-sets',
        title: 'Colors',
        parent: 'visualization',
      });
      expect(result.nested[0].page.sections.map(s => s.title)).toEqual(
        colorSets.sections.map(s => s.title),
      );
      expect(
        result.nested[0].redirects[
          'visualization-color-sets-color-sets-reference'
        ],
      ).toBe('/docs/visualization-color-sets#read-the-color-sets');
      expect(JSON.stringify(palette)).toContain('{@link namespace:color-sets}');
    },
    SLOW,
  );

  it('lists exactly the canonical data tokens with mode values and swatch hints', () => {
    const source = readFileSync(
      new URL('../../../core/src/theme/dataTokens.stylex.ts', import.meta.url),
      'utf8',
    );
    const canonical = [...source.matchAll(/'(--color-data-[a-z0-9-]+)':/g)].map(
      match => match[1],
    );
    const rows = colorSets.sections.flatMap(section =>
      section.content
        .filter(block => block.type === 'table')
        .flatMap(block => block.rows),
    );
    expect(canonical).toHaveLength(56);
    expect([...new Set(rows.map(row => row[1]))].sort()).toEqual(
      canonical.sort(),
    );
    expect(
      colorSets.sections
        .slice(1)
        .every(section => section.previewType === 'swatch'),
    ).toBe(true);
    expect(colorSets.sections.map(section => section.title)).toEqual([
      'Read the color sets',
      'Categorical',
      'Sequential',
      'Reference',
      'Semantic',
      'Diverging',
      'Spectrum',
      'Heatmap',
    ]);
    for (const row of rows) {
      expect(row).toHaveLength(5);
      expect(row[3]).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
      expect(row[4]).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
    }
    expect(JSON.stringify(colorSets.sections[0])).toContain(
      'not additional token families or approved palette defaults',
    );
  });

  it('preserves ramp order, composed mappings, repeats, and opacity strengths', () => {
    const section = id => colorSets.sections.find(item => item.id === id);
    const tables = id =>
      section(id).content.filter(block => block.type === 'table');
    const codeTokens = (id, index = 0) => {
      const codeBlocks = section(id).content.filter(
        block => block.type === 'code',
      );
      return [
        ...codeBlocks[index].code.matchAll(/'(--color-data-[a-z0-9-]+)'/g),
      ].map(match => match[1]);
    };
    const stops = (hue, order) =>
      order.map(stop => `--color-data-${hue}-${stop}`);
    const forward = [1, 2, 3, 4, 5],
      reverse = [5, 4, 3, 2, 1];
    expect(
      tables('sequential-token-reference').map(table =>
        table.rows.map(row => row[1]),
      ),
    ).toEqual(
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
      ].map(hue => stops(hue, reverse)),
    );
    expect(codeTokens('categorical-token-reference')).toEqual([
      '--color-data-categorical-blue',
      '--color-data-categorical-orange',
      '--color-data-categorical-purple',
      '--color-data-categorical-green',
      '--color-data-categorical-pink',
      '--color-data-categorical-cyan',
      '--color-data-categorical-red',
      '--color-data-categorical-teal',
      '--color-data-categorical-brown',
      '--color-data-categorical-indigo',
    ]);
    expect(codeTokens('diverging-data-colors')).toEqual([
      ...stops('orange', reverse),
      '--color-data-gray-1',
      ...stops('blue', forward),
    ]);
    expect(codeTokens('diverging-data-colors', 1)).toEqual([
      ...stops('pink', reverse),
      '--color-data-gray-1',
      ...stops('shamrock', forward),
    ]);
    const spectrum = codeTokens('spectrum-data-colors');
    expect(spectrum).toHaveLength(10);
    expect(new Set(spectrum).size).toBe(8);
    expect(spectrum[2]).toBe(spectrum[3]);
    expect(spectrum[8]).toBe(spectrum[9]);
    expect(tables('semantic-data-colors')[0].rows[1][1]).toBe(
      '--color-data-yellow-4',
    );
    expect(JSON.stringify(section('semantic-data-colors'))).toContain(
      'not a categorical yellow token or an approved warning default',
    );
    for (const table of tables('heatmap-data-colors').slice(0, 5)) {
      expect(table.rows.map(row => row[2])).toEqual([
        '25%',
        '37.5%',
        '50%',
        '62.5%',
        '75%',
        '87.5%',
        '100%',
      ]);
    }
    expect(JSON.stringify(section('heatmap-data-colors'))).toContain(
      'actual light or dark Neutral surface',
    );
  });

  it('keeps Reference to neutral and the gray ramp under Sequential', () => {
    const reference = colorSets.sections.find(
      section => section.id === 'reference-token-semantics',
    );
    const sequential = colorSets.sections.find(
      section => section.id === 'sequential-token-reference',
    );
    const rows = section =>
      section.content
        .filter(block => block.type === 'table')
        .flatMap(block => block.rows);
    expect(rows(reference).map(row => row[1])).toEqual([
      '--color-data-neutral',
    ]);
    expect(
      rows(sequential)
        .filter(row => row[1].startsWith('--color-data-gray-'))
        .map(row => row[1]),
    ).toEqual([5, 4, 3, 2, 1].map(stop => `--color-data-gray-${stop}`));
    expect(JSON.stringify(reference)).toContain(
      'not a separate reference palette',
    );
  });

  it('defines radius roles without changing data geometry', () => {
    const section = styling.sections.find(
      section => section.id === 'chart-radius',
    );
    const table = section.content.find(block => block.type === 'table');
    expect(table.rows.slice(0, 4).map(row => [row[0], row[1]])).toEqual([
      ['Chart card', '--radius-container'],
      ['Tooltip surface', '--radius-container'],
      ['Bars', '--radius-element'],
      ['Filled legend keys', '--radius-element'],
    ]);
    expect(table.rows[4]).toEqual([
      'Plot and hover region',
      '--radius-none',
      'Keep the plot and hover highlight rectangular. Apply the hover overlay without changing the series color.',
    ]);
    expect(JSON.stringify(section)).toContain(
      'without changing its value, scale, or baseline',
    );
    expect(JSON.stringify(section)).toContain(
      'Limit radius to half the bar’s width or height',
    );
    expect(JSON.stringify(section)).toContain(
      'then round it down to a whole CSS pixel',
    );
    expect(JSON.stringify(section)).toContain(
      'Round that final bounded radius down to a whole CSS pixel',
    );
    expect(JSON.stringify(section)).toContain(
      'Never round data values, bar dimensions, scales, or baselines',
    );
    expect(JSON.stringify(section)).toContain(
      'geometric ceiling, not a guarantee',
    );
    expect(table.rows[3][2]).toContain('4px corners becomes a circle');
  });

  it('links renderer delivery without duplicating its implementation', () => {
    const text = JSON.stringify(renderer.sections[0]);
    expect(text).toContain('{@link generic:choosing-data-colors}');
    expect(text).toContain('{@link generic:chart-styling}');
    expect(renderer.sections.map(s => s.id)).toEqual([
      'choose-a-path',
      'use-datavars',
      'use-raw-css-variables',
      'draw-canvas-with-resolved-colors',
      'configure-vega-lite',
    ]);
  });

  it('keeps unavailable data and example styling separate from component defaults', () => {
    const p = JSON.stringify(palette),
      s = JSON.stringify(styling);
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
    expect(s).toContain(
      "backgroundColor: colorVars['--color-background-surface']",
    );
    expect(s).toContain('<Heading level={3}>');
    expect(s).toContain('<Card padding={3}');
    expect(s).toContain('--color-border-emphasized');
  });
});
