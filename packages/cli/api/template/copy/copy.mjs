// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `template.copy` leaf — scaffold a resolved template into the project
 * (side effect) and return a `template.copy` receipt.
 *
 * @position api/template/copy — the only side-effecting template leaf: resolves
 *   a path-safe destination, strips demo asset refs, writes the file, and
 *   returns the receipt. The template dispatcher routes the copy case here.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertWithin,
  isFilePathArg,
  PathSafetyError,
  tempFolderOf,
  tempFolders,
} from '../../../foundation/fs/path-safety.mjs';
import {AstryxError, writeFailed} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {
  answeredComponentsInSource,
  pkgOf,
  replaceTemplateDemos,
} from '../../../foundation/discovery/template-adapter.mjs';
import {analyzeTemplateNeeds} from '../../../foundation/discovery/template-needs.mjs';
import {templateDestination} from '../../../foundation/discovery/template-destination.mjs';
import {quoteCommandArgument} from '../../../foundation/env/package-manager.mjs';
import {
  NO_ICON_SETS,
  mapTemplateIcons,
} from '../../../foundation/discovery/template-icons.mjs';

/**
 * Scaffold an already-resolved template to `targetPath` (relative to `cwd`) and
 * return the `template.copy` receipt.
 * @param {import('../../../foundation/discovery/template-adapter.mjs').DiscoveredTemplate} match
 * @param {{targetPath: string, cwd: string, overwrite?: boolean, iconSets?: Parameters<typeof mapTemplateIcons>[1], components?: {ownersOf: (name: string) => readonly string[], qualified: boolean}, command?: string}} ctx
 *   `iconSets`: the project's icon sets; without them the icons are unchanged.
 *   `components`: how `astryx component` reads the project's components
 *   (loadComponentLookup); without it the receipt names no component.
 *   `command`: the command that selects this template, without a path; the
 *   refusal of a path outside the project suggests it
 * @returns {import('../template.type.mjs').TemplateCopyResponse}
 */
