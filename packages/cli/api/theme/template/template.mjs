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
import {CLI_ROOT, projectWritePath} from '../../../foundation/fs/paths.mjs';
import {
  assertWithin,
  PathSafetyError,
} from '../../../foundation/fs/path-safety.mjs';
import {stripCopyrightHeader} from '../../../foundation/text/copyright-header.mjs';
import {formatCliCommand} from '../../../foundation/env/package-manager.mjs';
import {fsErrorMessage} from '../../../foundation/fs/fs-error.mjs';
import {editorThemeRecord} from '../../../foundation/config/theme-state.mjs';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';

/** The annotated `defineTheme` reference that ships with the CLI. */
export const THEME_TEMPLATE_SRC = path.join(
  CLI_ROOT,
  'assets',
  'theme.template.ts',
);

/** The warning the CLI prints when it writes the template outside a project. */
export const OUTSIDE_PROJECT_WARNING =
  'Warning: no package.json is in this folder or above it, so the template is written here. Run it inside a project, or run `npm init -y` here first, to write it at a project root.';

/** Where it lands when the caller does not say. */
export const THEME_TEMPLATE_DEFAULT_PATH = 'theme.template.ts';

/** The first words of the template; a file that holds them is a copy of it. */
const TEMPLATE_MARKER = 'Astryx theme template';

/** The template is TypeScript; any other extension gives a broken file. */
const TEMPLATE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

/** Names that theme sources use: `x.template.ts`, `x.theme.ts`, `xTheme.ts`. */
const THEME_SOURCE_NAME = /(?:\.template|\.theme|Theme)\.(?:ts|tsx|mts|cts)$/;

/**
 * May `--overwrite` replace this existing file? Only a copy of the template,
 * or a file named like a theme source. Anything else, such as `package.json`
 * or an app route, is the user's work and is never replaced.
 * @param {string} file
 * @returns {boolean}
 */
