// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The interfaces a Core declares for themes to widen by declaration
 *   merging (`interface ButtonVariantMap`), the prop axes they widen, and the
 *   keys a project adds to them.
 * @input  a Core package root, a public subpath name, a prop name; a project
 *   folder
 * @output the subpath's declarations, whether it declares an interface, the
 *   interface that widens a component prop's values, and the keys the
 *   project's own TypeScript files and its installed theme and integration
 *   packages' declaration files add to each interface
 * @position Read by theme build (api/theme/build/build.mjs), which augments
 *   these interfaces, and by render (api/render/_adapter.mjs), which takes a
 *   widened prop's added keys as values the prop has.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {babelParse} from '../runtime/lazy-dependencies.mjs';

/** @type {Map<string, string>} */
const declarationCache = new Map();

/**
 * The type declarations `@astryxdesign/core/<pascalName>` exposes: the shipped
 * `dist/<pascalName>/index.d.ts` (what a consumer's TypeScript sees), else the
 * `src/<pascalName>/index.ts` of a source checkout. With `includeTypes`, the
 * subpath's `types` file is read too. Returns '' when nothing is found.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {{includeTypes?: boolean}} [options]
 * @returns {string}
 */
export function readComponentDeclarations(coreRoot, pascalName, options = {}) {
  const includeTypes = options.includeTypes === true;
  const cacheKey = `${coreRoot}:${pascalName}:${includeTypes ? 'with-types' : 'index-only'}`;
  const cached = declarationCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let contents = '';
  if (coreRoot) {
    const candidateSets = [
      [path.join(coreRoot, 'dist', pascalName, 'index.d.ts')],
      [path.join(coreRoot, 'src', pascalName, 'index.ts')],
    ];
    if (includeTypes) {
      candidateSets[0].push(
        path.join(coreRoot, 'dist', pascalName, 'types.d.ts'),
      );
      candidateSets[1].push(path.join(coreRoot, 'src', pascalName, 'types.ts'));
    }
    for (const files of candidateSets) {
      if (!fs.existsSync(files[0])) continue;
      for (const file of files) {
        try {
          if (fs.existsSync(file))
            contents += fs.readFileSync(file, 'utf-8') + '\n';
        } catch {
          // An unreadable file adds nothing.
        }
      }
      if (contents) break;
    }
  }
  declarationCache.set(cacheKey, contents);
  return contents;
}

/**
 * Whether `@astryxdesign/core/<pascalName>` declares the interface
 * `interfaceName`, which module augmentation can widen. A closed literal union
 * (`ButtonSize`) is not an extension point. A type re-export does not count:
 * augmentation widens only the module that declares the interface, so
 * augmenting a barrel that re-exports it makes a dead sibling interface.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {string} interfaceName
 * @param {{includeTypes?: boolean}} [options]
 * @returns {boolean}
 */
export function componentHasAugmentableInterface(
  coreRoot,
  pascalName,
  interfaceName,
  options,
) {
  const declarations = readComponentDeclarations(coreRoot, pascalName, options);
  if (!declarations) return false;
  return new RegExp(String.raw`\binterface\s+${interfaceName}\b`).test(
    declarations,
  );
}

/**
 * Extension points whose public module and interface do not follow the usual
 * `<Component><Prop>Map` convention, keyed `<Component>.<prop>`. TextType
 * reads CustomTextTypes from the theme module.
 * @type {Record<string, {moduleName: string, interfaceName: string, includeTypes?: boolean}>}
 */
export const AUGMENTATION_OVERRIDES = {
  'Text.type': {
    moduleName: 'theme',
    interfaceName: 'CustomTextTypes',
    includeTypes: true,
  },
};

/**
 * The convention-breaking extension point of `<pascalName prop>` when the
 * Core declares it, as `{moduleName, interfaceName}`; null when the prop has
 * no such entry or the Core does not declare it.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {string} prop
 * @returns {{moduleName: string, interfaceName: string} | null}
 */
export function overrideAugmentationPoint(coreRoot, pascalName, prop) {
  const override = Object.hasOwn(
    AUGMENTATION_OVERRIDES,
    `${pascalName}.${prop}`,
  )
    ? AUGMENTATION_OVERRIDES[`${pascalName}.${prop}`]
    : null;
  if (!override) return null;
  return componentHasAugmentableInterface(
    coreRoot,
    override.moduleName,
    override.interfaceName,
    {
      includeTypes: override.includeTypes,
    },
  )
    ? {moduleName: override.moduleName, interfaceName: override.interfaceName}
    : null;
}

/**
 * The interface a theme widens to add values to component `pascalName`'s prop
 * `prop`, when the Core declares one: the convention-breaking entry of
 * {@link AUGMENTATION_OVERRIDES}, else `<Component><Prop>Map` in the
 * component's own subpath. Null when the prop's values are closed.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {string} prop
 * @returns {{moduleName: string, interfaceName: string} | null}
 */
export function propAugmentationPoint(coreRoot, pascalName, prop) {
  if (Object.hasOwn(AUGMENTATION_OVERRIDES, `${pascalName}.${prop}`)) {
    return overrideAugmentationPoint(coreRoot, pascalName, prop);
  }
  const interfaceName = `${pascalName}${prop.charAt(0).toUpperCase()}${prop.slice(1)}Map`;
  return componentHasAugmentableInterface(coreRoot, pascalName, interfaceName)
    ? {moduleName: pascalName, interfaceName}
    : null;
}

const CORE_PACKAGE = '@astryxdesign/core';
/** A project's own TypeScript file, declarations included. */
const SOURCE_FILE = /\.[cm]?tsx?$/;
/** A declaration file, the only TypeScript an installed package publishes. */
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
/** Entries a project read may visit before it gives up as incomplete. */
const ENTRY_LIMIT = 20_000;

