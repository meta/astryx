// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file selectableCardInput.ts
 * @input A card group's choice of native input for each card it renders
 * @output SelectableCardInputContext: the input type, name and value a group
 *   gives one SelectableCard
 * @position Internal: Lab's SelectableCardGroup provides it through
 *   `@astryxdesign/core/internal/selectable-card`. It is not public API, so
 *   SelectableCard's public props do not change.
 */

import {createSharedContext} from '../utils/sharedContext';

/** The native input a group gives one card. */
export interface SelectableCardInput {
  /** `radio` makes the card one choice of a single-choice set. */
  readonly type: 'checkbox' | 'radio';
  /** The input's `name`. Radios that share it form one native group. */
  readonly name: string;
  /** The input's `value`. A checkbox card submits it when it is selected. */
  readonly value: string;
}

/** Without a provider, a card renders its own checkbox. */
export const SelectableCardInputContext =
  createSharedContext<SelectableCardInput | null>(
    'SelectableCardInputContext',
    1,
    null,
  );
SelectableCardInputContext.displayName = 'SelectableCardInputContext';
