// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A tiny synthetic icon-set integration, laid out on disk for tests
 * (AST-084).
 *
 * `writeIconSetProject` writes a consuming project that declares one or more
 * icon packages, each installed under node_modules with an integration
 * manifest whose `experimental.iconSets` root holds one set. The default package,
 * `@acme/glyphs`, ships four hand-made SVG components (x, search, trash,
 * home) re-exported from per-icon files, a solid trash variant, a theme map,
 * and a license notice. Every part can be overridden to build a broken case.
 *
 * @input A temp directory and per-package overrides
 * @output The project directory
 * @position test-utils — shared by the icon-set discovery, command, search,
 *   check, Doctor, and template-mapping tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {ICON_NAMES} from '../authoring/doctypes/icon-set/icon-names.mjs';

/** @typedef {import('../authoring/doctypes/icon-set/type').IconSetData} IconSetData */

/** The default set's data file. */
export function glyphsData() {
  return /** @type {IconSetData} */ ({
    schemaVersion: 1,
    module: '@acme/glyphs',
    variants: ['outline', 'solid'],
    default: {variant: 'outline'},
    themeMap: 'themeIcons',
    map: {close: 'x', search: 'search'},
    icons: [
      {
        id: 'x',
        export: 'XIcon',
        words: ['close', 'cancel', 'dismiss', 'remove', 'times'],
      },
      {
        id: 'search',
        export: 'SearchIcon',
        words: ['find', 'magnifier', 'lookup', 'search'],
      },
      {
        id: 'trash',
        export: 'TrashIcon',
        words: ['delete', 'remove', 'bin', 'garbage'],
        variants: [{variant: 'solid', export: 'TrashSolidIcon'}],
      },
      {
        id: 'home',
        export: 'HomeIcon',
        words: ['house', 'start', 'main'],
      },
    ],
  });
}

/** @param {string} name @param {string} d */
const svgComponent = (name, d) => `export function ${name}(props) {
  return {
    type: 'svg',
    props: {viewBox: '0 0 24 24', 'aria-hidden': true, ...props, children: [{type: 'path', props: {d: '${d}'}}]},
  };
}
`;

