// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file preview-source-transform.mjs
 * The source rewrites that the Next build applies to template previews, for
 * the build-time preview snapshots.
 *
 * @input A source file's text and path, the docsite `public` folder, and the
 *   `DOCSITE_ICON_SET` value.
 * @output The source with its template images addressed through the image
 *   optimizer and, when an icon set is named, its icons rewritten to it.
 * @position Used by scripts/generate-preview-snapshots.mjs. SYNC: the source
 *   patterns match the icon and image loader rules in next.config.mjs.
 */

import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {
  previewIconSetList,
  rewriteTemplatePreview,
} from '../template-icon-loader.mjs';
import {optimizeTemplateImages} from '../template-image-loader.mjs';

const TEMPLATE_SOURCE =
  /packages[\\/]cli[\\/]assets[\\/]templates[\\/](?:pages|blocks)[\\/].+\.tsx$/u;
const PAGE_TEMPLATE_SOURCE =
  /packages[\\/]cli[\\/]assets[\\/]templates[\\/]pages[\\/].+\.tsx$/u;

/**
 * @param {string} source
 * @param {string} file the source's path
 * @param {{publicDir: string, projectDir: string, iconSet: string, rewriteIcons?: typeof rewriteTemplatePreview, discover?: () => Promise<any[]>}} options
 *   `rewriteIcons` and `discover` default to the docsite's own loaders
 * @returns {Promise<string>}
 */
export async function transformPreviewSource(source, file, options) {
  let output = source;
  if (PAGE_TEMPLATE_SOURCE.test(file)) {
    output = optimizeTemplateImages(output, path =>
      existsSync(join(options.publicDir, path)),
    );
  }
  const list = previewIconSetList(options.iconSet);
  if (list.length > 0 && TEMPLATE_SOURCE.test(file)) {
    const rewriteIcons = options.rewriteIcons ?? rewriteTemplatePreview;
    output = await rewriteIcons(output, file, {
      projectDir: options.projectDir,
      list,
      ...(options.discover ? {discover: options.discover} : {}),
    });
  }
  return output;
}
