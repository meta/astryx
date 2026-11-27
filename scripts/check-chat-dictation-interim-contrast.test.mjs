// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contrast guard for dictation's interim words in the chat composer.
 *
 * While dictation listens, words not yet confirmed show in the composer in
 * italic `--color-text-secondary` at full opacity (`useChatDictation`). They
 * are normal-size text on the composer body, `--color-background-popover`, so
 * this requires 4.5:1 there in every first-party theme, in both colour
 * schemes (`spec:AST-020` FR1).
 *
 * @input The first-party theme objects.
 * @output Fails when interim words drop below 4.5:1 on the composer.
 * @position Repo-level theme contrast guard, sibling of the other scripts/check-*.
 */

import {describe, expect, it} from 'vitest';
import {
  AA_NORMAL,
  FIRST_PARTY_THEMES,
  MODES,
  layeredContrast,
  resolveColor,
  themeTokens,
} from './lib/theme-contrast.mjs';

const INTERIM_TEXT = 'var(--color-text-secondary)';
const COMPOSER_BODY = 'var(--color-background-popover)';

function measurements() {
  const rows = [];
  for (const [themeName, theme] of Object.entries(FIRST_PARTY_THEMES)) {
    const tokens = themeTokens(theme);
    MODES.forEach((mode, modeIndex) => {
      const text = resolveColor(INTERIM_TEXT, tokens, modeIndex);
      const body = resolveColor(COMPOSER_BODY, tokens, modeIndex);
      rows.push({
        theme: themeName,
        mode,
        ratio: text && body ? layeredContrast(text, [body], modeIndex) : null,
      });
    });
  }
  return rows;
}

describe('dictation interim words in the chat composer', () => {
  const rows = measurements();

  it('measures every first-party theme in both colour schemes', () => {
    expect(rows.length).toBe(Object.keys(FIRST_PARTY_THEMES).length * 2);
    for (const row of rows) {
      expect(row.ratio, `${row.theme} ${row.mode}`).not.toBeNull();
    }
  });

  it('keeps 4.5:1 on the composer body', () => {
    const failing = rows
      .filter(row => row.ratio !== null && row.ratio < AA_NORMAL)
      .map(row => `${row.theme} ${row.mode} ${row.ratio.toFixed(2)}:1`);
    expect(failing).toEqual([]);
  });
});
