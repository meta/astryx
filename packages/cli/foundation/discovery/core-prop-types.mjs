// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which props Core's own types let a component take, read with the
 *   project's TypeScript.
 * @input The project's TypeScript compiler, the project folder, the pages'
 *   compiler options, the files that augment Core or React's JSX, and the
 *   props to judge for each Core component.
 * @output For each component TypeScript can read, whether its props type
 *   takes each prop; the prop names React's types give HTML and SVG elements
 *   and every component; or why the types could not be read.
 * @position Read by `astryx doctor` (api/doctor/_adapter.mjs) for the props a
 *   page gives Core components that Core's docs do not list.
 */

import * as path from 'node:path';
import {propsTypeTakes} from './prop-drift.mjs';

/** The module TypeScript reads Core's types from, as the app imports them. */
const CORE_PACKAGE = '@astryxdesign/core';

/**
 * A module that exists only for this read: it names Core's main module and
 * each component, imported from the module path a page imports it from (a
 * component such as `ToastViewport` is exported only by its subpath); the
 * HTML and SVG elements React's types know, whose prop names the read lists;
 * and what JSX gives every component (`React.JSX`, or the global `JSX` of
 * older React types), which a project's own declarations can widen (a `css`
 * prop).
 * @param {string[]} components
 * @param {Map<string, string>} sources each component's module path
 */
