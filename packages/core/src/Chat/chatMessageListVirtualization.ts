// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file chatMessageListVirtualization.ts
 * @input None
 * @output The key under which the capability carries the windowed renderer,
 *   and the public capability and handle types
 * @position ChatMessageList's wiring for windowing. The hook puts the
 *   renderer in the capability, so a list that never imports the hook
 *   carries this module only, not the window or its engine.
 */
import type {ComponentType, ReactNode, Ref} from 'react';
import {sharedKey} from '../utils/sharedRealm';
import type {SpacingStep} from '../utils/types';
import type {ChatDensity} from './ChatContext';

// A registered key, so a swizzled list reads a capability the package's hook
// made, and the package reads a copy's.
export const VIRTUALIZATION_CAPABILITY = sharedKey('chat/window', 1);

/** Where `scrollToItem` places an item in the scrollport. */
export type ChatMessageListItemAlign = 'start' | 'center' | 'end';

export interface ChatMessageListScrollToItemOptions {
  /**
   * `'start'` puts the item's top at the top of the scrollport, `'center'`
   * centers it, and `'end'` puts its bottom at the bottom.
   * @default 'start'
   */
  align?: ChatMessageListItemAlign;
}

/** Imperative handle of a windowed ChatMessageList. */
export interface ChatMessageListHandle {
  /**
   * Scrolls to an item, mounted or not, and stops following the newest
   * message. The item stays at `align` while the rows around it measure,
   * until the reader scrolls. Returns false when no item has the key.
   */
  scrollToItem: (
    key: string | number,
    options?: ChatMessageListScrollToItemOptions,
  ) => boolean;
}

/** Opaque windowing capability for `ChatMessageList.virtualization`. */
export interface ChatMessageListVirtualizationCapability {
  /**
   * A brand that is never present at runtime. It is required, so only the
   * hook makes a capability, and its name is the same in a swizzled copy.
   */
  readonly '@astryxdesign/core/chat-message-list-virtualization/v1': never;
}

/** What ChatMessageList gives the windowed renderer. Internal. */
export interface ChatMessageListWindowProps {
  items: ReadonlyArray<unknown>;
  getItemKey: (item: unknown, index: number) => string | number;
  renderItem: (item: unknown, index: number) => ReactNode;
  estimateItemSize:
    number | ((item: unknown, index: number) => number) | undefined;
  density: ChatDensity;
  gap: SpacingStep | undefined;
  handleRef: Ref<ChatMessageListHandle> | undefined;
}

/** What the capability carries. Internal. */
export interface ChatMessageListWindowing {
  readonly Window: ComponentType<ChatMessageListWindowProps>;
}
