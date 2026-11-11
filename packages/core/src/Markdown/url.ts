// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file url.ts
 * @input Untrusted Markdown link or image destination
 * @output Whether the parser keeps it; a checked base URL for plugin config
 * @position The parser's URL rule. Parser, plugin transforms, and Remark use
 *   it; the renderer trusts parsed nodes and checks no scheme itself
 */

import {sanitizeUrl} from '../utils/safeUrl';

/**
 * Markdown blocks every `data:` URL, of any media type, on top of the shared
 * navigation rule. The test runs on the shared rule's normalized form.
 */
const DATA_SCHEME_PATTERN = /^data:/i;

/**
 * Whether the parser keeps a link or image destination: the shared navigation
 * rule (`sanitizeUrl`) accepts it, and it is not a `data:` URL. The parser
 * decodes the destination before this check.
 */
export function isSafeMarkdownParserUrl(url: string): boolean {
  const normalized = sanitizeUrl(url);
  return normalized !== null && !DATA_SCHEME_PATTERN.test(normalized);
}

/**
 * The destination a link or image node stores: the shared rule's normalized
 * form (control characters and outer whitespace removed), so a blank
 * destination is empty and the renderer can use the URL as it is. A blocked
 * destination is returned unchanged for the safety check to reject.
 */
export function normalizedMarkdownDestination(url: string): string {
  return sanitizeUrl(url) ?? url;
}

/**
 * A navigation URL that does not come from parsed source, such as a plugin's
 * base URL, checked with the parser's rule. Returns the normalized URL, or
 * null.
 */
export function sanitizeMarkdownLinkUrl(url: string): string | null {
  const normalized = sanitizeUrl(url);
  return normalized === null ||
    normalized === '' ||
    DATA_SCHEME_PATTERN.test(normalized)
    ? null
    : normalized;
}