function queryText(components, sources) {
  const imports = components.map((name, i) => `import type {${name} as Component${i}Value} from '${sources.get(name) ?? CORE_PACKAGE}';`);
  return [
    `import type * as CoreModule from '${CORE_PACKAGE}';`,
    'export type Core = typeof CoreModule;',
    ...imports,
    "import type * as React from 'react';",
    'export type Elements = React.JSX.IntrinsicElements;',
    'export type GlobalElements = JSX.IntrinsicElements;',
    'export type Everywhere = React.JSX.IntrinsicAttributes & React.JSX.IntrinsicClassAttributes<unknown>;',
    'export type GlobalEverywhere = JSX.IntrinsicAttributes & JSX.IntrinsicClassAttributes<unknown>;',
    ...components.flatMap((_, i) => [
      `export type Component${i} = typeof Component${i}Value;`,
      `export type Props${i} = React.ComponentProps<typeof Component${i}Value>;`,
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
 * A config as TypeScript's own config reader gives it to a program through
 * `extends`: its compiler options, module resolution included (`paths`,
 * `baseUrl` and the folder `paths` resolve from, `moduleResolution`,
 * `customConditions`, `rootDirs` and the rest), and the files it includes,
 * which may declare global types that a file that augments Core uses. The
 * read hands both to TypeScript's program, so they come from the reader that
 * program trusts. Null with no config, or one TypeScript cannot read.
 * @param {any} ts
 * @param {string | undefined} configFile
 * @returns {{options: Record<string, unknown>, fileNames: string[]} | null}
 */
function readConfig(ts, configFile) {
  if (!configFile) return null;
  try {
    const parsed = ts.getParsedCommandLineOfConfigFile(configFile, {}, {...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {}});
    return parsed ? {options: parsed.options, fileNames: parsed.fileNames ?? []} : null;
  } catch {
    return null;
  }
}

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
 * @property {Set<string>} attributes the prop names React's types give HTML
 *   and SVG elements, DOM events and ARIA attributes included, and the props
 *   JSX gives every component
 * @property {string | null} unread why the types could not be read, or null
 */

/**
 * Read Core's own published types with the project's TypeScript, as the
 * project's pages see them: Core and React resolved from the project folder,
 * each component from the module path a page imports it from, with the files that
 * augment Core's modules or React's JSX read too, and the type packages the
 * pages' config names (`types` and `typeRoots`; every package under the
 * type roots when it names none, as TypeScript reads them). Nothing is
 * written: the module that names the types exists only in memory. A
 * component whose type TypeScript cannot read, or that is generic, is left
 * out of `takes`.
 * @param {object} input
 * @param {any} input.ts the project's TypeScript compiler
 * @param {string} input.projectDir the folder of the pages, from which
 *   TypeScript finds Core and React for them
 * @param {string} input.configDir the folder of the pages' config, which the
 *   default type roots are found from
 * @param {Record<string, unknown>} input.options the pages' compiler options,
 *   as their config writes them, with `typeRoots` absolute
 * @param {string[]} input.augmentations files that augment Core or React's JSX
 * @param {Map<string, Set<string>>} input.props for each component, the props to judge
 * @param {Map<string, string>} [input.sources] for each component, the module
 *   path a page imports it from (Core's main module when none is given)
 * @param {string} [input.configFile] the pages' config, whose options
 *   TypeScript resolves the augmenting files' imports with
 * @returns {CorePropTypes}
 */
export function readCorePropTypes({ts, projectDir, configDir, options: configOptions, augmentations, props, sources = new Map(), configFile}) {
  const components = [...props.keys()];
  const file = path.join(projectDir, '__astryx_core_props__.ts');
  const text = queryText(components, sources);
  const strings = (/** @type {unknown} */ list) =>
    Array.isArray(list) ? list.filter(entry => typeof entry === 'string') : undefined;
  // The pages' config as TypeScript reads it, so every import of a file that
  // augments Core resolves as it does for the project, and every global type
  // the project declares is there; a page with no config, or a config that
  // sets neither `module` nor `moduleResolution`, gets a bundler's resolution.
  const config = readConfig(ts, configFile);
  const fromConfig = config?.options ?? null;
  const options = fromConfig
    ? {
        ...fromConfig,
        noEmit: true,
        skipLibCheck: true,
        ...(fromConfig.module == null && fromConfig.moduleResolution == null
          ? {module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler}
          : {}),
      }
    : {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2022,
        types: strings(configOptions.types),
        typeRoots: strings(configOptions.typeRoots),
      };
  const host = ts.createCompilerHost(options, true);
  const {getSourceFile, fileExists, readFile} = host;
  // The default type roots are the `node_modules/@types` folders above the
  // config, as TypeScript finds them for the project.
  host.getCurrentDirectory = () => configDir;
  /**
   * @param {string} name
   * @param {any} language
   * @param {...any} rest
   */
  host.getSourceFile = (name, language, ...rest) =>
    path.resolve(name) === file ? ts.createSourceFile(file, text, language, true) : getSourceFile.call(host, name, language, ...rest);
  host.fileExists = (/** @type {string} */ name) => path.resolve(name) === file || fileExists.call(host, name);
  host.readFile = (/** @type {string} */ name) => (path.resolve(name) === file ? text : readFile.call(host, name));
  const rootNames = [...new Set([file, ...augmentations, ...(config?.fileNames ?? [])])];
  const program = ts.createProgram({rootNames, options, host});
  const checker = program.getTypeChecker();
  /** @type {Map<string, any>} */
  const aliases = new Map();
  const source = program.getSourceFile(file);
  for (const statement of source?.statements ?? []) {
    if (ts.isTypeAliasDeclaration(statement)) {
      aliases.set(statement.name.text, checker.getTypeAtLocation(statement.name));
    }
  }
  /** @type {Map<string, Map<string, boolean>>} */
  const takes = new Map();
  // Named members only: an element the project declares with `any` props, or
  // a catch-all index entry, names no attribute and must not hide the rest.
  /** @type {Set<string>} */
  const attributes = new Set();
  const elements = [aliases.get('Elements'), aliases.get('GlobalElements')].find(type => type && !unreadable(ts, type));
  for (const element of elements ? checker.getPropertiesOfType(elements) : []) {
    const type = checker.getTypeOfSymbolAtLocation(element, source);
    if (unreadable(ts, type)) continue;
    for (const attribute of checker.getPropertiesOfType(type)) attributes.add(attribute.getName());
  }
  const everywhere = [aliases.get('Everywhere'), aliases.get('GlobalEverywhere')].find(type => type && !unreadable(ts, type));
  for (const each of everywhere ? checker.getPropertiesOfType(everywhere) : []) attributes.add(each.getName());
  // A string index on what JSX gives every component takes every name.
  const takesEveryName = everywhere != null && checker.getIndexInfoOfType(everywhere, ts.IndexKind.String) != null;
  if (attributes.size === 0) {
    return {takes, attributes, unread: "TypeScript could not read React's types from this project"};
  }
  // Core's types are unread only when its main module does not load; a
  // component whose own type TypeScript cannot read is not judged.
  const core = aliases.get('Core');
  if (!core || unreadable(ts, core)) {
    return {takes, attributes, unread: `TypeScript could not read ${CORE_PACKAGE}'s types from this project`};
  }
  components.forEach((name, i) => {
    const own = aliases.get(`Component${i}`);
    const propsType = aliases.get(`Props${i}`);
    if (!own || !propsType || unreadable(ts, own) || unreadable(ts, propsType)) return;
    if (isGeneric(ts, checker, own)) return;
    /** @type {Map<string, boolean>} */
    const verdicts = new Map();
    for (const prop of props.get(name) ?? []) verdicts.set(prop, takesEveryName || propsTypeTakes(ts, checker, propsType, prop));
    takes.set(name, verdicts);
  });
  return {takes, attributes, unread: null};
}
