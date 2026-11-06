// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Tour.tsx
 * @input Uses React state/refs, TourContext
 * @output Exports Tour controller component and TourProps
 * @position Lab experiment (meta/astryx#4239); controller consumed by index.ts
 *
 * Tour is the controller for a product-tour / NUX walkthrough. It renders no
 * visible chrome of its own — it owns the tour state (active step, advance /
 * retreat / complete / dismiss) and shares it with declaratively-nested
 * `<TourStep>` children through context. Steps register on mount, so the step
 * ORDER is taken from the children in document order (no step array to keep in
 * sync with the markup).
 *
 * The behavior (a controller plus spotlight feature steps, an `isActive`
 * switch, dismiss-with-reason, and step progress) is composed from Astryx
 * primitives. Each step anchors its callout via Popover and draws its own
 * highlight/backdrop (see TourStep) — the controller owns no chrome.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/Tour/TourStep.tsx
 * - /packages/lab/src/Tour/TourContext.ts
 * - /packages/lab/src/Tour/useTour.ts
 * - /packages/lab/src/Tour/Tour.doc.mjs (props table, features)
 * - /packages/lab/src/Tour/Tour.test.tsx (tests for new/changed behavior)
 * - /packages/lab/src/Tour/index.ts (exports if types change)
 */

import {useCallback, useMemo, useState, type ReactNode} from 'react';
import {
  TourContext,
  type TourDismissSource,
  type TourContextValue,
} from './TourContext';

export interface TourProps {
  /**
   * Whether the tour is running. When false, nothing renders and step state
   * resets — the tour restarts from the first step next time it becomes active.
   * (Controlled: the consumer owns "has this user seen the tour?".)
   */
  isActive: boolean;
  /**
   * The tour's steps — `<TourStep>` elements. Step order is taken from their
   * order here; only the active step renders its callout.
   */
  children?: ReactNode;
  /**
   * Called when the tour is dismissed, with the reason. Fires for every exit,
   * including completing the last step (`source === 'complete'`). The consumer
   * flips `isActive` to false in response, and can branch on the source to tell
   * a successful finish apart from an early skip/backdrop/escape.
   */
  onDismiss: (source: TourDismissSource) => void;
  /**
   * Dim the page around the active step's target (a spotlight cutout — the
   * target stays lit, everything else darkens). Use for modal-style steps that
   * demand focus; leave off for a lightweight coachmark that only rings the
   * target.
   * @default false
   */
  hasBackdrop?: boolean;
  /**
   * Show the step count ("2 of 5") in each step.
   * @default false
   */
  isStepCountShown?: boolean;
}

/**
 * Controller for a guided product tour. Renders no chrome; coordinates the
 * active step among its `<TourStep>` children.
 *
 * @example
 * ```
 * const [isActive, setIsActive] = useState(true);
 * const saveRef = useRef(null);
 * const shareRef = useRef(null);
 * <Tour isActive={isActive} hasBackdrop isStepCountShown onDismiss={() => setIsActive(false)}>
 *   <TourStep targetRef={saveRef} heading="Save your work">
 *     Changes save automatically to the cloud.
 *   </TourStep>
 *   <TourStep targetRef={shareRef} heading="Share it">
 *     Invite teammates from here.
 *   </TourStep>
 * </Tour>
 * ```
 */
export function Tour({
  isActive,
  children,
  onDismiss,
  hasBackdrop = false,
  isStepCountShown = false,
}: TourProps) {
  // Steps register on mount; insertion order (document order) defines the
  // sequence. A plain array keeps registration order deterministic.
  const [stepIds, setStepIds] = useState<string[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const registerStep = useCallback((id: string) => {
    setStepIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    return () => {
      setStepIds(prev => prev.filter(stepId => stepId !== id));
    };
  }, []);

  // Reset to the first step when the tour is deactivated, so a dismissed tour
  // begins from the top next time isActive flips back on. Adjusted during
  // render, so no commit carries the old step past deactivation.
  const [wasActive, setWasActive] = useState(isActive);
  if (!Object.is(wasActive, isActive)) {
    setWasActive(isActive);
    if (!isActive) {
      setActiveStepIndex(0);
    }
  }

  const stepCount = stepIds.length;

  const onNext = useCallback(() => {
    // Runs from a click/imperative call (never during render), so branch on the
    // current index directly rather than inside a state updater — calling
    // onDismiss from within setState triggers a "setState while rendering"
    // warning.
    if (activeStepIndex < stepCount - 1) {
      setActiveStepIndex(activeStepIndex + 1);
      return;
    }
    // Past the last step → complete. onDismiss carries the reason so a
    // consumer can branch on 'complete' vs an early exit.
    onDismiss('complete');
  }, [activeStepIndex, stepCount, onDismiss]);

  const onPrevious = useCallback(() => {
    setActiveStepIndex(prev => (prev > 0 ? prev - 1 : prev));
  }, []);

  const activeStepId = isActive ? (stepIds[activeStepIndex] ?? null) : null;

  const contextValue = useMemo<TourContextValue>(
    () => ({
      registerStep,
      activeStepId,
      activeStepIndex,
      stepCount,
      isStepCountShown,
      hasBackdrop,
      onNext,
      onPrevious,
      onDismiss,
    }),
    [
      registerStep,
      activeStepId,
      activeStepIndex,
      stepCount,
      isStepCountShown,
      hasBackdrop,
      onNext,
      onPrevious,
      onDismiss,
    ],
  );

  return (
    <TourContext.Provider value={contextValue}>{children}</TourContext.Provider>
  );
}

Tour.displayName = 'Tour';
