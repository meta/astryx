// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Programmatic API for the `icon` command (AST-084 FR6, FR7):
 * dispatcher over three leaves.
 *
 *   icon('<words>')       icon.search: icons ranked by meaning
 *   icon('<set>/<id>')    icon.detail: one icon and every variant's import
 *   icon('', {list})      icon.list: the installed sets
 *
 * Every read comes from installed icon sets' data files, through the
 * `Project` seam; nothing executes an icon module.
 *
 * @input a query or `<set>/<id>`, and options
 * @output icon.search | icon.detail | icon.list envelope
 * @position api/icon — dispatcher; command wrapper in clients/cli/commands/icon.mjs
 */

import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {iconSearch} from './search/search.mjs';
import {iconDetail} from './detail/detail.mjs';
import {iconList} from './list/list.mjs';
import {iconSetIcons} from './search/search.mjs';
import {astryxIconDefinitions} from './_adapter.mjs';
import {passed, refuseIgnoredPairs} from './_options.mjs';

/** The default `limit` for `icon.search`. */
export const DEFAULT_ICON_LIMIT = 10;

/** `<set>/<id>` or `<package>/<set>/<id>`: no spaces, and an id after a slash. */
const REFERENCE_RE = /^[^\s/][^\s]*\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * Find icons by meaning, read one icon, or list the installed icon sets.
 *
 * Experimental (spec:AST-017 FR27): may change or be removed in a patch
 * release.
 * @experimental
 * @param {string} [query] words to search for, or `<set>/<id>`
 * @param {import('./icon.type.mjs').IconOptions} [options]
 * @returns {Promise<import('./icon.type.mjs').IconSearchResponse | import('./icon.type.mjs').IconDetailResponse | import('./icon.type.mjs').IconListResponse | import('./icon.type.mjs').IconSetIconsResponse | import('./icon.type.mjs').IconDefinitionsResponse>}
 */
export async function icon(query, options = {}) {
  const {
    cwd = process.cwd(),
    list = false,
    set,
    limit: givenLimit,
    allIcons = false,
    definitions = false,
  } = options;
  const given = typeof query === 'string' ? query.trim() : '';
  // Every listing takes nothing the others take, and a query or one icon
  // takes no listing (spec:AST-042 FR5).
  refuseIgnoredPairs(
    {
      'a query': given !== '',
      '--list': passed(list),
      '--definitions': passed(definitions),
      '--all-icons': passed(allIcons),
      '--set': passed(set),
      '--limit': passed(givenLimit),
      'a <set>/<id> query': REFERENCE_RE.test(given),
    },
    [
      ['--list', 'a query'],
      ['--list', '--definitions'],
      ['--list', '--all-icons'],
      ['--list', '--set'],
      ['--list', '--limit'],
      ['--definitions', 'a query'],
      ['--definitions', '--all-icons'],
      ['--definitions', '--set'],
      ['--definitions', '--limit'],
      ['--all-icons', 'a query'],
      ['--all-icons', '--limit'],
      ['a <set>/<id> query', '--set'],
      ['a <set>/<id> query', '--limit'],
    ],
  );
  const limit = givenLimit ?? DEFAULT_ICON_LIMIT;
  if (query != null && typeof query !== 'string') {
    throw new AstryxError(
      `Invalid icon query: ${String(query)}`,
      [],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const term = (query ?? '').trim();
  if (list) return iconList({cwd});
  if (definitions) {
    return {
      type: /** @type {const} */ ('icon.definitions'),
      data: {
        definitions: astryxIconDefinitions().definitions.map(({doc}) => ({
          name: doc.name,
          builtIn: doc.builtIn === true,
          description: doc.description,
          words: doc.words,
        })),
      },
    };
  }
  if (allIcons) {
    if (set == null) {
      throw new AstryxError(
        '--all-icons lists every icon of one set: pass --set',
        [
          {
            name: 'astryx experimental icon --set <name> --all-icons',
            reason: "list one set's icons",
          },
        ],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    return iconSetIcons({cwd, set});
  }
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
  if (limit != null && (!Number.isInteger(limit) || limit <= 0)) {
    throw new AstryxError(
      `Invalid limit "${limit}". Must be a positive integer.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  if (REFERENCE_RE.test(term)) return iconDetail(term, {cwd});
  return iconSearch(term, {cwd, set, limit});
}
