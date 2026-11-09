// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useSyntaxTheme.diff.test.tsx
 * @input A SyntaxTheme provider with a preset that sets no diff slots
 * @output The hook hands a canvas consumer paintable colours for every slot
 * @position Diff slot resolution for the imperative (canvas) path
 */

import {render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {SyntaxTheme, useSyntaxTheme} from './SyntaxTheme';
import {dracula} from './presets';
import {parseColor} from '../../utils/color';

function Probe({onTokens}: {onTokens: (t: Record<string, string>) => void}) {
  const syntax = useSyntaxTheme();
  if (syntax) onTokens(syntax.tokens);
  return null;
}

describe('useSyntaxTheme diff slots', () => {
  it("resolves unset marker slots to the theme's own punctuation colour", () => {
    let tokens: Record<string, string> = {};
    render(
      <SyntaxTheme theme={dracula}>
        <Probe onTokens={t => (tokens = t)} />
      </SyntaxTheme>,
    );
    expect(tokens.punctuation).toMatch(/^#|^rgb/);
    expect(tokens['added-marker']).toBe(tokens.punctuation);
    expect(tokens['removed-marker']).toBe(tokens.punctuation);
    // The row paints derive from the page theme's resolved muted tokens at
    // the default strength, as rgba() a canvas can paint.
    expect(tokens.added).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
    expect(tokens.removed).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
    expect(parseColor(tokens.added)?.a).toBeCloseTo(0.2 * 0.25, 3);
    expect(tokens['diff-header']).toBe('transparent');
  });
});
