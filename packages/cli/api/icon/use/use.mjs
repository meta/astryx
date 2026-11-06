// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.use` leaf (AST-084 FR8): choose the project's icon set by
 * writing `experimental.iconSet` in astryx.config.
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
  refuseOutsideProject,
  setConfigString,
} from '../_adapter.mjs';
import {setsNamed, unusableSet} from '../_records.mjs';

/**
 * Make an installed set the project's icon set.
 * Experimental (spec:AST-017 FR27): may change or be removed in a patch
 * release.
 * @experimental
 * @param {string} selector a set name, or `<package>/<set>`
 * @param {{cwd?: string}} [options]
 * @returns {Promise<import('../icon.type.mjs').IconUseResponse>}
 */
export async function iconUse(selector, {cwd = process.cwd()} = {}) {
  if (typeof selector !== 'string' || selector.trim() === '') {
    throw new AstryxError(
      'Name the icon set to use',
      [
        {
          name: 'astryx experimental icon --list',
          reason: 'list the installed sets',
        },
      ],
      ERROR_CODES.ERR_MISSING_ARGUMENT,
    );
  }
  refuseOutsideProject(cwd, 'experimental icon use', 'the app project');
  const {projectDir, sets, withdrawn} = await loadIconProject(cwd);
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
  let written;
  try {
    written = setConfigString(projectDir, 'experimental.iconSet', selector);
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
  // An older CLI the project may still run refuses the key just written.
  const warning = iconSetConfigCliWarning(projectDir);
  return {
    type: 'icon.use',
    data: {
      iconSet: selector,
      set: iconSetKey(named[0]),
      config: path.relative(projectDir, written.file).split(path.sep).join('/'),
      created: written.created,
      previous: written.previous,
      changed: written.changed,
      ...(warning ? {warning} : {}),
    },
  };
}
