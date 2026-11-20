// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Hook discovery — find, list, and resolve Astryx hooks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {listDir, listDirEntries, pathExists} from '../fs/listing-cache.mjs';
import {existsCaseExact} from '../fs/paths.mjs';
import {levenshteinDistance} from '../text/string-utils.mjs';
import {compareText} from '../text/compare-text.mjs';

/** The folders the hook lookup never enters, at any depth of `src`. */
export const HOOK_SKIP_DIRS = new Set(['utils', '__tests__', 'node_modules']);

// A hook's doc outside src/hooks/: a `use…` hook, or a `create…` factory
// documented as one (its doc typed `HookDoc`, such as createReorderable).
const HOOK_DOC_FILE_RE = /^(?:use|create)[A-Z]\w*\.doc\.mjs$/;

// Matches the top-level `relatedHooks: [...]` field in a hook .doc.mjs file.
const RELATED_HOOKS_RE = /(?:^|\n) {0,4}relatedHooks:\s*\[([^\]]*)\]/;

// Matches the top-level `category: 'categoryName'` field in a hook .doc.mjs file.
const CATEGORY_RE = /(?:^|\n) {0,4}category:\s*['"]([^'"]+)['"]/;

// Matches the top-level `keywords: [...]` field in a hook .doc.mjs file.
const KEYWORDS_RE = /(?:^|\n) {0,4}keywords:\s*\[([^\]]*)\]/;

// One quoted string in a list of strings.
const QUOTED_RE = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;

/**
 * Read the `category` field from a hook's .doc.mjs file (synchronous).
 * @param {string} docPath
 * @returns {{category: string | null}}
 */
function readHookMeta(docPath) {
  try {
    const content = fs.readFileSync(docPath, 'utf-8');
    const categoryMatch = CATEGORY_RE.exec(content);
    return {
      category: categoryMatch ? categoryMatch[1].charAt(0).toUpperCase() + categoryMatch[1].slice(1) : null,
    };
  } catch {
    return {category: null};
  }
}

/**
 * Whether a `create…` factory's doc names its own `use…` hook in
 * `relatedHooks`, as createAnimator's names useAnimator. Such a factory is
 * listed beside that hook, not on its own.
 * @param {string} docPath
 * @param {string} hookName
 * @returns {boolean}
 */
function isBesideOwnHook(docPath, hookName) {
  if (!hookName.startsWith('create')) return false;
  const ownHook = `use${hookName.slice('create'.length)}`;
  try {
    const related = RELATED_HOOKS_RE.exec(fs.readFileSync(docPath, 'utf-8'));
    return related != null && related[1].includes(`'${ownHook}'`);
  } catch {
    return false;
  }
}

/**
 * Extract the hook name from a doc filename.
 * e.g. 'useFocusTrap.doc.mjs' → 'useFocusTrap'
 * @param {string} fileName
 * @returns {string}
 */
function hookNameFromFile(fileName) {
  return fileName.replace('.doc.mjs', '');
}

/**
 * Discover all hooks that have .doc.mjs files.
 * Returns Record<category, hookName[]> similar to discoverComponents.
 * Categories from HookDoc.category: focus, layout, animation, interaction, data, media, streaming
 * Hooks without a category go in 'Other'.
 * @param {string | null} coreDir null in a run that reads no Core
 * @param {(name: string) => boolean} [keep] the hooks to read; the others are
 *   left out, and their docs are not read
 * @param {Set<string>} [tops] the top folders of `src` outside `hooks` to
 *   read, when only these can hold a hook `keep` accepts
 * @returns {Record<string, string[]>}
 */
