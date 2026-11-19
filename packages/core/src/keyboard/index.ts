// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input keyboardHeight.ts, keyboardLayoutGuide.ts, keyboardModel.ts and
 *   rideKeyboard.ts
 * @output Re-exports the on-screen keyboard module, the keyboard layout
 *   guide and rideKeyboard, with their types
 * @position Entry of the keyboard module. It is internal to core, and the
 *   package entry point exports nothing here.
 *
 * SYNC: When modified, update /packages/core/src/keyboard/README.md
 */

export {
  findTextEntryControl,
  getKeyboardHeight,
  isKeyboardMeasurable,
  isTextEntryControl,
  measureKeyboardHeight,
  refuseFocusReveal,
  subscribeKeyboardHeight,
  watchRevealPan,
  type KeyboardHeightEvent,
  type RefuseFocusRevealOptions,
  type RevealPanWatch,
  type WatchRevealPanOptions,
} from './keyboardHeight';
export {
  bringsUpKeyboard,
  getKeyboardLayoutGuide,
  keyboardProfileOf,
  type KeyboardLayoutGuide,
} from './keyboardLayoutGuide';
export {rideKeyboard} from './rideKeyboard';
export {
  useMobileKeyboard,
  type MobileKeyboard,
  type MobileKeyboardOptions,
} from './useMobileKeyboard';
export {
  createKeyboardModel,
  type KeyboardCurve,
  type KeyboardModel,
  type KeyboardProfile,
  type KeyboardTransition,
  type KeyboardTransitionKind,
} from './keyboardModel';
