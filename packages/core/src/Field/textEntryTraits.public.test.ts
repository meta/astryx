// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textEntryTraits.public.test.ts
 * @input The package entry's keyboard-trait types and the props of the fields
 *   that take them
 * @output Guards that `enterKeyHint`, `inputMode` and `autoCapitalize` are
 *   closed unions of the HTML-standard values, importable from the package
 *   entry, and that an arbitrary or unnarrowed string does not type-check
 * @position Public API test guarding @astryxdesign/core; `pnpm typecheck`
 *   runs its type assertions
 */

import {describe, expectTypeOf, it} from 'vitest';
import type {
  TextAreaProps,
  AutoCapitalize,
  EnterKeyHint,
  InputMode,
  TextInputProps,
} from '../index';

type Traits = Pick<
  TextInputProps,
  'enterKeyHint' | 'inputMode' | 'autoCapitalize'
>;

describe('keyboard-trait types', () => {
  it('are closed unions of the HTML-standard values', () => {
    expectTypeOf<EnterKeyHint>().toEqualTypeOf<
      'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send'
    >();
    expectTypeOf<InputMode>().toEqualTypeOf<
      | 'none'
      | 'text'
      | 'tel'
      | 'url'
      | 'email'
      | 'numeric'
      | 'decimal'
      | 'search'
    >();
    expectTypeOf<AutoCapitalize>().toEqualTypeOf<
      'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters'
    >();
  });

  it('type the props of every field that takes them', () => {
    expectTypeOf<
      NonNullable<TextInputProps['enterKeyHint']>
    >().toEqualTypeOf<EnterKeyHint>();
    expectTypeOf<
      NonNullable<TextInputProps['inputMode']>
    >().toEqualTypeOf<InputMode>();
    expectTypeOf<
      NonNullable<TextInputProps['autoCapitalize']>
    >().toEqualTypeOf<AutoCapitalize>();
    expectTypeOf<
      NonNullable<TextAreaProps['enterKeyHint']>
    >().toEqualTypeOf<EnterKeyHint>();
    expectTypeOf<
      NonNullable<TextAreaProps['inputMode']>
    >().toEqualTypeOf<InputMode>();
    expectTypeOf<
      NonNullable<TextAreaProps['autoCapitalize']>
    >().toEqualTypeOf<AutoCapitalize>();
  });

  it('reject a string outside the standard values', () => {
    const traits: Traits = {
      // @ts-expect-error -- not a Return key the HTML standard defines
      enterKeyHint: 'submit',
      // @ts-expect-error -- not a keyboard the HTML standard defines
      inputMode: 'number',
      // @ts-expect-error -- not a capitalization the HTML standard defines
      autoCapitalize: 'title',
    };
    expectTypeOf(traits).toEqualTypeOf<Traits>();
  });

  it('reject a string that has not been narrowed to the union', () => {
    const fromServer: string = 'send';
    // @ts-expect-error -- a plain string must be narrowed first
    const enterKeyHint: EnterKeyHint = fromServer;
    // @ts-expect-error -- a plain string must be narrowed first
    const inputMode: InputMode = fromServer;
    // @ts-expect-error -- a plain string must be narrowed first
    const autoCapitalize: AutoCapitalize = fromServer;
    expectTypeOf({enterKeyHint, inputMode, autoCapitalize}).toEqualTypeOf<{
      enterKeyHint: EnterKeyHint;
      inputMode: InputMode;
      autoCapitalize: AutoCapitalize;
    }>();
  });
});
