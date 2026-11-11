// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swipeHost.ts
 * @input Nothing at runtime
 * @output Exports the public swipe-action types: SwipeAction,
 *   SwipeActionVariant, SwipeBehavior, CreateSwipeOptions and the opaque Swipe.
 *   Also the contract between a row and the runtime a Swipe value carries
 *   (SwipeHost, SwipeRowFacts, SwipeAttachment), and the deprecated path's
 *   layer contract (SwipeBridge, SwipeLayerProps). makeSwipe makes a Swipe
 *   value for a host, and swipeHostOf finds it again
 * @position The one swipe module a row imports at runtime: it holds no
 *   gesture, animation or rendering code, and no swipe rule. createSwipe.ts
 *   brings those, so they ship only with a caller that uses swipe actions.
 */

import type {KeyboardEvent, ReactNode} from 'react';
import type {StyleXStyles} from '@stylexjs/stylex';
import {realmValue, sharedKey} from '../utils/sharedRealm';

/**
 * How the action looks: ordinary, the one you mean, the dangerous one. Not a
 * status set: a verb is not a state.
 */
export type SwipeActionVariant = 'neutral' | 'accent' | 'destructive';

/**
 * One verb. The row renders it as a filled surface in its `variant`'s colour
 * with the icon above the label. Every field is known before the gesture
 * begins.
 */
export interface SwipeAction {
  id?: string;
  /**
   * The verb's name, and the button's accessible name while the row rests
   * open. Names the state the verb reaches ("Unread"), since the gesture
   * already supplies the verb.
   */
  label: string;
  /** Drawn above the label. */
  icon?: ReactNode;
  /**
   * Fires on a tap on a resting entry, on the full-swipe accelerator, or on a
   * `commit` release. When the row slides out (a full swipe, a commit, a tapped
   * entry with `hasRemoval`), it fires once the row's content has left its box.
   * A tapped entry without `hasRemoval` fires at the tap. May return a Promise;
   * the row waits for nothing. Not `onClick`: a commit fires with no click.
   */
  onActivate: () => void | Promise<void>;
  isDisabled?: boolean;
  /** @default 'accent' */
  variant?: SwipeActionVariant;
  /**
   * After this action activates, the row holds out rather than springing
   * back. Only that: not a promise the caller removes the row, not an
   * animation, not a timing rule. Independent of `swipeBehavior` and of
   * `variant`; all combinations occur.
   * @default false
   */
  hasRemoval?: boolean;
}

/**
 * `reveal`: a fast release goes the way it moves, and a slow one rests the
 * row open past half the panel. The open row's entries are real buttons. A
 * fling never fires an entry. A long drag fires the outermost: past the
 * confirm point the row runs ahead and the outermost entry covers its place.
 * Backing out closes the row. On a side with two or more entries, only a
 * drag that starts on the open row fires. `commit`: a release past the
 * confirm point slides the row out and fires the one entry of a side.
 * Nothing rests, and the panel is presentational. On a side with two or more
 * entries, `commit` fires none.
 */
export type SwipeBehavior = 'reveal' | 'commit';

/**
 * The verbs a sideways drag uncovers on each side, outermost last, and what a
 * swipe does on both sides. `leading` is uncovered by a drag toward the inline
 * end, `trailing` by one toward the inline start.
 */
export interface CreateSwipeOptions {
  /** Uncovered by a drag toward the inline end (rightward in LTR); outermost last. */
  leading?: ReadonlyArray<SwipeAction>;
  /** Uncovered by a drag toward the inline start (leftward in LTR); outermost last. */
  trailing?: ReadonlyArray<SwipeAction>;
  /**
   * What a swipe does; applies to both sides. `reveal`: a release opens or
   * closes the row by its speed, then by half the panel's width. The open
   * row rests with every entry a real button. A fling never fires an entry,
   * and a long drag fires the outermost. On a side with two or more entries,
   * only a drag from the open row fires it. `commit`: a lift past the confirm
   * point slides the row out and fires the one entry of a side. Nothing
   * rests, and the panel is presentational. On a side with two or more
   * entries, `commit` fires none and warns in development. A commit is not a
   * removal: the row springs back unless the entry has `hasRemoval`.
   * @default 'reveal'
   */
  swipeBehavior?: SwipeBehavior;
}

