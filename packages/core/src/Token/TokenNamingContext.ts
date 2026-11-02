// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TokenNamingContext.ts
 * @input Naming parts from a caller whose token value renders outside its label
 * @output Internal context: an id for the label text and a remove-button name
 * @position Internal to Core; not exported from the Token entry point
 */

import {createContext} from 'react';

/**
 * Naming parts for a Token whose value renders outside its label. PowerSearch
 * provides them: its tokens show the value as `endContent`.
 *
 * - `labelId` goes on the visible label text, so the caller can name the
 *   token's action by that text and the value together.
 * - `removeName` names the remove button in place of `label`. The remove word
 *   still comes from the catalog, so each locale keeps its word order.
 */
export interface TokenNaming {
  labelId?: string;
  removeName?: string;
}

export const TokenNamingContext = createContext<TokenNaming | null>(null);
TokenNamingContext.displayName = 'TokenNamingContext';
