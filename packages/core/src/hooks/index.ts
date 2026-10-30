// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports hooks from individual files
 * @output Exports all hooks
 * @position Hook entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header
 */

export {hasActiveFocusTrapEscape, useFocusTrap} from './useFocusTrap';
export type {UseFocusTrapOptions, UseFocusTrapReturn} from './useFocusTrap';

export {useAnnounce} from './useAnnounce';
export type {AnnounceFn, AnnouncePoliteness} from './useAnnounce';

export {useClipboard} from './useClipboard';
export type {UseClipboardOptions, UseClipboardReturn} from './useClipboard';

export {useGridFocus} from './useGridFocus';
export type {UseGridFocusOptions, UseGridFocusReturn} from './useGridFocus';

export {useListFocus} from './useListFocus';
export type {
  UseListFocusOptions,
  UseListFocusReturn,
  ListFocusOrientation,
} from './useListFocus';

export {useTreeFocus} from './useTreeFocus';
export type {UseTreeFocusOptions, UseTreeFocusReturn} from './useTreeFocus';

export {useHotkeys} from './useHotkeys';
export type {Hotkey} from './useHotkeys';

export {useTypeahead} from './useTypeahead';

export {
  useMenuPress,
  MENU_PRESS_MARKER,
  isMenuPressActivation,
} from './useMenuPress';
export type {UseMenuPressOptions, UseMenuPressReturn} from './useMenuPress';
export {menuPressStep, MENU_PRESS_SETTLE_MS} from './menuPressGesture';
export type {
  MenuPressEffect,
  MenuPressEvent,
  MenuPressGesture,
  MenuPressPointerType,
  MenuPressStep,
} from './menuPressGesture';

export {useKeyboardHint} from './useKeyboardHint';
export type {
  UseKeyboardHintOptions,
  UseKeyboardHintReturn,
  KeyboardHintOrientation,
} from './useKeyboardHint';
export type {UseTypeaheadOptions, UseTypeaheadReturn} from './useTypeahead';

export {useMediaQuery} from './useMediaQuery';

export {useMergedRefs} from './useMergedRefs';

export {useOverflow} from './useOverflow';
export type {UseOverflowOptions, UseOverflowReturn} from './useOverflow';

export {useScrollOverflow} from './useScrollOverflow';
export type {ScrollOverflowState} from './useScrollOverflow';

export {useScrollableArea} from './useScrollableArea';
export type {
  ScrollAxis,
  ScrollAxisState,
  ScrollOverscroll,
  ScrollStickyContainment,
  ScrollKeyboardAccess,
  ScrollableAreaState,
  ScrollableElementProps,
  UseScrollableAreaOptions,
  UseScrollableAreaResult,
} from './useScrollableArea';

export {useScrollLock} from './useScrollLock';

export {useAnimatedLayout} from './useAnimatedLayout';
export type {
  AnimatedLayout,
  UseAnimatedLayoutOptions,
} from './useAnimatedLayout';

export {useEntryAnimation} from './useEntryAnimation';
export type {EntryAnimationPreset} from './useEntryAnimation';

export {useStreamingText} from './useStreamingText';
export type {
  StreamingTextSpeed,
  UseStreamingTextOptions,
} from './useStreamingText';
export {useImageMode} from './useImageMode';
export type {ImageSampleRegion, UseImageModeOptions} from './useImageMode';

export {
  useClickableContainer,
  INTERACTIVE_SELECTORS,
  hasInteractiveAncestor,
  hasTextSelection,
} from './useClickableContainer';
export type {
  UseClickableContainerOptions,
  ClickableContainerResult,
} from './useClickableContainer';

export {useInputContainer} from './useInputContainer';
export type {UseInputContainerOptions} from './useInputContainer';

export {useInputStatusIcon} from './useInputStatusIcon';
export type {
  UseInputStatusIconOptions,
  UseInputStatusIconReturn,
} from './useInputStatusIcon';

export {useInteractiveRole} from './useInteractiveRole';
export type {
  InteractiveRole,
  UseInteractiveRoleOptions,
} from './useInteractiveRole';

export {useLongPress} from './useLongPress';
export type {UseLongPressOptions, UseLongPressHandlers} from './useLongPress';

export {usePressFeedback} from './usePressFeedback';

export {useDevWarning} from './useDevWarning';
export {useIndicatorFocusRing} from './useIndicatorFocusRing';

export {useContainerReveal} from './useContainerReveal';
export type {
  UseContainerRevealOptions,
  UseContainerRevealReturn,
  ContainerRevealOptions,
  ContentRevealOptions,
} from './useContainerReveal';
