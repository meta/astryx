// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  new URL('../components/docs/ColorSetsDocView.tsx', import.meta.url),
  'utf8',
);
const preview = readFileSync(
  new URL('../components/docs/RechartsThemingPreview.tsx', import.meta.url),
  'utf8',
);

describe('color-set presentation', () => {
  it('shows a separate swatch and value for each mode', () => {
    for (const header of ['Token', 'Light mode', 'Dark mode']) {
      expect(source).toContain(`header: '${header}'`);
    }
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

  it('composes actual chart components instead of preview-only lookalikes', () => {
    expect(source).toContain('<ChartStylingPreview />');
    expect(source).toContain(
      '<ChartStylingTable sections={stylingSections} />',
    );
    expect(source).toContain(
      '<ChartRadiusReference sections={stylingSections} />',
    );
    expect(source).toContain('<RechartsThemingPreview />');
    expect(source).toContain('<RechartsThemingPreview anatomy />');
    const radiusSection = source.slice(
      source.indexOf('function ChartRadiusReference'),
      source.indexOf('function CopyTokensButton'),
    );
    expect(radiusSection).toContain('descriptions.map(text =>');
    expect(
      radiusSection.indexOf('<RechartsThemingPreview anatomy />'),
    ).toBeLessThan(radiusSection.indexOf('<Table'));
    expect(source).toContain('<AnatomyNumber value={row.number} />');
    expect(source).toContain('styles.radiusAnatomy');
    expect(source).toContain('<Heading level={3}>');
    expect(source).toContain('<Heading level={4}>');
    expect(source).toContain(
      'Compare sales by quarter against a $150k target.',
    );
    expect(preview).toContain("from 'recharts'");
    for (const component of [
      'BarChart',
      'Bar',
      'CartesianGrid',
      'XAxis',
      'YAxis',
      'Legend',
      'Tooltip',
      'Rectangle',
      'Curve',
    ]) {
      expect(preview).toContain(`<${component}`);
    }
    expect(preview).toContain("stroke={colorVars['--color-border']}");
    expect(preview).toContain("stroke: colorVars['--color-border-emphasized']");
    expect(preview).toContain("fill: colorVars['--color-text-secondary']");
    expect(preview).toContain("fill={colorVars['--color-text-primary']}");
    expect(preview).toContain(
      "backgroundColor: colorVars['--color-background-surface']",
    );
    expect(preview).toContain("borderRadius: radiusVars['--radius-container']");
    expect(preview).toContain('radius={[r, r, 0, 0]}');
    expect(preview).toContain('boundedChartRadius(radius, 8, 8)');
    expect(preview).toContain('domain={[0, 200]}');
    expect(preview).toContain('<Card padding={3}');
    expect(preview).toContain("isolation: 'isolate'");
    for (const lookalike of [
      '<svg',
      '<rect',
      '<line ',
      '<button',
      'styles.barTrigger',
      'styles.chartLabel',
      'label="Hover"',
      '@astryxdesign/charts',
    ]) {
      expect(source + preview).not.toContain(lookalike);
    }
  });

  it('keeps visible color values tied to canonical Neutral token resolution', () => {
    expect(source).toContain(
      "light: resolveThemeTokens(neutralTheme, {mode: 'light'})",
    );
    expect(source).toContain(
      "dark: resolveThemeTokens(neutralTheme, {mode: 'dark'})",
    );
    expect(source).toContain('const color = modeTokens[mode][token]');
    expect(source).toContain('const label = colorLabel(color, strength)');
    expect(source).toContain("borderRadius: radiusVars['--radius-element']");
    expect(source).toContain('<Theme theme={neutralTheme} mode={mode}>');
    expect(source).not.toContain('radiusBar');
  });
});
