// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TokenSelectedContext.ts
 * @input None
 * @output A context that marks the token inside it as selected
 * @position Internal to Core: not exported from the Token barrel. Tokenizer
 *   provides it around each token; Token reflects it as its `selected` theme
 *   state.
 */

import {createContext} from 'react';

export const TokenSelectedContext = createContext(false);
TokenSelectedContext.displayName = 'TokenSelectedContext';
