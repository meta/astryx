// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file bottomSheetEscape.ts
 * @input React context
 * @output BottomSheetEscapeContext: whether Escape (and the platform's close
 *   request) may dismiss the standalone sheet below it
 * @position Internal to Core, not exported from the package: Popover's sheet
 *   presentation passes `hasEscapeDismiss` through it, so its sheet can
 *   light-dismiss (scrim tap, swipe down) while Escape stays off
 *   (component:Popover DEC-8). A standalone BottomSheet reads the default
 *   (true), so its `purpose` rule is unchanged.
 */

import {createContext} from 'react';

/** Whether Escape may dismiss the sheet; `purpose="required"` still blocks it. */
export const BottomSheetEscapeContext = createContext(true);
BottomSheetEscapeContext.displayName = 'BottomSheetEscapeContext';
