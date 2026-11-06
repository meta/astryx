// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file codeLinkifiers.ts
 * @input The text content of an inline code span.
 * @output The docs-site href that span points at, or null to leave it as
 *   plain code.
 * @position Consumed by InlineCode.tsx, which renders every inline code span
 *   on the site. Kept separate so the rules are unit-testable without React.
 *
 * Docs prose cites sibling topics as the literal CLI command — "Semantic
 * tokens, not hardcoded values (see `astryx docs tokens`)". That is what an
 * agent should type, so it stays copy-pasteable code; linkifying it gives a
 * human somewhere to click. Component mentions work the same way: authors
 * write `<InternationalizationProvider>` as literal code, and the span
 * resolves to that component's doc page.
 *
 * To teach the site a new kind of cross-reference, write a CodeLinkifier and
 * append it to LINKIFIERS.
 */

import {docRedirects, docTopics} from '../generated/docsRegistry';
import {components} from '../generated/componentRegistry';

/** Returns an href for a code span it recognizes, or null to pass. */
type CodeLinkifier = (code: string) => string | null;

const KNOWN_TOPICS = new Set(docTopics.map(d => d.topic));

/**
 * `astryx docs tokens` -> /docs/tokens, `astryx docs` -> the docs index.
 *
 * Anything after the topic — a section argument, or a flag like `--dense`
 * that only changes CLI output — still belongs to the topic's page. Unknown
 * topics return null so a renamed doc degrades to plain code, not a 404.
 */
const docTopic: CodeLinkifier = code => {
  const match =
    /^(?:npx (?:@astryxdesign\/cli(?:@\S+)?|astryx)|astryx) docs(?:\s+([a-z][\w-]*(?:\/[a-z][\w-]*)*))?(?:\s.*)?$/.exec(
      code,
    );
  if (!match) {
    return null;
  }
  const topic = match[1];
  if (topic == null) {
    return '/docs';
  }
  // A docs-tree guide has a slug named after its route, with "/" as "-": its
  // own page (`authoring/quick-start`), or a redirect to its section on
  // its namespace's page (`layout/scaffold` -> /docs/layout#scaffold).
  const slug = topic.replaceAll('/', '-');
  if (KNOWN_TOPICS.has(slug)) {
    return `/docs/${slug}`;
  }
  return docRedirects[slug] ?? null;
};

/** Every documented component and hook name; each has a /components page. */
const KNOWN_COMPONENTS = new Set(
  Object.values(components)
    .flat()
    .map(c => c.name),
);

/**
 * `Button`, `<InternationalizationProvider>`, `<Button />` -> the component's
 * doc page.
 *
 * A span has to be exactly one documented name — bare, or as a lone JSX tag —
 * so snippets like `<Button open>` and phrases that merely contain a name stay
 * plain code. Case-sensitive on purpose: `button` is the HTML element,
 * `Button` the component. XDS-prefixed aliases resolve to the unprefixed page,
 * matching the prose linkifier (changelogLinkify's linkifyComponents).
 */
const componentName: CodeLinkifier = code => {
  const jsx = /^<([A-Z][A-Za-z\d]*)\s*\/?>$/.exec(code);
  const name = jsx != null ? jsx[1] : code;
  if (KNOWN_COMPONENTS.has(name)) {
    return `/components/${name}`;
  }
  if (name.startsWith('XDS') && KNOWN_COMPONENTS.has(name.slice(3))) {
    return `/components/${name.slice(3)}`;
  }
  return null;
};

const LINKIFIERS: CodeLinkifier[] = [docTopic, componentName];

/** Resolve an inline code span to a docs href, or null to leave it alone. */
export function linkifyCode(code: string): string | null {
  const text = code.trim();
  for (const linkify of LINKIFIERS) {
    const href = linkify(text);
    if (href != null) {
      return href;
    }
  }
  return null;
}
