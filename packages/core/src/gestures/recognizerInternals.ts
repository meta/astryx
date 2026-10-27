// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file recognizerInternals.ts
 * @input GestureRecognizer
 * @output internals(recognizer): the members the arena, the host and the
 *   React hooks drive, and RecognizerFamily, the brand the host reads instead
 *   of `instanceof`
 * @position Internal to packages/core/src/gestures; never exported from the
 *   experimental subpath
 *
 * A recognizer's arena plumbing (its arena, a pending recognition, touch
 * delivery, approved transitions) is `protected` on the class, so the
 * published type offers it to subclasses only. The arena and the host reach
 * it through this view, and so do the React hooks, for the arena an Effect's
 * stop defers its resolution to.
 *
 * SYNC: When modified, update the `protected` members of GestureRecognizer.ts.
 */

import type {GestureArena} from './GestureArena';
import type {GestureRecognizer} from './GestureRecognizer';
import type {GestureEventContext, GestureState, GestureTouch} from './types';

/**
 * The kinds of recognizer the host and touch-action treat specially. Each of
 * those classes brands itself (a subclass inherits the brand), so the host
 * never imports a recognizer class: a page ships only the recognizers it
 * constructs.
 */
export type RecognizerFamily = 'tap' | 'longPress' | 'pan' | 'pinch' | 'hover';

/** The members of a recognizer only the gesture system calls. */
export interface RecognizerInternals {
  /** The recognizer's family, when the host treats it specially. */
  readonly family?: RecognizerFamily;
  arena: GestureArena | null;
  pending: 'began' | 'ended' | null;
  readonly seenTouchIds: Set<number>;
  readonly acceptsTouchInput: boolean;
  requiresFailureOf(other: GestureRecognizer): boolean;
  allowsSimultaneous(other: GestureRecognizer): boolean;
  shouldBegin(): boolean;
  keepsTouch(touchId: number): boolean;
  wantsTouch(touch: GestureTouch): boolean;
  deliverBegan(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void;
  deliverBeganElsewhere(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void;
  deliverMoved(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void;
  deliverEnded(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void;
  deliverCancelled(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void;
  deliverTakenByBrowser(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void;
  applyState(next: GestureState): void;
  resetToPossible(): void;
}

/** The gesture system's view of `recognizer`. */
export function internals(recognizer: GestureRecognizer): RecognizerInternals {
  return recognizer as unknown as RecognizerInternals;
}
