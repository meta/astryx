// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file keyboardFieldPart.tsx
 * @input A text field's element and its keyboard options
 * @output MobileKeyboardField, which keeps the focused field above the
 *   on-screen keyboard and renders nothing
 * @position The text fields' touch part. Only useDeferredMobileKeyboard.tsx
 *   imports it, through the touch loader, so the keyboard module loads after
 *   first paint
 */

import type {RefObject} from 'react';
import {
  useMobileKeyboard,
  type MobileKeyboardOptions,
} from './useMobileKeyboard';

interface MobileKeyboardFieldProps {
  readonly targetRef: RefObject<HTMLElement | null>;
  readonly options?: MobileKeyboardOptions;
}

/** Keeps the field above the on-screen keyboard. It renders nothing. */
export function MobileKeyboardField({
  targetRef,
  options,
}: MobileKeyboardFieldProps): null {
  useMobileKeyboard(targetRef, options);
  return null;
}
