// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BaseTypeaheadFocusContext.ts
 * @input Uses createSharedContext
 * @output Exports BaseTypeaheadFocusContext (internal; not re-exported)
 * @position Internal to Typeahead; provided by a composing field, read by
 *   BaseTypeahead
 *
 * Focus wiring a composing field gives the BaseTypeahead inside it.
 * `inputReturnTarget` names the element a dialog-role menu returns focus to
 * in place of the input, when the field hides the input (Typeahead's token).
 */

import {createSharedContext} from '../utils/sharedContext';

export interface BaseTypeaheadFocusWiring {
  inputReturnTarget?: () => HTMLElement | null;
}

export const BaseTypeaheadFocusContext =
  createSharedContext<BaseTypeaheadFocusWiring | null>(
    'BaseTypeaheadFocusContext',
    1,
    null,
  );
BaseTypeaheadFocusContext.displayName = 'BaseTypeaheadFocusContext';
