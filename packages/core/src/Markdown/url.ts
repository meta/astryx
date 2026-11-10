// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file url.ts
 * @input Untrusted Markdown link or image destination
 * @output The parser's acceptance and normalized render-safe destinations
 * @position Shared URL policy for parser, transforms, and renderer
 */

import {sanitizeUrl} from '../utils/safeUrl';

/** Schemes Markdown never keeps as a parsed link or image, or renders as an image. */
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
 * whitespace and ignores case. The renderer's image check uses the same rule.
 */
export function isSafeMarkdownParserUrl(url: string): boolean {
  return !hasBlockedScheme(normalizeMarkdownUrl(url));
}

/** Navigation and image rendering deliberately have different policies. */
export function sanitizeMarkdownLinkUrl(url: string): string | null {
  const normalized = sanitizeUrl(url);
  return normalized === '' ? null : normalized;
}

export function sanitizeMarkdownUrl(url: string): string | null {
  const normalized = normalizeMarkdownUrl(url);
  return normalized !== '' && !hasBlockedScheme(normalized) ? normalized : null;
}
