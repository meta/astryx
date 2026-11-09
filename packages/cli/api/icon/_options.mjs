// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The options each icon call takes, and the option pairs it cannot
 * honor together; either is refused, so a caller never gets a silent success
 * that did not do what it asked (spec:AST-042 FR5).
 *
 * @position api/icon — read by every icon leaf
 */

import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

/** The options each call takes. */
const ALLOWED = {
  'icon-set': new Set([
    'cwd',
    'dryRun',
    'from',
    'exclude',
    'variants',
    'defaultVariant',
    'displayName',
    'description',
  ]),
  'icon-definition': new Set([
    'cwd',
    'dryRun',
    'set',
    'description',
    'words',
    'icon',
  ]),
};

/**
 * Refuse an option the call does not take.
 * @param {keyof typeof ALLOWED} kind
 * @param {Record<string, unknown>} options
 */
export function refuseOtherOptions(kind, options) {
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && !ALLOWED[kind].has(key)) {
      throw new AstryxError(
        `Option "${key}" does not apply to integration kind "${kind}".`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
  }
}

/**
 * Refuse two options given together when the call would ignore one of them
 * (spec:AST-042 FR5): each pair names the two as the caller writes them
 * (`--list`, `a query`), and `given` says which the caller passed. A pair is
 * refused with `ERR_INVALID_OPTION`, in the order the list gives, before any
 * file is written.
 * @param {Record<string, boolean>} given each option's label, and whether it was passed
 * @param {ReadonlyArray<readonly [string, string]>} pairs
 */
export function refuseIgnoredPairs(given, pairs) {
  for (const [a, b] of pairs) {
    if (given[a] && given[b]) {
      throw new AstryxError(
        `${a} and ${b} cannot be used together`,
        undefined,
        ERROR_CODES.ERR_INVALID_OPTION,
      );
    }
  }
}

/** @param {unknown} value whether an option was passed at all */
export const passed = value =>
  value !== undefined && value !== null && value !== false && value !== '';
