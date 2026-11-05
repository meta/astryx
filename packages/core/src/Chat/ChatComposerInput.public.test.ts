// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatComposerInput.public.test.ts
 * @input The package entry's ChatComposerInputProps and EnterKeyHint
 * @output Guards that the composer's `enterKeyHint` takes the text fields'
 *   closed, exported union of HTML-standard Return-key values. An arbitrary
 *   or unnarrowed string does not type-check.
 * @position Public API test guarding @astryxdesign/core; `pnpm typecheck`
 *   runs its type assertions
 */

import {describe, expectTypeOf, it} from 'vitest';
import type {ChatComposerInputProps, EnterKeyHint} from '../index';

type ReturnKey = Pick<ChatComposerInputProps, 'enterKeyHint'>;

describe('ChatComposerInput enterKeyHint type', () => {
  it('is the exported closed union of the HTML-standard values', () => {
    expectTypeOf<
      NonNullable<ChatComposerInputProps['enterKeyHint']>
    >().toEqualTypeOf<EnterKeyHint>();
    expectTypeOf<
      NonNullable<ChatComposerInputProps['enterKeyHint']>
    >().toEqualTypeOf<
      'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send'
    >();
  });

  it('rejects a string outside the standard values', () => {
    const returnKey: ReturnKey = {
      // @ts-expect-error -- not a Return key the HTML standard defines
      enterKeyHint: 'submit',
    };
    expectTypeOf(returnKey).toEqualTypeOf<ReturnKey>();
  });

  it('rejects a string that has not been narrowed to the union', () => {
    const fromServer: string = 'send';
    // @ts-expect-error -- a plain string must be narrowed first
    const returnKey: ReturnKey = {enterKeyHint: fromServer};
    expectTypeOf(returnKey).toEqualTypeOf<ReturnKey>();
  });
});
