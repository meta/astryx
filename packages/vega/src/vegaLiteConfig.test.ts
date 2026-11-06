// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vegaLiteConfig.test.ts
 * @input Uses vitest, buildVegaLiteConfig, withAstryxConfig, its exported layout
 *   constants, and the shared CATEGORICAL_TOKENS from @astryxdesign/charts
 * @output Functional tests for the Astryx-themed Vega-Lite config builder and
 *   the compile-options merge that applies it
 * @position Colocated test for vegaLiteConfig.ts (issue #4295 vega coverage)
 */

import {describe, it, expect} from 'vitest';
import {CATEGORICAL_TOKENS, type TokenResolver} from '@astryxdesign/charts';
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
    expect(config.range?.category).toEqual([...CATEGORICAL_TOKENS]);
  });

  it('resolves every categorical slot through the caller token resolver', () => {
    const config = buildVegaLiteConfig(name => `value(${name})`);
    expect(config.range?.category).toEqual(
      CATEGORICAL_TOKENS.map(name => `value(${name})`),
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
    expect(options.config?.range?.category).toEqual([...CATEGORICAL_TOKENS]);
    expect(options.config?.axis?.labelColor).toBe('--color-text-secondary');
  });
});
