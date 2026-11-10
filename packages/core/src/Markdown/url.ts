// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file url.ts
 * @input Untrusted Markdown link or image destination
 * @output Whether the parser keeps it; a checked base URL for plugin config
 * @position The parser's URL rule. Parser, plugin transforms, and Remark use
 *   it; the renderer trusts parsed nodes and checks no scheme itself
 */

import {sanitizeUrl} from '../utils/safeUrl';

/** Schemes the parser never keeps as a link or an image. */
const BLOCKED_SCHEME_PATTERN = /^(?:javascript:|data:|vbscript:)/i;

function normalizeMarkdownUrl(url: string): string {
  // Browsers ignore embedded controls in schemes, so normalize before checking.
  // eslint-disable-next-line no-control-regex -- control chars are the bypass
  return url.replace(/[\x00-\x1f\x7f]/g, '').trim();
}

function hasBlockedScheme(normalized: string): boolean {
  return BLOCKED_SCHEME_PATTERN.test(normalized);
}

/**
 * Whether the parser keeps a link or image destination. It rejects every
 * `javascript:`, `vbscript:`, and `data:` URL, after the parser decodes the
 * destination and after this step removes control characters and outer
 * whitespace and ignores case.
 */
export function isSafeMarkdownParserUrl(url: string): boolean {
  return !hasBlockedScheme(normalizeMarkdownUrl(url));
}

/**
 * A navigation URL that does not come from parsed source, such as a plugin's
 * base URL, checked with the shared navigation rule and the parser's rule.
 * Returns the normalized URL, or null.
 */
export function sanitizeMarkdownLinkUrl(url: string): string | null {
  const normalized = sanitizeUrl(url);
  return normalized === null ||
    normalized === '' ||
    hasBlockedScheme(normalized)
    ? null
    : normalized;
}
