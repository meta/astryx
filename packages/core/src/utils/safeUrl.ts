// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file safeUrl.ts
 * @input Navigation strings or supported structured router destinations
 * @output The shared blocked-scheme decision, without rewriting accepted inputs
 * @position Core navigation policy; embedded-resource policy is separate
 */

function normalizeUrl(url: string): string {
  // eslint-disable-next-line no-control-regex -- inspect schemes without browser-ignored controls
  return url.replace(/[\x00-\x1f\x7f]/g, '').trim();
}

/**
 * The form a URL's scheme is compared in: lowercase, and without the spaces
 * after the scheme's colon, which a data URL's media type ignores
 * (`data: text/html` is HTML).
 */
function comparableUrl(normalized: string): string {
  return normalized.toLowerCase().replace(/^([a-z][a-z\d+.-]*:) +/, '$1');
}

/** Return a normalized navigation URL, or null for a blocked scheme. */
export function sanitizeUrl(url: string): string | null {
  const normalized = normalizeUrl(url);
  const lower = comparableUrl(normalized);
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/html')
  ) {
    return null;
  }
  return normalized;
}

/** Inspect a navigation string without changing the value used by its sink. */
export function isSafeUrl(url: string): boolean {
  return sanitizeUrl(url) !== null;
}

/**
 * Inspect React Router paths, Next.js URL objects, and URL instances without
 * serializing or replacing the object handed to the router. Search/query/hash
 * are route-relative data, not schemes. Absent destinations remain absent.
 */
export function isSafeDestination(destination: unknown): boolean {
  if (destination == null) {
    return true;
  }
  if (typeof destination === 'string') {
    return isSafeUrl(destination);
  }
  if (typeof destination !== 'object') {
    return false;
  }

  const {pathname, href, protocol, host, hostname} = destination as {
    pathname?: unknown;
    href?: unknown;
    protocol?: unknown;
    host?: unknown;
    hostname?: unknown;
  };
  for (const field of [pathname, href, protocol, host, hostname]) {
    if (field != null && typeof field !== 'string') {
      return false;
    }
  }
  if (typeof pathname === 'string' && !isSafeUrl(pathname)) {
    return false;
  }
  if (typeof href === 'string' && !isSafeUrl(href)) {
    return false;
  }
  if (typeof protocol === 'string' && protocol !== '') {
    // URL-object formatters accept a protocol with or without its colon and
    // can assemble a data media type from the host and pathname fields.
    const normalizedProtocol = normalizeUrl(protocol);
    const prefix = normalizedProtocol.endsWith(':')
      ? normalizedProtocol
      : `${normalizedProtocol}:`;
    if (!isSafeUrl(prefix)) {
      return false;
    }
    const body = (host || hostname || '') as string;
    const path = typeof pathname === 'string' ? pathname : '';
    if (!isSafeUrl(`${prefix}${body}${path}`)) {
      return false;
    }
  }
  return true;
}
