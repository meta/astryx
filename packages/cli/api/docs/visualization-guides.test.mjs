// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Check palette and chart-styling guide discovery, focused reads, and renderer-guide links. */
import {describe, expect, it} from 'vitest';
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
