// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guest token pairs in the enterprise fixture meet text contrast.
 *
 * The guest subtree redefines generic token names. Each text-on-surface pair
 * that `fixtures:contrast` measures in a real browser is checked here from the
 * token values in the fixture's CSS, so a palette change that drops a pair
 * below 4.5:1 fails in the unit suite. The browser check still owns what only
 * rendering shows: the cascade resolving these values at every boundary.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const FIXTURE = path.join(
  import.meta.dirname,
  '../fixtures/enterprise-scoped-synthetic/src',
);
const BROWSER_CHECK = path.join(
  import.meta.dirname,
  '../scripts/fixture-browser.mjs',
);
const MINIMUM_CONTRAST = 4.5;
const WHITE = '#ffffff';

/** Reads the guest block (`[data-guest-design-system] { ... }`) from the CSS. */
function guestTokens() {
  const css = fs.readFileSync(path.join(FIXTURE, 'index.css'), 'utf8');
  const block = css.match(/\[data-guest-design-system\]\s*\{([^}]*)\}/)?.[1];
  if (block == null) throw new Error('no guest token block in index.css');
  return Object.fromEntries(
    [...block.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(
      ([, name, value]) => [name, value.toLowerCase()],
    ),
  );
}

function rgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The painted color of `foreground` at `alpha` over an opaque `background`. */
function over(foreground, background, alpha) {
  const [fr, fg, fb] = rgb(foreground);
  const [br, bg, bb] = rgb(background);
  const mix = (f, b) => Math.round(f * alpha + b * (1 - alpha));
  return `#${[mix(fr, br), mix(fg, bg), mix(fb, bb)]
    .map(channel => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Each probe the browser check measures, as the token pair App.tsx paints it.
 * `alpha` is the element's opacity (`opacity-75` on the dialog body).
 */
const PAIRS = {
  'guest-callout': {text: '--foreground', surface: '--subtle'},
  'guest-callout-heading': {text: '--accent', surface: '--subtle'},
  'dialog-body': {text: '--foreground', surface: '--panel', alpha: 0.75},
  'dialog-callout': {text: '--foreground', surface: '--subtle'},
  'popover-menu-item': {text: '--foreground', surface: '--panel'},
  'popover-menu-item:hover': {text: '--foreground', surface: '--subtle'},
  'destructive-action': {text: WHITE, surface: '--error'},
};

describe('guest fixture token contrast', () => {
  const tokens = guestTokens();
  const resolve = value => (value.startsWith('--') ? tokens[value] : value);

  it('pairs every probe the browser check measures', () => {
    const source = fs.readFileSync(BROWSER_CHECK, 'utf8');
    const probes = source
      .match(/const CONTRAST_PROBES = \[([\s\S]*?)\];/)?.[1]
      .matchAll(/\['[^']+', '([^']+)'\]/g);
    expect([...(probes ?? [])].map(([, probe]) => probe).sort()).toEqual(
      Object.keys(PAIRS)
        .filter(probe => !probe.endsWith(':hover'))
        .sort(),
    );
  });

  it.each(Object.entries(PAIRS))(
    '%s meets 4.5:1 from the guest token values',
    (probe, {text, surface, alpha = 1}) => {
      const background = resolve(surface);
      const foreground = resolve(text);
      expect(background, `${surface} is not a guest token`).toBeDefined();
      expect(foreground, `${text} is not a guest token`).toBeDefined();
      const ratio = contrast(over(foreground, background, alpha), background);
      expect(
        ratio,
        `${probe}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
    },
  );
});
