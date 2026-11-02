// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file committedChoicesKey.tsx
 * @input React context
 * @output Exports CommittedChoicesKeyContext and useCommittedChoicesKey
 * @position Package-internal; not exported from the package entry point.
 *   Tokenizer passes a key for its committed values through it. When the key
 *   changes while the list is open, BaseTypeahead reloads the list, so a
 *   committed value leaves it and a removed one returns (component:Tokenizer
 *   FR13, spec:AST-092 FR4). A source that is only rebuilt in render does not
 *   change the key and reloads nothing.
 */

import {createContext, use} from 'react';

export const CommittedChoicesKeyContext = createContext<string | undefined>(
  undefined,
);
CommittedChoicesKeyContext.displayName = 'CommittedChoicesKeyContext';

/** The caller's committed-values key, if a caller provides one. */
export function useCommittedChoicesKey(): string | undefined {
  return use(CommittedChoicesKeyContext);
}
