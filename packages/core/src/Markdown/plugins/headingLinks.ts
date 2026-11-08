// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file headingLinks.ts
 * @input Transformed Markdown headings plus optional namespace and URL base
 * @output First-party heading-links plugin and its deterministic projection
 * @position Public server-safe module built on the canonical Markdown plugin protocol
 */

import {markdownAstText, visitMarkdownNodes} from '../ast';
import type {MarkdownAstHeading, MarkdownAstRoot} from '../ast';
import {sanitizeMarkdownLinkUrl} from '../url';
import {
  createMarkdownPlugin,
  getMarkdownPluginDefinition,
  markdownExtensionText,
  markMarkdownTransformTrusted,
  type MarkdownExtensionNode,
  type MarkdownPluginEntry,
  type PreparedMarkdownPlugins,
} from './protocol';

const PLUGIN_NAME = 'heading-links';
const PORTABLE_CONFIG_KIND = '@astryxdesign/core/MarkdownHeadingLinksConfig';
const portableConfigKey = Symbol.for(PORTABLE_CONFIG_KIND);
type Heading = MarkdownAstHeading<MarkdownExtensionNode>;

export interface MarkdownHeadingLinksOptions {
  /**
   * Stable caller-owned namespace for generated heading ids. Use the same
   * value for the Markdown root `id` when each document needs its own fragment
   * namespace. Omit it to keep unprefixed fragments for a single document.
   */
  readonly headingIdPrefix?: string;
  /**
   * Optional caller-owned URL before the generated `#fragment`. Omit it to copy
   * an absolute URL for the current document. Any existing fragment is replaced.
   */
  readonly permalinkBaseUrl?: string;
}

interface PortableMarkdownHeadingLinksConfig {
  readonly kind: typeof PORTABLE_CONFIG_KIND;
  readonly apiVersion: 1;
  readonly headingIdPrefix?: string;
  readonly permalinkBaseUrl: string;
}

/** @internal Module-owned projection consumed by Markdown and Outline. */
export interface MarkdownHeadingLinksProjection {
  readonly ids: ReadonlyMap<Heading, string>;
  readonly labels: ReadonlyMap<Heading, string>;
  readonly permalinkUrls: ReadonlyMap<Heading, string>;
}

const identityTransform = markMarkdownTransformTrusted(root => root);

function fail(message: string): never {
  throw new TypeError(`Markdown heading links: ${message}`);
}

// Built at runtime, not written as a literal: for targets without property
// escapes, or when no browserslist is set, Babel's
// transform-unicode-property-regex rewrites a `\p{…}` literal, and the copy
// bundled with Next.js lacks the Unicode data it needs, so a source build fails
// with "Unknown property". A literal is safe once Next's bundled Babel ships
// that data.
const NON_SLUG_CHARACTERS = new RegExp('[^\\p{Letter}\\p{Number}]+', 'gu');

