// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file String utilities — fuzzy matching and semantic search for component names
 */

// levenshteinDistance lives in its own pure module so browser-bundled code
// (the XLE/XLO language) can use it without this file's dynamic node:fs/path
// imports landing in the webpack graph. Re-exported for existing consumers.
import {levenshteinDistance} from './levenshtein.mjs';
export {levenshteinDistance} from './levenshtein.mjs';

/**
 * Find the closest component names to a given (possibly misspelled) name.
 * Returns matches sorted by distance, filtered to maxDistance.
 * @param {string} name
 * @param {Record<string, string[]>} components
 * @param {number} [maxDistance]
 * @returns {{name: string, distance: number}[]}
 */
export function findClosestComponents(name, components, maxDistance = 3) {
  const allNames = Object.values(components).flat();
  const needle = name.toLowerCase();

  const matches = allNames
    .map(comp => ({
      name: comp,
      distance: levenshteinDistance(needle, comp.toLowerCase()),
    }))
    .filter(m => m.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);

  return matches;
}

/**
 * Unified component search that scores matches across multiple signals:
 * name similarity, keyword matches, and description/feature text search.
 *
 * Always returns results (top 5 minimum). Scores determine confidence:
 *   100  exact name match
 *    90  exact keyword match
 *    80  name Levenshtein distance 1
 *    70  keyword substring or Levenshtein distance 1
 *    60  substring match on component name (min 4 chars, 50%+ coverage)
 *    50  description or feature text contains the search term
 *    40  name Levenshtein distance 2
 *    30  keyword Levenshtein distance 2
 *    20  name Levenshtein distance 3
 *
 * Each result: { name, score, reason }, plus `keywordAt` when a keyword set
 * the component's score: the position of the keyword that set it.
 *
 * @param {string} needle
 * @param {string} coreDir
 * @param {Record<string, string[]>} components
 * @returns {Promise<{name: string, score: number, reason: string}[]>}
 */
