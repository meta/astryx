// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {fontServiceFamilies, importedFontFamilies} from './font-stylesheet.mjs';

describe('fontServiceFamilies', () => {
  it('reads every family a font service URL requests', () => {
    expect([
      ...fontServiceFamilies(
        'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Fraunces:opsz,wght@9..144,400&display=swap',
      ),
    ]).toEqual(['jetbrains mono', 'fraunces']);
    expect([
      ...fontServiceFamilies(
        '//fonts.googleapis.com/css?family=Roboto:400,700|Open+Sans:400',
      ),
    ]).toEqual(['roboto', 'open sans']);
    expect([
      ...fontServiceFamilies(
        'https://fonts.googleapis.com/icon?family=Material+Icons',
      ),
    ]).toEqual(['material icons']);
  });

  it('reads nothing from a URL with no family parameter', () => {
    expect(fontServiceFamilies('https://fonts.example/ocean.css').size).toBe(0);
  });

  it('is what an imported font service URL loads', () => {
    expect([
      ...importedFontFamilies(
        'https://fonts.googleapis.com/css?family=Roboto|Lato',
        '/',
      ),
    ]).toEqual(['roboto', 'lato']);
  });
});
