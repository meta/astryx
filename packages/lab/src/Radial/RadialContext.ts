// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadialContext.ts
 * @output React context for radial chart components
 */

import {createContext, useContext} from 'react';
import type {RadialContext} from './types';

const RadialCtx = createContext<
  (RadialContext & {interactive?: boolean}) | null
>(null);

export const RadialProvider = RadialCtx.Provider;

export function useRadialInteractive(): boolean {
  return useContext(RadialCtx)?.interactive ?? false;
}

/** Access the radial chart context. Throws if used outside RadialChart. */
export function useRadial(): RadialContext {
  const ctx = useContext(RadialCtx);
  if (!ctx) {
    throw new Error('Radial components must be used inside <RadialChart>');
  }
  return ctx;
}
