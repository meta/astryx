// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {pickInvertedSide, pickMediaMode} from './mediaSide';
import {parseColor} from '../utils/color';

const rgb = (value: string) => {
  const parsed = parseColor(value);
  if (parsed === null) {
    throw new Error(`bad test color ${value}`);
  }
  return parsed;
};

const onDark = rgb('#FFFFFF');
const onLight = rgb('#171717');
// The theme's --color-text-primary, per color mode.
const ambientLight = rgb('#171717');
const ambientDark = rgb('#FAFAFA');

describe('pickMediaMode', () => {
  it('picks dark for a dark surface under a light page', () => {
    expect(pickMediaMode(rgb('#0A1317'), ambientLight, onDark, onLight)).toBe(
      'dark',
    );
  });

  it('picks light for a light surface under a dark page', () => {
    expect(pickMediaMode(rgb('#FFFFFF'), ambientDark, onDark, onLight)).toBe(
      'light',
    );
  });

  // The bug this exists for: a theme whose "inverted" background is a pale
  // grey, where a hardcoded mode="dark" paints white text at 1.25:1.
  it('answers off for a surface a theme merely calls inverted', () => {
    // Ambient already reads at 14.36; no media side improves on it, so a
    // media context would churn accent and overlays for nothing.
    expect(pickMediaMode(rgb('#E4E6EB'), ambientLight, onDark, onLight)).toBe(
      'off',
    );
  });

  it('answers off for a chromatic surface its ambient text already reads on', () => {
    // The dark-mode error toast: ambient 4.50 clears the bar. Verified in
    // Chromium that this renders identically to mode="dark" — a dark page
    // already resolves those tokens to what the media context would install.
    expect(pickMediaMode(rgb('#E3193B'), ambientDark, onDark, onLight)).toBe(
      'off',
    );
  });

  it('picks dark for a saturated surface under a light page', () => {
    // The light-mode error toast: a deeper red, where the page's near-black
    // text only manages 2.35 and the surface genuinely needs inverting.
    expect(pickMediaMode(rgb('#AA071E'), ambientLight, onDark, onLight)).toBe(
      'dark',
    );
  });

  it('respects a theme that overrides its on-colors', () => {
    // The decision follows the theme's own values, not an assumption that
    // on-dark is white.
    expect(
      pickMediaMode(
        rgb('#0A1317'),
        ambientLight,
        rgb('#101010'),
        rgb('#F0F0F0'),
      ),
    ).toBe('light');
  });

  it('composites a translucent on-color before judging it', () => {
    // Ambient (1.44) does not read, so a side must be chosen. Raw white would
    // score 4.54 here and win; composited at 10% alpha it is 1.21 and loses.
    expect(
      pickMediaMode(
        rgb('#767676'),
        rgb('#8A8A8A'),
        rgb('rgba(255,255,255,0.10)'),
        rgb('#171717'),
      ),
    ).toBe('light');
  });

  it('picks a side when the ambient color cannot be read at all', () => {
    // Unparseable token: it cannot conclude "no media wanted", so it inverts.
    expect(pickMediaMode(rgb('#0A1317'), null, onDark, onLight)).toBe('dark');
  });

  it('treats the bar as a floor, not a target', () => {
    // 3.45:1 is poor for body text but clears the bar: the theme is rendering
    // this successfully and a media context would not make it more legible.
    // Deliberately NOT corrected — this is not a WCAG enforcer.
    expect(pickMediaMode(rgb('#8A8A8A'), rgb('#FFFFFF'), onDark, onLight)).toBe(
      'off',
    );
  });

  it('gives up when an on-color is unreadable', () => {
    expect(
      pickMediaMode(rgb('#0A1317'), ambientLight, null, onLight),
    ).toBeNull();
    expect(
      pickMediaMode(rgb('#0A1317'), ambientLight, onDark, null),
    ).toBeNull();
  });
});

describe('pickInvertedSide', () => {
  it('gives an inverted card the on-color that reads best, even where the page text clears 3:1', () => {
    // A dark-mode error card under an off-white page text: the page text
    // reads at about 4.15:1, white at 4.70:1, so the card takes white.
    expect(
      pickInvertedSide(rgb('#E3193B'), rgb('#F0F0F9'), onDark, onLight),
    ).toBe('dark');
  });

  it('keeps the page text when it reads at least as well as both on-colors', () => {
    expect(
      pickInvertedSide(rgb('#E4E6EB'), ambientLight, onDark, onLight),
    ).toBe('off');
    expect(
      pickInvertedSide(rgb('#E3193B'), rgb('#FFFFFF'), onDark, onLight),
    ).toBe('off');
  });

  it('picks a side when the page text cannot be read', () => {
    expect(pickInvertedSide(rgb('#0A1317'), null, onDark, onLight)).toBe(
      'dark',
    );
  });

  it('gives up when an on-color is unreadable', () => {
    expect(
      pickInvertedSide(rgb('#0A1317'), ambientLight, null, onLight),
    ).toBeNull();
  });
});
