// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Hook discovery — find, list, and resolve Astryx hooks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {listDir, listDirEntries, pathExists} from '../fs/listing-cache.mjs';
import {existsCaseExact} from '../fs/paths.mjs';
import {levenshteinDistance} from '../text/string-utils.mjs';

const SKIP_DIRS = new Set(['utils', '__tests__', 'node_modules']);

// Matches the top-level `category: 'categoryName'` field in a hook .doc.mjs file.
const CATEGORY_RE = /(?:^|\n) {0,4}category:\s*['"]([^'"]+)['"]/;

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
 * @param {string} coreDir
 * @returns {Record<string, string[]>}
 */
export function discoverHooks(coreDir) {
  const srcDir = path.join(coreDir, 'src');
  const hooksDir = path.join(srcDir, 'hooks');

  /** @type {Map<string, string>} hookName → category */
  const hookCategories = new Map();

  // 1. Scan src/hooks/ for *.doc.mjs files
  if (pathExists(hooksDir)) {
    const entries = listDirEntries(hooksDir);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.doc.mjs')) continue;
      const hookName = hookNameFromFile(entry.name);
      const docPath = path.join(hooksDir, entry.name);
      const {category} = readHookMeta(docPath);
      hookCategories.set(hookName, category || 'Other');
    }
  }

  // 2. Scan ALL component directories for files matching use*.doc.mjs
  if (pathExists(srcDir)) {
    const topEntries = listDirEntries(srcDir);
    for (const entry of topEntries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name === 'hooks') continue;
      const dirPath = path.join(srcDir, entry.name);
      scanDirForHookDocs(dirPath, hookCategories);
    }
  }

  // 3. Group by category, sorted alphabetically
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const [hookName, category] of hookCategories) {
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
    return a[0].localeCompare(b[0]);
  });

  /** @type {Record<string, string[]>} */
  const ordered = {};
  for (const [key, values] of sortedEntries) {
    ordered[key] = values;
  }

  return ordered;
}

/**
 * Recursively scan a directory for use*.doc.mjs files.
 * @param {string} dirPath
 * @param {Map<string, string>} hookCategories
 */
function scanDirForHookDocs(dirPath, hookCategories) {
  if (!pathExists(dirPath)) return;
  const entries = listDirEntries(dirPath);
  for (const entry of entries) {
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      scanDirForHookDocs(path.join(dirPath, entry.name), hookCategories);
    } else if (
      entry.isFile() &&
      entry.name.startsWith('use') &&
      entry.name.endsWith('.doc.mjs')
    ) {
      const hookName = hookNameFromFile(entry.name);
      if (!hookCategories.has(hookName)) {
        const docPath = path.join(dirPath, entry.name);
        const {category} = readHookMeta(docPath);
        hookCategories.set(hookName, category || 'Other');
      }
    }
  }
}

/**
 * Find the .doc.mjs file for a hook by name.
 * Searches hooks/ directory and component directories.
 * Matches both exact name and with 'use' prefix stripped.
 *
 * @param {string} coreDir
 * @param {string} name - Hook name (e.g. 'useMediaQuery', 'MediaQuery', 'mediaquery')
 * @returns {string|null} Path to the .doc.mjs file, or null
 */
export function findHookDoc(coreDir, name) {
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
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name === 'hooks') continue;
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
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
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
 * @param {string} coreDir
 * @returns {string[]}
 */
export function getAllHookNames(coreDir) {
  const hooks = discoverHooks(coreDir);
  return Object.values(hooks).flat();
}
