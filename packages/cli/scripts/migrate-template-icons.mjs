#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Move bundled templates from icon-library imports to icon
 * placeholders (AST-084 FR21): each icon a template imports from Heroicons or
 * Lucide becomes `<Meaning>Icon` from `@astryxdesign/template-icons`, in the
 * look its import path drew, and the template's descriptor loses its `icons`
 * declaration, because the import now names the meaning.
 *
 *   node packages/cli/scripts/migrate-template-icons.mjs [<folder> ...] [--check]
 *
 * Each `<folder>` is a path under assets/templates (`pages/table`,
 * `blocks/components/Button`); with none, every template moves. `--check`
 * changes nothing and exits 1 when a named template still imports an icon
 * library.
 *
 * Nothing is guessed. Each icon's meaning is the one its descriptor declares,
 * and the table (assets/icons/template-icons.json) must draw that meaning in
 * that look with the very icon the template imports; otherwise the script
 * stops and names the icon, so no picture changes. Uses keep their names
 * where the import aliased the icon; other uses take the placeholder's name.
 * Only files it changes are formatted, and only when they were formatted
 * before. Running it again changes nothing.
 *
 * @input Template sources and descriptors under assets/templates; the table
 * @output The same templates, importing icon placeholders
 * @position CLI maintenance script for the template icon migration
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {
  parseTemplateSource,
  traverseTemplateSource,
} from '../foundation/discovery/template-source-tree.mjs';
import {
  placeholderExportName,
  placeholderModule,
  placeholderTable,
} from '../foundation/discovery/template-placeholders.mjs';

const CLI_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const REPO = path.resolve(CLI_DIR, '../..');
const TEMPLATES = path.join(CLI_DIR, 'assets/templates');
const require = createRequire(path.join(CLI_DIR, 'package.json'));

/** The icon libraries the bundled templates import, and the look each path draws. */
const LIBRARY_RE =
  /^(?:@heroicons\/react\/(16|20|24)\/(outline|solid)|lucide-react)$/u;

/** @param {string} module @returns {string | null} */
function libraryLook(module) {
  const match = LIBRARY_RE.exec(module);
  if (!match) return null;
  return match[1] ? `${match[1]}/${match[2]}` : 'lucide';
}

/** Template sources under a folder, sorted, themes left out. @param {string} dir */
function templateSources(dir) {
  /** @type {string[]} */
  const out = [];
  const visit = (/** @type {string} */ current) => {
    const entries = fs
      .readdirSync(current, {withFileTypes: true})
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (path.relative(TEMPLATES, full) !== 'themes') visit(full);
      } else if (entry.name.endsWith('.tsx')) {
        out.push(full);
      }
    }
  };
  if (fs.statSync(dir).isDirectory()) visit(dir);
  else out.push(dir);
  return out;
}

/** The descriptor that declares a source's icons, or null. @param {string} file */
function descriptorOf(file) {
  const dir = path.dirname(file);
  const own = path.join(dir, `${path.basename(file, '.tsx')}.doc.mjs`);
  if (fs.existsSync(own)) return own;
  const page = path.join(dir, 'template.doc.mjs');
  return fs.existsSync(page) ? page : null;
}

/**
 * The `icons` property of a descriptor: its node and its entries.
 * @param {string} source
 * @returns {IconsProperty | null}
 */
function iconsProperty(source) {
  const ast = parseTemplateSource(source);
  /** @type {IconsProperty | null} */
  let found = null;
  traverseTemplateSource(ast, {
    ObjectProperty(/** @type {any} */ p) {
      const key = p.node.key;
      if (
        !found &&
        (key.name ?? key.value) === 'icons' &&
        p.node.value.type === 'ObjectExpression'
      ) {
        /** @type {Record<string, string>} */
        const entries = {};
        for (const prop of p.node.value.properties) {
          entries[prop.key.name ?? prop.key.value] = prop.value.value;
        }
        found = {node: p.node, entries};
      }
    },
  });
  // The visitor assigns `found`; TypeScript cannot see that through it.
  return /** @type {IconsProperty | null} */ (found);
}

