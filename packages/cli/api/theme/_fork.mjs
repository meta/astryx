// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The names a theme fork takes: its identity (slug, identifier,
 * export binding, entry and descriptor file names), its renamed files, and
 * its source rewritten from the base theme's names to the fork's.
 *
 * Shared by `theme eject` (api/theme/_adapter.mjs) and `integration add
 * theme` (api/integration/add-theme.mjs), so the two forks name a theme the
 * same way, and both the way `theme build` names its outputs.
 */

import * as path from 'node:path';
import {babelParse as parse} from '../../foundation/runtime/lazy-dependencies.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  PathSafetyError,
  sanitizeName,
} from '../../foundation/fs/path-safety.mjs';

/**
 * A theme name as the identifier `theme build` gives its export: each run
 * of dashes goes, and the letter after it is capitalized.
 * @param {string} name
 */
export function themeIdentifier(name) {
  return name.replace(/-+([a-z0-9])/gu, (_, c) => c.toUpperCase());
}

/**
 * The binding a theme named `name` exports, as `theme build` names it.
 * @param {string} name
 */
export function themeBinding(name) {
  return `${themeIdentifier(name)}Theme`;
}

/**
 * A new theme's names, from a checked kebab-case slug.
 * @param {string} slug
 */
export function themeIdentity(slug) {
  try {
    sanitizeName(slug, {label: 'theme name'});
  } catch (error) {
    if (error instanceof PathSafetyError) {
      throw new AstryxError(
        error.message,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    throw error;
  }
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new AstryxError(
      `Invalid theme name "${slug}": use lowercase kebab-case starting with a letter.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const identifier = themeIdentifier(slug);
  const displayName = slug
    .split('-')
    .map(part =>
      part === 'y2k' ? 'Y2K' : part[0].toUpperCase() + part.slice(1),
    )
    .join(' ');
  return {
    slug,
    identifier,
    displayName,
    exportName: `${identifier}Theme`,
    entry: `${identifier}Theme.ts`,
    descriptor: `${identifier}Theme.doc.mjs`,
  };
}

/**
 * Rename a file from the base theme's namespace to the new theme's namespace.
 * Files whose name starts with the base identifier get the new identifier;
 * others keep their name as-is.
 * @param {string} file  POSIX relative path inside the theme directory
 * @param {string} baseIdentifier
 * @param {string} newIdentifier
 * @returns {string}
 */
export function renameThemeFile(file, baseIdentifier, newIdentifier) {
  const basename = path.posix.basename(file);
  const dir = path.posix.dirname(file);
  if (!basename.startsWith(baseIdentifier)) return file;
  const renamed = newIdentifier + basename.slice(baseIdentifier.length);
  return dir === '.' ? renamed : `${dir}/${renamed}`;
}

/** @param {string} s */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Rewrite a source file's contents from the base theme's names to the new
 * theme's names. This replaces:
 *   1. Identifier prefixes (camelCase variables, import paths): baseIdentifier
 *      followed by an uppercase letter.
 *   2. The theme slug in string literals: 'baseSlug' → 'newSlug' and
 *      'astryx-baseSlug' → 'astryx-newSlug'.
 *   3. CSS custom properties scoped to the theme: --astryx-theme-baseSlug-.
 * @param {string} source
 * @param {string} baseSlug
 * @param {string} baseIdentifier
 * @param {string} newSlug
 * @param {string} newIdentifier
 * @returns {string}
 */
export function rewriteThemeSource(
  source,
  baseSlug,
  baseIdentifier,
  newSlug,
  newIdentifier,
) {
  let result = source;
  const identRe = new RegExp(`${escapeRegExp(baseIdentifier)}(?=[A-Z])`, 'gu');
  result = result.replace(identRe, newIdentifier);
  result = result.replace(
    new RegExp(`'astryx-${escapeRegExp(baseSlug)}'`, 'gu'),
    `'astryx-${newSlug}'`,
  );
  result = result.replace(
    new RegExp(`'${escapeRegExp(baseSlug)}'`, 'gu'),
    `'${newSlug}'`,
  );
  result = result.replace(
    new RegExp(`--astryx-theme-${escapeRegExp(baseSlug)}-`, 'gu'),
    `--astryx-theme-${newSlug}-`,
  );
  return result;
}

/**
 * The theme source with its `defineTheme({...})` name set to `to`, wherever
 * the `name` property sits in the object (after `extends`, under a
 * comment), or null when no `defineTheme` call names a theme. Only that
 * one string changes.
 * @param {string} source
 * @param {string} to
 * @returns {string | null}
 */
export function renameDefinedTheme(source, to) {
  /** @type {any} */
  let ast;
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
  } catch {
    return null;
  }
  /** @type {{start: number, end: number, quote: string} | null} */
  let hit = null;
  /** @param {any} node */
  const visit = node => {
    if (hit || !node || typeof node !== 'object') return;
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'defineTheme' &&
      node.arguments?.[0]?.type === 'ObjectExpression'
    ) {
      const prop = node.arguments[0].properties.find(
        (/** @type {any} */ p) =>
          p.type === 'ObjectProperty' &&
          !p.computed &&
          ((p.key.type === 'Identifier' && p.key.name === 'name') ||
            (p.key.type === 'StringLiteral' && p.key.value === 'name')) &&
          p.value.type === 'StringLiteral',
      );
      if (prop)
        hit = {
          start: prop.value.start,
          end: prop.value.end,
          quote: source[prop.value.start],
        };
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object' && value.type) visit(value);
    }
  };
  visit(ast.program);
  if (!hit) return null;
  const {start, end, quote} = hit;
  return `${source.slice(0, start)}${quote}${to}${quote}${source.slice(end)}`;
}

/**
 * The file names of a fork: the theme's own, except that a fork named other
 * than the theme names its entry and descriptor after its binding
 * (`acmeOceanTheme.ts`, `acmeOceanTheme.doc.mjs`), as discovery reads them.
 * @param {{slug: string, docPath: string, files: string[]}} theme
 * @param {string} forkName
 * @returns {string[]} in the order of theme.files
 */
export function forkFileNames(theme, forkName) {
  if (forkName === theme.slug) return [...theme.files];
  const docName = path.basename(theme.docPath);
  const stem = docName.slice(0, -'.doc.mjs'.length);
  const binding = themeBinding(forkName);
  return theme.files.map(name =>
    name === docName
      ? `${binding}.doc.mjs`
      : name === theme.files[0] && path.basename(name).startsWith(`${stem}.`)
        ? path.join(path.dirname(name), binding + path.extname(name))
        : name,
  );
}

/**
 * The theme entry renamed for a fork: its `defineTheme` name is the fork's,
 * so the build writes `<fork>.css` and `<fork>.js`, and its export binding is
 * the build's (`acmeOceanTheme`), the name discovery and `theme add` read.
 * Refused when the entry names no theme to rename, since the fork would
 * then build under the base theme's name.
 * @param {string} contents
 * @param {{slug: string, docPath: string}} theme
 * @param {string} to
 * @returns {string}
 */
export function renamedEntry(contents, theme, to) {
  const stem = path.basename(theme.docPath).slice(0, -'.doc.mjs'.length);
  const named = renameDefinedTheme(contents, to);
  if (named == null)
    throw new AstryxError(
      `The entry of theme "${theme.slug}" names no theme in a defineTheme({name: ...}) call, so a fork named "${to}" would still build as "${theme.slug}". Fork it under its own name.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  return named.replace(
    new RegExp(`\\b${escapeRegExp(stem)}\\b`, 'gu'),
    themeBinding(to),
  );
}
