// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file mergeComponents.test.ts
 * Tests that a component, style key, or property left undefined is not set
 * when component style maps merge, and that null keeps its meaning.
 */

import {describe, expect, it} from 'vitest';
import type {ComponentStyleMap} from './defineTheme';
import {deepMergeComponents} from './mergeComponents';

/** A map typed as authored, holding the undefined a test gives it. */
const map = (value: unknown) => value as ComponentStyleMap;

describe('deepMergeComponents', () => {
  const base = map({
    card: {base: {padding: '8px', '@dark': {color: 'white'}}},
    button: {base: {margin: '2px'}},
  });

  it('keeps the inherited component, style key and value an override leaves undefined', () => {
    const merged = deepMergeComponents(
      base,
      map({
        card: {base: {padding: undefined, '@dark': {color: undefined}}},
        button: undefined,
        link: {base: undefined},
      }),
    );
    expect(merged).toEqual({
      card: {base: {padding: '8px', '@dark': {color: 'white'}}},
      button: {base: {margin: '2px'}},
      link: {},
    });
  });

  it('drops what a single map leaves undefined', () => {
    expect(
      deepMergeComponents(
        undefined,
        map({
          card: {base: {padding: undefined, margin: '4px'}},
          button: undefined,
        }),
      ),
    ).toEqual({card: {base: {margin: '4px'}}});
  });

  it('keeps null as a value that replaces the inherited one', () => {
    expect(
      deepMergeComponents(base, map({card: {base: {padding: null}}}))?.card
        ?.base,
    ).toEqual({padding: null, '@dark': {color: 'white'}});
  });
});
