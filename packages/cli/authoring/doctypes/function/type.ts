// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Function doc types — the generalized `type: 'function'` doc that covers
 * BOTH React hooks and CLI/programmatic API functions. A hook (`HookDoc`) is the
 * hook-flavored view of this same kind; `FunctionDoc` adds the fields an API
 * function needs (a `{type,data}` return envelope, thrown error codes, the CLI
 * command that wraps it). Colocated at `api/<name>/<name>.doc.mjs` (API) or with
 * the hook source (hooks). The CLI binding lives in a separate CommandDoc, not
 * here — the function does not know it has a CLI.
 */

import type {
  AuthoredDocGraphFields,
  HookParamDoc,
  UsageDoc,
} from '../base/type.js';

/**
 * A documented return. Hooks list named return fields (`name` set); CLI/API
 * functions list `{type, data}` envelope entries where `type` is the response
 * discriminant and `name` is omitted.
 */
export interface FunctionReturnDoc {
  /** Field name (hooks) — omit for API envelope entries. */
  name?: string;
  /** TS type (hooks) or response-type discriminant (API), as a string. */
  type: string;
  description: string;
}

/** An error the function can throw, keyed to an ERROR_CODES member. */
export interface FunctionThrowsDoc {
  code: string;
  when: string;
}

export interface FunctionExampleDoc {
  label?: string;
  /** Language-level usage, e.g. "await search('button')". */
  code: string;
  /** Optional sample result. */
  result?: string;
}

/**
 * A function documentation file (.doc.mjs).
 *
 *   /\*\* @type {import('@astryxdesign/cli/authoring').FunctionDoc} \*\/
 *   export const doc = { type: 'function', kind: 'api', name: 'search', ... };
 */
export interface FunctionDoc extends AuthoredDocGraphFields {
  /** Doc-kind discriminant (shared with hooks). */
  type?: 'function';
  /** Export name, e.g. 'search' | 'useMediaQuery'. */
  name: string;
  /** Human-readable display name, e.g. 'search()'. */
  displayName: string;
  /** Which flavor — drives docsite sectioning; inferred from importPath if omitted. */
  kind?: 'hook' | 'api';
  /** One-line summary. */
  summary?: string;
  /** Longer description. */
  description?: string;
  /** The group that reads this doc. The CLI's API functions use 'cli/api', which the docs tree adopts by kind: each is the leaf `cli/api/functions/<name>`. Every function doc the CLI ships declares one, and `astryx doctor` fails on one that is missing or that nothing reads. */
  namespace?: string;
  /** Alternate slugs that also resolve to this doc. */
  aliases?: string[];
  /** Search keywords for discovery. */
  keywords?: string[];
  /** Import path, e.g. '@astryxdesign/cli/api' | '@astryxdesign/core/hooks'. */
  importPath?: string;
  /** Full signature as a string, e.g. 'search(query, options?): Promise<SearchResponse>'. */
  signature?: string;
  /** Parameters / options-object fields. */
  params: HookParamDoc[];
  /** Return documentation (named fields for hooks; envelope entries for API). */
  returns: FunctionReturnDoc[];
  /** Errors the function throws (API functions), keyed to ERROR_CODES. */
  throws?: FunctionThrowsDoc[];
  /** Usage examples. */
  examples?: FunctionExampleDoc[];
  /** Usage documentation (hooks) — description, best practices, anatomy. */
  usage?: UsageDoc;
  /** The CLI command that wraps this function, e.g. 'search'. */
  command?: string;
  /** Related function names; the CLI links each to its doc. Name the CLI
   *  command with `command`, not here. */
  related?: string[];
  /** Component names this is commonly used with (hooks). */
  relatedComponents?: string[];
  /** Other hook names this is commonly used with (hooks). */
  relatedHooks?: string[];
  /** Category for grouping in listings. */
  category?: string;
}
