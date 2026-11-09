// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {generateMarkdownFixture} from './benchmark';
import {
  getMarkdownBenchmarkPlugins,
  getMarkdownBenchmarkProfile,
  MARKDOWN_BENCHMARK_PROFILES,
} from './benchmarkProfiles';

describe('Markdown performance profiles', () => {
  const source = generateMarkdownFixture(20);
  const softBreaks = getMarkdownBenchmarkProfile('soft-breaks');

  it('uses the same prepared fixture for paired empty and plugin runs', () => {
    expect(softBreaks.plugins).toHaveLength(1);
    expect(softBreaks.prepareSource(source, 'none')).toBe(source);
    expect(getMarkdownBenchmarkPlugins(softBreaks, 'baseline')).toHaveLength(0);
    expect(getMarkdownBenchmarkPlugins(softBreaks, 'plugin')).toBe(
      softBreaks.plugins,
    );
  });

  it('provides deterministic sparse and dense soft-break fixtures', () => {
    expect(
      softBreaks.prepareSource(source, 'sparse').match(/\nand inline /g),
    ).toHaveLength(2);
    expect(
      softBreaks.prepareSource(source, 'dense').match(/\nand inline /g),
    ).toHaveLength(20);
  });

  it('keeps profile ids unique', () => {
    expect(
      new Set(MARKDOWN_BENCHMARK_PROFILES.map(profile => profile.id)).size,
    ).toBe(MARKDOWN_BENCHMARK_PROFILES.length);
  });
});