export function templateCopy(
  match,
  {
    targetPath,
    cwd,
    overwrite = false,
    iconSets = NO_ICON_SETS,
    components = {ownersOf: () => [], qualified: false},
    command = `astryx template ${match.dirName} --type ${match.type}`,
  },
) {
  if (!fs.existsSync(match.filePath)) {
    throw new AstryxError(
      `No source file found for template "${match.dirName}"`,
      undefined,
      ERROR_CODES.ERR_NO_SOURCE,
    );
  }

  // If targetPath looks like a file (e.g. `./foo.tsx`), write directly to
  // it. Previously this path was treated as a directory and the file was
  // written as `./foo.tsx/page.tsx`, which is wrong and surprising.
  const fileTarget = isFilePathArg(targetPath)
    ? targetPath
    : path.join(
        targetPath,
        match.type === 'block' ? path.basename(match.filePath) : 'page.tsx',
      );

  // Path-safety: the guard sees the file that will be written, not only its
  // directory — a symlink at that name would otherwise carry the write
  // outside the project root. Runs BEFORE any mkdir/write. An absolute path
  // inside the project is the same write as its relative form.
  let outputFilePath;
  // A scratch copy in the system temp folder, outside the project.
  let scratch = false;
  try {
    outputFilePath = assertWithin(fileTarget, cwd, {
      allowAbsolute: true,
      label: 'template target path',
    });
  } catch (err) {
    if (!(err instanceof PathSafetyError)) throw err;
    const outsideProject =
      path.isAbsolute(targetPath) &&
      err.code === ERROR_CODES.ERR_PATH_TRAVERSAL &&
      !err.viaSymlink;
    const temp = outsideProject ? tempFolderOf(targetPath) : null;
    if (temp) {
      outputFilePath = inTempFolder(fileTarget, targetPath, temp);
      scratch = true;
    } else if (outsideProject) {
      // Outside the project and the temp folder there is nothing to write,
      // so the refusal names a place inside the project and the print that
      // writes nothing.
      const folder = templateDestination(cwd, match.type, match.dirName);
      const [scratchFolder] = tempFolders();
      throw new AstryxError(
        `Invalid template target path "${targetPath}": it is outside the project root (${path.resolve(cwd)}). ` +
          (scratchFolder
            ? `The template is written only inside the project, or as a scratch copy in the system temp folder (${scratchFolder}). Give a path inside one, or print the source.`
            : 'The template is written only inside the project. Give a path inside it, or print the source.'),
        [
          {
            name: `${command} ${quoteCommandArgument(folder)}`,
            reason: `write the ${match.type} inside the project`,
          },
          {name: command, reason: 'print the source and write nothing'},
        ],
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    } else {
      throw new AstryxError(
        err.message,
        undefined,
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
  }
  const outputDir = path.dirname(outputFilePath);
  const outputFileName = path.basename(outputFilePath);

  // Refuse to clobber an existing file unless the caller opts in. The CLI has
  // its own pre-flight collision message, but the API is a public surface
  // (@astryxdesign/cli/api) and must enforce this itself — same guard the peer
  // theme/add write-leaf applies.
  if (!overwrite && fs.existsSync(outputFilePath)) {
    const rel = scratch
      ? outputFilePath
      : path.relative(cwd, outputFilePath) || outputFilePath;
    throw new AstryxError(
      `Refusing to overwrite existing file ${rel}. Re-run with --overwrite (or -f) to replace it.`,
      undefined,
      ERROR_CODES.ERR_FILE_EXISTS,
    );
  }

  // Replace docs-only demo content and demo media references so the
  // scaffolded file renders without anything only Astryx's previews provide.
  // Read before any write, so a failure below leaves nothing behind.
  const {
    source: withMedia,
    demoContentReplaced,
    demoMediaReplaced,
  } = replaceTemplateDemos(fs.readFileSync(match.filePath, 'utf-8'));
  // Icons follow the project's icon set and its backups (AST-084 FR9). An
  // icon no set in the list draws a placeholder the file declares, so the
  // library the template imported it from is no longer a needed dependency
  // below.
  const {source: outputSource, icons} = mapTemplateIcons(
    withMedia,
    iconSets,
    match.icons,
  );
  try {
    fs.mkdirSync(outputDir, {recursive: true});
    fs.writeFileSync(outputFilePath, outputSource);
  } catch (err) {
    throw writeFailed(outputFilePath, cwd, err);
  }

  // Analyze what the template needs that the project lacks: external packages
  // and the StyleX compiler. Derived from the source's own imports.
  const {notes, missingPackages, installCommand, installGuidance} =
    analyzeTemplateNeeds(outputSource, cwd);
  const missing = missingPackages;

  const relOutput = scratch ? outputDir : path.relative(cwd, outputDir) || '.';
  return {
    type: 'template.copy',
    package: pkgOf(match),
    data: {
      template: match.dirName,
      outputDir: relOutput,
      fileName: outputFileName,
      filesCopied: 1,
      demoMediaReplaced,
      demoContentReplaced,
      notes,
      missingPackages: missing,
      installCommand,
      components: answeredComponentsInSource(outputSource, components),
      ...(installGuidance ? {installGuidance} : {}),
      ...(path.isAbsolute(targetPath) && !scratch
        ? {givenPath: targetPath}
        : {}),
      ...(icons ? {icons} : {}),
      isReady: match.isReady !== false,
    },
  };
}

/**
 * The file a scratch copy writes, checked as a write inside the temp folder
 * `temp`: a link that carries it out of that folder is refused, as a link out
 * of the project is.
 * @param {string} file the file to write, absolute
 * @param {string} given the path as given
 * @param {string} temp the temp folder
 * @returns {string}
 */
function inTempFolder(file, given, temp) {
  try {
    return assertWithin(file, temp, {
      allowAbsolute: true,
      label: 'template target path',
    });
  } catch (err) {
    if (!(err instanceof PathSafetyError)) throw err;
    throw new AstryxError(
      `Invalid template target path "${given}": a link carries it out of the temp folder (${temp}).`,
      undefined,
      ERROR_CODES.ERR_PATH_TRAVERSAL,
    );
  }
}
