// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx theme template` leaf — writes the annotated theme template into the
 * consumer's project.
 *
 * `theme add` uses an installed built theme without copying source. This command
 * writes the blank annotated reference for a new theme. `theme eject` is the
 * separate path for starting from a complete source fork of an existing theme.
 *
 * The template is a doc that happens to compile, so it is one file at the
 * project root by default rather than a package under src/themes/ — you read
 * it, copy what you need into your own theme file, and delete it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT} from '../../../foundation/fs/paths.mjs';
import {assertWithin, PathSafetyError} from '../../../foundation/fs/path-safety.mjs';
import {stripCopyrightHeader} from '../../../foundation/text/copyright-header.mjs';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';

/** The annotated `defineTheme` reference that ships with the CLI. */
export const THEME_TEMPLATE_SRC = path.join(CLI_ROOT, 'assets', 'theme.template.ts');

/** Where it lands when the caller does not say. */
export const THEME_TEMPLATE_DEFAULT_PATH = 'theme.template.ts';

/**
 * Write the annotated theme template into a project.
 *
 * Refuses to overwrite without `overwrite`: an edited copy is the consumer's
 * work, and this command is safe to re-run (init calls it on every setup).
 *
 * @param {{targetPath?: string, overwrite?: boolean, cwd?: string}} [options]
 * @returns {import('../theme.type.mjs').ThemeTemplateResponse}
 */
export function themeTemplate(options = {}) {
  const {
    targetPath = THEME_TEMPLATE_DEFAULT_PATH,
    overwrite = false,
    cwd = process.cwd(),
  } = options;

  let resolved;
  try {
    resolved = assertWithin(targetPath, cwd, {label: 'theme template path'});
  } catch (err) {
    if (err instanceof PathSafetyError) {
      throw new AstryxError(err.message, undefined, ERROR_CODES.ERR_PATH_TRAVERSAL);
    }
    throw err;
  }

  const relative = path.relative(cwd, resolved) || targetPath;

  if (fs.existsSync(resolved) && !overwrite) {
    return {type: 'theme.template', data: {path: relative, written: false, reason: 'exists'}};
  }

  // Our repo header has no business in someone else's source tree.
  const contents = stripCopyrightHeader(fs.readFileSync(THEME_TEMPLATE_SRC, 'utf-8'));
  try {
    fs.mkdirSync(path.dirname(resolved), {recursive: true});
    fs.writeFileSync(resolved, contents);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AstryxError(
      `Failed to write the theme template to ${relative}: ${message}`,
      undefined,
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  }

  return {type: 'theme.template', data: {path: relative, written: true, reason: null}};
}
