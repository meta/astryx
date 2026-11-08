// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Pure markdown post-processors. Each turns a raw pattern in authored markdown
 * into a markdown link before it is handed to a renderer. Kept side-effect-free
 * so they can be unit tested without rendering the component.
 *
 * `linkifyPRs` / `linkifyContributors` / `stripTitle` are changelog-specific.
 * `linkifyComponents` is shared: the changelog runs it over CHANGELOG text
 * before <Markdown>, and the docs pages run it over `.doc.mjs` prose before
 * renderInlineMarkdown (see docs/docsLinkify.ts).
 */

import {GITHUB_REPO} from '../constants';

// GitHub profile base, derived from the repo URL (e.g. https://github.com).
const GITHUB_HOST = new URL(GITHUB_REPO).origin;

/** Turn `#1234` PR references into links to the GitHub PR. */
export function linkifyPRs(markdown: string): string {
  return markdown.replace(/(?<!\[)#(\d+)/g, `[#$1](${GITHUB_REPO}/pull/$1)`);
}

/**
 * Link the `#### Contributors` bullets to GitHub profiles. The changelog
 * formatter (scripts/format-changelogs.mjs) emits each contributor as a
 * standalone `- @handle` bullet, so we match a list item whose entire content
 * is a single handle. This deliberately avoids package-name bullets like
 * `- @astryxdesign/core` (they contain a `/` and are backticked) and inline
 * `@` mentions in prose. The handle pattern follows GitHub's username rules
 * (alphanumeric or hyphens, no leading/trailing hyphen, max 39 chars).
 */
export function linkifyContributors(markdown: string): string {
  return markdown.replace(
    /^(\s*-\s+)@([A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?)[ \t]*$/gm,
    `$1[@$2](${GITHUB_HOST}/$2)`,
  );
}

/**
 * Spans the component linkifier copies through verbatim: fenced blocks, inline
 * code spans, and existing markdown links. Whatever sits inside one of those is
 * already deliberate authoring, so rewriting it would either double-link it or
 * splice link syntax into a literal. In the changelog this doubles as the
 * author's opt-out — backticking a name suppresses its auto-link. On the docs
 * site, InlineCode still resolves an exact-name code span to its page
 * (codeLinkifiers.ts); this pass stays out of the span either way.
 *
 * Adjacency lookarounds alone are not enough: they miss `<Theme>` and
 * `packages/core/src/Icon/x.tsx`, where the name is inside the span but not
 * touching its delimiters.
 */
const OPAQUE_SPAN = /```[\s\S]*?```|`[^`]+`|\[[^\]]*\]\([^)]*\)/g;

export interface LinkifyComponentsOptions {
  /**
   * Emit a backticked label — `` [`Button`](/components/Button) `` — so the
   * auto-link renders as monospace. Off by default; the changelog wants plain
   * prose labels.
   */
  monospace?: boolean;
}

/** Link bare component names (e.g. `Button`, `XDSButton`) to their doc page. */
export function linkifyComponents(
  markdown: string,
  names: string[],
  options?: LinkifyComponentsOptions,
): string {
  if (names.length === 0) {
    return markdown;
  }

  const nameToHref = new Map<string, string>();
  for (const name of names) {
    nameToHref.set(name, `/components/${name}`);
    nameToHref.set('XDS' + name, `/components/${name}`);
  }

  const sorted = [...nameToHref.keys()].sort((a, b) => b.length - a.length);
  const escaped = sorted.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(
    '(?<!`|\\[)\\b(' + escaped.join('|') + ')\\b(?!`|\\])',
    'g',
  );

  const linkify = (text: string): string =>
    text.replace(pattern, match => {
      const href = nameToHref.get(match);
      if (!href) {
        return match;
      }
      const label = options?.monospace === true ? '`' + match + '`' : match;
      return '[' + label + '](' + href + ')';
    });

  let out = '';
  let lastIndex = 0;
  for (const span of markdown.matchAll(OPAQUE_SPAN)) {
    out += linkify(markdown.slice(lastIndex, span.index)) + span[0];
    lastIndex = span.index + span[0].length;
  }
  return out + linkify(markdown.slice(lastIndex));
}

/** Add a visible note to release sections that contain only a version heading. */
export function addEmptyReleasePlaceholders(markdown: string): string {
  return markdown
    .split(/\n+---\n+/)
    .map(section => {
      const trimmed = section.trim();
      return /^#\s+\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(trimmed)
        ? `${trimmed}\n\n_No changes in this release._`
        : trimmed;
    })
    .join('\n\n---\n\n');
}

/** Strip the leading `# Title` line (the package name h1) from a changelog. */
export function stripTitle(markdown: string): string {
  return markdown.replace(/^#\s+.+\n+/, '');
}
