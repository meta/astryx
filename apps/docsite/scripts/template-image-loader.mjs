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
import {mapFixtureRefs} from '../../../packages/cli/foundation/discovery/template-adapter.mjs';
import {
  OPTIMIZED_IMAGE_QUALITY,
  optimizedImageUrl,
} from '../src/lib/optimizedImageUrl.mjs';

// The optimizer does not enlarge, so this width keeps the pixel size of every
// image that is not wider. It must be a width the optimizer allows
// (`images.deviceSizes`); the optimizer answers 400 for any other.
export const TEMPLATE_IMAGE_WIDTH = 1920;
export const TEMPLATE_IMAGE_QUALITY = OPTIMIZED_IMAGE_QUALITY;

// The formats the optimizer converts. It refuses a vector image.
const OPTIMIZED_FORMAT = /\.(?:png|jpe?g)$/iu;

/**
 * The optimizer URL for a template image: the same picture in the format the
 * browser accepts, no wider than `width`.
 *
 * @param {string} path a root-relative path under `/template-assets/`
 * @param {number} [width] a width the optimizer allows
 * @returns {string}
 */
export function templateImageUrl(path, width = TEMPLATE_IMAGE_WIDTH) {
  return optimizedImageUrl(path, width);
}

/**
 * Address each template image the optimizer can serve by its optimizer URL.
 * The CLI's scanner finds the references, so a preview and a copy agree on
 * what a fixture reference is. Other references stay as written: vector
 * images, video, a mention in text, and the missing files that fallback
 * examples name.
 *
 * @param {string} source
 * @param {(path: string) => boolean} isServed whether `public` serves a file
 *   at the path
 * @param {number} [width] the widest picture to ask for; a width the
 *   optimizer allows
 * @returns {string}
 */
export function optimizeTemplateImages(
  source,
  isServed,
  width = TEMPLATE_IMAGE_WIDTH,
) {
  return mapFixtureRefs(source, ({reference, kind, isValue}) => {
    if (kind !== 'image' || !isValue) {
      return null;
    }
    // A query or a fragment does not select another file.
    const path = reference.split(/[?#]/u)[0];
    return OPTIMIZED_FORMAT.test(path) && isServed(path)
      ? templateImageUrl(path, width)
      : null;
  }).source;
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
