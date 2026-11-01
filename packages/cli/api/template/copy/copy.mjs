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
} from '../../../foundation/fs/path-safety.mjs';
import {AstryxError, writeFailed} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {pkgOf, replaceDemoMedia} from '../../../foundation/discovery/template-adapter.mjs';
import {analyzeTemplateNeeds} from '../../../foundation/discovery/template-needs.mjs';
import {
  NO_ICON_SETS,
  mapTemplateIcons,
} from '../../../foundation/discovery/template-icons.mjs';

/**
 * Scaffold an already-resolved template to `targetPath` (relative to `cwd`) and
 * return the `template.copy` receipt.
 * @param {import('../../../foundation/discovery/template-adapter.mjs').DiscoveredTemplate} match
 * @param {{targetPath: string, cwd: string, overwrite?: boolean, iconSets?: Parameters<typeof mapTemplateIcons>[1]}} ctx
 *   `iconSets`: the project's icon sets; without them the icons are unchanged
 * @returns {import('../template.type.mjs').TemplateCopyResponse}
 */
export function templateCopy(
  match,
  {targetPath, cwd, overwrite = false, iconSets = NO_ICON_SETS},
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
  // outside the project root. Runs BEFORE any mkdir/write.
  let outputFilePath;
  try {
    outputFilePath = assertWithin(fileTarget, cwd, {
      label: 'template target path',
    });
  } catch (err) {
    if (err instanceof PathSafetyError) {
      throw new AstryxError(
        err.message,
        undefined,
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    throw err;
  }
  const outputDir = path.dirname(outputFilePath);
  const outputFileName = path.basename(outputFilePath);

  // Refuse to clobber an existing file unless the caller opts in. The CLI has
  // its own pre-flight collision message, but the API is a public surface
  // (@astryxdesign/cli/api) and must enforce this itself — same guard the peer
  // theme/add write-leaf applies.
  if (!overwrite && fs.existsSync(outputFilePath)) {
    const rel = path.relative(cwd, outputFilePath) || outputFilePath;
    throw new AstryxError(
      `Refusing to overwrite existing file ${rel}. Re-run with --overwrite (or -f) to replace it.`,
      undefined,
      ERROR_CODES.ERR_FILE_EXISTS,
    );
  }

  // Strip demo image references so the scaffolded file renders without a
  // Meta-only network dependency. Read before any write, so a failure below
  // leaves nothing behind.
  const {source: withMedia, demoMediaReplaced} = replaceDemoMedia(
    fs.readFileSync(match.filePath, 'utf-8'),
  );
  // Icons follow the project's icon set (AST-084 FR9). An icon with no match
  // keeps its import, so its library stays a needed dependency below.
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
  const {notes, missingPackages, installCommand} = analyzeTemplateNeeds(
    outputSource,
    cwd,
  );
  const missing = missingPackages;

  const relOutput = path.relative(cwd, outputDir) || '.';
  return {
    type: 'template.copy',
    package: pkgOf(match),
    data: {
      template: match.dirName,
      outputDir: relOutput,
      fileName: outputFileName,
      filesCopied: 1,
      demoMediaReplaced,
      notes,
      missingPackages: missing,
      installCommand,
      ...(icons ? {icons} : {}),
    },
  };
}
