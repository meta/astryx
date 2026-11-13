// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vegaLiteConfig.test.ts
 * @input Uses vitest, buildVegaLiteConfig, withAstryxConfig, its exported layout
 *   constants, and the shared palette from @astryxdesign/charts
 * @output Functional tests for the Astryx-themed Vega-Lite config builder and
 *   the compile-options merge that applies it
 * @position Colocated test for vegaLiteConfig.ts (issue #4295 vega coverage)
 */

import {describe, it, expect} from 'vitest';
import {compile, type TopLevelSpec} from 'vega-lite';
import {
  getChartColorsFromResolver,
  type TokenResolver,
} from '@astryxdesign/charts';
import {
  buildVegaLiteConfig,
  withAstryxConfig,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_POINT_SIZE,
  DEFAULT_LEGEND_ORIENT,
  LEGEND_OFFSET,
  TITLE_OFFSET,
} from './vegaLiteConfig';

/** Resolver that makes every resolved token traceable to its name. */
const token = (name: string) => `resolved(${name})`;

/** Echoes the token name back, so resolved output is inspectable by name. */
const echo: TokenResolver = name => name;

describe('buildVegaLiteConfig', () => {
  it('resolves chart chrome colors through the provided token resolver', () => {
    const config = buildVegaLiteConfig(token);
    expect(config.axis?.domainColor).toBe('resolved(--color-icon-primary)');
    expect(config.axis?.labelColor).toBe('resolved(--color-text-secondary)');
    expect(config.background).toBe('resolved(--color-background-card)');
    expect(config.text?.color).toBe('resolved(--color-text-primary)');
    expect(config.point?.fill).toBe('resolved(--color-background-card)');
    expect(config.legend?.labelFont).toBe('resolved(--font-family-body)');
    expect(config.title?.subtitleColor).toBe(
      'resolved(--color-text-secondary)',
    );
  });

  it('orders the categorical palette across the ten categorical data tokens', () => {
    const config = buildVegaLiteConfig(token);
    expect(config.range?.category).toEqual([
      'resolved(--color-data-categorical-blue)',
      'resolved(--color-data-categorical-orange)',
      'resolved(--color-data-categorical-purple)',
      'resolved(--color-data-categorical-green)',
      'resolved(--color-data-categorical-pink)',
      'resolved(--color-data-categorical-cyan)',
      'resolved(--color-data-categorical-red)',
      'resolved(--color-data-categorical-teal)',
      'resolved(--color-data-categorical-brown)',
      'resolved(--color-data-categorical-indigo)',
    ]);
  });

  it('draws its categorical range from the shared @astryxdesign/charts token list', () => {
    // Pins the palette to charts' single source of truth: with an echoing
    // resolver the range IS the shared token list, so a re-introduced local
    // copy in this package drifts and fails here.
    const config = buildVegaLiteConfig(echo);
    expect(config.range?.category).toEqual(
      getChartColorsFromResolver(echo).categorical(10),
    );
  });

  it('resolves every categorical slot through the caller token resolver', () => {
    const config = buildVegaLiteConfig(name => `value(${name})`);
    expect(config.range?.category).toEqual(
      getChartColorsFromResolver(echo)
        .categorical(10)
        .map(name => `value(${name})`),
    );
  });

  it('builds the diverging range as a blue-to-red ramp around a gray midpoint', () => {
    const config = buildVegaLiteConfig(token);
    expect(config.range?.diverging).toEqual([
      'resolved(--color-data-blue-5)',
      'resolved(--color-data-blue-4)',
      'resolved(--color-data-blue-3)',
      'resolved(--color-data-blue-2)',
      'resolved(--color-data-blue-1)',
      'resolved(--color-data-gray-1)',
      'resolved(--color-data-red-1)',
      'resolved(--color-data-red-2)',
      'resolved(--color-data-red-3)',
      'resolved(--color-data-red-4)',
      'resolved(--color-data-red-5)',
    ]);
    // Sequential ranges are ascending blues.
    expect(config.range?.heatmap).toEqual([
      'resolved(--color-data-blue-1)',
      'resolved(--color-data-blue-2)',
      'resolved(--color-data-blue-3)',
      'resolved(--color-data-blue-4)',
      'resolved(--color-data-blue-5)',
    ]);
  });

  it('applies the structural mark and layout constants', () => {
    const config = buildVegaLiteConfig(token);
    expect(config.line?.strokeWidth).toBe(DEFAULT_STROKE_WIDTH);
    expect(config.line?.strokeWidth).toBe(2);
    expect(config.point?.size).toBe(DEFAULT_POINT_SIZE);
    expect(config.point?.size).toBe(64);
    expect(config.legend?.orient).toBe(DEFAULT_LEGEND_ORIENT);
    expect(config.legend?.orient).toBe('right');
    expect(config.legend?.offset).toBe(LEGEND_OFFSET);
    expect(config.legend?.offset).toBe(16);
    expect(config.title?.offset).toBe(TITLE_OFFSET);
    expect(config.title?.offset).toBe(16);
    expect(config.padding).toBe(16);
    expect(config.scale?.bandPaddingInner).toBe(0.1);
    expect(config.view?.stroke).toBeNull();
  });
});

describe('withAstryxConfig', () => {
  it('applies the themed config by default when no compile options are given', () => {
    const options = withAstryxConfig(echo);
    expect(options.config).toEqual(buildVegaLiteConfig(echo));
  });

  it('applies the themed config when compile options carry no config', () => {
    const logger = {
      level: () => logger,
      error: () => logger,
      warn: () => logger,
      info: () => logger,
      debug: () => logger,
    };
    const options = withAstryxConfig(echo, {logger});
    expect(options.logger).toBe(logger);
    expect(options.config).toEqual(buildVegaLiteConfig(echo));
  });

  it('lets user config win over the derived theme config', () => {
    const options = withAstryxConfig(echo, {
      config: {background: '#ff0000', axis: {labelFontSize: 99}},
    });
    expect(options.config?.background).toBe('#ff0000');
    expect(options.config?.axis?.labelFontSize).toBe(99);
  });

  it('keeps theme values the user did not override', () => {
    const options = withAstryxConfig(echo, {config: {background: '#ff0000'}});
    // Untouched theme keys survive the merge.
    expect(options.config?.range?.category).toEqual(
      getChartColorsFromResolver(echo).categorical(10),
    );
    expect(options.config?.axis?.labelColor).toBe('--color-text-secondary');
  });
});

describe('theme, caller and spec config through Vega-Lite', () => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    data: {
      values: [
        {a: 1, b: 1},
        {a: 2, b: 3},
      ],
    },
    mark: 'point',
    encoding: {
      x: {field: 'a', type: 'quantitative'},
      y: {field: 'b', type: 'quantitative'},
    },
  } as TopLevelSpec;

  /** The orients of the grid axes the compiled spec draws. */
  const gridOrients = (compiled: ReturnType<typeof compile>) =>
    (compiled.spec.axes ?? [])
      .filter(axis => axis.grid === true)
      .map(axis => axis.orient);

  it('draws only the y grid under the theme alone', () => {
    const orients = gridOrients(compile(spec, withAstryxConfig(echo)));
    expect(orients).toContain('left');
    expect(orients).not.toContain('bottom');
  });

  it("lets the caller's generic axis key outrank the theme's per-axis value", () => {
    const orients = gridOrients(
      compile(spec, withAstryxConfig(echo, {config: {axis: {grid: true}}})),
    );
    expect(orients).toContain('bottom');
  });

  it("lets the spec's inline generic axis key outrank the theme's per-axis value", () => {
    const inline = {...spec, config: {axis: {grid: true}}} as TopLevelSpec;
    const orients = gridOrients(
      compile(inline, withAstryxConfig(echo, undefined, inline)),
    );
    expect(orients).toContain('bottom');
  });

  it("lets the caller's channel-level axis key outrank the theme's channel-and-type value", () => {
    const orients = gridOrients(
      compile(spec, withAstryxConfig(echo, {config: {axisY: {grid: false}}})),
    );
    expect(orients).not.toContain('left');
  });

  it("lets the spec's inline channel-level axis key outrank the theme's channel-and-type value", () => {
    const inline = {...spec, config: {axisY: {grid: false}}} as TopLevelSpec;
    const orients = gridOrients(
      compile(inline, withAstryxConfig(echo, undefined, inline)),
    );
    expect(orients).not.toContain('left');
  });

  it("lets the caller's type-level axis key outrank the theme's channel-and-type value", () => {
    const orients = gridOrients(
      compile(
        spec,
        withAstryxConfig(echo, {config: {axisQuantitative: {grid: false}}}),
      ),
    );
    expect(orients).not.toContain('left');
  });

  it('ignores an orient block for an orient the chart does not draw', () => {
    // The x axis is at the bottom, so axisTop applies to no axis.
    const orients = gridOrients(
      compile(
        spec,
        withAstryxConfig(echo, {config: {axisTop: {grid: true}}}, spec),
      ),
    );
    expect(orients).not.toContain('bottom');
    const options = withAstryxConfig(
      echo,
      {config: {axisRight: {domain: true}}},
      spec,
    );
    expect(options.config?.axisY?.domain).toBe(false);
  });

  it('counts an orient block for an orient the chart draws', () => {
    const rightY = {
      ...spec,
      encoding: {
        ...(spec as {encoding: object}).encoding,
        y: {field: 'b', type: 'quantitative', axis: {orient: 'right'}},
      },
    } as TopLevelSpec;
    const options = withAstryxConfig(
      echo,
      {config: {axisRight: {domain: true}}},
      rightY,
    );
    expect(options.config?.axisY).not.toHaveProperty('domain');
  });

  it('keeps the left axis themed when a key names only the right orient of a dual-axis chart', () => {
    const dual = {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      data: {
        values: [
          {a: 1, b: 1, c: 5},
          {a: 2, b: 3, c: 2},
        ],
      },
      layer: [
        {
          mark: 'line',
          encoding: {
            x: {field: 'a', type: 'quantitative'},
            y: {field: 'b', type: 'quantitative'},
          },
        },
        {
          mark: 'line',
          encoding: {
            x: {field: 'a', type: 'quantitative'},
            y: {field: 'c', type: 'quantitative', axis: {orient: 'right'}},
          },
        },
      ],
      resolve: {scale: {y: 'independent'}},
    } as TopLevelSpec;
    const compiled = compile(
      dual,
      withAstryxConfig(
        echo,
        {config: {axisRight: {domain: true, gridWidth: 2}}},
        dual,
      ),
    );
    const config = compiled.spec.config as Record<
      string,
      Record<string, unknown> | undefined
    >;
    expect(config.axisY?.domain).toBeUndefined();
    expect(config.axisLeft?.domain).toBe(false);
    expect(config.axisRight?.domain).toBe(true);
    expect(config.axisLeft?.gridWidth).toBe(0.5);
    expect(config.axisRight?.gridWidth).toBe(2);
  });

  it('skips inline data when it reads the drawn axes', () => {
    const many = {
      ...spec,
      data: {
        values: Array.from({length: 150_000}, (_, index) => ({
          a: index,
          b: index,
        })),
      },
    } as TopLevelSpec;
    expect(() =>
      withAstryxConfig(echo, {config: {axisTop: {grid: true}}}, many),
    ).not.toThrow();
  });

  it('keeps the theme per-axis value for a key no override sets', () => {
    const options = withAstryxConfig(echo, {
      config: {axis: {labelFontSize: 14}},
    });
    expect(options.config?.axisX?.grid).toBe(false);
  });
});
