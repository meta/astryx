// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frontmatter.ts
 * @input Document-start frontmatter delimiters and a typed metadata decoder
 * @output A Markdown plugin plus a typed metadata reader for later transforms
 * @position Optional first-party document metadata helper
 */

import type {MarkdownAstRoot} from '../ast';
import {
  createMarkdownPlugin,
  freezeMarkdownPluginData,
  isMarkdownPluginData,
  markMarkdownTransformTrusted,
  type MarkdownExtensionNode,
  type MarkdownPluginData,
  type MarkdownPluginEntry,
  type MarkdownTransform,
} from './protocol';

const ENVELOPE_KEY = 'astryx:frontmatter';
const ENVELOPE_BRAND = 'astryx.markdown.frontmatter';
const ENVELOPE_VERSION = 1;

type FrontmatterRecord = Readonly<Record<string, string>>;
type Envelope = {
  readonly brand: typeof ENVELOPE_BRAND;
  readonly version: typeof ENVELOPE_VERSION;
  readonly values: Readonly<Record<string, MarkdownPluginData>>;
};

export interface MarkdownFrontmatterOptions<
  Metadata extends MarkdownPluginData,
> {
  /** Stable plugin and metadata namespace. */
  readonly name: string;
  /** Converts validated key/value fields into typed document metadata. */
  readonly parse: (fields: FrontmatterRecord) => Metadata;
}

export type MarkdownFrontmatterParseResult<
  Metadata extends MarkdownPluginData,
> =
  | {readonly status: 'none'}
  | {readonly status: 'defer'}
  | {
      readonly status: 'match';
      readonly contentStart: number;
      readonly metadata: Metadata;
    };

export interface MarkdownFrontmatter<Metadata extends MarkdownPluginData> {
  readonly plugin: MarkdownPluginEntry<never>;
  parse(
    source: string,
    isFinal?: boolean,
  ): MarkdownFrontmatterParseResult<Metadata>;
  getMetadata(
    document: MarkdownAstRoot<MarkdownExtensionNode>,
  ): Metadata | undefined;
}

type DataRecord = Readonly<Record<string, MarkdownPluginData>>;

function asDataRecord(value: MarkdownPluginData | undefined): DataRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as DataRecord)
    : {};
}

function parseEnvelope(value: unknown): Envelope | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }
  const candidate = value as Partial<Envelope>;
  return candidate.brand === ENVELOPE_BRAND &&
    candidate.version === ENVELOPE_VERSION &&
    candidate.values != null &&
    typeof candidate.values === 'object' &&
    !Array.isArray(candidate.values)
    ? (candidate as Envelope)
    : undefined;
}

function readFrontmatter(source: string):
  | {readonly status: 'none'}
  | {readonly status: 'defer'}
  | {
      readonly status: 'match';
      readonly end: number;
      readonly fields: FrontmatterRecord;
    } {
  const openingLength = source.startsWith('---\r\n')
    ? 5
    : source.startsWith('---\n')
      ? 4
      : 0;
  if (openingLength === 0) {
    return {status: 'none'};
  }
  const body = source.slice(openingLength);
  const close = /(?:^|\r?\n)---(?=\r?\n|$)/.exec(body);
  if (close == null) {
    return {status: 'defer'};
  }
  const entries = new Map<string, string>();
  for (const line of body.slice(0, close.index).split(/\r?\n/)) {
    if (line.trim() === '') {
      continue;
    }
    const separator = line.indexOf(':');
    const key = line.slice(0, separator).trim();
    if (separator <= 0 || key === '' || entries.has(key)) {
      return {status: 'none'};
    }
    entries.set(key, line.slice(separator + 1).trim());
  }
  // A plain object, so a parser that returns the record unchanged passes the
  // JSON-like metadata check. `fromEntries` defines every key as an own data
  // property, so a field named `__proto__` stays a field.
  const fields: Record<string, string> = Object.fromEntries(entries);
  let end = openingLength + close.index + close[0].length;
  if (source.startsWith('\r\n', end)) {
    end += 2;
  } else if (source[end] === '\n') {
    end += 1;
  }
  return {status: 'match', end, fields: Object.freeze(fields)};
}

export function createMarkdownFrontmatter<Metadata extends MarkdownPluginData>(
  options: MarkdownFrontmatterOptions<Metadata>,
): MarkdownFrontmatter<Metadata> {
  if (options.name.trim() === '') {
    throw new TypeError('Markdown frontmatter name must be non-empty');
  }
  const name = options.name;
  const parse = (
    source: string,
    isFinal = true,
  ): MarkdownFrontmatterParseResult<Metadata> => {
    const parsed = readFrontmatter(source);
    if (parsed.status === 'defer') {
      return isFinal ? {status: 'none'} : parsed;
    }
    if (parsed.status === 'none') {
      return parsed;
    }
    const metadata = options.parse(parsed.fields);
    if (!isMarkdownPluginData(metadata)) {
      throw new TypeError(
        'Markdown frontmatter metadata must be finite JSON-like data',
      );
    }
    return {
      status: 'match',
      contentStart: parsed.end,
      metadata: freezeMarkdownPluginData(metadata),
    };
  };
  const transform: MarkdownTransform<never> = (document, context) => {
    const parsed = parse(context.source, context.isFinal);
    if (parsed.status === 'none') {
      return document;
    }
    if (parsed.status === 'defer') {
      return {...document, children: []};
    }
    const documentData = asDataRecord(document.data);
    const prior = parseEnvelope(documentData[ENVELOPE_KEY]);
    const envelope: Envelope = Object.freeze({
      brand: ENVELOPE_BRAND,
      version: ENVELOPE_VERSION,
      values: Object.freeze({
        ...prior?.values,
        [name]: parsed.metadata,
      }),
    });
    return {
      ...document,
      data: Object.freeze({...documentData, [ENVELOPE_KEY]: envelope}),
      children: document.children.filter(
        node => (node.position?.end.offset ?? Infinity) > parsed.contentStart,
      ),
    };
  };
  const plugin = createMarkdownPlugin({
    name,
    apiVersion: 1,
    transform: markMarkdownTransformTrusted(transform),
  });
  return Object.freeze({
    plugin,
    parse,
    getMetadata(document: MarkdownAstRoot<MarkdownExtensionNode>) {
      const data = asDataRecord(document.data);
      return parseEnvelope(data[ENVELOPE_KEY])?.values[name] as
        Metadata | undefined;
    },
  });
}
