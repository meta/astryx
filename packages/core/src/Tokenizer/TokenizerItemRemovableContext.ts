// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TokenizerItemRemovableContext.ts
 * @input None
 * @output A context carrying a predicate that tells which tokens the user can
 *   remove
 * @position Internal to Core: not exported from the Tokenizer barrel. A
 *   component that composes Tokenizer and locks some tokens (PowerSearch: its
 *   read-only filters, and every filter of a read-only field) provides it. In
 *   the popover presentation, Clear all then keeps a locked token, Backspace
 *   removes nothing while the last token is locked, and Clear all shows only
 *   while a removable token remains. Without it, every token is removable.
 */

import {createContext} from 'react';
import type {SearchableItem} from '../Typeahead/types';

export const TokenizerItemRemovableContext = createContext<
  ((item: SearchableItem) => boolean) | null
>(null);
TokenizerItemRemovableContext.displayName = 'TokenizerItemRemovableContext';
