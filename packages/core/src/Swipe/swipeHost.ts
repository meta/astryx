// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swipeHost.ts
 * @input Nothing at runtime
 * @output Exports the public swipe-action types: SwipeAction,
 *   ItemSwipeActionVariant, ItemSwipeBehavior, CreateSwipeOptions and the
 *   opaque Swipe.
 *   Also the contract between a row and the runtime a Swipe value carries
 *   (SwipeHost, SwipeRowFacts, SwipeAttachment), and the layer contract
 *   (SwipeBridge, SwipeLayerProps). makeSwipe makes a Swipe
 *   value for a host, swipeHostOf finds it again, and swipeWithItemKey keys
 *   one for a ListItem
 * @position The one swipe module a row imports at runtime: it holds no
 *   gesture, animation or rendering code, and no swipe rule. createSwipe.ts
 *   brings those, so they ship only with a caller that uses swipe actions.
 */

import type {KeyboardEvent, ReactNode} from 'react';
import type {StyleXStyles} from '@stylexjs/stylex';

/**
 * How the action looks: ordinary, the one you mean, the dangerous one. Not a
 * status set: a verb is not a state.
 */
export type ItemSwipeActionVariant = 'neutral' | 'accent' | 'destructive';

/**
 * One verb. The row renders it as a filled surface in its `variant`'s colour
 * with the icon above the label. Every field is known before the gesture
 * begins, so a definition can live at module scope.
 */
export interface SwipeAction<Id extends string = string> {
  /**
   * Names the action. `onActivate` receives it, and a row keys its panel on
   * its actions' ids. A new `swipe` value with the same ids keeps an open row
   * open; one with other ids closes it.
   */
  id: Id;
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
   * A tapped entry without `hasRemoval` fires at the tap. It receives the
   * action's `id` and the row's `itemKey`: a `ListItem`'s, or `undefined` on a
   * plain `Item`. So one handler serves every row, with no closure over a row.
   * May return a Promise; the row waits for nothing. Not `onClick`: a commit
   * fires with no click.
   */
  onActivate: (event: {id: Id; itemKey: string | number | undefined}) => void;
  isDisabled?: boolean;
  /** @default 'accent' */
  variant?: ItemSwipeActionVariant;
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
export type ItemSwipeBehavior = 'reveal' | 'commit';

/**
 * The verbs a sideways drag uncovers on each side, outermost last, and what a
 * swipe does on both sides. `leading` is uncovered by a drag toward the inline
 * end, `trailing` by one toward the inline start.
 */
export interface CreateSwipeOptions<Id extends string = string> {
  /** Uncovered by a drag toward the inline end (rightward in LTR); outermost last. */
  leading?: ReadonlyArray<SwipeAction<Id>>;
  /** Uncovered by a drag toward the inline start (leftward in LTR); outermost last. */
  trailing?: ReadonlyArray<SwipeAction<Id>>;
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
  swipeBehavior?: ItemSwipeBehavior;
}

/**
 * The configured swipe actions. Callers create it only through `createSwipe`
 * and pass it only to `swipe`; its contents are not public. Its type carries
 * its actions' ids.
 */
export interface Swipe<Id extends string = string> {
  /**
   * A brand that is never present, so the swipe types of the package and a
   * swizzled copy match.
   */
  readonly '@astryxdesign/core/swipe/v1'?: never;
  /** The actions' ids, for the type only: never present. */
  readonly '@astryxdesign/core/swipe/ids'?: Id;
}

/**
 * An action as a row runs it: one `createSwipe` made, or an entry of the
 * deprecated `swipeActions`. Such an entry's `id` is optional, and its
 * handler takes nothing. The row calls `onActivate` with the entry's `id` and
 * its key.
 */
export interface SwipeEntry {
  readonly id?: string;
  readonly label: string;
  readonly icon?: ReactNode;
  onActivate(event: {
    id: string;
    itemKey: string | number | undefined;
  }): unknown;
  readonly isDisabled?: boolean;
  readonly variant?: ItemSwipeActionVariant;
  readonly hasRemoval?: boolean;
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
  /** The `itemKey` of the `ListItem` the row is; a plain `Item` has none. */
  readonly itemKey?: string | number;
}

/**
 * What the runtime gives a row it serves. The row's root takes its style: the
 * travel it moves by, and the touch it leaves the browser. Inside its root, the
 * row renders the layer: the panels and the gesture, which attaches to the root
 * itself. The root forwards its key events into the bridge the layer fills.
 */
export interface SwipeAttachment {
  readonly rootStyle: StyleXStyles;
  readonly layer: ReactNode;
}

/**
 * A Swipe value as a row reads it: the declared actions, and the runtime the
 * value carries. A row hands that runtime its facts and its root.
 */
export interface SwipeHost {
  readonly leading: ReadonlyArray<SwipeEntry>;
  readonly trailing: ReadonlyArray<SwipeEntry>;
  readonly behavior: ItemSwipeBehavior;
  /** Whether swipe actions serve a row with these facts. */
  readonly serves: (facts: SwipeRowFacts) => boolean;
  /**
   * Whether the row is served, and if so, how (createSwipe.ts). The row passes
   * the setter of the bridge its root forwards key events into.
   */
  readonly attach: (
    facts: SwipeRowFacts,
    onBridge?: (bridge: SwipeBridge | null) => void,
  ) => SwipeAttachment | null;
}

/**
 * The bridge a row's root forwards its key events into (Escape closes a
 * resting row). The layer writes it when it mounts and clears it when it
 * leaves; the root reads it on every event.
 */
export interface SwipeBridge {
  onKeyDown: (event: KeyboardEvent) => void;
}

/** What the swipe layer takes. */
export interface SwipeLayerProps {
  /**
   * Called when the layer mounts, with the gesture for the row's root to
   * forward its key events into, and with `null` when the layer leaves.
   */
  onBridge?: (bridge: SwipeBridge | null) => void;
  leading: ReadonlyArray<SwipeEntry>;
  trailing: ReadonlyArray<SwipeEntry>;
  behavior: ItemSwipeBehavior;
  /** The row's key, handed to each `onActivate`. */
  itemKey?: string | number;
}

// Each Swipe value carries its host under this key, not enumerable and not
// writable. Every copy of the package makes the same key, so a swizzled Item
// finds the host of the package's value. A value built by hand has none.
const HOST = Symbol.for('@astryxdesign/core/swipe/host');

/** A Swipe value as its makers read it. */
interface HostedSwipe {
  readonly [HOST]?: SwipeHost;
}

/** Makes a Swipe value for a host (createSwipe.ts). */
export function makeSwipe<Id extends string = string>(
  host: SwipeHost,
): Swipe<Id> {
  const swipe: Swipe<Id> = Object.freeze(
    Object.defineProperty({}, HOST, {value: host}),
  );
  return swipe;
}

/** The host of a Swipe value, or null for a value it did not make. */
export function swipeHostOf(swipe: Swipe): SwipeHost | null {
  return (swipe as HostedSwipe)[HOST] ?? null;
}

/**
 * The Swipe value a `ListItem` hands its `Item`: the same actions and runtime,
 * attached with the row's key.
 */
export function swipeWithItemKey(
  swipe: Swipe,
  itemKey: string | number | undefined,
): Swipe {
  const host = swipeHostOf(swipe);
  if (host == null || itemKey == null) {
    return swipe;
  }
  return makeSwipe({
    ...host,
    attach: (facts, onBridge) => host.attach({...facts, itemKey}, onBridge),
  });
}
