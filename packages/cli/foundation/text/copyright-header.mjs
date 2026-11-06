// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Strips our repo's copyright header from files we scaffold into someone
 * else's project.
 *
 * Every file in this repo carries the Meta copyright header, and several
 * commands copy repo files out verbatim — `theme eject` (bundled theme sources),
 * `init --features theme` (the annotated theme template), `template --cdn` (the
 * CDN starter page). A consumer's own source tree should not inherit our
 * boilerplate, and their lint may well reject it.
 *
 * SYNC: the same regex is applied by apps/docsite/src/lib/codeExamples.ts for
 * rendered code samples. That copy lives in a different package (the docsite
 * cannot import CLI internals), so a change to the header format has to land in
 * both.
 */

/**
 * Matches our header at the very start of a file, with the leading BOM and/or
 * shebang captured so they survive the strip.
 */
const META_COPYRIGHT_HEADER_RE =
  /^(\uFEFF?(?:#![^\r\n]*(?:\r?\n))?)\/\/ Copyright \(c\) Meta Platforms, Inc\. and affiliates\.\r?\n(?:\r?\n)*/;

/** The same header in HTML comment syntax, as scripts/add-copyright.sh writes
 *  it into the .html assets we scaffold. */
const META_COPYRIGHT_HEADER_HTML_RE =
  /^(\uFEFF?)<!-- Copyright \(c\) Meta Platforms, Inc\. and affiliates\. -->\r?\n(?:\r?\n)*/;

/**
 * Remove the leading Meta copyright header, preserving any BOM/shebang before
 * it. Returns the source unchanged when the header is absent.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripCopyrightHeader(source) {
  return source
    .replace(META_COPYRIGHT_HEADER_RE, '$1')
    .replace(META_COPYRIGHT_HEADER_HTML_RE, '$1');
}
