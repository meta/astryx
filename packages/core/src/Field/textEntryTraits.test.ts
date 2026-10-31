// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textEntryTraits.test.ts
 * @input textEntryTraitAttributes
 * @output Tests the mapping from keyboard-trait props to native attributes
 * @position Unit tests for Field/textEntryTraits.ts
 */

import {describe, expect, it} from 'vitest';
import {textEntryTraitAttributes} from './textEntryTraits';

describe('textEntryTraitAttributes', () => {
  it('renders nothing for absent traits', () => {
    expect(textEntryTraitAttributes({})).toEqual({});
  });

  it('passes the string traits through unchanged', () => {
    expect(
      textEntryTraitAttributes({
        enterKeyHint: 'previous',
        inputMode: 'none',
        autoCapitalize: 'characters',
      }),
    ).toEqual({
      enterKeyHint: 'previous',
      inputMode: 'none',
      autoCapitalize: 'characters',
    });
  });

  it('maps hasAutoCorrect onto the on/off keyword', () => {
    expect(textEntryTraitAttributes({hasAutoCorrect: true})).toEqual({
      autoCorrect: 'on',
    });
    expect(textEntryTraitAttributes({hasAutoCorrect: false})).toEqual({
      autoCorrect: 'off',
    });
  });

  it('omits a trait explicitly set to undefined', () => {
    expect(
      textEntryTraitAttributes({
        enterKeyHint: undefined,
        hasAutoCorrect: undefined,
      }),
    ).toEqual({});
  });
});
