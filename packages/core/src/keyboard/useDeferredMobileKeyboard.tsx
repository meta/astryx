// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useDeferredMobileKeyboard.tsx
 * @input A text field's element and its keyboard options
 * @output useDeferredMobileKeyboard: the element that keeps the focused field
 *   above the on-screen keyboard once the touch loader has loaded it, else
 *   null
 * @position Used by TextInput, TextArea and NumberInput. The keyboard module
 *   is their touch part, so it leaves their first load
 */

import type {ReactNode, RefObject} from 'react';
import {createTouchPart, useTouchPart} from '../utils/touchRuntime';
import type {MobileKeyboardOptions} from './useMobileKeyboard';

const keyboardFieldPart = createTouchPart(
  async () => import('./keyboardFieldPart'),
);

/**
 * The element that keeps the field above the on-screen keyboard. The field
 * renders it. Until the touch loader has loaded the keyboard module (after
 * first paint), it is null, and a focused field keeps the browser's own
 * reveal.
 */
export function useDeferredMobileKeyboard(
  targetRef: RefObject<HTMLElement | null>,
  options?: MobileKeyboardOptions,
): ReactNode {
  const part = useTouchPart(keyboardFieldPart);
  return part == null ? null : (
    <part.MobileKeyboardField targetRef={targetRef} options={options} />
  );
}
