// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tailwind-theme.test.ts
 * @input Uses the public Tailwind bridge and Tailwind's compiler
 * @output Regression coverage for reference-only token registration and
 *   token-backed utility generation
 * @position Package-contract test for the Tailwind v4 bridge
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';

import {compile} from 'tailwindcss';
import {describe, expect, it} from 'vitest';

const bridgeCSS = readFileSync(
  path.resolve(__dirname, 'tailwind-theme.css'),
  'utf8',
);

const sameNameColorTokens = [
  '--color-overlay',
  '--color-accent-muted',
  '--color-on-accent',
  '--color-neutral',
  '--color-overlay-hover',
  '--color-overlay-pressed',
  '--color-tint-hover',
  '--color-info',
  '--color-info-muted',
  '--color-on-info',
  '--color-success',
  '--color-success-muted',
  '--color-on-success',
  '--color-error',
  '--color-error-muted',
  '--color-on-error',
  '--color-warning',
  '--color-warning-muted',
  '--color-on-warning',
  '--color-on-info-muted',
  '--color-on-success-muted',
  '--color-on-warning-muted',
  '--color-on-error-muted',
  '--color-border',
  '--color-on-dark',
  '--color-on-light',
  '--color-skeleton',
  '--color-track',
  '--color-shadow',
] as const;

const sameNameFontWeightTokens = [
  '--font-weight-normal',
  '--font-weight-medium',
  '--font-weight-semibold',
  '--font-weight-bold',
] as const;

const sameNameRadiusTokens = ['--radius-none', '--radius-full'] as const;

function suffix(token: string, prefix: string): string {
  return token.slice(prefix.length);
}

async function compileBridge(): Promise<string> {
  const compiler = await compile(`${bridgeCSS}\n@tailwind utilities;`);
  return compiler.build([
    ...sameNameColorTokens.map(token => `bg-${suffix(token, '--color-')}`),
    ...sameNameFontWeightTokens.map(
      token => `font-${suffix(token, '--font-weight-')}`,
    ),
    ...sameNameRadiusTokens.map(
      token => `rounded-${suffix(token, '--radius-')}`,
    ),
    'bg-surface',
    'text-status-info',
    'text-status-success',
    'text-status-warning',
    'text-status-error',
  ]);
}

describe('Tailwind theme bridge', () => {
  it('does not emit runtime theme declarations', async () => {
    const css = await compileBridge();

    expect(bridgeCSS).toContain('@theme reference inline');
    expect(css).not.toMatch(/:root|:host/);
  });

  it('keeps every same-name token family external', async () => {
    const css = await compileBridge();

    for (const token of sameNameColorTokens) {
      expect(css).toContain(`background-color: var(${token});`);
    }
    for (const token of sameNameFontWeightTokens) {
      expect(css).toContain(`font-weight: var(${token});`);
    }
    for (const token of sameNameRadiusTokens) {
      expect(css).toContain(`border-radius: var(${token});`);
    }
  });

  it('keeps renamed mappings inline in generated utilities', async () => {
    const css = await compileBridge();

    expect(css).toContain('background-color: var(--color-background-surface);');
    expect(css).toContain('color: var(--color-text-info);');
    expect(css).toContain('color: var(--color-text-success);');
    expect(css).toContain('color: var(--color-text-warning);');
    expect(css).toContain('color: var(--color-text-error);');
    expect(css).not.toContain('background-color: var(--color-surface);');
  });

  it('projects each status by paint property', async () => {
    const compiler = await compile(`${bridgeCSS}\n@tailwind utilities;`);
    for (const status of ['info', 'success', 'warning', 'error']) {
      const text = `var(--color-text-${status})`;
      const border = `var(--color-border-${status})`;
      const fill = `var(--color-${status})`;
      for (const [utility, expected] of [
        [`text-${status}`, text],
        [`decoration-${status}`, text],
        [`placeholder-${status}`, text],
        [`caret-${status}`, text],
        [`border-${status}`, border],
        [`divide-${status}`, border],
        [`outline-${status}`, border],
        [`ring-${status}`, border],
        [`bg-${status}`, fill],
        [`accent-${status}`, fill],
        [`fill-${status}`, fill],
        [`text-status-${status}`, text],
      ]) {
        expect([utility, compiler.build([utility])]).toEqual([
          utility,
          expect.stringContaining(expected),
        ]);
      }
      // text-status-<status> is a text-only alias.
      for (const utility of [
        `bg-status-${status}`,
        `border-status-${status}`,
        `ring-status-${status}`,
      ]) {
        expect(compiler.build([utility])).not.toContain(`.${utility} {`);
      }
    }
  });
});
