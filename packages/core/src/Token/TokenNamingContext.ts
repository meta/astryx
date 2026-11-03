// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TokenNamingContext.ts
 * @input Naming parts from a caller whose token value renders outside its label
 * @output Internal context: the names of a token's action and remove button
 * @position Internal to Core; not exported from the Token entry point
 */

import {createContext} from 'react';

/**
 * Names for a Token whose visible text runs past its label. PowerSearch
 * provides them: its tokens show the value as `endContent`.
 *
 * - `actionName` names a clickable token's inner button in place of `label`.
 * - `removeName` names the remove button in place of `label`. The remove word
 *   still comes from the catalog, so each locale keeps its word order.
 */
export interface TokenNaming {
  actionName?: string;
  removeName?: string;
}

export const TokenNamingContext = createContext<TokenNaming | null>(null);
TokenNamingContext.displayName = 'TokenNamingContext';
