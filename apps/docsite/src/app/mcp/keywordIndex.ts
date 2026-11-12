// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keywordIndex.ts
 * @input Each visible component's name and its `.doc.mjs` keywords
 * @output buildKeywordIndex (each lowercased keyword to the components that
 *   list it) and resolveKeywords (the components whose keywords a query names)
 * @position The MCP route's keyword resolution; its tests import it too
 *
 * A doc keyword is any string. The index is a Map because a plain object
 * reads a keyword such as `constructor` or `__proto__` as a property it
 * inherits, and the route then fails as it loads.
 */

/** What the index reads from a component's doc. */
export interface KeywordSource {
  readonly name: string;
  readonly keywords: ReadonlyArray<string>;
}

/** Each lowercased keyword, with the components that list it, in doc order. */
export function buildKeywordIndex(
  sources: ReadonlyArray<KeywordSource>,
): ReadonlyMap<string, ReadonlyArray<string>> {
  const index = new Map<string, string[]>();
  for (const source of sources) {
    for (const keyword of source.keywords) {
      const lower = keyword.toLowerCase();
      const names = index.get(lower);
      if (names == null) {
        index.set(lower, [source.name]);
      } else if (!names.includes(source.name)) {
        names.push(source.name);
      }
    }
  }
  return index;
}

/**
 * The components with a keyword the query contains or that contains the
 * query, each once.
 */
export function resolveKeywords(
  index: ReadonlyMap<string, ReadonlyArray<string>>,
  query: string,
): string[] {
  const lower = query.toLowerCase();
  const resolved: string[] = [];
  for (const [keyword, names] of index) {
    if (lower.includes(keyword) || keyword.includes(lower)) {
      resolved.push(...names);
    }
  }
  return [...new Set(resolved)];
}
