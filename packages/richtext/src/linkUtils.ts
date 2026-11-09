// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file linkUtils.ts
 * @input Uses only the DOM URL constructor (guarded via try/catch for SSR/edge).
 * @output Exports `sanitizeUrl`, `validateUrl`, and the URL/email matcher regexes
 *   used by the AutoLink wiring.
 * @position @astryxdesign/richtext helper shared by RichTextEditorToolbar (link
 *   button) and the AutoLink matchers in RichTextEditor. Kept dependency-free so
 *   both can import it without pulling in extra `@lexical/*` surface.
 *
 * SYNC: When modified, update:
 * - /packages/richtext/src/RichTextEditorToolbar.tsx (link button)
 * - /packages/richtext/src/RichTextEditor.tsx (AutoLink matchers)
 * - /packages/richtext/src/RichTextEditor.test.tsx (tests)
 * - /packages/richtext/src/RichTextEditor.doc.mjs (link docs)
 * - /packages/richtext/src/index.ts (exports / barrel)
 *
 * NOTE: Mirrors the Lexical playground's url.ts (`sanitizeUrl` / `validateUrl`
 * / `URL_REGEX` / `EMAIL_REGEX`). Sanitization is the security-critical part:
 * it blocks `javascript:`, `data:`, and other non-http(s)/mailto/tel schemes
 * from being written into a LinkNode's href, so an inserted link can never
 * smuggle in an executable URL.
 */

/**
 * Schemes a link is allowed to carry. Anything else (notably `javascript:`,
 * `data:`, `vbscript:`) is rejected by {@link validateUrl} and coerced to
 * `about:blank` by {@link sanitizeUrl}, so a malicious paste can't produce a
 * clickable code-execution link.
 */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Matches a scheme prefix like `https:` / `mailto:` at the start of a string. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Matches a bare URL for AutoLink. Adapted from the Lexical playground.
 * Intentionally permissive on path/query so real-world URLs linkify.
 */
export const URL_MATCHER =
  /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/;

/** Matches a bare email address for AutoLink (rendered as a `mailto:` link). */
export const EMAIL_MATCHER =
  /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/;

/** Prepend a default `https://` scheme to a bare host so it parses as absolute. */
function withDefaultScheme(url: string): string {
  return HAS_SCHEME.test(url) ? url : `https://${url}`;
}

/**
 * Return a safe href for `url`, or `'about:blank'` if it can't be parsed or uses
 * a disallowed scheme. A scheme-less input like `example.com` is treated as
 * `https://example.com`. Use this before writing any user-supplied string into
 * a link's href.
 */
export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === '') {
    return 'about:blank';
  }
  try {
    const parsed = new URL(withDefaultScheme(trimmed));
    if (!SAFE_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
      return 'about:blank';
    }
    return parsed.href;
  } catch {
    return 'about:blank';
  }
}

/**
 * Whether `url` is a well-formed, safe (http/https/mailto/tel) URL. Used to
 * decide whether an entered link value is acceptable before dispatching the
 * toggle-link command. Shares the {@link SAFE_PROTOCOLS} allowlist with
 * {@link sanitizeUrl} so the two never disagree.
 */
export function validateUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '') {
    return false;
  }
  try {
    const parsed = new URL(withDefaultScheme(trimmed));
    return SAFE_PROTOCOLS.has(parsed.protocol.toLowerCase());
  } catch {
    return false;
  }
}
