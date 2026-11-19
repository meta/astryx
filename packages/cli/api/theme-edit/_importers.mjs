// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The files of an app that import preview pages about to be removed,
 * read from their syntax trees, with how many source files are read at
 * most as a parameter: past it, the caller refuses rather than guess.
 *
 * @position api/theme-edit — imported by _preview-app.mjs
 */

import {parse as parseModule} from '@babel/parser';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {shown} from './_settings.mjs';

/** Folders the importer search never enters: installs and build output. */
const NOT_SOURCE = new Set([
  'node_modules',
  'out',
  'dist',
  'build',
  'coverage',
]);

/** At most this many source files the preview's commands read. */
export const IMPORTER_SCAN_MAX = 50000;

/**
 * Files of the project's own that import any of `targets` (preview files
 * about to be deleted), so deleting them would break the app's build. The
 * whole project root is read: every .ts/.tsx/.js/.jsx/.mjs/.cjs/.mdx file
 * outside node_modules, build output and dot folders, the preview's own
 * files left out. Each file's import and export-from declarations,
 * import() and require() calls (a string or a template with no
 * substitution) are read from its syntax tree and resolved: relative,
 * `@/`, or a tsconfig `paths` alias. `tooBig` when the project holds more
 * than `limit` source files, so the caller refuses instead of guessing.
 * @param {string} cwd
 * @param {{files: string[]}} data the preview's record (its own files are
 *   left out)
 * @param {string} dir the preview folder
 * @param {string[]} targets absolute paths, without extension
 * @param {{aliases: Array<{prefix: string, to: string[]}>, limit: number}} opts
 *   the app's tsconfig `paths` aliases, and how many source files to read
 *   at most
 * @returns {{importers: string[], tooBig: boolean, limit: number}}
 */
export function pageImporters(cwd, data, dir, targets, {aliases, limit}) {
  const wanted = new Set(targets);
  if (!wanted.size) return {importers: [], tooBig: false, limit};
  const names = [...new Set(targets.map(t => path.basename(t)))];
  const own = new Set(data.files.map(f => path.join(dir, f)));
  /** @type {Set<string>} */
  const out = new Set();
  let files = 0;
  let tooBig = false;
  /** @param {string} file @param {string} spec */
  const resolves = (file, spec) => {
    const alias = aliases.find(x => spec.startsWith(x.prefix));
    const bases = alias
      ? alias.to.map(t => path.join(t, spec.slice(alias.prefix.length)))
      : spec.startsWith('@/')
        ? [path.join(cwd, 'src', spec.slice(2)), path.join(cwd, spec.slice(2))]
        : spec.startsWith('.')
          ? [path.resolve(path.dirname(file), spec)]
          : [];
    return bases.some(
      b =>
        wanted.has(b.replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/, '')) ||
        wanted.has(path.join(b, 'index')),
    );
  };
  /** @param {any} node @param {(spec: string) => void} found */
  const specifiers = (node, found) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const x of node) specifiers(x, found);
      return;
    }
    const text = (/** @type {any} */ n) =>
      n?.type === 'StringLiteral'
        ? n.value
        : n?.type === 'TemplateLiteral' && n.expressions.length === 0
          ? n.quasis.map((/** @type {any} */ q) => q.value.cooked).join('')
          : null;
    if (
      (node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration') &&
      node.source
    ) {
      const t = text(node.source);
      if (t != null) found(t);
    } else if (node.type === 'ImportExpression') {
      const t = text(node.source);
      if (t != null) found(t);
    } else if (
      node.type === 'CallExpression' &&
      (node.callee?.type === 'Import' ||
        (node.callee?.type === 'Identifier' && node.callee.name === 'require'))
    ) {
      const t = text(node.arguments?.[0]);
      if (t != null) found(t);
    } else if (
      node.type === 'TSImportType' ||
      node.type === 'TSExternalModuleReference'
    ) {
      const t = text(node.argument ?? node.expression);
      if (t != null) found(t);
    }
    for (const [k, v] of Object.entries(node))
      if (
        k !== 'loc' &&
        k !== 'start' &&
        k !== 'end' &&
        v &&
        typeof v === 'object'
      )
        specifiers(v, found);
  };
  /** @param {string} at */
  const walk = at => {
    if (tooBig) return;
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(at, {withFileTypes: true});
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(at, e.name);
      if (e.isDirectory()) {
        if (!NOT_SOURCE.has(e.name) && !e.name.startsWith('.')) walk(full);
        if (tooBig) return;
        continue;
      }
      if (!/\.(tsx|ts|jsx|js|mjs|cjs|mdx)$/.test(e.name) || own.has(full))
        continue;
      if (e.name.endsWith('.d.ts')) continue;
      if (++files > limit) {
        tooBig = true;
        return;
      }
      /** @type {string} */
      let source;
      try {
        source = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      // Only a file that names a target's file name can import it.
      if (!names.some(n => source.includes(n))) continue;
      /** @type {string[]} */
      const specs = [];
      try {
        const ast = parseModule(
          e.name.endsWith('.mdx')
            ? source
                .split('\n')
                .filter(l => /^\s*(import|export)\b/.test(l))
                .join('\n')
            : source,
          {
            sourceType: 'unambiguous',
            errorRecovery: true,
            plugins: [
              'jsx',
              ...(/\.(ts|tsx|mts|cts)$/.test(e.name)
                ? [/** @type {const} */ ('typescript')]
                : []),
            ],
          },
        );
        specifiers(ast.program, spec => specs.push(spec));
      } catch {
        // Not parsed: read its import strings as text.
        for (const m of source.matchAll(
          /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)['"`]([^'"`$]+)['"`]/g,
        ))
          specs.push(m[1]);
      }
      if (specs.some(sp => resolves(full, sp))) out.add(shown(cwd, full));
    }
  };
  walk(cwd);
  return {importers: [...out].sort(), tooBig, limit};
}
