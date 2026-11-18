// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every official theme package exports the color modes its theme draws
 * @input The official theme sources and their `colorModes` exports
 * @output A failure for a theme whose `colorModes` export is missing or
 *   names other modes than its colour tokens draw
 * @position Repo-level guard beside the theme contrast checks
 *
 * A theme draws both modes when any colour token differs between light and
 * dark, and one mode when every colour token is the same in both (gothic
 * draws dark on every page).
 */

import {describe, expect, it} from 'vitest';
import * as butter from '../packages/themes/butter/src/source.ts';
import * as chocolate from '../packages/themes/chocolate/src/source.ts';
import * as gothic from '../packages/themes/gothic/src/source.ts';
import * as matcha from '../packages/themes/matcha/src/source.ts';
import * as neutral from '../packages/themes/neutral/src/source.ts';
import * as stone from '../packages/themes/stone/src/source.ts';
import * as y2k from '../packages/themes/y2k/src/source.ts';

const PACKAGES = {butter, chocolate, gothic, matcha, neutral, stone, y2k};

/** A token value's light and dark halves. */
function halves(value) {
  if (Array.isArray(value)) return [String(value[0]), String(value[1])];
  const pair = /^light-dark\((.*)\)$/s.exec(String(value).trim());
  if (!pair) return [String(value), String(value)];
  let depth = 0;
  for (const [i, ch] of [...pair[1]].entries()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0)
      return [pair[1].slice(0, i).trim(), pair[1].slice(i + 1).trim()];
  }
  return [String(value), String(value)];
}

/** The modes a theme draws, from its colour tokens. */
function drawnModes(theme) {
  const tokens = Object.entries(theme.tokens ?? {}).filter(([token]) =>
    token.startsWith('--color-'),
  );
  if (tokens.some(([, value]) => new Set(halves(value)).size > 1))
    return ['light', 'dark'];
  // One mode: the one its page color reads as.
  const body = halves(theme.tokens?.['--color-background-body'] ?? '')[0];
  const hex = /^#([0-9a-f]{6})/i.exec(body)?.[1];
  const sum = hex
    ? [0, 2, 4].reduce(
        (total, i) => total + parseInt(hex.slice(i, i + 2), 16),
        0,
      )
    : 765;
  return sum < 383 ? ['dark'] : ['light'];
}

describe('official theme color modes', () => {
  it.each(Object.entries(PACKAGES))(
    '%s exports the modes its theme draws',
    (name, pkg) => {
      const theme = pkg[`${name}Theme`];
      expect(theme, name).toBeDefined();
      expect([...(pkg.colorModes ?? [])]).toEqual(drawnModes(theme));
    },
  );
});
