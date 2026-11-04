// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file XLE component registry — built from @astryxdesign/core .doc.mjs metadata.
 *
 * Everything the layout language knows about components (valid names,
 * aliases, props, enums, slots) is derived from the same .doc.mjs files
 * that power `xds component`, so the notation can never drift from the
 * branch's actual API. The pure pieces (alias table, enum parsing,
 * resolution, serialize/hydrate) live in registry-core.mjs so they can
 * run in the browser; this module adds the fs-bound builder.
 *
 * @input  packages/core/src/(star)/(star).doc.mjs via component-discovery
 * @output buildRegistry() → { components, aliases, componentNames }
 * @position lib/xle — shared by parse/validate/expand; no CLI concerns here
 */

import fs from 'node:fs';
import path from 'node:path';
import {findCoreDir} from '../fs/paths.mjs';
import {
  discoverComponents,
  familyMember,
  findComponentReadme,
  resolveImportPath,
} from '../discovery/component-discovery.mjs';
import {loadDocs} from '../discovery/component-loader.mjs';
import {
  ALIAS_TABLE,
  normalizeName,
  toComponentEntry,
} from './registry-core.mjs';

// Re-export the pure surface so existing importers (and tests) keep working.
export {
  ALIAS_TABLE,
  SPACING_STEPS,
  parseEnumValues,
  resolveComponent,
  serializeRegistry,
  hydrateRegistry,
} from './registry-core.mjs';

/**
 * @param {Record<string, string[]>} grouped
 * @param {string} member
 * @returns {string|null}
 */
function findDirFor(grouped, member) {
  for (const [dir, members] of Object.entries(grouped)) {
    if (members.includes(member)) return dir;
  }
  return null;
}

// Match bare `export {Name}` / `export {Name, Other}` named re-exports in a
// component directory's index.ts. PascalCase only — hooks (useX), lowercase
// helpers, and `type` exports are skipped via the caller's filters.
const NAMED_EXPORT_RE = /export\s*\{([^}]*)\}/g;

/**
 * Read the PascalCase component names re-exported from a component directory's
 * `index.ts`. Used to recover structural sub-components that ship without their
 * own `.doc.mjs` (e.g. TableHeader, TableBody, TableFooter) — the doc-driven
 * discoverComponents() intentionally skips those, but the layout language still
 * needs to name and emit them.
 *
 * @param {string} coreDir
 * @param {string} dirName
 * @returns {string[]} bare PascalCase export names
 */
function readDirExportedComponents(coreDir, dirName) {
  const indexPath = path.join(coreDir, 'src', dirName, 'index.ts');
  let content;
  try {
    content = fs.readFileSync(indexPath, 'utf-8');
  } catch {
    return [];
  }
  const names = new Set();
  for (const match of content.matchAll(NAMED_EXPORT_RE)) {
    for (const raw of match[1].split(',')) {
      // `Name`, `Name as Alias`, ` type Name ` — keep the exported (left) name,
      // drop `type` and aliases.
      const token = raw.trim();
      if (!token || token.startsWith('type ')) continue;
      const name = token.split(/\s+as\s+/)[0].trim().replace(/^XDS/, '');
      // PascalCase components only — skip hooks (useX), lowercase utils, and
      // non-rendering exports (Context/Provider) that discoverComponents()
      // also excludes.
      if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) continue;
      if (/(?:Context|Provider)$/.test(name)) continue;
      names.add(name);
    }
  }
  return [...names];
}

let cachedRegistry = /** @type {import('./xle-ast').Registry | null} */ (null);

/**
 * Build (and cache) the registry: every documented component keyed by its
 * un-prefixed name, plus the validated alias map.
 *
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @returns {Promise<{components: Map<string, object>, aliases: Map<string, string>, componentNames: string[]}>}
 */
