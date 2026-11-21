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
import {resolveColor, themeTokens} from './lib/theme-contrast.mjs';
import {parseColor} from '../packages/core/src/utils/color.ts';
import * as butter from '../packages/themes/butter/src/source.ts';
import * as chocolate from '../packages/themes/chocolate/src/source.ts';
import * as gothic from '../packages/themes/gothic/src/source.ts';
import * as matcha from '../packages/themes/matcha/src/source.ts';
import * as neutral from '../packages/themes/neutral/src/source.ts';
import * as stone from '../packages/themes/stone/src/source.ts';
import * as y2k from '../packages/themes/y2k/src/source.ts';

const PACKAGES = {butter, chocolate, gothic, matcha, neutral, stone, y2k};

/** The modes a theme draws, from its colour tokens as each mode resolves them. */
function drawnModes(theme) {
  const tokens = themeTokens(theme);
  const [light, dark] = [0, 1].map(mode =>
    Object.fromEntries(
      Object.keys(tokens)
        .filter(token => token.startsWith('--color-'))
        .map(token => [token, resolveColor(tokens[token], tokens, mode)]),
    ),
  );
  if (Object.keys(light).some(token => light[token] !== dark[token]))
    return ['light', 'dark'];
  // One mode: the one its page color reads as.
  const body = parseColor(light['--color-background-body'] ?? '');
  const lightness = body ? body.r + body.g + body.b : 765;
  return lightness < 383 ? ['dark'] : ['light'];
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
