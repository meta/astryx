// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guides a theme's own package ships, for the moments the CLI speaks
 * for that theme (theme add, build, export). PROTOTYPE for a blind test.
 *
 * A guide is a docs topic with `category: 'guide'` in the package that owns
 * the theme. No new field: the package's `docs` root and the topic's
 * `category` already exist.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {firstSentence} from '../text/string-utils.mjs';

/** 'pointer' prints one line per guide; 'inline' prints the guide at build. */
export const GUIDE_MODE = 'pointer';

/**
 * @typedef {object} ThemeGuide
 * @property {string} theme the theme's slug
 * @property {string} package the package that owns the theme and the guide
 * @property {string} name the docs topic
 * @property {string} description the topic's first sentence
 */

/**
 * The guides each theme's package ships.
 * @param {string} cwd
 * @param {{slug: string, package: string}[]} themes
 * @returns {Promise<ThemeGuide[]>}
 */
export async function guidesForThemes(cwd, themes) {
  if (themes.length === 0) return [];
  const {loadDocsCatalog} = await import('../../api/docs/_adapter.mjs');
  let catalog;
  try {
    catalog = await loadDocsCatalog(cwd);
  } catch {
    return [];
  }
  /** @type {ThemeGuide[]} */
  const out = [];
  const seen = new Set();
  for (const theme of themes) {
    for (const entry of catalog.entries()) {
      if (entry.package !== theme.package || entry.category !== 'guide') continue;
      if (entry.replaces) continue;
      if (seen.has(entry.name)) continue;
      seen.add(entry.name);
      out.push({
        theme: theme.slug,
        package: theme.package,
        name: entry.name,
        description: firstSentence(entry.description ?? ''),
      });
    }
  }
  return out.slice(0, 3);
}

/**
 * Integration themes available here, with the package that owns each.
 * @param {string} cwd
 * @returns {Promise<{slug: string, displayName: string, package: string}[]>}
 */
export async function packageThemes(cwd) {
  try {
    const {listAvailableThemes, themeRecordOwner} = await import('../../api/theme/_adapter.mjs');
    const themes = await listAvailableThemes(cwd, {includeLocal: false});
    return themes
      .map(t => ({slug: t.slug, displayName: t.displayName ?? t.slug, package: themeRecordOwner(t) ?? t.package}))
      .filter(t => t.package && !t.package.startsWith('@astryxdesign/'));
  } catch {
    return [];
  }
}

/**
 * Themes an ask names by slug or display name.
 * @param {string} cwd
 * @param {string} ask
 */
export async function themesNamedIn(cwd, ask) {
  const words = ` ${ask.toLowerCase().replace(/[^a-z0-9@/.-]+/g, ' ')} `;
  const squashed = ask.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return (await packageThemes(cwd)).filter(t => {
    const name = t.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '');
    return (
      words.includes(` ${t.slug.toLowerCase()} `) ||
      (name.length > 2 && squashed.includes(name)) ||
      words.includes(t.package.toLowerCase())
    );
  });
}

/**
 * The app's added themes (its generated theme module), default first.
 * @param {string} cwd
 */
export async function appThemes(cwd) {
  try {
    const {readThemeListState} = await import('../../api/theme/_adapter.mjs');
    const state = readThemeListState(cwd);
    const added = Object.entries(state.themes ?? {});
    if (added.length === 0) return [];
    const byPackage = await packageThemes(cwd);
    const picked = byPackage.filter(t => added.some(([slug, owner]) => slug === t.slug && owner === t.package));
    return picked.sort((a, b) => Number(b.slug === state.defaultSlug) - Number(a.slug === state.defaultSlug));
  } catch {
    return [];
  }
}

/**
 * Themes a page imports, read from the page and its local modules.
 * @param {string} cwd
 * @param {string[]} files page first, relative to `dir`
 * @param {string} dir
 */
export async function themesImportedBy(cwd, files, dir) {
  /** @type {Set<string>} */
  const pkgs = new Set();
  for (const rel of files.slice(0, 20)) {
    if (!/\.[cm]?[jt]sx?$/.test(rel)) continue;
    let src;
    try {
      src = fs.readFileSync(path.resolve(dir, rel), 'utf8');
    } catch {
      continue;
    }
    for (const m of src.matchAll(/(?:from\s+|import\s+)['"]((?:@[^/'"]+\/)?[^/'".][^/'"]*)/g)) {
      pkgs.add(m[1]);
    }
  }
  return (await packageThemes(cwd)).filter(t => pkgs.has(t.package));
}

/**
 * One line per guide, as the CLI prints it.
 * @param {ThemeGuide[]} guides
 * @param {string} run the CLI invocation
 */
export function guideLines(guides, run) {
  return guides.map(
    g =>
      `${g.theme} (${g.package}) has a guide for pages in it: ${run} docs ${g.name}${
        g.description ? ` (${g.description.replace(/\.$/, '')})` : ''
      }`,
  );
}

/**
 * The guide's whole text, as `docs <name> --full` prints it.
 * @param {ThemeGuide} guide
 * @returns {string}
 */
export function guideText(guide) {
  const p = spawnSync(process.execPath, [process.argv[1], 'docs', guide.name, '--full'], {
    encoding: 'utf8',
    env: process.env,
    cwd: process.cwd(),
    maxBuffer: 1 << 24,
  });
  return (p.stdout || '').trim();
}
