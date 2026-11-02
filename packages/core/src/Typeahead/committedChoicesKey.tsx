// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file committedChoicesKey.tsx
 * @input React context
 * @output Exports CommittedChoicesKeyContext and useCommittedChoices
 * @position Package-internal; not exported from the package entry point.
 *   Tokenizer passes a key for its committed values through it, and whether
 *   those values reached its limit. When the key changes while the list is
 *   open, BaseTypeahead reloads the list, so a committed value leaves it and a
 *   removed one returns (component:Tokenizer FR13, spec:AST-092 FR4); at the
 *   limit it closes the list instead (FR15). A source that is only rebuilt in
 *   render does not change the key and reloads nothing.
 */

import {createContext, use} from 'react';

export type CommittedChoices = {
  /** Changes exactly when the committed values change. */
  key: string;
  /** The committed values' ids: never offered as choices. */
  ids: ReadonlySet<string>;
  /** No further value can be committed, so no list is offered. */
  isAtLimit: boolean;
};

export const CommittedChoicesKeyContext = createContext<
  CommittedChoices | undefined
>(undefined);
CommittedChoicesKeyContext.displayName = 'CommittedChoicesKeyContext';

/** The caller's committed values, if a caller provides them. */
export function useCommittedChoices(): CommittedChoices | undefined {
  return use(CommittedChoicesKeyContext);
}
