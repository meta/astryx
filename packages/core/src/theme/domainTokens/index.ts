// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file domainTokens/index.ts
 * @input None (re-exports sub-modules)
 * @output domainTokenDefaults, DomainTokenName
 * @position Token aggregator; consumed by defineTheme for validation + autocomplete
 *
 * Re-exports only. The merged map lives in domainTokenDefaults.ts so that
 * defineTheme, inside a lazily imported module graph, imports it without a
 * barrel. Actual token definitions live in their own directories (syntax/,
 * dataviz/).
 */

export {syntaxTokenDefaults} from '../syntax/tokens';
export type {SyntaxTokenName} from '../syntax/tokens';

export {dataTokenDefaults} from './dataTokens';
export type {DataTokenName} from './dataTokens';

export {domainTokenDefaults} from './domainTokenDefaults';

import type {SyntaxTokenName} from '../syntax/tokens';
import type {DataTokenName} from './dataTokens';

/** Union of all domain token names */
export type DomainTokenName = SyntaxTokenName | DataTokenName;