export function discoverHooks(coreDir, keep = () => true, tops) {
  // Group by category, sorted alphabetically
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const [hookName, docPath] of hookDocs(coreDir, keep, tops)) {
    const category = readHookMeta(docPath).category || 'Other';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)?.push(hookName);
  }

  // Sort members within each group
  for (const members of groups.values()) {
    members.sort();
  }

  // Sort groups alphabetically, but 'Other' goes last
  const sortedEntries = Array.from(groups.entries()).sort((a, b) => {
    if (a[0] === 'Other') return 1;
    if (b[0] === 'Other') return -1;
    return compareText(a[0], b[0]);
  });

  /** @type {Record<string, string[]>} */
  const ordered = {};
  for (const [key, values] of sortedEntries) {
    ordered[key] = values;
  }

  return ordered;
}

/**
 * Each hook's doc, by hook name: the `*.doc.mjs` files in src/hooks/, then
 * the hook docs in the other folders of src/.
 * @param {string | null} coreDir null in a run that reads no Core
 * @param {(name: string) => boolean} keep the hooks to list
 * @param {Set<string>} [tops] as for {@link discoverHooks}
 * @returns {Map<string, string>} hook name → doc path
 */
function hookDocs(coreDir, keep, tops) {
  if (coreDir == null) return new Map();
  const srcDir = path.join(coreDir, 'src');
  const hooksDir = path.join(srcDir, 'hooks');
  /** @type {Map<string, string>} */
  const docs = new Map();

  if (pathExists(hooksDir)) {
    for (const entry of listDirEntries(hooksDir)) {
      if (!entry.isFile() || !entry.name.endsWith('.doc.mjs')) continue;
      const hookName = hookNameFromFile(entry.name);
      if (keep(hookName)) docs.set(hookName, path.join(hooksDir, entry.name));
    }
  }

  // Every component folder: use*.doc.mjs, and create*.doc.mjs for a factory
  // documented as a hook (createReorderable).
  if (pathExists(srcDir)) {
    for (const entry of listDirEntries(srcDir)) {
      if (!entry.isDirectory() || HOOK_SKIP_DIRS.has(entry.name) || entry.name === 'hooks') continue;
      if (tops && !tops.has(entry.name)) continue;
      scanDirForHookDocs(path.join(srcDir, entry.name), docs, keep);
    }
  }
  return docs;
}

/**
 * Recursively scan a directory for use*.doc.mjs files.
 * @param {string} dirPath
 * @param {Map<string, string>} docs hook name → doc path
 * @param {(name: string) => boolean} keep
 */
function scanDirForHookDocs(dirPath, docs, keep) {
  if (!pathExists(dirPath)) return;
  const entries = listDirEntries(dirPath);
  for (const entry of entries) {
    if (entry.isDirectory() && !HOOK_SKIP_DIRS.has(entry.name)) {
      scanDirForHookDocs(path.join(dirPath, entry.name), docs, keep);
    } else if (entry.isFile() && HOOK_DOC_FILE_RE.test(entry.name)) {
      const hookName = hookNameFromFile(entry.name);
      const docPath = path.join(dirPath, entry.name);
      if (
        keep(hookName) &&
        !docs.has(hookName) &&
        !isBesideOwnHook(docPath, hookName)
      ) {
        docs.set(hookName, docPath);
      }
    }
  }
}

/**
 * Each hook with the keywords its doc declares, in name order. The docs are
 * read as text, not imported.
 * @param {string} coreDir
 * @returns {Array<{name: string, keywords: string[]}>}
 */
export function discoverHookKeywords(coreDir) {
  return [...hookDocs(coreDir, () => true)]
    .sort(([a], [b]) => compareText(a, b))
    .map(([name, docPath]) => ({name, keywords: readHookKeywords(docPath)}));
}

/**
 * The `keywords` a hook's doc declares, or none when the doc does not read.
 * @param {string} docPath
 * @returns {string[]}
 */
function readHookKeywords(docPath) {
  try {
    const list = KEYWORDS_RE.exec(fs.readFileSync(docPath, 'utf-8'));
    if (!list) return [];
    return [...list[1].matchAll(QUOTED_RE)].map(
      match => match[1] ?? match[2],
    );
  } catch {
    return [];
  }
}

