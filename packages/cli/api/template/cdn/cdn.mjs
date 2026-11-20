// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `template.cdn` leaf — writes the annotated no-build-step starter page
 * into the consumer's project.
 *
 * A CDN starter is a template, so it lives in the template family. It is the
 * one member that is not discovered: it ships as an asset rather than as a
 * `page.tsx` + `template.doc.mjs` pair, which is why the dispatcher routes to
 * it from a flag instead of resolving a name.
 *
 * Every CDN URL in the asset carries the `__ASTRYX_VERSION__` placeholder, which
 * is substituted here. An unpinned CDN URL resolves to whatever is latest and is
 * cached hard, so a page written today can break tomorrow without being edited.
 *
 * @position api/template/cdn — writes the CDN starter asset; the template
 *   dispatcher routes `--cdn` here before any discovery happens.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT, findCoreDir} from '../../../foundation/fs/paths.mjs';
import {
  assertWithin,
  homeRelativePath,
  PathSafetyError,
} from '../../../foundation/fs/path-safety.mjs';
import {stripCopyrightHeader} from '../../../foundation/text/copyright-header.mjs';
import {getXdsVersion} from '../../../foundation/agent-docs/agent-docs.mjs';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';

/** The annotated CDN starter that ships with the CLI. */
export const CDN_TEMPLATE_SRC = path.join(
  CLI_ROOT,
  'assets',
  'cdn.template.html',
);

/** Where it lands when the caller does not say. */
export const CDN_TEMPLATE_DEFAULT_PATH = 'cdn.template.html';

/** The token every CDN URL in the asset carries in place of a version. */
export const CDN_VERSION_PLACEHOLDER = '__ASTRYX_VERSION__';

/**
 * Write the annotated CDN starter page into a project.
 *
 * Refuses to overwrite without `overwrite`: an edited copy is the consumer's
 * work, and this command is safe to re-run.
 *
 * @param {{targetPath?: string, overwrite?: boolean, cwd?: string}} [options]
 * @returns {import('../template.type.mjs').TemplateCdnResponse}
 */
export function templateCdn(options = {}) {
  const {
    targetPath = CDN_TEMPLATE_DEFAULT_PATH,
    overwrite = false,
    cwd = process.cwd(),
  } = options;

  const inside = [
    {
      name: `astryx template --cdn ${CDN_TEMPLATE_DEFAULT_PATH}`,
      reason: 'write the page inside the project',
    },
  ];
  // An absolute path inside the project is the same write as its relative
  // form. `~/…` names the home folder, as a shell reads it.
  const target = homeRelativePath(targetPath) ?? targetPath;
  let resolved;
  try {
    resolved = assertWithin(target, cwd, {
      allowAbsolute: true,
      label: 'cdn template path',
    });
  } catch (err) {
    if (!(err instanceof PathSafetyError)) throw err;
    const outside =
      path.isAbsolute(target) &&
      err.code === ERROR_CODES.ERR_PATH_TRAVERSAL &&
      !err.viaSymlink;
    throw new AstryxError(
      outside
        ? `Invalid cdn template path "${targetPath}": it is outside the project root (${path.resolve(cwd)}). ` +
            'The page is written only inside the project.'
        : err.message,
      inside,
      ERROR_CODES.ERR_PATH_TRAVERSAL,
    );
  }

  const relative = path.relative(cwd, resolved) || targetPath;
  // The installed @astryxdesign/core when there is one, else this CLI's own
  // version. core, the themes and the CLI are released as one fixed group, so
  // either answer pins a set of packages that exist together.
  const version = getXdsVersion(findCoreDir(cwd));

  if (fs.existsSync(resolved) && !overwrite) {
    return {
      type: 'template.cdn',
      data: {path: relative, version, written: false, reason: 'exists'},
    };
  }

  const source = stripCopyrightHeader(
    fs.readFileSync(CDN_TEMPLATE_SRC, 'utf-8'),
  );
  const contents = source.replaceAll(CDN_VERSION_PLACEHOLDER, version);
  fs.mkdirSync(path.dirname(resolved), {recursive: true});
  fs.writeFileSync(resolved, contents);

  return {
    type: 'template.cdn',
    data: {path: relative, version, written: true, reason: null},
  };
}
