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
    'adapter',
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

/** `<set>/<id>` or `<package>/<set>/<id>`: no spaces, and an id after a slash. */
export const REFERENCE_RE = /^[^\s/][^\s]*\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * Refuse an icon query that is not a string.
 * @param {unknown} query
 */
export function checkIconQueryType(query) {
  if (query != null && typeof query !== 'string') {
    throw new AstryxError(
      `Invalid icon query: ${String(query)}`,
      [],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
}

/**
 * Refuse an empty icon search.
 * @param {string} term the trimmed query
 */
export function requireIconTerm(term) {
  if (!term) {
    throw new AstryxError(
      'An icon query is required',
      [
        {
          name: 'astryx experimental icon delete',
          reason: 'find icons by meaning',
        },
        {
          name: 'astryx experimental icon --list',
          reason: 'list the installed sets',
        },
      ],
      ERROR_CODES.ERR_MISSING_ARGUMENT,
    );
  }
}

/**
 * Refuse a limit that is not a positive integer.
 * @param {unknown} limit
 */
export function checkIconLimit(limit) {
  if (limit != null && (!Number.isInteger(limit) || Number(limit) <= 0)) {
    throw new AstryxError(
      `Invalid limit "${limit}". Must be a positive integer.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
}
