// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BaseTypeaheadFocusContext.ts
 * @input Uses createSharedContext
 * @output Exports BaseTypeaheadFocusContext (internal; not re-exported)
 * @position Internal to Typeahead; provided by a composing field (Typeahead,
 *   Tokenizer), read by BaseTypeahead
 *
 * Focus wiring a composing field gives the BaseTypeahead inside it.
 * `inputReturnTarget` names the element a dialog-role menu returns focus to
 * in place of the input, when the field hides the input (Typeahead's token).
 * Tokenizer provides two refs: `menuFocusReturn` is `true` while a
 * dialog-role menu's close returns focus, so the field keeps that focus on
 * the token; and `pressedOpener` holds the token control a click activates,
 * which `open()` records as the menu's opener even when the click did not
 * focus it (a click does not focus a button in Safari).
 */

import type {RefObject} from 'react';
import {createSharedContext} from '../utils/sharedContext';

export interface BaseTypeaheadFocusWiring {
  inputReturnTarget?: () => HTMLElement | null;
  menuFocusReturn?: RefObject<boolean>;
  pressedOpener?: RefObject<HTMLElement | null>;
}

export const BaseTypeaheadFocusContext =
  createSharedContext<BaseTypeaheadFocusWiring | null>(
    'BaseTypeaheadFocusContext',
    1,
    null,
  );
BaseTypeaheadFocusContext.displayName = 'BaseTypeaheadFocusContext';