/** @typedef {{node: any, entries: Record<string, string>}} IconsProperty */

/** @param {string} text @param {Array<{start: number, end: number, text: string}>} edits */
function applyEdits(text, edits) {
  let out = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

/**
 * The migrated source of one template, or null when it imports no icon
 * library. Throws when an icon has no meaning or the table draws another icon.
 * @param {string} rel
 * @param {string} source
 * @param {Record<string, string>} declared
 * @param {ReturnType<typeof placeholderTable>} table
 */
export function migrateTemplateSource(rel, source, declared, table) {
  const ast = parseTemplateSource(source);
  const imports = ast.program.body.filter(
    (/** @type {any} */ node) =>
      node.type === 'ImportDeclaration' &&
      node.importKind !== 'type' &&
      libraryLook(node.source.value) != null,
  );
  if (imports.length === 0) return null;
  /** @type {Set<string>} */
  const bound = new Set();
  /** @type {any} */
  let programScope = null;
  traverseTemplateSource(ast, {
    Program(/** @type {any} */ p) {
      programScope = p.scope;
    },
    Scope(/** @type {any} */ p) {
      for (const name of Object.keys(p.scope.bindings)) bound.add(name);
    },
  });
  /** @type {Array<{start: number, end: number, text: string}>} */
  const edits = [];
  /** @type {Map<string, string>} local name → new local name */
  const renames = new Map();
  for (const node of imports) {
    const look = /** @type {string} */ (libraryLook(node.source.value));
    const library = look === 'lucide' ? 'lucide' : 'heroicons';
    const specifiers = [];
    for (const specifier of node.specifiers) {
      if (specifier.type !== 'ImportSpecifier') {
        throw new Error(
          `${rel}: ${specifier.local.name} is not a named icon import`,
        );
      }
      const imported = specifier.imported.name ?? specifier.imported.value;
      const local = specifier.local.name;
      const meaning = declared[imported] ?? declared[local];
      if (!meaning) throw new Error(`${rel}: ${imported} declares no meaning`);
      const drawn = Object.hasOwn(table.meanings, meaning)
        ? table.meanings[meaning][library]
        : undefined;
      if (drawn !== imported) {
        throw new Error(
          `${rel}: ${imported} draws "${meaning}", but the table draws ${drawn ?? 'nothing'} for it in ${look}. Give the icon a meaning the table draws with ${imported}.`,
        );
      }
      const name = placeholderExportName(meaning);
      let newLocal = local;
      if (local === imported) {
        if (name !== local && bound.has(name)) {
          throw new Error(`${rel}: ${name} is already a name in the file`);
        }
        newLocal = name;
      }
      if (newLocal !== local) renames.set(local, newLocal);
      specifiers.push(newLocal === name ? name : `${name} as ${newLocal}`);
    }
    const comments = (ast.comments ?? [])
      .filter(
        (/** @type {any} */ c) => c.start > node.start && c.end < node.end,
      )
      .map((/** @type {any} */ c) => `${source.slice(c.start, c.end)}\n`)
      .join('');
    edits.push({
      start: node.start,
      end: node.end,
      text: `${comments}import {${specifiers.join(', ')}} from '${placeholderModule(look)}';`,
    });
  }
  traverseTemplateSource(ast, {
    'Identifier|JSXIdentifier'(/** @type {any} */ p) {
      const to = renames.get(p.node.name);
      if (
        !to ||
        p.findParent((/** @type {any} */ q) => q.isImportDeclaration())
      ) {
        return;
      }
      if (
        p.scope.getBinding(p.node.name) !== programScope.getBinding(p.node.name)
      ) {
        return;
      }
      if (p.isJSXIdentifier()) {
        const parent = p.parentPath;
        if (
          !parent.isJSXOpeningElement() &&
          !parent.isJSXClosingElement() &&
          !parent.isJSXMemberExpression()
        ) {
          return;
        }
      } else if (
        !p.isReferencedIdentifier() &&
        !p.parentPath.isExportSpecifier()
      ) {
        return;
      } else if (
        p.parentPath.isObjectProperty({shorthand: true}) &&
        p.parent.value === p.node
      ) {
        edits.push({
          start: p.parent.start,
          end: p.parent.end,
          text: `${p.node.name}: ${to}`,
        });
        return;
      }
      edits.push({start: p.node.start, end: p.node.end, text: to});
    },
  });
  return applyEdits(source, edits);
}

/** A descriptor without its `icons` property, or null when it has none. @param {string} source */
function withoutIcons(source) {
  const found = iconsProperty(source);
  if (!found) return null;
  let start = found.node.start;
  let end = found.node.end;
  while (
    start > 0 &&
    source[start - 1] !== '\n' &&
    /\s/u.test(source[start - 1])
  )
    start--;
  if (source[end] === ',') end++;
  if (source[end] === '\n') end++;
  return source.slice(0, start) + source.slice(end);
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const folders = args.filter(arg => !arg.startsWith('--'));
  const roots =
    folders.length > 0
      ? folders.map(f => path.join(TEMPLATES, f))
      : [TEMPLATES];
  const prettier = require('prettier');
  const config = JSON.parse(
    fs.readFileSync(path.join(REPO, '.prettierrc.json'), 'utf-8'),
  );
  /**
   * Format a changed file the way the repository does, but only when the
   * file was formatted before: a file that was not keeps every line the
   * migration did not change.
   * @param {string} text
   * @param {string} before
   * @param {string} filepath
   */
  const format = async (text, before, filepath) => {
    const options = {...config, filepath};
    return (await prettier.format(before, options)) === before
      ? prettier.format(text, options)
      : text;
  };
  const table = placeholderTable();
  /** @type {Map<string, Record<string, string>>} */
  const docs = new Map();
  const left = [];
  /** @type {string[]} */
  const errors = [];
  /** @type {Array<{file: string, migrated: string, descriptor: string | null, declared: Record<string, string>}>} */
  const planned = [];
  for (const file of roots.flatMap(templateSources)) {
    const rel = path.relative(TEMPLATES, file);
    const descriptor = descriptorOf(file);
    const descriptorSource = descriptor
      ? fs.readFileSync(descriptor, 'utf-8')
      : '';
    const declared = descriptor
      ? (iconsProperty(descriptorSource)?.entries ?? {})
      : {};
    const source = fs.readFileSync(file, 'utf-8');
    try {
      const migrated = migrateTemplateSource(rel, source, declared, table);
      if (migrated == null) continue;
      if (check) left.push(rel);
      else planned.push({file, migrated, descriptor, declared});
    } catch (error) {
      errors.push(/** @type {Error} */ (error).message);
    }
  }
  // Every template is checked before any file is written, so a stopped run
  // leaves the tree as it was.
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  for (const {file, migrated, descriptor, declared} of planned) {
    fs.writeFileSync(
      file,
      await format(migrated, fs.readFileSync(file, 'utf-8'), file),
    );
    if (descriptor) docs.set(descriptor, declared);
  }
  const moved = planned.length;
  for (const descriptor of [...docs.keys()].sort()) {
    const sharedBy = templateSources(path.dirname(descriptor)).filter(
      file => descriptorOf(file) === descriptor,
    );
    const stillLibrary = sharedBy.some(file =>
      /from '(?:@heroicons\/react\/|lucide-react')/u.test(
        fs.readFileSync(file, 'utf-8'),
      ),
    );
    if (stillLibrary) continue;
    const before = fs.readFileSync(descriptor, 'utf-8');
    const next = withoutIcons(before);
    if (next != null) {
      fs.writeFileSync(descriptor, await format(next, before, descriptor));
    }
  }
  if (check && left.length > 0) {
    console.error(
      `Templates still import an icon library:\n${left.map(r => `  ${r}`).join('\n')}`,
    );
    process.exit(1);
  }
  if (!check)
    console.log(
      `Moved ${moved} template${moved === 1 ? '' : 's'} to icon placeholders.`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
