// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Programmatic API for the hook command — dispatcher + barrel.
 *
 * Returns the same typed envelope { type, data } that `astryx --json hook`
 * outputs. This module is routing only: it computes the shared detail default
 * (kept in sync with the CLI) and dispatches to one of the hook leaves —
 * ./list (hook.list), ./detail (hook.detail), or ./detail/params
 * (hook.detail.params). The CLI command handler is a thin wrapper around this
 * function and api/index.mjs re-exports `hook` from here, so the export surface
 * is unchanged.
 *
 * @position api/hook/hook.mjs — dispatcher over ./list, ./detail, ./detail/params
 */

import {list} from './list/list.mjs';
import {detail as detailLeaf} from './detail/detail.mjs';
import {params as paramsLeaf} from './detail/params/params.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

/**
 * @param {string} [name]
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {boolean} [options.list]
 * @param {string} [options.category]
 * @param {boolean} [options.params]
 * @param {'full'|'compact'|'brief'} [options.detail] - Defaults to 'full' for a single hook, 'brief' for list views (list/category/no name), matching the CLI.
 * @param {string} [options.lang]
 * @param {boolean} [options.zh]
 * @returns {Promise<{type: string, data: unknown}>}
 */
export async function hook(name, options = {}) {
  const {
    cwd = process.cwd(),
    list: listFlag = false,
    category,
    params: paramsFlag = false,
    detail: detailOption,
    lang = null,
    zh = false,
  } = options;

  // Default detail level mirrors the CLI (see commands/hook.mjs):
  // single-hook views default to 'full', list-style views (--list,
  // --category, or no name) default to 'brief' (scannable name lists).
  // Keeping this in sync with the CLI is what the API↔CLI parity test checks.
  const isListView = listFlag || category != null || !name;
  const detail = detailOption ?? (isListView ? 'brief' : 'full');

  // A public API caller could pass a non-string category; the list leaf does
  // `category.toLowerCase()`, so guard it up front (same class as the name
  // guard below) instead of throwing a raw TypeError with no `.code`.
  if (category != null && typeof category !== 'string') {
    throw new AstryxError(
      `Unknown category "${String(category)}"`,
      undefined,
      ERROR_CODES.ERR_UNKNOWN_CATEGORY,
    );
  }

  // ── List mode ──────────────────────────────────────────────────
  if (category || listFlag || !name) {
    return list({cwd, category, detail, zh, lang});
  }

  // ── Single hook ────────────────────────────────────────────────
  // A public API caller could pass a non-string name (the CLI only ever passes
  // string|undefined). Guard it up front so the leaves' `name.replace(...)` /
  // `name.toLowerCase()` don't throw a raw TypeError with no `.code` (which the
  // CLI would downgrade to ERR_UNKNOWN). Mirrors the component() dispatcher.
  if (typeof name !== 'string') {
    throw new AstryxError(
      `No hook named "${String(name)}"`,
      undefined,
      ERROR_CODES.ERR_UNKNOWN_HOOK,
    );
  }

  if (paramsFlag) {
    return paramsLeaf(name, {cwd, zh, lang});
  }

  return detailLeaf(name, {cwd, zh, lang});
}