function headingSlug(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/['"]/gu, '')
    .replace(NON_SLUG_CHARACTERS, '-')
    .replace(/^-+|-+$/gu, '');
}

function uniqueHeadingSlug(
  baseSlug: string,
  counts: Map<string, number>,
): string {
  const fallbackSlug = baseSlug || 'section';
  let count = counts.get(fallbackSlug) ?? 0;
  let candidate = count === 0 ? fallbackSlug : `${fallbackSlug}-${count}`;
  while (counts.has(candidate)) {
    count++;
    candidate = `${fallbackSlug}-${count}`;
  }
  counts.set(fallbackSlug, count + 1);
  counts.set(candidate, 0);
  return candidate;
}

function createPortableConfig(
  headingIdPrefix: string | undefined,
  permalinkBaseUrl: string,
): PortableMarkdownHeadingLinksConfig {
  return Object.freeze({
    kind: PORTABLE_CONFIG_KIND,
    apiVersion: 1 as const,
    headingIdPrefix,
    permalinkBaseUrl,
  });
}

const PERMALINK_VALIDATION_BASE = 'https://astryx.invalid/';

function isParsablePermalinkBaseUrl(url: string): boolean {
  try {
    new URL(url, PERMALINK_VALIDATION_BASE);
    return true;
  } catch {
    return false;
  }
}

function readPortableConfig(
  entry: MarkdownPluginEntry,
): PortableMarkdownHeadingLinksConfig | undefined {
  const definition = getMarkdownPluginDefinition(entry);
  if (definition.name !== PLUGIN_NAME) {
    return undefined;
  }

  const config = (definition as unknown as Record<PropertyKey, unknown>)[
    portableConfigKey
  ] as Partial<PortableMarkdownHeadingLinksConfig> | undefined;
  if (
    config == null ||
    typeof config !== 'object' ||
    Object.getPrototypeOf(config) !== Object.prototype ||
    Reflect.ownKeys(config).length !== 4 ||
    !Object.isFrozen(config) ||
    config.kind !== PORTABLE_CONFIG_KIND ||
    config.apiVersion !== 1 ||
    (config.headingIdPrefix !== undefined &&
      typeof config.headingIdPrefix !== 'string') ||
    typeof config.permalinkBaseUrl !== 'string' ||
    config.permalinkBaseUrl.includes('#') ||
    !isParsablePermalinkBaseUrl(config.permalinkBaseUrl) ||
    (config.permalinkBaseUrl !== '' &&
      sanitizeMarkdownLinkUrl(config.permalinkBaseUrl) !==
        config.permalinkBaseUrl)
  ) {
    return undefined;
  }
  return config as PortableMarkdownHeadingLinksConfig;
}

/**
 * Create the opt-in plugin that gives every rendered h1–h6 a stable identity
 * and an inline sibling copy button for each built-in heading. The entry is safe
 * to share between Markdown and Markdown-derived Outline, including compatible
 * Core package copies.
 */
export function createMarkdownHeadingLinks(
  options: MarkdownHeadingLinksOptions = {},
): MarkdownPluginEntry<never> {
  if (
    options.headingIdPrefix !== undefined &&
    typeof options.headingIdPrefix !== 'string'
  ) {
    fail('headingIdPrefix must be a string');
  }
  if (
    options.permalinkBaseUrl !== undefined &&
    typeof options.permalinkBaseUrl !== 'string'
  ) {
    fail('permalinkBaseUrl must be a string');
  }

  const rawBaseUrl = options.permalinkBaseUrl ?? '';
  const sanitizedBaseUrl =
    rawBaseUrl === '' ? '' : sanitizeMarkdownLinkUrl(rawBaseUrl);
  if (
    sanitizedBaseUrl == null ||
    !isParsablePermalinkBaseUrl(sanitizedBaseUrl)
  ) {
    fail('permalinkBaseUrl must be a safe, parseable navigation URL');
  }
  const permalinkBaseUrl = sanitizedBaseUrl.replace(/#.*$/u, '');

  const definition = {
    name: PLUGIN_NAME,
    apiVersion: 1 as const,
    transform: identityTransform,
  };
  Object.defineProperty(definition, portableConfigKey, {
    configurable: false,
    enumerable: false,
    value: createPortableConfig(options.headingIdPrefix, permalinkBaseUrl),
    writable: false,
  });
  return createMarkdownPlugin(definition);
}

function getHeadingLinksConfig(
  plugins: PreparedMarkdownPlugins | undefined,
): PortableMarkdownHeadingLinksConfig | undefined {
  if (plugins == null) {
    return undefined;
  }
  for (const entry of plugins.entries) {
    const config = readPortableConfig(entry);
    if (config != null) {
      return config;
    }
  }
  return undefined;
}

/** @internal Project the module's all-depth identity after transforms run. */
export function projectMarkdownHeadingLinks(
  root: MarkdownAstRoot<MarkdownExtensionNode>,
  preparedPlugins?: PreparedMarkdownPlugins,
): MarkdownHeadingLinksProjection | undefined {
  const config = getHeadingLinksConfig(preparedPlugins);
  if (config == null) {
    return undefined;
  }

  const ids = new Map<Heading, string>();
  const labels = new Map<Heading, string>();
  const permalinkUrls = new Map<Heading, string>();
  const counts = new Map<string, number>();

  visitMarkdownNodes(root, 'heading', heading => {
    const label = markdownAstText(heading.children, node =>
      markdownExtensionText(preparedPlugins, node),
    ).trim();
    const slug = uniqueHeadingSlug(headingSlug(label), counts);
    const id =
      config.headingIdPrefix != null && config.headingIdPrefix !== ''
        ? `${config.headingIdPrefix}--${slug}`
        : slug;
    ids.set(heading, id);
    labels.set(heading, label);
    permalinkUrls.set(heading, `${config.permalinkBaseUrl}#${id}`);
  });

  return {ids, labels, permalinkUrls};
}