/** The default package's module files, by path. */
export function glyphsModules() {
  return {
    'index.js': [
      "export {XIcon} from './icons/x.js';",
      "export {SearchIcon} from './icons/search.js';",
      "export * from './icons/trash.js';",
      "export {HomeIcon} from './icons/home.js';",
      "export {themeIcons} from './theme.js';",
      '',
    ].join('\n'),
    'icons/x.js': svgComponent('XIcon', 'M6 6l12 12M6 18L18 6'),
    'icons/search.js': svgComponent(
      'SearchIcon',
      'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
    ),
    'icons/trash.js':
      svgComponent('TrashIcon', 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13') +
      svgComponent('TrashSolidIcon', 'M5 7h14v13H5z'),
    'icons/home.js': svgComponent('HomeIcon', 'M3 11l9-8 9 8v10H3z'),
    'theme.js': [
      "import {XIcon} from './icons/x.js';",
      "import {SearchIcon as Magnifier} from './icons/search.js';",
      '',
      'export const themeIcons = {',
      '  close: XIcon,',
      '  search: Magnifier,',
      '};',
      '',
    ].join('\n'),
  };
}

/**
 * The default set with every built-in icon definition mapped: `close` and
 * `search` to their icons, every other built-in to `home`, and a theme map
 * keyed by exactly those definitions. `integration check` then reports no
 * error for it.
 * @returns {{data: IconSetData, modules: Record<string, string>}}
 */
export function completeGlyphs() {
  const others = ICON_NAMES.filter(
    name => name !== 'close' && name !== 'search',
  );
  const data = glyphsData();
  data.map = {
    ...data.map,
    ...Object.fromEntries(others.map(name => [name, 'home'])),
  };
  const modules = glyphsModules();
  modules['theme.js'] = [
    "import {XIcon} from './icons/x.js';",
    "import {SearchIcon as Magnifier} from './icons/search.js';",
    "import {HomeIcon} from './icons/home.js';",
    '',
    'export const themeIcons = {',
    '  close: XIcon,',
    '  search: Magnifier,',
    ...others.map(name => `  ${name}: HomeIcon,`),
    '};',
    '',
  ].join('\n');
  return {data, modules};
}

/**
 * @typedef {object} IconPackageSpec
 * @property {string} [name] package name (default `@acme/glyphs`)
 * @property {string} [version]
 * @property {string} [set] set directory name (default the package's last
 *   segment)
 * @property {Record<string, unknown>} [doc] descriptor fields (merged over
 *   the defaults)
 * @property {string | null} [docSource] the whole descriptor source, or null
 *   to leave it out
 * @property {unknown} [data] the data file value (default glyphsData with
 *   `module` set to the package name), or null to leave it out
 * @property {Record<string, string>} [modules] module files (default
 *   glyphsModules)
 * @property {boolean} [notice] write a LICENSE in the set directory (default
 *   true)
 * @property {Record<string, string>} [dependencies] the package's own
 *   dependencies
 * @property {boolean} [install] install it in node_modules (default true)
 * @property {Record<string, string>} [definitions] the set's own icon
 *   definition files, by name: each value is the file's source
 */

/**
 * Write one icon package into a directory.
 * @param {string} dir
 * @param {IconPackageSpec} spec
 */
export function writeIconPackage(dir, spec = {}) {
  const name = spec.name ?? '@acme/glyphs';
  const set = spec.set ?? name.split('/').pop();
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: spec.version ?? '1.0.0',
        type: 'module',
        sideEffects: false,
        exports: {'.': './index.js'},
        ...(spec.dependencies ? {dependencies: spec.dependencies} : {}),
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.integration.mjs'),
    "export default {experimental: {iconSets: './icon-sets'}};\n",
  );
  for (const [file, text] of Object.entries(spec.modules ?? glyphsModules())) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
    fs.writeFileSync(path.join(dir, file), text);
  }
  const setDir = path.join(dir, 'icon-sets', /** @type {string} */ (set));
  fs.mkdirSync(setDir, {recursive: true});
  const doc = {
    type: 'icon-set',
    name: set,
    displayName: `Acme ${set}`,
    description: 'Hand-drawn test icons.',
    maintained: true,
    license: 'MIT',
    ...(spec.doc ?? {}),
  };
  if (spec.docSource !== null) {
    fs.writeFileSync(
      path.join(setDir, `${set}.doc.mjs`),
      spec.docSource ??
        `/** @type {import('@astryxdesign/cli/authoring').IconSetDoc} */\nexport default ${JSON.stringify(doc, null, 2)};\n`,
    );
  }
  const data =
    spec.data === undefined ? {...glyphsData(), module: name} : spec.data;
  if (data !== null) {
    fs.writeFileSync(
      path.join(setDir, `${set}.icons.json`),
      typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    );
  }
  if (spec.notice !== false) {
    fs.writeFileSync(path.join(setDir, 'LICENSE'), 'MIT License\n');
  }
  for (const [definition, source] of Object.entries(spec.definitions ?? {})) {
    const definitionsDir = path.join(setDir, 'definitions');
    fs.mkdirSync(definitionsDir, {recursive: true});
    fs.writeFileSync(
      path.join(definitionsDir, `${definition}.doc.mjs`),
      source,
    );
  }
}

/**
 * The source of one icon definition file.
 * @param {string} name
 * @param {{description?: string, words?: string[]}} [fields]
 */
export function definitionSource(name, fields = {}) {
  return `/** @type {import('@astryxdesign/cli/authoring').IconDefinitionDoc} */\nexport default ${JSON.stringify(
    {
      type: 'icon-definition',
      name,
      description: fields.description ?? `The ${name} icon.`,
      words: fields.words ?? [name.toLowerCase()],
    },
    null,
    2,
  )};\n`;
}

/**
 * Write a consuming project that declares (and installs) icon packages.
 * @param {string} root
 * @param {{packages?: IconPackageSpec[], config?: Record<string, unknown> | null}} [options]
 *   `config`: astryx.config.mjs contents; null for none
 * @returns {string} the project directory
 */
export function writeIconSetProject(root, options = {}) {
  const packages = options.packages ?? [{}];
  const project = path.join(root, 'app');
  fs.mkdirSync(project, {recursive: true});
  /** @type {Record<string, string>} */
  const dependencies = {};
  for (const spec of packages) {
    const name = spec.name ?? '@acme/glyphs';
    dependencies[name] = spec.version ?? '1.0.0';
    if (spec.install === false) continue;
    writeIconPackage(
      path.join(project, 'node_modules', ...name.split('/')),
      spec,
    );
  }
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'app', private: true, dependencies}, null, 2),
  );
  if (options.config) {
    fs.writeFileSync(
      path.join(project, 'astryx.config.mjs'),
      `export default ${JSON.stringify(options.config)};\n`,
    );
  }
  return project;
}