function isReplaceableThemeFile(file) {
  if (THEME_SOURCE_NAME.test(path.basename(file))) return true;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const head = Buffer.alloc(512);
      const n = fs.readSync(fd, head, 0, head.length, 0);
      return head.subarray(0, n).toString('utf-8').includes(TEMPLATE_MARKER);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

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

  const suggested = path.posix.join(
    String(targetPath)
      .trim()
      .replace(/[\\/]+$/, '') || '.',
    THEME_TEMPLATE_DEFAULT_PATH,
  );
  if (String(targetPath).trim() === '') {
    throw new AstryxError(
      'The theme template path is blank. Give a file path, or leave it out for theme.template.ts.',
      [
        {
          name: formatCliCommand(
            `theme template ${THEME_TEMPLATE_DEFAULT_PATH}`,
            cwd,
          ),
          reason: 'the default path',
        },
      ],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }

  // The project the folder belongs to bounds the path, as for other theme
  // commands: a path given is read from the current folder, and no path
  // means the project root.
  // With no package.json at or above the folder it writes here, and the CLI
  // prints OUTSIDE_PROJECT_WARNING.
  // Read as every theme command reads a path it writes; a backslash
  // separates folders on every platform.
  const {projectDir, relative: fromRoot} = projectWritePath(
    cwd,
    options.targetPath == null ? undefined : String(targetPath),
    THEME_TEMPLATE_DEFAULT_PATH,
  );
  let resolved;
  try {
    resolved = assertWithin(fromRoot, projectDir, {
      label: 'theme template path',
    });
  } catch (err) {
    if (err instanceof PathSafetyError) {
      throw new AstryxError(
        // The path as typed, not as read from the project root.
        err.message.replace(`"${fromRoot}"`, `"${targetPath}"`),
        [
          {
            // No path: the template at the project root.
            name: formatCliCommand('theme template', cwd),
            reason: 'write the template at the project root',
          },
        ],
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    throw err;
  }

  const relative = path.relative(cwd, resolved) || targetPath;

  const namesFolder = /[\\/]$/.test(targetPath) || isDirectory(resolved);
  if (namesFolder) {
    throw new AstryxError(
      `${relative || '.'} is a folder. The theme template is one file; give its path.`,
      [
        {
          name: formatCliCommand(`theme template ${suggested}`, cwd),
          reason: 'write the template into that folder',
        },
      ],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  if (!TEMPLATE_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    throw new AstryxError(
      `${relative} is not a TypeScript file. The theme template is TypeScript; give a .ts path.`,
      [
        {
          name: formatCliCommand(
            `theme template ${path.posix.join(path.dirname(targetPath).replace(/\\/g, '/'), THEME_TEMPLATE_DEFAULT_PATH)}`,
            cwd,
          ),
          reason: 'a .ts path in the same folder',
        },
      ],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }

  const editorRecord =
    fs.existsSync(resolved) && overwrite
      ? editorThemeRecord(path.dirname(resolved))
      : null;
  if (editorRecord) {
    throw new AstryxError(
      `${relative} belongs to a theme the theme editor made (${editorRecord} is beside it). Replacing it would cut the theme off from its settings, so --overwrite does not replace it.`,
      [
        {
          name: formatCliCommand(
            `theme template ${THEME_TEMPLATE_DEFAULT_PATH}`,
            cwd,
          ),
          reason: 'write the template to a new file',
        },
      ],
      ERROR_CODES.ERR_FILE_EXISTS,
    );
  }

  if (
    fs.existsSync(resolved) &&
    overwrite &&
    !isReplaceableThemeFile(resolved)
  ) {
    throw new AstryxError(
      `${relative} is not a theme template or theme source, so --overwrite does not replace it.`,
      [
        {
          name: formatCliCommand(
            `theme template ${THEME_TEMPLATE_DEFAULT_PATH}`,
            cwd,
          ),
          reason: 'write the template to a new file',
        },
      ],
      ERROR_CODES.ERR_FILE_EXISTS,
    );
  }

  if (fs.existsSync(resolved) && !overwrite) {
    // Whether --overwrite would replace this file, and if not, a path that
    // takes the template, so the hint never names a command that refuses.
    const overwritable =
      !editorThemeRecord(path.dirname(resolved)) &&
      isReplaceableThemeFile(resolved);
    return {
      type: 'theme.template',
      data: {
        path: relative,
        written: false,
        reason: 'exists',
        overwritable,
        alternative: overwritable ? null : freeTemplatePath(resolved, cwd),
      },
    };
  }

  // Our repo header has no business in someone else's source tree.
  const contents = stripCopyrightHeader(
    fs.readFileSync(THEME_TEMPLATE_SRC, 'utf-8'),
  );
  try {
    fs.mkdirSync(path.dirname(resolved), {recursive: true});
    fs.writeFileSync(resolved, contents);
  } catch (err) {
    const message =
      fsErrorMessage(err, relative) ??
      `Failed to write the theme template to ${relative}: ${err instanceof Error ? err.message : String(err)}`;
    throw new AstryxError(message, undefined, ERROR_CODES.ERR_WRITE_FAILED);
  }

  return {
    type: 'theme.template',
    data: {path: relative, written: true, reason: null},
  };
}

/** @param {string} file */
function isDirectory(file) {
  try {
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
}

/**
 * A path near `file` that holds no file yet, for the template: the default
 * name in its folder, then numbered names.
 * @param {string} file
 * @param {string} cwd
 * @returns {string} relative to cwd, with `/`
 */
function freeTemplatePath(file, cwd) {
  const dir = path.dirname(file);
  for (let n = 1; n < 100; n += 1) {
    const name =
      n === 1 ? THEME_TEMPLATE_DEFAULT_PATH : `theme.template-${n}.ts`;
    const candidate = path.join(dir, name);
    if (!fs.existsSync(candidate)) {
      return path.relative(cwd, candidate).split(path.sep).join('/');
    }
  }
  return THEME_TEMPLATE_DEFAULT_PATH;
}
