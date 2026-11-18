// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  new URL('../components/docs/ColorSetsDocView.tsx', import.meta.url),
  'utf8',
);

describe('color-set presentation', () => {
  it('uses the token reference’s two-column, paired-swatch format', () => {
    expect(source).toContain("header: 'Token'");
    expect(source).toContain("header: 'Value'");
    expect(source).not.toContain("header: 'Light'");
    expect(source).not.toContain("header: 'Dark'");
    expect(source).toContain('light === dark ? light : `${light} / ${dark}`');
    expect(source).toContain('density="spacious"');
    expect(source).toContain('mode="light"');
    expect(source).toContain('mode="dark"');
  });

  it('keeps implementation code optional and chart styling reachable', () => {
    expect(source).toContain('trigger="Implementation details"');
    expect(source).toContain('defaultIsOpen={false}');
    expect(source).toContain('label="Chart styling"');
    expect(source).toContain(
      'href="/docs/visualization#match-each-chart-part-to-an-existing-role"',
    );
  });

  it('keeps set selection addressable without changing token values', () => {
    expect(source).toContain("window.addEventListener('hashchange', restore)");
    expect(source).toContain("window.addEventListener('popstate', restore)");
    expect(source).toContain('window.history.replaceState');
    expect(source).toContain(
      "resolveThemeTokens(neutralTheme, {mode: 'light'})",
    );
    expect(source).toContain(
      "resolveThemeTokens(neutralTheme, {mode: 'dark'})",
    );
    expect(source).toContain(
      'Transparent fills blend with the light or dark surface.',
    );
  });
});
