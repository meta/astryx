// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {syntaxFallbackRule, syntaxTokenDefaults} from './tokens';

describe('syntaxFallbackRule', () => {
  it('declares every built-in syntax token at the root and on a color-setting Theme wrapper outside a SyntaxTheme', () => {
    const rule = syntaxFallbackRule();
    expect(rule.slice(0, rule.indexOf('{')).trim()).toBe(
      ':root, [data-astryx-theme-colors]:not([data-astryx-syntax-theme] *)',
    );
    for (const [name, value] of Object.entries(syntaxTokenDefaults)) {
      expect(rule).toContain(`  ${name}: ${value};`);
    }
  });
});
