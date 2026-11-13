// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLinkify.tsx
 * @input Uses React, Link, useLinkComponent
 * @output Exports useLinkify hook for auto-detecting links in plain text
 * @position Link utility hook; turns plain text into a mix of strings and Link elements
 *
 * Detects URLs, email addresses, and custom patterns (e.g. T1234, D5678)
 * in plain text and renders them as Link elements that respect
 * LinkProvider for client-side routing.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Link/index.ts (exports)
 * - /packages/core/src/Link/useLinkify.test.tsx (tests)
 */

import {type ReactNode, useMemo} from 'react';
import {Link} from './Link';

// =============================================================================
// Types
// =============================================================================

/**
 * A custom pattern for detecting linkable text.
 */
export interface LinkifyPattern {
  /**
   * Regex pattern to match. Must use the global flag (g).
   * Capture groups can be used in `href` and `label` functions.
   */
  pattern: RegExp;

  /**
   * Build the link URL from a regex match.
   */
  href: (match: RegExpMatchArray) => string;

  /**
   * Optional: custom display text for the link.
   * Defaults to the full matched string (match[0]).
   */
  label?: (match: RegExpMatchArray) => string;

  /**
   * Whether the link should open in a new tab.
   * @default false
   */
  isExternal?: boolean;
}

export interface UseLinkifyOptions {
  /**
   * Custom patterns to detect, in addition to (or replacing) built-in patterns.
   * Patterns are matched in order; first match wins for overlapping ranges.
   */
  patterns?: LinkifyPattern[];

  /**
   * Whether to include built-in URL and email detection.
   * @default true
   */
  hasBuiltins?: boolean;
}

// =============================================================================
// Built-in patterns
// =============================================================================

// URL pattern: matches http(s) URLs
const URL_PATTERN: LinkifyPattern = {
  pattern: /https?:\/\/[^\s<>'")\]},]+/g,
  href: match => match[0],
  isExternal: true,
};

// A match starts only where a local part starts. The scan then reads each run
// of local-part characters once.
const EMAIL_PATTERN: LinkifyPattern = {
  pattern:
    /(?<![a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  href: match => `mailto:${match[0]}`,
};

const BUILTIN_PATTERNS: LinkifyPattern[] = [URL_PATTERN, EMAIL_PATTERN];

// =============================================================================
// Match processing
// =============================================================================

interface ResolvedMatch {
  start: number;
  end: number;
  href: string;
  label: string;
  isExternal: boolean;
}

/**
 * Find all non-overlapping matches across all patterns.
 * Custom patterns are checked first (higher priority), then builtins.
 * First match wins for overlapping ranges.
 */
function findMatches(
  text: string,
  patterns: LinkifyPattern[],
): ResolvedMatch[] {
  const allMatches: ResolvedMatch[] = [];

  for (const p of patterns) {
    // Clone the regex to reset lastIndex
    const re = new RegExp(p.pattern.source, p.pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      allMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        href: p.href(match),
        label: p.label ? p.label(match) : match[0],
        isExternal: p.isExternal ?? false,
      });
    }
  }

  // Sort by start position, then by earlier pattern priority (stable sort)
  allMatches.sort((a, b) => a.start - b.start);

  // Remove overlapping matches (first wins)
  const result: ResolvedMatch[] = [];
  let lastEnd = 0;
  for (const m of allMatches) {
    if (m.start >= lastEnd) {
      result.push(m);
      lastEnd = m.end;
    }
  }

  return result;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Detects URLs, emails, and custom patterns in plain text and returns
 * a ReactNode array with Link elements for each match.
 *
 * Links render via Link, respecting LinkProvider for client-side routing.
 *
 * @example
 * ```
 * const nodes = useLinkify('Visit https://example.com or email hi@example.com');
 * return <p>{nodes}</p>;
 * ```
 */
export function useLinkify(
  text: string,
  options?: UseLinkifyOptions,
): ReactNode[] {
  const {patterns: customPatterns, hasBuiltins = true} = options ?? {};

  // Build the pattern list: custom first (higher priority), then builtins
  const allPatterns = useMemo(() => {
    const result: LinkifyPattern[] = [];
    if (customPatterns) {
      result.push(...customPatterns);
    }
    if (hasBuiltins) {
      result.push(...BUILTIN_PATTERNS);
    }
    return result;
  }, [customPatterns, hasBuiltins]);

  return useMemo(() => {
    if (allPatterns.length === 0 || text.length === 0) {
      return [text];
    }

    const matches = findMatches(text, allPatterns);
    if (matches.length === 0) {
      return [text];
    }

    const nodes: ReactNode[] = [];
    let lastIndex = 0;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];

      // Text before this match
      if (m.start > lastIndex) {
        nodes.push(text.slice(lastIndex, m.start));
      }

      // The link
      nodes.push(
        <Link key={`linkify-${i}`} href={m.href} isExternalLink={m.isExternal}>
          {m.label}
        </Link>,
      );

      lastIndex = m.end;
    }

    // Remaining text after the last match
    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }

    return nodes;
  }, [text, allPatterns]);
}
