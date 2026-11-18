// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TourContext.ts
 * @input Uses React createContext
 * @output Exports TourContext, TourContextValue, TourDismissSource
 * @position Internal context; provided by Tour, consumed by TourStep + useTour
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/Tour/Tour.tsx
 * - /packages/lab/src/Tour/TourStep.tsx
 * - /packages/lab/src/Tour/useTour.ts
 * - /packages/lab/src/Tour/Tour.doc.mjs
 */

import {createContext} from 'react';

/**
 * Why a tour was dismissed. Lets a consumer distinguish "finished the whole
 * tour" from the various early exits, so it can persist "has seen this tour"
 * appropriately.
 * - `backdrop`: clicked the dimmed background
 * - `escape`: pressed Escape at any step
 * - `close`: pressed the step's close (X) control
 * - `skip`: chose "skip"/"maybe later" on the first step
 * - `complete`: advanced past the final step
 */
export type TourDismissSource =
  'backdrop' | 'escape' | 'close' | 'skip' | 'complete';

/**
 * Value shared from the Tour controller to its steps. Steps register
 * themselves on mount (so the controller learns the step order from the
 * children, in document order) and read whether they are the active step.
 */
export interface TourContextValue {
  /** Register a step by its stable id; returns an unregister cleanup. */
  registerStep: (id: string) => () => void;
  /** The id of the step that is currently active, or null when none. */
  activeStepId: string | null;
  /** Zero-based index of the active step among registered steps. */
  activeStepIndex: number;
  /** Total number of registered steps. */
  stepCount: number;
  /** Whether the tour's step count should be shown in each step. */
  isStepCountShown: boolean;
  /** Whether a dimmed background is shown behind the active step. */
  hasBackdrop: boolean;
  /** Advance to the next step (or complete on the last step). */
  onNext: () => void;
  /** Return to the previous step (no-op on the first step). */
  onPrevious: () => void;
  /** Dismiss the tour with a reason. */
  onDismiss: (source: TourDismissSource) => void;
  /** The element that had focus when the tour started, if any. */
  getOpener: () => HTMLElement | null;
}

export const TourContext = createContext<TourContextValue | null>(null);
