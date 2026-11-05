// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared published types for complete multi-selector lookup receipts.
 * Adopting API subjects specialize these types with their single-result and
 * ambiguity-candidate types instead of defining command-specific row shapes.
 *
 * @input One exact selector, its single-result response, and its candidate shape.
 * @output BatchRow and BatchResponse for every AST-053 lookup adopter.
 * @position packages/cli/foundation/response — shared JSON response types
 */

/**
 * One complete row for an accepted selector.
 * @template TResult
 * @template TCandidate
 * @typedef {(
 *   | {selector: string; status: 'found'; result: TResult}
 *   | {selector: string; status: 'ambiguous'; code: string; error: string; candidates: TCandidate[]}
 *   | {selector: string; status: 'not_found' | 'error'; code: string; error: string; suggestions?: import('./base').Suggestion[]}
 * )} BatchRow
 */

/**
 * One ordered batch receipt inside the shared `{type, data}` success envelope.
 * @template {string} TType
 * @template TResult
 * @template TCandidate
 * @typedef {object} BatchResponse
 * @property {TType} type
 * @property {{count: number; results: BatchRow<TResult, TCandidate>[]}} data
 */

export {};