export async function buildRegistry({cwd = process.cwd()} = {}) {
  if (cachedRegistry) return cachedRegistry;

  const coreDir = findCoreDir(cwd);
  if (!coreDir) {
    throw new Error('Could not find @astryxdesign/core package — run from an XDS workspace');
  }

  const components = new Map();
  const grouped = discoverComponents(coreDir);
  const dirNames = [...new Set(Object.values(grouped).flat())];

  for (const dirName of dirNames) {
    const readme = findComponentReadme(coreDir, dirName);
    if (!readme || !readme.endsWith('.doc.mjs')) continue;
    let docs;
    try {
      docs = await loadDocs(readme, {});
    } catch {
      continue; // a malformed doc must not take down the whole language
    }
    // A member documented in its family's doc (VStack in Stack's doc) is
    // registered by the family's own folder, with every other member.
    if (familyMember(docs, dirName)) continue;
    const importPath = resolveImportPath(coreDir, dirName);

    const register = (/** @type {string} */ rawName, /** @type {import('./xle-ast').DocProp[]} */ props) => {
      const name = normalizeName(rawName);
      const entry = toComponentEntry(name, props, dirName, importPath);
      const existing = components.get(name);
      // Some docs list related components with empty prop arrays
      // (e.g. Layout's references to Card) — prefer the richer entry.
      if (!existing || entry.props.size > existing.props.size) {
        components.set(name, entry);
      }
    };

    if (docs.props) register(docs.name || dirName, docs.props);
    for (const sub of docs.components || []) {
      if (sub?.name) register(sub.name, sub.props);
    }
  }

  // Some components are documented in a sibling `<Name>.doc.mjs` inside another
  // component's dir (e.g. Text/Heading.doc.mjs documents Heading, with its own
  // props like `level`). The per-dir main-doc read above only sees the bare
  // `{name: 'Heading'}` cross-reference stub (no props), so without this those
  // props go missing and valid attrs (e.g. Heading[level=2]) get rejected.
  // Read every .doc.mjs in each contributing dir and upgrade props, keyed to
  // each component's own export subpath. Props-only: never adds empty entries.
  const upgradeFromDoc = (/** @type {string} */ rawName, /** @type {import('./xle-ast').DocProp[]} */ props, /** @type {string} */ fallbackDir) => {
    if (!props || props.length === 0) return;
    const name = normalizeName(rawName);
    // Prefer the component's own export subpath (Heading → @astryxdesign/core/Heading);
    // fall back to the dir it was found in, then any existing entry's path.
    const ip =
      resolveImportPath(coreDir, name) ||
      resolveImportPath(coreDir, fallbackDir) ||
      components.get(name)?.importPath;
    const entry = toComponentEntry(name, props, name, ip);
    const existing = components.get(name);
    if (!existing || entry.props.size > existing.props.size) components.set(name, entry);
  };
  for (const dirName of dirNames) {
    const dirPath = path.join(coreDir, 'src', dirName);
    let files;
    try {
      files = fs.readdirSync(dirPath).filter(f => f.endsWith('.doc.mjs'));
    } catch {
      continue;
    }
    for (const file of files) {
      let docs;
      try {
        docs = await loadDocs(path.join(dirPath, file), {});
      } catch {
        continue;
      }
      if (docs.props) upgradeFromDoc(docs.name || file.replace(/\.doc\.mjs$/, ''), docs.props, dirName);
      for (const sub of docs.components || []) {
        if (sub?.name && sub.props?.length) upgradeFromDoc(sub.name, sub.props, dirName);
      }
    }
  }

  // Exported components without their own doc entry (e.g. TableHeader,
  // TableBody) still get minimal registry entries so they can be named in
  // expressions — the validator warns rather than validates their props.
  //
  // Two sources:
  //  1. Members discovered alongside a documented sibling (legacy path).
  //  2. Bare PascalCase re-exports in each component dir's index.ts. The
  //     doc-driven discoverComponents() skips doc-less structural pieces
  //     (TableHeader/Body/Footer became bare files with no own .doc.mjs after
  //     the un-prefix migration), so we recover them from the real export
  //     surface here.
  const registerUndocumented = (/** @type {string} */ name, /** @type {string} */ dirName) => {
    if (components.has(name)) return;
    const entry = toComponentEntry(name, [], dirName, resolveImportPath(coreDir, name));
    entry.undocumented = true;
    components.set(name, entry);
  };

  for (const [, members] of Object.entries(grouped)) {
    for (const member of members) {
      registerUndocumented(normalizeName(member), findDirFor(grouped, member) || member);
    }
  }

  // Walk every component directory (those that contributed at least one
  // documented component) and backfill its index.ts exports.
  const docDirs = new Set();
  for (const c of components.values()) {
    if (c.dirName) docDirs.add(c.dirName);
  }
  for (const dirName of docDirs) {
    for (const name of readDirExportedComponents(coreDir, dirName)) {
      registerUndocumented(name, dirName);
    }
  }

  const aliases = new Map();
  for (const [alias, target] of Object.entries(ALIAS_TABLE)) {
    if (components.has(target)) aliases.set(alias, target);
  }

  cachedRegistry = {
    components,
    aliases,
    componentNames: [...components.keys()].sort(),
  };
  return cachedRegistry;
}
