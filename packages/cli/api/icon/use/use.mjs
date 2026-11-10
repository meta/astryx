// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.use` leaf (AST-084 FR8): choose the project's main icon set,
 * and any backup sets in order, by writing `experimental.iconSet` in
 * astryx.config. With no backup it writes the set name as a string; with
 * backups it writes a list, the main set first.
 *
 * @output the `icon.use` envelope
 * @position api/icon/use — dispatched by the `experimental icon use` command
 */

import * as path from 'node:path';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {
  iconSetConfigCliWarning,
  iconSetKey,
  loadIconProject,
  ICON_USE_ORDER_COMMAND,
  refuseOutsideProject,
  setConfigValue,
  unlistedIconSets,
} from '../_adapter.mjs';
import {setsNamed, unusableSet} from '../_records.mjs';

/**
 * The one installed set a selector names, or the error that says why not.
 * @param {import('../../../foundation/discovery/icon-set-discovery.mjs').DiscoveredIconSet[]} sets
 * @param {import('../../../foundation/discovery/icon-set-discovery.mjs').WithdrawnIconSet[]} withdrawn
 * @param {string} selector
 */
function oneSet(sets, withdrawn, selector) {
  const named = setsNamed(sets, selector);
  if (named.length === 0) throw unusableSet(sets, withdrawn, selector);
  if (named.length > 1) {
    throw new AstryxError(
      `Two installed packages ship an icon set named "${selector}"; name it with its package.`,
      named.map(set => ({
        name: iconSetKey(set),
        reason: `the set in ${set.package}`,
      })),
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  return named[0];
}

/**
 * Make an installed set the project's main icon set, with backup sets in
 * order. A copied template takes each icon from the first set in the list
 * that has its meaning.
 * Experimental (spec:AST-017 FR27): may change or be removed in a patch
 * release.
 * @experimental
 * @param {string} selector a set name, or `<package>/<set>`
 * @param {{cwd?: string, backups?: string[]}} [options] `backups`: the
 *   backup sets, in order
 * @returns {Promise<import('../icon.type.mjs').IconUseResponse>}
 */
export async function iconUse(
  selector,
  {cwd = process.cwd(), backups = []} = {},
) {
  if (typeof selector !== 'string' || selector.trim() === '') {
    throw new AstryxError(
      'Name the icon set to use',
      [
        {
          name: 'astryx experimental icon --list',
          reason: 'list the installed sets',
        },
        {
          name: ICON_USE_ORDER_COMMAND,
          reason: 'choose a main set and backup sets, in order',
        },
      ],
      ERROR_CODES.ERR_MISSING_ARGUMENT,
    );
  }
  refuseOutsideProject(cwd, 'experimental icon use', 'the app project');
  const {projectDir, sets, withdrawn} = await loadIconProject(cwd);
  const main = oneSet(sets, withdrawn, selector);
  const backupSets = backups.map(each => oneSet(sets, withdrawn, each));
  const listed = [main, ...backupSets];
  const repeated = listed.find((set, index) => listed.indexOf(set) !== index);
  if (repeated) {
    throw new AstryxError(
      `"${iconSetKey(repeated)}" is in the list twice; name each set once, the main set first.`,
      [{name: ICON_USE_ORDER_COMMAND, reason: 'each set once, in order'}],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const value = backups.length > 0 ? [selector, ...backups] : selector;
  let written;
  try {
    written = setConfigValue(projectDir, 'experimental.iconSet', value);
  } catch (error) {
    // A protected config, or an unreadable protection source, keeps the
    // stable code every consumer-file writer uses (spec:AST-040 FR4, FR6).
    const code = /** @type {{code?: unknown}} */ (error)?.code;
    const stable = [
      ERROR_CODES.ERR_CODEMOD_PROTECTED,
      ERROR_CODES.ERR_CODEMOD_PROTECTION_SOURCE,
    ].find(each => each === code);
    throw new AstryxError(
      error instanceof Error ? error.message : String(error),
      undefined,
      stable ?? ERROR_CODES.ERR_WRITE_FAILED,
    );
  }
  // An older CLI the project may still run refuses the value just written.
  const warning = iconSetConfigCliWarning(projectDir, {
    list: Array.isArray(value),
  });
  // Doctor fails a project that installs several sets and leaves one out.
  const unlisted = sets.filter(set => !listed.includes(set)).map(iconSetKey);
  const left =
    unlisted.length > 0
      ? unlistedIconSets(sets.length, selector, backups, unlisted)
      : null;
  return {
    type: 'icon.use',
    data: {
      iconSet: selector,
      set: iconSetKey(main),
      backups: backups.map((each, index) => ({
        iconSet: each,
        set: iconSetKey(backupSets[index]),
      })),
      config: path.relative(projectDir, written.file).split(path.sep).join('/'),
      created: written.created,
      previous: written.previous,
      changed: written.changed,
      unlisted,
      ...(left ? {next: `${left.problem}. ${left.fix}`} : {}),
      ...(warning ? {warning} : {}),
    },
  };
}
