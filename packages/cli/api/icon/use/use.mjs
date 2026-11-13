// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.use` leaf (AST-084 FR8): choose the project's main icon set,
 * any backup sets in order, and the look its icons draw, by writing
 * `experimental.iconSet` and `experimental.iconVariant` in astryx.config in
 * one write. With no backup it writes the set name as a string; with backups
 * it writes a list, the main set first. With no variant it removes
 * `experimental.iconVariant`, so the sets draw their default looks.
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
  lookThemeMap,
  ICON_USE_ORDER_COMMAND,
  refuseOutsideProject,
  setConfigValues,
  iconSetLook,
  iconUseCommand,
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
 * Refuse a variant the main set does not declare: the look a project picks
 * is one of its main set's looks.
 * @param {import('../../../foundation/discovery/icon-set-discovery.mjs').DiscoveredIconSet} main
 * @param {string} selector
 * @param {string[]} backups
 * @param {unknown} variant
 */
function checkVariant(main, selector, backups, variant) {
  if (typeof variant !== 'string' || variant.trim() === '') {
    throw new AstryxError(
      'Name the variant every icon draws, or leave out --variant',
      [
        {
          name: `astryx experimental icon --list`,
          reason: "each installed set's variants",
        },
      ],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const declared = main.data.variants ?? [];
  if (declared.includes(variant)) return;
  const fallback = main.data.default?.variant;
  throw new AstryxError(
    declared.length === 0
      ? `Icon set "${iconSetKey(main)}" declares no variants: it draws one look, so it takes no --variant.`
      : `Icon set "${iconSetKey(main)}" declares no "${variant}" variant. Its variants: ${declared.join(', ')}.`,
    declared.length === 0
      ? [
          {
            name: iconUseCommand(selector, backups),
            reason: 'use it in its one look',
          },
        ]
      : declared.map(each => ({
          name: iconUseCommand(selector, backups, each),
          reason:
            each === fallback
              ? `its default look, ${each}`
              : `its ${each} look`,
        })),
    ERROR_CODES.ERR_INVALID_ARGUMENT,
  );
}

/**
 * Make an installed set the project's main icon set, with backup sets in
 * order, and choose the look its icons draw. A copied template takes each
 * icon from the first set in the list that has its meaning, in the project's
 * variant when that set's icon has it.
 * Experimental (spec:AST-017 FR27): may change or be removed in a patch
 * release.
 * @experimental
 * @param {string} selector a set name, or `<package>/<set>`
 * @param {{cwd?: string, backups?: string[], variant?: string}} [options]
 *   `backups`: the backup sets, in order; `variant`: the look every icon
 *   draws, one of the main set's variants
 * @returns {Promise<import('../icon.type.mjs').IconUseResponse>}
 */
export async function iconUse(
  selector,
  {cwd = process.cwd(), backups = [], variant} = {},
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
  const {
    projectDir,
    sets,
    withdrawn,
    variant: configured,
  } = await loadIconProject(cwd);
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
  if (variant !== undefined) checkVariant(main, selector, backups, variant);
  const value = backups.length > 0 ? [selector, ...backups] : selector;
  // One write: the sets, and the look, which is removed when none is named.
  /** @type {Array<[string, string | string[] | null]>} */
  const fields = [['experimental.iconSet', value]];
  if (variant !== undefined) fields.push(['experimental.iconVariant', variant]);
  else if (configured != null) fields.push(['experimental.iconVariant', null]);
  let written;
  try {
    written = setConfigValues(projectDir, fields);
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
  const previousVariant = written.previous[1] ?? null;
  // An older CLI the project may still run refuses the value just written.
  const warning = iconSetConfigCliWarning(projectDir, {
    list: Array.isArray(value),
    variant: variant !== undefined,
  });
  // Doctor fails a project that installs several sets and leaves one out.
  const unlistedSets = sets.filter(set => !listed.includes(set));
  const unlisted = unlistedSets.map(iconSetKey);
  const left =
    unlistedSets.length > 0
      ? unlistedIconSets(sets, main, backupSets, unlistedSets, variant)
      : null;
  const themeMap =
    variant === undefined ? null : lookThemeMap(main.data, variant);
  return {
    type: 'icon.use',
    data: {
      iconSet: selector,
      set: iconSetKey(main),
      backups: backups.map((each, index) => ({
        iconSet: each,
        set: iconSetKey(backupSets[index]),
      })),
      variant: variant ?? null,
      config: path.relative(projectDir, written.file).split(path.sep).join('/'),
      created: written.created,
      previous: written.previous[0] ?? null,
      previousVariant:
        typeof previousVariant === 'string' ? previousVariant : null,
      changed: written.changed,
      unlisted,
      ...(variant !== undefined
        ? {
            looks: listed.map(set => ({
              set: iconSetKey(set),
              variant: iconSetLook(set, variant),
            })),
          }
        : {}),
      ...(themeMap
        ? {themeMap: {module: main.data.module, export: themeMap}}
        : {}),
      ...(left ? {next: `${left.problem}. ${left.fix}`} : {}),
      ...(warning ? {warning} : {}),
    },
  };
}
