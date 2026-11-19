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
    expect(source).toContain('titleDescriptionGap={1}');
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
    expect(source).toContain(
      "announce('Could not copy. Try again.', 'assertive')",
    );
    expect(source).not.toContain('role="alert"');
    expect(source).toContain('sets.map(section =>');
    expect(source).toContain('groups.map((group, index) =>');
    expect(source).not.toContain('Implementation details');
    expect(source).toContain('Switch preview to dark mode');
    expect(source).not.toContain('SegmentedControl');
    expect(source).toContain('mode={mode}');
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
    expect(source).not.toContain('Tooltip for Q2');
    expect(source).toContain('<HoverCard');
    expect(source).toContain('delay={0}');
    expect(source).toContain('touchTrigger="tap"');
    expect(source).toContain('const target = 150');
    expect(source).toContain('Target: {money(target)}');
    expect(source).toContain(
      'Compare sales by quarter against a $150k target.',
    );
    const chart = source.slice(
      source.indexOf('function ChartStylingPreview'),
      source.indexOf('function ChartStylingTable'),
    );
    expect(chart).not.toContain('type="display-3"');
    expect(chart).not.toContain('<text');
    expect(chart).toContain('type="body"');
    expect(chart).toContain('styles.chartLabel');
    expect(source).not.toContain('styles.chartText');
    expect(source).toContain(".replace(/`/g, '')");
    expect(source).toContain("stroke={colorVars['--color-border']}");
    expect(source).toContain("stroke={colorVars['--color-border-emphasized']}");
    expect(source).toContain("stroke={dataVars['--color-data-neutral']}");
    expect(source).toContain(
      "backgroundColor: dataVars['--color-data-categorical-blue']",
    );
    expect(source).toContain('borderTopLeftRadius: `min(${radiusVars');
    expect(source).toContain('borderTopRightRadius: `min(${radiusVars');
    expect(source).toContain('borderBottomLeftRadius: 0');
    expect(source).toContain('borderBottomRightRadius: 0');
    expect(source).toContain(
      '<ChartRadiusReference sections={stylingSections} />',
    );
    expect(source).toContain("fill={colorVars['--color-overlay-hover']}");
    expect(source).toContain("isolation: 'isolate'");
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
