// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file recognizerInternals.ts
 * @input GestureRecognizer
 * @output internals(recognizer): the members the arena and the host drive
 * @position Internal to packages/core/src/gestures; never exported from the
 *   experimental subpath
 *
 * A recognizer's arena plumbing (its arena, a pending recognition, touch
 * delivery, approved transitions) is `protected` on the class, so the
 * published type offers it to subclasses only. The arena and the host reach
 * it through this view.
 *
 * SYNC: When modified, update the `protected` members of GestureRecognizer.ts.
 */

import type {GestureArena} from './GestureArena';
import type {GestureRecognizer} from './GestureRecognizer';
import type {GestureEventContext, GestureState, GestureTouch} from './types';

/** The members of a recognizer only the gesture system calls. */
export interface RecognizerInternals {
  arena: GestureArena | null;
  pending: 'began' | 'ended' | null;
  readonly seenTouchIds: Set<number>;
  readonly acceptsTouchInput: boolean;
  requiresFailureOf(other: GestureRecognizer): boolean;
  allowsSimultaneous(other: GestureRecognizer): boolean;
  shouldBegin(): boolean;
  wantsTouch(touch: GestureTouch): boolean;
  deliverBegan(
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
