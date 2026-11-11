// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A Webpack loader that serves template preview images through the
 *   image optimizer. Template sources keep their `/template-assets/` paths:
 *   the CLI copies those sources into projects, and the site shows them as
 *   code. Only the module a preview renders is rewritten.
 * @input A template's `.tsx` source and the docsite's `public` folder.
 * @output The source with each PNG and JPEG that exists under
 *   `public/template-assets` addressed by its optimizer URL.
 * @position Build-time docsite tooling, read by next.config.mjs.
 */

import {existsSync} from 'node:fs';
import {join} from 'node:path';

// The optimizer does not enlarge, so this width keeps the pixel size of every
// image that is not wider. It must be a width the optimizer allows
// (`images.deviceSizes`); the optimizer answers 400 for any other.
export const TEMPLATE_IMAGE_WIDTH = 1920;
// Must be in `images.qualities`.
export const TEMPLATE_IMAGE_QUALITY = 75;

// A whole quoted or `url()` value, the two forms the CLI replaces on copy.
const TEMPLATE_IMAGE =
  /(?<=['"`(])\/template-assets\/[\w@.-]+\.(?:png|jpe?g)(?=['"`)])/gu;

/**
 * The optimizer URL for a template image: the same picture in the format the
 * browser accepts, at its own pixel size.
 *
 * @param {string} path a root-relative path under `/template-assets/`
 * @returns {string}
 */
export function templateImageUrl(path) {
  return `/_next/image?url=${encodeURIComponent(path)}&w=${TEMPLATE_IMAGE_WIDTH}&q=${TEMPLATE_IMAGE_QUALITY}`;
}

/**
 * Address each template image the optimizer can serve by its optimizer URL.
 * Other references stay as written: vector images, video, and the missing
 * files that fallback examples name.
 *
 * @param {string} source
 * @param {(path: string) => boolean} isServed whether `public` serves a file
 *   at the path
 * @returns {string}
 */
export function optimizeTemplateImages(source, isServed) {
  return source.replace(TEMPLATE_IMAGE, path =>
    isServed(path) ? templateImageUrl(path) : path,
  );
}

/**
 * @this {{getOptions: () => {publicDir: string}, addDependency: (file: string) => void, addMissingDependency: (file: string) => void}}
 * @param {string} source
 */
export default function templateImageLoader(source) {
  const {publicDir} = this.getOptions();
  return optimizeTemplateImages(source, path => {
    const file = join(publicDir, path);
    const isServed = existsSync(file);
    // The output depends on whether the file exists, so the build cache must
    // follow it.
    if (isServed) {
      this.addDependency(file);
    } else {
      this.addMissingDependency(file);
    }
    return isServed;
  });
}
