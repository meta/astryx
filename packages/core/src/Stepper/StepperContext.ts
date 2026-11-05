// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file StepperContext.ts
 * @input Layer-scoped React context/use
 * @output Exports the public Stepper context hook and package-internal
 *   coordination used by Stepper and Step
 * @position Context for Stepper <-> Step communication
 *
 * `StepperContextValue` is the supported public read. It keeps the Stepper
 * state, configuration, transition history, and step registration contract
 * while excluding compact-layout coordination used only by the built-in Step.
 * Its provider carries exactly those keys, so JavaScript and TypeScript observe
 * the same boundary.
 *
 * `StepperInternalContextValue` is carried by a separate package-internal
 * provider. It adds compact-layout coordination for Stepper and Step but is not
 * re-exported from index.ts.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Stepper/Stepper.doc.mjs
 * - /packages/core/src/Stepper/index.ts
 * - /packages/core/src/Stepper/Stepper.public.test.ts
 */

import {use, type Context} from 'react';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';

export type StepperOrientation = 'horizontal' | 'vertical';
export type StepperDensity = 'compact' | 'balanced' | 'spacious';

/**
 * Controls where each step's indicator sits relative to the connector track.
 * - 'separated': indicator lives in the label row, distinct from the progress
 *   bar (Astryx's original layout).
 * - 'on-track': indicator is slotted *into* the connector line as a node on the
 *   track, with the label beside (vertical) or below (horizontal). Aligns with
 *   the on-track stepper design.
 */
export type StepperIndicatorPosition = 'separated' | 'on-track';

/** Options reported by a Step when it registers with Stepper. */
export interface StepperRegistrationOptions {
  /** Reads the Step's current disabled state. */
  getIsDisabled?: () => boolean;
}

/** Stepper state and coordination available to descendant content. */
export interface StepperContextValue {
  activeStep: number;
  /**
   * The `activeStep` this stepper last rendered with, so a Step can tell
   * whether the change it is reacting to was a single step forward — the one
   * change that animates the connector fill — and which span that change
   * crossed (see the CONNECTOR FILL block in Step.tsx). Equal to `activeStep`
   * on the first render, which is what keeps a stepper that mounts mid-flow
   * from animating its way to the step it opened on.
   */
  previousActiveStep: number;
  orientation: StepperOrientation;
  isNonLinear: boolean;
  onStepClick: ((index: number) => void) | null;
  density: StepperDensity;
  indicatorPosition: StepperIndicatorPosition;
  /**
   * Registers a Step index and an optional disabled-state getter. The Stepper
   * tracks the set, warns if two Steps share an index, and keeps compact
   * previous/next controls from selecting disabled steps. Returns a cleanup
   * function to call on unmount.
   */
  registerStep: (
    index: number,
    options?: StepperRegistrationOptions,
  ) => () => void;
}

/**
 * Package-internal Stepper <-> Step coordination. This type is intentionally
 * absent from the public component barrel.
 */
export interface StepperInternalContextValue extends StepperContextValue {
  /** Number of registered steps used to derive the compact threshold. */
  stepCount: number;
  /** Whether a horizontal Stepper is currently using its compact layout. */
  isCompact: boolean;
  /** Portal target for the active step's compact summary. */
  summarySlot: HTMLElement | null;
}

export const StepperContext = createContext<StepperContextValue | null>(null);
StepperContext.displayName = 'StepperContext';

export const StepperInternalContext =
  createContext<StepperInternalContextValue | null>(null);
StepperInternalContext.displayName = 'StepperInternalContext';

function useContextValue<T>(context: Context<T | null>, hookName: string): T {
  const ctx = use(context);
  if (ctx == null) {
    throw new Error(
      `${hookName} must be used within Stepper. Wrap your Step in <Stepper>.`,
    );
  }
  return ctx;
}

/** Package-internal context read used by the built-in Step. */
export function useStepperInternalContext(): StepperInternalContextValue {
  return useContextValue(StepperInternalContext, 'useStepperInternalContext');
}

/**
 * Reads the enclosing Stepper's public context.
 *
 * Step count, compact state, summary-portal coordination, and threshold
 * measurement details are intentionally not part of this return type.
 */
export function useStepperContext(): StepperContextValue {
  return useContextValue(StepperContext, 'useStepperContext');
}
