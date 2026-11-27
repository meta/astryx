// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file selectableCardGroupContext.ts
 * @input The selection, input and disabled state of a group of cards
 * @output SelectableCardGroupContext: what a group gives each SelectableCard
 *   that its `value` makes a member
 * @position Internal: Lab's SelectableCardGroup provides it through
 *   `@astryxdesign/core/internal/selectable-card`. It is not public API.
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

/** What a group gives each card that it names by `value`. */
export interface SelectableCardGroupMembership {
  /** `radio` makes each member one choice of a single-choice set. */
  readonly inputType: 'checkbox' | 'radio';
  /** The members' input `name`. Radios that share it form one native group. */
  readonly inputName: string;
  /** The name that the chosen radio member submits its value under. */
  readonly submitName: string;
  /** Disables every member. A member can also disable itself. */
  readonly isDisabled: boolean;
  readonly isSelected: (value: string) => boolean;
  readonly onMemberChange: (value: string, isSelected: boolean) => void;
}

/**
 * Without a provider, a card with a `value` has no group. Membership stops at
 * a layer boundary, so a card in a layer opened from a member is not a member.
 */
export const SelectableCardGroupContext =
  createLayerScopedContext<SelectableCardGroupMembership | null>(
    'SelectableCardGroupContext',
    1,
    null,
  );
SelectableCardGroupContext.displayName = 'SelectableCardGroupContext';
