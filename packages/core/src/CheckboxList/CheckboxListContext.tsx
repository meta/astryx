// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CheckboxListContext.tsx
 * @input Uses the private layer-scoped context factory
 * @output Exports CheckboxListContext for parent-child communication
 * @position Internal context; consumed by CheckboxList.tsx and CheckboxListItem.tsx
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

export interface CheckboxListContextValue {
  value?: string[];
  /**
   * Collection-mode change handler. `toggledValue` is the value of the item
   * the user just toggled, so the list can show a loading spinner on that
   * specific item while a `changeAction` promise is pending — no diffing
   * of the value array required.
   */
  onChange?: (values: string[], toggledValue?: string) => void;
  isDisabled: boolean;
  /**
   * True when the whole group is disabled *and* a `disabledMessage` is set. In
   * that mode items stay focusable via `aria-disabled` (instead of the native
   * `disabled` attribute) so the group's disabled-reason tooltip is keyboard-
   * and AT-discoverable; toggling is still blocked.
   */
  hasDisabledMessage?: boolean;
  /**
   * The id of the group's reason tooltip while `hasDisabledMessage` is true.
   * The reason describes the group (CheckboxList FR1) and every checkbox adds
   * it to its own `aria-describedby` (FR9): a screen reader announces a
   * checkbox's description when the checkbox takes focus, which it does not
   * reliably do for a description on the group.
   */
  disabledMessageID?: string;
  isReadOnly: boolean;
  /**
   * Values of the items whose `changeAction` is pending. Each matching item
   * renders an in-checkbox spinner and blocks re-toggling; the list is empty
   * when idle.
   */
  loadingValues?: ReadonlyArray<string>;
}

export const CheckboxListContext =
  createLayerScopedContext<CheckboxListContextValue | null>(null);
CheckboxListContext.displayName = 'CheckboxListContext';
