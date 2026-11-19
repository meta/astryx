// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where an HTML element shows an image from an address.
 * @input An element's name and one of its attribute's names.
 * @output Whether the browser draws an image from that attribute's address.
 * @position The one rule the render's markup pass, its pass over the page's
 *   code and the file's script share (render-page.mjs, page-worker.mjs,
 *   client-bundle.mjs).
 */

/** An address whose path names a type that is never an image: a font, media, a script, a stylesheet or a document. */
export const NOT_AN_IMAGE =
  /\.(woff2?|ttf|otf|eot|mp4|webm|mov|mp3|wav|ogg|css|[cm]?js|json|html?|pdf|txt|xml)$/i;

/**
 * Whether an HTML element shows an image from the address in an attribute:
 * the `src` of an `<img>` or an `<input>`, the `srcset` of an `<img>` or a
 * `<source>`, or the `poster` of a `<video>`. Any input's `src` counts: the
 * browser asks for it only for an image input, and a page can set `src`
 * before `type`. The file's script runs this too, so it reads nothing
 * outside itself.
 * @param {string} tag the element's name, in lower case
 * @param {string} attr the attribute's name, in lower case
 * @returns {boolean}
 */
export function showsImage(tag, attr) {
  return (
    (attr === 'src' && (tag === 'img' || tag === 'input')) ||
    (attr === 'srcset' && (tag === 'img' || tag === 'source')) ||
    (attr === 'poster' && tag === 'video')
  );
}
