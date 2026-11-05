// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Similar-page ranking for the docsite 404 experience.
 * @input The missing pathname and canonical sitemap paths and page titles
 * @output Up to three high-confidence pages ordered by similarity
 * @position Pure matching logic behind the DidYouMean component
 */

const MAX_INPUT_LENGTH = 128;
const MAX_NORMALIZED_DISTANCE = 0.34;

export interface PageCandidate {
  path: string;
  title: string;
}

interface NormalizedPath {
  full: string;
  leaf: string;
}

interface Comparison {
  distance: number;
  ratio: number;
  length: number;
}

interface RankedPage {
  page: PageCandidate;
  matchTier: number;
  comparison: Comparison;
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function normalizeSegment(segment: string): string {
  return segment.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function normalizePath(path: string): NormalizedPath {
  const pathname = decodePath(path).split(/[?#]/, 1)[0];
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map(normalizeSegment)
    .filter(Boolean);

  return {
    full: segments.join('/'),
    leaf: segments.at(-1) ?? '',
  };
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  let previous = Array.from({length: b.length + 1}, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[b.length];
}

function compare(a: string, b: string): Comparison {
  const length = Math.max(a.length, b.length);
  if (length === 0) {
    return {distance: Number.POSITIVE_INFINITY, ratio: 1, length};
  }

  const distance = levenshteinDistance(a, b);
  return {distance, ratio: distance / length, length};
}

function isHighConfidence(comparison: Comparison): boolean {
  const maxDistance = Math.max(1, Math.floor(comparison.length * 0.34));
  return (
    comparison.distance <= maxDistance &&
    comparison.ratio <= MAX_NORMALIZED_DISTANCE
  );
}

export function findSimilarPages(
  pathname: string,
  pages: readonly PageCandidate[],
  limit = 3,
): PageCandidate[] {
  if (pathname.length > MAX_INPUT_LENGTH || limit <= 0) {
    return [];
  }

  const requested = normalizePath(pathname);
  if (!requested.leaf) {
    return [];
  }

  const seen = new Set<string>();
  const ranked: RankedPage[] = [];

  for (const page of pages) {
    if (seen.has(page.path)) {
      continue;
    }
    seen.add(page.path);

    const candidate = normalizePath(page.path);
    if (!candidate.leaf || page.path === pathname) {
      continue;
    }

    const terms = [
      candidate.leaf,
      normalizeSegment(page.title),
      ...normalizeWords(page.title),
    ].filter(Boolean);
    const termComparisons = terms.map(term => compare(requested.leaf, term));
    const fullComparison = compare(requested.full, candidate.full);
    const comparison = [...termComparisons, fullComparison].sort(
      (a, b) => a.ratio - b.ratio || a.distance - b.distance,
    )[0];
    const exactTerm = termComparisons.some(result => result.distance === 0);
    const partialTerm = terms.some(
      term =>
        requested.leaf.length >= 4 &&
        term.length >= 4 &&
        (term.includes(requested.leaf) || requested.leaf.includes(term)),
    );
    const matchTier = exactTerm ? 0 : partialTerm ? 1 : 2;

    if (matchTier === 2 && !isHighConfidence(comparison)) {
      continue;
    }

    ranked.push({page, matchTier, comparison});
  }

  return ranked
    .sort((a, b) => {
      return (
        a.matchTier - b.matchTier ||
        a.comparison.ratio - b.comparison.ratio ||
        a.comparison.distance - b.comparison.distance ||
        a.page.path.length - b.page.path.length ||
        a.page.title.localeCompare(b.page.title)
      );
    })
    .slice(0, limit)
    .map(match => match.page);
}
