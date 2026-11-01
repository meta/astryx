// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TokenizerClearAllMessageContext.ts
 * @input None
 * @output A context carrying the words a composing component announces for
 *   the field's Clear all
 * @position Internal to Core: not exported from the Tokenizer barrel. A
 *   component that composes Tokenizer and words its own Clear all (PowerSearch:
 *   "All filters removed") provides it; Tokenizer otherwise announces its own
 *   words (component:Tokenizer AR7).
 */

import {createContext} from 'react';

export const TokenizerClearAllMessageContext = createContext<string | null>(
  null,
);
TokenizerClearAllMessageContext.displayName = 'TokenizerClearAllMessageContext';
