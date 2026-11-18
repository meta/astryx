// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which props Core's own types let a component take, read with the
 *   project's TypeScript.
 * @input The project's TypeScript compiler, the project folder, the files
 *   that augment Core, and the props to judge for each Core component.
 * @output For each component TypeScript can read, whether its props type
 *   takes each prop; the names of the HTML, SVG, DOM and ARIA attributes
 *   React's types know; or why the types could not be read.
 * @position Read by `astryx doctor` (api/doctor/_adapter.mjs) for the props a
 *   page gives Core components that Core's docs do not list.
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {propsTypeTakes} from './prop-drift.mjs';

/** The module TypeScript reads Core's types from, as the app imports them. */
const CORE_PACKAGE = '@astryxdesign/core';

/**
 * For each component a Core subpath exports, the subpath: its types are a
 * small part of Core's, which TypeScript reads far faster than the whole
 * package. Read from the package's `exports` and each subpath's own
 * declarations; empty when the project has no Core installed.
 * @param {string} projectDir
 * @returns {Map<string, string>}
 */
function subpathsByComponent(projectDir) {
  /** @type {Map<string, string>} */
  const subpaths = new Map();
  /** @type {any} */
  let manifest;
  /** @type {string} */
  let coreDir;
  try {
    const file = createRequire(path.join(projectDir, 'package.json')).resolve(`${CORE_PACKAGE}/package.json`);
    coreDir = path.dirname(file);
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return subpaths;
  }
  for (const [key, target] of Object.entries(manifest?.exports ?? {})) {
    const types = /** @type {any} */ (target)?.types;
    if (!/^\.\/[A-Z]\w*$/.test(key) || typeof types !== 'string') continue;
    let text;
    try {
      text = fs.readFileSync(path.join(coreDir, types), 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
      for (const part of match[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name && /^[A-Z]/.test(name) && !subpaths.has(name)) subpaths.set(name, `${CORE_PACKAGE}/${key.slice(2)}`);
      }
    }
  }
  return subpaths;
}

/**
 * A module that exists only for this read: it names each component's props
 * type, imported from the module that declares it, and the attributes React's
 * element types take.
 * @param {string[]} components
 * @param {Map<string, string>} modules each component's module
 */
function queryText(components, modules) {
  const imports = components.map((name, i) => `import type {${name} as Component${i}Value} from '${modules.get(name) ?? CORE_PACKAGE}';`);
  return [
    ...imports,
    "import type {AllHTMLAttributes, ComponentProps, SVGAttributes} from 'react';",
    'export type Attributes = AllHTMLAttributes<HTMLElement> & SVGAttributes<SVGElement>;',
    ...components.flatMap((_, i) => [
      `export type Component${i} = typeof Component${i}Value;`,
      `export type Props${i} = ComponentProps<typeof Component${i}Value>;`,
    ]),
    '',
  ].join('\n');
}

/**
 * @param {any} ts
 * @param {any} type
 */
const unreadable = (ts, type) => (type.flags & ts.TypeFlags.Any) !== 0;

/**
 * Whether a component is generic: its props may come from a type argument the
 * page gives it, which no fixed props type holds.
 * @param {any} ts
 * @param {any} checker
 * @param {any} type the component's own type
 */
function isGeneric(ts, checker, type) {
  return [ts.SignatureKind.Call, ts.SignatureKind.Construct].some(kind =>
    checker.getSignaturesOfType(type, kind).some((/** @type {any} */ signature) => (signature.typeParameters?.length ?? 0) > 0),
  );
}

/**
 * @typedef {object} CorePropTypes
 * @property {Map<string, Map<string, boolean>>} takes for each component
 *   whose props type TypeScript reads, whether it takes each prop asked about
 * @property {Set<string>} attributes the attribute names React's HTML and SVG
 *   element types take, DOM events and ARIA included
 * @property {string | null} unread why the types could not be read, or null
 */

/**
 * Read Core's own published types with the project's TypeScript, as the
 * project's pages see them: Core and React resolved from the project folder,
 * each component from the Core subpath that exports it, with the files that
 * augment Core's modules read too. Nothing is written: the module that names
 * the types exists only in memory. A component whose type TypeScript cannot
 * read, or that is generic, is left out of `takes`.
 * @param {object} input
 * @param {any} input.ts the project's TypeScript compiler
 * @param {string} input.projectDir
 * @param {string[]} input.augmentations files that augment Core
 * @param {Map<string, Set<string>>} input.props for each component, the props to judge
 * @returns {CorePropTypes}
 */
export function readCorePropTypes({ts, projectDir, augmentations, props}) {
  const components = [...props.keys()];
  const file = path.join(projectDir, '__astryx_core_props__.ts');
  const text = queryText(components, subpathsByComponent(projectDir));
  const options = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    types: [],
  };
  const host = ts.createCompilerHost(options, true);
  const getSourceFile = host.getSourceFile;
  host.getSourceFile = (/** @type {string} */ name, /** @type {any} */ language, ...rest) =>
    path.resolve(name) === file ? ts.createSourceFile(file, text, language, true) : getSourceFile.call(host, name, language, ...rest);
  const fileExists = host.fileExists;
  host.fileExists = (/** @type {string} */ name) => path.resolve(name) === file || fileExists.call(host, name);
  const readFile = host.readFile;
  host.readFile = (/** @type {string} */ name) => (path.resolve(name) === file ? text : readFile.call(host, name));
  const program = ts.createProgram({rootNames: [file, ...augmentations], options, host});
  const checker = program.getTypeChecker();
  /** @type {Map<string, any>} */
  const aliases = new Map();
  for (const statement of program.getSourceFile(file)?.statements ?? []) {
    if (ts.isTypeAliasDeclaration(statement)) {
      aliases.set(statement.name.text, checker.getTypeAtLocation(statement.name));
    }
  }
  /** @type {Map<string, Map<string, boolean>>} */
  const takes = new Map();
  const attributesType = aliases.get('Attributes');
  if (!attributesType || unreadable(ts, attributesType)) {
    return {takes, attributes: new Set(), unread: "TypeScript could not read React's types from this project"};
  }
  const attributes = new Set(checker.getPropertiesOfType(attributesType).map((/** @type {any} */ symbol) => symbol.getName()));
  let readAny = false;
  components.forEach((name, i) => {
    const own = aliases.get(`Component${i}`);
    const propsType = aliases.get(`Props${i}`);
    if (!own || !propsType || unreadable(ts, own) || unreadable(ts, propsType)) return;
    readAny = true;
    if (isGeneric(ts, checker, own)) return;
    /** @type {Map<string, boolean>} */
    const verdicts = new Map();
    for (const prop of props.get(name) ?? []) verdicts.set(prop, propsTypeTakes(ts, checker, propsType, prop));
    takes.set(name, verdicts);
  });
  if (components.length > 0 && !readAny) {
    return {takes, attributes, unread: `TypeScript could not read ${CORE_PACKAGE}'s types from this project`};
  }
  return {takes, attributes, unread: null};
}
