// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared resolution + IO for the hook command's leaves.
 *
 * Both the list leaf (hook.list) and the single-hook leaves (hook.detail /
 * hook.detail.params) need to (a) locate @astryxdesign/core and (b) resolve a
 * named hook's authored doc. Those two steps live here so each leaf stays a thin
 * projection over a single shared resolver: the leaves shape the `{type, data}`
 * envelope, this adapter does the "find it on disk" work.
 *
 * @input  cwd, hook name
 * @output resolved core dir / loaded HookDoc (or a thrown AstryxError)
 * @position api/hook/_adapter.mjs — shared by ./list, ./detail, ./detail/params
 */

import {requireCoreDir} from '../../foundation/fs/paths.mjs';
import {
  findHookDoc,
  getAllHookNames,
} from '../../foundation/discovery/hook-discovery.mjs';
import {loadDocs} from '../../foundation/discovery/component-loader.mjs';
import {levenshteinDistance} from '../../foundation/text/string-utils.mjs';
import {AstryxError, coreDirOrThrow} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

/** The package that owns Core's components, hooks, and codemods. */
export {CORE_PROVIDER_ID as CORE_PACKAGE} from '../../foundation/identity/providers.mjs';

/**
 * Locate the @astryxdesign/core package directory, or throw the same
 * ERR_CORE_NOT_FOUND envelope the flat command threw. Shared by every hook leaf.
 * @param {string} cwd
 * @returns {string} Absolute path to the core package directory.
 */
export function resolveCoreDir(cwd) {
  return coreDirOrThrow(requireCoreDir, cwd);
}

/**
 * Resolve a single hook's authored doc by name, or throw ERR_UNKNOWN_HOOK with
 * fuzzy (levenshtein) suggestions, led by the command that reads a component,
 * template or docs topic of exactly that name when one exists. Shared by the detail and detail.params
 * leaves, which both start from a resolved hook doc.
 * @param {string} coreDir
 * @param {string} name
 * @param {{zh?: boolean, lang?: string|null, cwd?: string}} [opts]
 * @returns {Promise<import('./hook.type.mjs').HookDoc>}
 */
export async function resolveHookDoc(
  coreDir,
  name,
  {zh = false, lang = null, cwd = process.cwd()} = {},
) {
  const docPath = findHookDoc(coreDir, name);

  if (!docPath) {
    // Fuzzy search for suggestions
    const allNames = getAllHookNames(coreDir);
    const needle = name.toLowerCase();
    const suggestions = allNames
      .map(hookName => ({
        name: hookName,
        distance: levenshteinDistance(needle, hookName.toLowerCase()),
      }))
      .filter(m => m.distance <= 5)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)
      .map(m => ({
        name: m.name,
        reason: `similar name (distance ${m.distance})`,
      }));

    throw new AstryxError(
      `No hook named "${name}"`,
      await withOtherCommandHint(name, suggestions, {coreDir, cwd}),
      ERROR_CODES.ERR_UNKNOWN_HOOK,
    );
  }

  return loadDocs(docPath, {zh, lang, root: 'hooks'});
}

/**
 * The unknown-hook suggestions with the command that reads a component,
 * template or docs topic matching that name (exact, folded or last segment)
 * in them, the list keeping its length, in the place
 * foundation/suggest/other-command.mjs gives it. The suggestions stay as they
 * are when no such entry exists or the check fails. The hint's modules load
 * only on this path.
 * @param {string} name
 * @param {import('../../foundation/response/base').Suggestion[]} suggestions
 * @param {{coreDir: string, cwd: string}} context
 * @returns {Promise<import('../../foundation/response/base').Suggestion[] | undefined>}
 */
async function withOtherCommandHint(name, suggestions, {coreDir, cwd}) {
  try {
    const [{findOtherCommand, withOtherCommand}, {docsRoutesLazily}] =
      await Promise.all([
        import('../../foundation/suggest/other-command.mjs'),
        import('../docs/_entry-names-lazily.mjs'),
      ]);
    const hint = await findOtherCommand(name, {
      from: 'hook',
      cwd,
      coreDir,
      docsRoutes: docsRoutesLazily,
    });
    return withOtherCommand(suggestions, hint, name, {from: 'hook'});
  } catch {
    return suggestions;
  }
}
