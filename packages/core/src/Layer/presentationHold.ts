// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file presentationHold.ts
 * @input Whether a layer is open, and the presentation an opening would
 *   choose now
 * @output createPresentationHold (an imperative hold, for code that decides
 *   at an open event) and usePresentationHold (the same hold taken during
 *   render): the presentation the opening chose, held until the component
 *   releases it
 * @position The layer runtime's presentation hold (architecture:layer-runtime
 *   INV14): keeping a layer's chosen presentation from the open until its
 *   close settles. Internal to core: not exported from the package or any
 *   barrel (presentationHold.test.tsx locks that). Not the input hold
 *   (inputHold.ts), which drops input while a presentation animates.
 *
 * A layer that can present more than one way (a popover that is a sheet on a
 * phone, a touch grow or a pointer entrance) chooses as it opens, and its
 * close has to play out in the same presentation even when what it would
 * choose has changed meanwhile (a phone rotated past the compact width, a
 * pointer that changed). One job: take the choice at the opening, hold it,
 * and let it go when the component says its close has settled (its
 * `<dialog>`'s `close` event, its exit animation's end). The component
 * decides when that is; the hold decides nothing about timing.
 *
 * SYNC: When modified, update presentationHold.test.tsx.
 */

import {useCallback, useState} from 'react';

/** An imperative presentation hold. */
export interface PresentationHold<P> {
  /** Takes the opening's choice, replacing any held one. */
  take(presentation: P): void;
  /** The held choice, or undefined when nothing is held. */
  current(): P | undefined;
  /** Whether a choice is held. */
  isHeld(): boolean;
  /** Lets the held choice go (the close has settled). */
  release(): void;
}

/** A presentation hold for code that chooses at an open event. */
export function createPresentationHold<P>(): PresentationHold<P> {
  let held: {readonly value: P} | null = null;
  return {
    take(presentation) {
      held = {value: presentation};
    },
    current: () => held?.value,
    isHeld: () => held != null,
    release() {
      held = null;
    },
  };
}

/** What `usePresentationHold` returns. */
export interface PresentationHoldState<P> {
  /** The opening's choice while it is held; null when nothing is held. */
  readonly presentation: P | null;
  /** True from the opening render until `release()`. */
  readonly isHeld: boolean;
  /** Lets the held choice go (the close has settled). Stable. */
  readonly release: () => void;
}

/**
 * The presentation hold, taken during render: the render in which `isOpen`
 * turns on already holds `presentation` as it is then, and it stays held,
 * whatever `presentation` becomes, until `release()`. A component calls
 * `release()` when its close has settled (it may do so during render, as it
 * would set any of its own state).
 */
export function usePresentationHold<P>({
  isOpen,
  presentation,
}: {
  isOpen: boolean;
  presentation: P;
}): PresentationHoldState<P> {
  const [held, setHeld] = useState<{readonly value: P} | null>(null);
  let current = held;
  if (isOpen && held == null) {
    current = {value: presentation};
    setHeld(current);
  }
  const release = useCallback(() => setHeld(null), []);
  return {
    presentation: current == null ? null : current.value,
    isHeld: current != null,
    release,
  };
}