/**
 * The configured swipe actions. Callers create it only through `createSwipe`
 * and pass it only to `swipe`; its contents are not public.
 */
export interface Swipe {
  /**
   * A brand that is never present, so the swipe types of the package and a
   * swizzled copy match.
   */
  readonly '@astryxdesign/core/swipe/v1'?: never;
}

/**
 * What a row knows about itself that decides whether swipe actions serve it,
 * handed to the runtime with its root. The runtime decides.
 */
export interface SwipeRowFacts {
  /** The root's role, if it has one. */
  readonly role: string | undefined;
  readonly isDisabled: boolean;
  /** The row is the enlarged target of a control inside it. */
  readonly isDelegate: boolean;
  /** The root is itself a link. */
  readonly isLinkRoot: boolean;
}

/**
 * What the runtime gives a row it serves. The row's root takes its style: the
 * travel it moves by, and the touch it leaves the browser. The root also
 * carries its handlers. Inside its root, the row renders the layer: the panels
 * and the gesture, which attaches to the root itself.
 */
export interface SwipeAttachment {
  readonly rootStyle: StyleXStyles;
  readonly rootProps: {readonly onKeyDown: (event: KeyboardEvent) => void};
  readonly layer: ReactNode;
}

/**
 * A Swipe value as a row reads it: the declared actions, and the runtime the
 * value carries. A row hands that runtime its facts and its root.
 */
export interface SwipeHost {
  readonly leading: ReadonlyArray<SwipeAction>;
  readonly trailing: ReadonlyArray<SwipeAction>;
  readonly behavior: SwipeBehavior;
  /** Whether swipe actions serve a row with these facts. */
  readonly serves: (facts: SwipeRowFacts) => boolean;
  /** Whether the row is served, and if so, how (createSwipe.ts). */
  readonly attach: (facts: SwipeRowFacts) => SwipeAttachment | null;
}

/**
 * The deprecated path's bridge: the key handler
 * Item's root forwards its key events into (Escape closes a resting row).
 * The layer writes it when it mounts and clears it when it leaves; the root
 * reads it on every event.
 * Leaves with the deprecated props.
 */
export interface SwipeBridge {
  onKeyDown: (event: KeyboardEvent) => void;
}

/** What the swipe layer takes. */
export interface SwipeLayerProps {
  /**
   * The deprecated path only. It is called when the layer mounts, with the
   * gesture for Item's root to forward into, and with `null` when the layer
   * leaves. A row given `swipe` routes its root's keys through the
   * runtime instead (swipeRoots.ts).
   */
  onBridge?: (bridge: SwipeBridge | null) => void;
  leading: ReadonlyArray<SwipeAction>;
  trailing: ReadonlyArray<SwipeAction>;
  behavior: SwipeBehavior;
}

// The host of every Swipe value: the value itself carries nothing a caller
// can read, and a value built by hand has none. Registered, so a swizzled
// Item finds the host of the package's Swipe value.
const hosts = realmValue(
  sharedKey('swipe/hosts', 1),
  () => new WeakMap<Swipe, SwipeHost>(),
  value => value instanceof WeakMap,
);

/** Makes a Swipe value for a host (createSwipe.ts). */
export function makeSwipe(host: SwipeHost): Swipe {
  const swipe: Swipe = Object.freeze({});
  hosts.set(swipe, host);
  return swipe;
}

/** The host of a Swipe value, or null for a value it did not make. */
export function swipeHostOf(swipe: Swipe): SwipeHost | null {
  return hosts.get(swipe) ?? null;
}