/**
 * The keys a project adds to Core's interfaces by module augmentation
 * (`declare module '@astryxdesign/core/Button' { interface ButtonVariantMap
 * { 'primary-muted': true } }`), keyed by interface name. It reads the places
 * TypeScript reads for the project's pages: every TypeScript file under the
 * project folder (a theme build's `<theme>.variants.d.ts` included), and the
 * declaration files of each package the project depends on that depends on
 * Core or is an Astryx integration. `complete` is false when a file cannot be
 * read or parsed, or the read passes {@link ENTRY_LIMIT} entries: the keys
 * may then miss some, and a caller must not take them as the whole set.
 * @param {string} projectDir the folder of the project's package.json
 * @returns {{keys: Map<string, Set<string>>, complete: boolean}}
 */
export function projectAugmentations(projectDir) {
  /** @type {Map<string, Set<string>>} */
  const keys = new Map();
  const state = {entries: 0, complete: true};
  readTree(projectDir, SOURCE_FILE, keys, state);
  for (const dir of astryxDependencyDirs(projectDir)) {
    if (!state.complete) break;
    readTree(dir, DECLARATION_FILE, keys, state);
  }
  return {keys, complete: state.complete};
}

/**
 * The folders of the packages `projectDir`'s package.json depends on that
 * depend on Core (or peer on it) or carry an `astryx.integration.mjs`: the
 * theme and integration packages whose declarations can augment Core.
 * @param {string} projectDir
 * @returns {string[]}
 */
function astryxDependencyDirs(projectDir) {
  /** @type {any} */
  let manifest;
  try {
    manifest = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
    );
  } catch {
    return [];
  }
  const names = new Set(
    [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ].flatMap(field => Object.keys(manifest?.[field] ?? {})),
  );
  names.delete(CORE_PACKAGE);
  /** @type {string[]} */
  const dirs = [];
  for (const name of names) {
    const dir = installedPackageDir(projectDir, name);
    if (!dir) continue;
    /** @type {any} */
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const onCore = Boolean(
      pkg?.dependencies?.[CORE_PACKAGE] ??
      pkg?.peerDependencies?.[CORE_PACKAGE],
    );
    if (onCore || fs.existsSync(path.join(dir, 'astryx.integration.mjs')))
      dirs.push(dir);
  }
  return dirs;
}

/**
 * The real folder of package `name` as Node resolves it from `fromDir`: the
 * first `node_modules/<name>` holding a package.json on the way up.
 * @param {string} fromDir
 * @param {string} name
 * @returns {string | null}
 */
function installedPackageDir(fromDir, name) {
  for (let dir = path.resolve(fromDir); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'));
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      try {
        return fs.realpathSync(candidate);
      } catch {
        return null;
      }
    }
    if (path.dirname(dir) === dir) return null;
  }
}

/**
 * Read the augmentations of every file under `root` that `pattern` matches,
 * into `keys`. It does not enter `node_modules`, hidden folders, or linked
 * folders.
 * @param {string} root
 * @param {RegExp} pattern
 * @param {Map<string, Set<string>>} keys
 * @param {{entries: number, complete: boolean}} state
 */
function readTree(root, pattern, keys, state) {
  const folders = [root];
  while (folders.length > 0 && state.complete) {
    const folder = /** @type {string} */ (folders.pop());
    let entries;
    try {
      entries = fs.readdirSync(folder, {withFileTypes: true});
    } catch {
      state.complete = false;
      return;
    }
    for (const entry of entries) {
      if (++state.entries > ENTRY_LIMIT) {
        state.complete = false;
        return;
      }
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) folders.push(file);
      else if (
        pattern.test(entry.name) &&
        (entry.isFile() || entry.isSymbolicLink())
      ) {
        if (!readAugmentations(file, keys)) state.complete = false;
      }
    }
  }
}

/**
 * Add the keys `file` adds to Core's interfaces to `keys`. A file that names
 * no Core module in a `declare module` adds nothing and is not parsed.
 * @param {string} file
 * @param {Map<string, Set<string>>} keys
 * @returns {boolean} false when the file cannot be read or parsed
 */
function readAugmentations(file, keys) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  if (!text.includes(CORE_PACKAGE) || !/\bdeclare\s+module\b/.test(text))
    return true;
  /** @type {any} */
  let ast;
  try {
    ast = babelParse(text, {
      sourceType: 'module',
      plugins: [
        ['typescript', {dts: DECLARATION_FILE.test(file)}],
        ...(file.endsWith('x') ? /** @type {const} */ (['jsx']) : []),
      ],
    });
  } catch {
    return false;
  }
  for (const statement of ast.program.body) {
    if (
      statement.type !== 'TSModuleDeclaration' ||
      statement.id?.type !== 'StringLiteral'
    )
      continue;
    const target = statement.id.value;
    if (target !== CORE_PACKAGE && !target.startsWith(`${CORE_PACKAGE}/`))
      continue;
    for (const member of statement.body?.body ?? []) {
      const declaration =
        member.type === 'ExportNamedDeclaration' ? member.declaration : member;
      if (declaration?.type !== 'TSInterfaceDeclaration') continue;
      const added = keys.get(declaration.id.name) ?? new Set();
      for (const property of declaration.body.body) {
        if (property.type !== 'TSPropertySignature' || property.computed)
          continue;
        const key = property.key;
        if (key.type === 'StringLiteral') added.add(key.value);
        else if (key.type === 'Identifier') added.add(key.name);
        else if (key.type === 'NumericLiteral') added.add(String(key.value));
      }
      keys.set(declaration.id.name, added);
    }
  }
  return true;
}