/**
 * Find the .doc.mjs file for a hook by name.
 * Searches hooks/ directory and component directories.
 * Matches both exact name and with 'use' prefix stripped.
 *
 * @param {string | null} coreDir null in a run that reads no Core
 * @param {string} name - Hook name (e.g. 'useMediaQuery', 'MediaQuery', 'mediaquery')
 * @returns {string|null} Path to the .doc.mjs file, or null
 */
export function findHookDoc(coreDir, name) {
  if (coreDir == null) return null;
  const srcDir = path.join(coreDir, 'src');
  const hooksDir = path.join(srcDir, 'hooks');

  // Normalize: ensure we have both 'useFoo' and 'Foo' variants
  const normalized = name.replace(/^use/, '');
  const withUse = 'use' + normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const candidates = [name, withUse, 'use' + normalized];

  // Deduplicate candidates
  const uniqueCandidates = [...new Set(candidates)];

  // 1. Check src/hooks/{name}.doc.mjs first
  for (const candidate of uniqueCandidates) {
    const direct = path.join(hooksDir, `${candidate}.doc.mjs`);
    if (existsCaseExact(direct, hooksDir)) return direct;
  }

  // 2. Case-insensitive search in hooks directory
  if (pathExists(hooksDir)) {
    const entries = listDir(hooksDir);
    for (const entry of entries) {
      if (!entry.endsWith('.doc.mjs')) continue;
      const hookName = hookNameFromFile(entry);
      if (hookName.toLowerCase() === name.toLowerCase() ||
          hookName.toLowerCase() === withUse.toLowerCase()) {
        return path.join(hooksDir, entry);
      }
    }
  }

  // 3. Check all component dirs for {name}.doc.mjs or use{Name}.doc.mjs
  if (pathExists(srcDir)) {
    const topEntries = listDirEntries(srcDir);
    for (const entry of topEntries) {
      if (!entry.isDirectory() || HOOK_SKIP_DIRS.has(entry.name) || entry.name === 'hooks') continue;
      const found = searchDirForHookDoc(path.join(srcDir, entry.name), uniqueCandidates);
      if (found) return found;
    }
  }

  // 4. Fuzzy fallback: levenshtein distance on discovered hooks
  const allHooks = discoverHooks(coreDir);
  const allNames = Object.values(allHooks).flat();
  const needle = name.toLowerCase();

  let bestMatch = null;
  let bestDist = Infinity;
  for (const hookName of allNames) {
    const dist = levenshteinDistance(needle, hookName.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = hookName;
    }
  }

  if (bestMatch && bestDist <= 3) {
    return findHookDoc(coreDir, bestMatch);
  }

  return null;
}

/**
 * Recursively search a directory for a hook doc matching any of the candidate names.
 * @param {string} dirPath
 * @param {string[]} candidates
 * @returns {string | null}
 */
function searchDirForHookDoc(dirPath, candidates) {
  if (!pathExists(dirPath)) return null;
  const entries = listDirEntries(dirPath);
  for (const entry of entries) {
    if (entry.isDirectory() && !HOOK_SKIP_DIRS.has(entry.name)) {
      const found = searchDirForHookDoc(path.join(dirPath, entry.name), candidates);
      if (found) return found;
    } else if (entry.isFile() && entry.name.endsWith('.doc.mjs')) {
      const hookName = hookNameFromFile(entry.name);
      for (const candidate of candidates) {
        if (hookName === candidate || hookName.toLowerCase() === candidate.toLowerCase()) {
          return path.join(dirPath, entry.name);
        }
      }
    }
  }
  return null;
}

/**
 * Get all discovered hook names as a flat array (for fuzzy matching).
 * @param {string | null} coreDir null in a run that reads no Core
 * @param {(name: string) => boolean} [keep] as for {@link discoverHooks}
 * @param {Set<string>} [tops] as for {@link discoverHooks}
 * @returns {string[]}
 */
export function getAllHookNames(coreDir, keep, tops) {
  const hooks = discoverHooks(coreDir, keep, tops);
  return Object.values(hooks).flat();
}
