// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  new URL('../components/docs/ColorSetsDocView.tsx', import.meta.url),
  'utf8',
);

describe('color-set presentation', () => {
  it('shows a separate swatch and value for each mode', () => {
    expect(source).toContain("header: 'Token'");
    expect(source).toContain("header: 'Light mode'");
    expect(source).toContain("header: 'Dark mode'");
    expect(source).not.toContain("header: 'Value'");
    expect(source).toContain('density="spacious"');
    expect(source).toContain('mode="light"');
    expect(source).toContain('mode="dark"');
    expect(source.match(/width: pixel\(152\)/g)).toHaveLength(4);
    expect(source).toContain('width: proportional(1)');
    expect(source).toContain(
      '<DocPageLayout title={title} description={description}>',
    );
    expect(source).not.toContain('Example combination');
  });

  it('shows every color set and chart styling without selection controls', () => {
    expect(source).not.toContain('TabList');
    expect(source).not.toContain('Selector');
    expect(source).toContain("useClipboard({announce: 'Tokens copied'})");
    expect(source).toContain("isCopied ? 'Copied' : 'Copy tokens'");
    expect(source).toContain('<IconButton');
    expect(source).toContain('variant="ghost"');
    expect(source).toContain('tooltip="Copy tokens"');
    expect(source).toContain("isCopied ? 'check' : 'copy'");
    expect(source).toContain('sets.map(section =>');
    expect(source).toContain('groups.map((group, index) =>');
    expect(source).toContain("section.id !== 'readable-chart-details'");
    expect(source).toContain('id="chart-styling"');
    expect(source).toContain('trigger="Implementation details"');
    expect(source).toContain('defaultIsOpen={false}');
    const setSection = source.slice(
      source.indexOf('function SetSection'),
      source.indexOf('export function ColorSetsDocView'),
    );
    expect(setSection).not.toContain('Collapsible');
    expect(setSection).not.toContain('ContentBlockRenderer');
  });

  it('shows a chart preview with the same roles as the swatch table', () => {
    expect(source).toContain('<ChartStylingPreview />');
    expect(source).toContain(
      '<ChartStylingTable sections={stylingSections} />',
    );
    expect(source).toContain('Tooltip for Q2');
    expect(source).toContain("stroke={colorVars['--color-border']}");
    expect(source).toContain("stroke={colorVars['--color-border-emphasized']}");
    expect(source).toContain("stroke={dataVars['--color-data-neutral']}");
    expect(source).toContain(
      "fill={dataVars['--color-data-categorical-blue']}",
    );
    expect(source).toContain(
      "backgroundColor: colorVars['--color-background-surface']",
    );
    expect(source).toContain("fill={colorVars['--color-overlay-hover']}");
  });

  it('preserves canonical mode values and transparency', () => {
    expect(source).toContain(
      "resolveThemeTokens(neutralTheme, {mode: 'light'})",
    );
    expect(source).toContain(
      "resolveThemeTokens(neutralTheme, {mode: 'dark'})",
    );
    expect(source).toContain('opacity: strength');
    expect(source).not.toContain("section.title === 'Sequential' &&");
    expect(source).not.toContain("section.title === 'Semantic' &&");
    expect(source).not.toContain("section.title === 'Heatmap' &&");
  });
});
