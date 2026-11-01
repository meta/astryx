// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's arguments and results: argument checks, the result each
 * candidate becomes, and the components a search read.
 */

import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {setResultCoverage} from './coverage.mjs';
import {SEARCH_DOMAINS} from './_query.mjs';

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * Map a scored candidate to its public, actionable result shape. Each result
 * carries enough to act on it: the domain, name, a one-line description, and
 * the follow-up command (and import path where relevant).
 *
 * @param {Candidate} c - candidate
 * @param {number} score
 * @param {string} reason
 * @param {number} matchedTerms - Query concepts this result answered.
 * @param {number} queryTerms - Query concepts there were to answer.
  * @param {boolean} [outside] - The search runs outside a project, where a
 *   theme cannot be added to an app, so its command forks the source instead
 *   (spec AST-081 FR3).
 */
export function toResult(
  c,
  score,
  reason,
  matchedTerms,
  queryTerms,
  outside = false,
) {
  const base = {
    domain: c.domain,
    name: c._resultName ?? c.name,
    package: c._package,
    score,
    reason,
    description: c.description || '',
  };
  let result;
  switch (c.domain) {
    case 'component':
      result = {
        ...base,
        import: c._import,
        command: c._command ?? `astryx component ${c.name}`,
      };
      break;
    case 'hook':
      result = {
        ...base,
        import: c._import,
        command: `astryx hook ${c.name}`,
      };
      break;
    case 'doc':
      // A doc result names its topic or route, plus the section when the
      // hit is one section; its command reads exactly that part.
      result = {
        ...base,
        name: c._topic ?? c.name,
        ...(c._section ? {section: c._section} : {}),
        title: c._title,
        command: c._command ?? `astryx docs ${c.name}`,
        ...(c._parent ? {parent: c._parent} : {}),
      };
      break;
    case 'template':
      result = {
        ...base,
        displayName: c._displayName,
        kind: c._kind,
        command: `astryx template ${c._commandName ?? c.name} --type ${c._kind}`,
      };
      break;
    case 'theme':
      result = {
        ...base,
        displayName: c._displayName,
        command: outside
          ? `astryx theme eject ${c.name}`
          : `astryx theme add ${c.name}`,
      };
      break;
    default:
      result = base;
  }
  return setResultCoverage(result, matchedTerms, queryTerms);
}

/**
 * Throws the search argument errors: an empty query, an unknown type, a limit
 * that is not a positive integer.
 *
 * @param {string} query
 * @param {{type?: string, limit?: number}} options
 */
export function checkSearchArgs(query, options) {
  const {type, limit = 20} = options;

  if (!query || !String(query).trim()) {
    throw new AstryxError(
      'A search query is required',
      [{name: 'astryx search button', reason: 'example'}],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }

  if (type && !SEARCH_DOMAINS.includes(type)) {
    throw new AstryxError(
      `Unknown --type "${type}"`,
      SEARCH_DOMAINS.map(d => ({name: d, reason: 'valid type'})),
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }

  // Validate limit here (not just in the CLI) so direct API callers get the same
  // contract: a non-positive or non-integer limit is an error, never a silent
  // "return everything". (Previously `limit <= 0` fell through to the full set.)
  if (limit != null && (!Number.isInteger(limit) || limit <= 0)) {
    throw new AstryxError(
      `Invalid limit "${limit}". Must be a positive integer.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
}

/**
 * The components each search response was scored against, by response:
 * `build` reads them to tell a part of a page from a page without gathering
 * them again. Module-private, so they never enter search's JSON.
 * @type {WeakMap<object, {name: string, keywords: string[]}[]>}
 */
export const searchedComponentsOf = new WeakMap();

/**
 * The components (name and keywords) a search response was scored against, or
 * null when that search was narrowed away from components.
 * @param {object} response
 * @returns {{name: string, keywords: string[]}[] | null}
 */
export function searchedComponents(response) {
  return searchedComponentsOf.get(response) ?? null;
}