export async function searchComponents(needle, coreDir, components) {
  const {readDocView} = await import('../doc-compiler/read.mjs');
  const fs = await import('node:fs');
  const path = await import('node:path');

  const term = needle.toLowerCase();
  const allNames = Object.values(components).flat();
  /** @type {Map<string, {name: string, score: number, reason: string}>} */
  const scored = new Map();
  /** Position of the keyword that set each component's score. */
  /** @type {Map<string, number>} */
  const keywordAt = new Map();

  /**
   * @param {string} name
   * @param {number} score
   * @param {string} reason
   */
  function addMatch(name, score, reason) {
    const existing = scored.get(name);
    if (!existing || score > existing.score) {
      scored.set(name, {name, score, reason});
    }
  }

  // --- Pass 1: Name matching (sync, fast) ---
  for (const comp of allNames) {
    const compLower = comp.toLowerCase();

    // Exact name
    if (compLower === term) {
      addMatch(comp, 100, 'exact name');
      continue;
    }

    // Substring match on name (both directions)
    const shorter = term.length < compLower.length ? term : compLower;
    const longer = term.length < compLower.length ? compLower : term;
    if (shorter.length >= 4 && longer.includes(shorter)) {
      const coverage = shorter.length / longer.length;
      if (coverage >= 0.5) {
        addMatch(comp, 60, 'name contains "' + shorter + '"');
      }
    }

    // Levenshtein on name
    const dist = levenshteinDistance(term, compLower);
    if (dist === 1) addMatch(comp, 80, 'similar name (distance ' + dist + ')');
    else if (dist === 2)
      addMatch(comp, 40, 'similar name (distance ' + dist + ')');
    else if (dist === 3)
      addMatch(comp, 20, 'similar name (distance ' + dist + ')');
  }

  // --- Pass 2: Keyword + description matching (async, reads doc files) ---
  for (const comp of allNames) {
    const srcDir = path.join(coreDir, 'src');

    let docPath = null;
    const direct = path.join(srcDir, comp, comp + '.doc.mjs');
    if (fs.existsSync(direct)) {
      docPath = direct;
    }
    if (!docPath) {
      const xdsDirect = path.join(srcDir, comp, 'XDS' + comp + '.doc.mjs');
      if (fs.existsSync(xdsDirect)) {
        docPath = xdsDirect;
      }
    }
    if (!docPath && fs.existsSync(srcDir)) {
      const entries = fs.readdirSync(srcDir, {withFileTypes: true});
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const nested = path.join(srcDir, entry.name, comp, comp + '.doc.mjs');
        if (fs.existsSync(nested)) {
          docPath = nested;
          break;
        }
      }
    }

    if (!docPath) continue;

    try {
      // Only the legacy `docs` export has ever been indexed here.
      const docs = await readDocView(docPath, {
        root: 'components',
        loader: 'native',
        exports: ['docs'],
      });
      if (!docs) continue;

      // Keyword matching
      if (docs.keywords && Array.isArray(docs.keywords)) {
        for (const [at, kw] of docs.keywords.entries()) {
          const kwLower = kw.toLowerCase();
          const before = scored.get(comp)?.score ?? 0;

          // Exact keyword
          if (kwLower === term) {
            addMatch(comp, 90, 'keyword "' + kw + '"');
            if (!keywordAt.has(comp) || before < 90) keywordAt.set(comp, at);
            break;
          }

          // Substring: term contains keyword or keyword contains term
          const s = term.length < kwLower.length ? term : kwLower;
          const l = term.length < kwLower.length ? kwLower : term;
          if (s.length >= 4 && l.includes(s)) {
            const coverage = s.length / l.length;
            if (coverage >= 0.5) {
              addMatch(comp, 70, 'keyword "' + kw + '"');
            }
          }

          const dist = levenshteinDistance(term, kwLower);
          if (dist === 1)
            addMatch(comp, 70, 'keyword "' + kw + '" (distance ' + dist + ')');
          else if (dist === 2)
            addMatch(comp, 30, 'keyword "' + kw + '" (distance ' + dist + ')');
          if ((scored.get(comp)?.score ?? 0) > before) keywordAt.set(comp, at);
        }
      }

      // Description search (whole word boundary)
      const searchDesc = docs.usage?.description || docs.description;
      if (searchDesc && term.length >= 3) {
        const descLower = searchDesc.toLowerCase();
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('\\b' + escaped + '\\b');
        if (re.test(descLower)) {
          addMatch(comp, 50, 'description mentions "' + term + '"');
        }
      }

      // Best practices search (whole word boundary)
      const bestPractices = docs.usage?.bestPractices;
      if (bestPractices && Array.isArray(bestPractices) && term.length >= 3) {
        for (const bp of bestPractices) {
          const bpLower = bp.description.toLowerCase();
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp('\\b' + escaped + '\\b');
          if (re.test(bpLower)) {
            addMatch(comp, 50, 'best practice mentions "' + term + '"');
            break;
          }
        }
      }
    } catch {
      continue;
    }
  }

  // --- Pass 3: a name made of other words around a component's name ---
  // Only when nothing above matched: a contiguous run of the needle's words
  // ("Primitive Button", "Meta Employee Typeahead") that is a component's
  // whole name. Longer runs and runs nearer the end score higher.
  if (scored.size === 0) {
    const words = String(needle)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    const byLower = new Map(allNames.map(n => [n.toLowerCase(), n]));
    const longest = Math.max(0, ...allNames.map(n => n.length));
    for (let i = 0; i < words.length; i++) {
      let run = '';
      for (let j = i + 1; j <= words.length; j++) {
        // Grow the run one word at a time; stop once no name is that long.
        run += words[j - 1];
        if (run.length > longest) break;
        if (run.length < 4 || run === term) continue;
        const comp = byLower.get(run);
        if (!comp) continue;
        const span = j - i;
        const atEnd = j === words.length ? 1 : 0;
        addMatch(comp, 10 + Math.min(span, 4) + atEnd, 'name part "' + run + '"');
      }
    }
    // Keep only the strongest name parts, so a weaker part never sits
    // beside the best one.
    const best = Math.max(0, ...[...scored.values()].map(r => r.score));
    for (const [name, r] of scored) if (r.score < best) scored.delete(name);
  }

  const results = Array.from(scored.values())
    .map(r =>
      keywordAt.has(r.name)
        ? {...r, keywordAt: /** @type {number} */ (keywordAt.get(r.name))}
        : r,
    )
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return results;
}

/**
 * The first sentence of a text, whitespace collapsed. A period after "e.g" or
 * "i.e" does not end the sentence. Used where a description has to fit on one
 * line: `build`'s alternatives and its text kit.
 * @param {string} text
 * @returns {string}
 */
export function firstSentence(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  const ends = /[.!?](?=\s|$)/g;
  for (let m = ends.exec(flat); m; m = ends.exec(flat)) {
    if (!/\b(e\.g|i\.e)$/i.test(flat.slice(0, m.index))) {
      return flat.slice(0, m.index + 1);
    }
  }
  return flat;
}
