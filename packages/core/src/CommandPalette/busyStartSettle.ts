// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file busyStartSettle.ts
 * @input The palette's registration for its input's busy-start settle function
 * @output Context the input uses to register that function
 * @position Package-internal; not exported from the package entry point
 *
 * The input owns the search's busy start; the palette is the only thing that
 * knows when a search's outcome is about to be announced, and so when a busy
 * start not yet announced has to be dropped (`spec:AST-086` FR8). A context
 * rather than a member of `CommandPaletteContextValue`, which is exported:
 * this module is not exported from `index.ts`, so the seam stays closed by
 * module boundary.
 */

import {createContext} from 'react';

/** Registers the input's settle function, or `null` when the input goes away. */
export type RegisterBusyStartSettle = (settle: (() => void) | null) => void;

export const BusyStartSettleContext =
  createContext<RegisterBusyStartSettle | null>(null);
BusyStartSettleContext.displayName = 'BusyStartSettleContext';
