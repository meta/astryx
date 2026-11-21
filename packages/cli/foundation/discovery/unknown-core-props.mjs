// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The props pages give Core components that the component does not
 *   take.
 * @input The props pages give Core components (core-props.mjs), a reader of
 *   each component's documented props, and the project's TypeScript.
 * @output Each prop the component does not take, with a documented prop that
 *   has the same words; or why the props were not checked.
 * @position Shared by `astryx doctor` (api/doctor/_adapter.mjs), which reads
 *   every page of the project, and `astryx experimental export`
 *   (api/render/_adapter.mjs), which reads the page it exports.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
export {OTHER_JSX_RUNTIME} from './core-elements.mjs';
import {projectAugmentations} from './core-augmentation-points.mjs';
import {
  findInstalledPackage,
  findPackageRoot,
  findWorkspaceRoot,
} from '../fs/paths.mjs';
import {
  listProjectSourceFiles,
  SOURCE_FILE_LIMIT,
} from '../fs/project-source-files.mjs';
import {compilerOptionsFor, projectMapsImport} from '../render/ts-paths.mjs';
import {nameWords, orderByAffinity} from '../text/suggest-order.mjs';
import {compareText} from '../text/compare-text.mjs';

/**
 * A TypeScript module that may widen what JSX gives every component: one
 * that augments React or the global scope (where `JSX` lives), or that loads
 * a library's `css` prop types.
 */
const JSX_DECLARATION =
  /\bdeclare\s+(?:module\s+['"]react(?:\/jsx-runtime)?['"]|global\b)|\bnamespace\s+JSX\b|styled-components\/cssprop|@emotion\/react\/types\/css-prop/;

/**
 * The JSX runtime other than React's that compiler options name: a
 * `jsxImportSource` other than `react`, or a `jsxFactory` other than
 * `React.createElement`. Null for React's.
 * @param {Record<string, unknown>} options
 * @returns {string | null}
 */
function otherJsxRuntime(options) {
  const {jsxImportSource: source, jsxFactory: factory} = options;
  if (typeof source === 'string' && source !== 'react') return source;
  if (typeof factory === 'string' && factory !== 'React.createElement')
    return factory;
  return null;
}

/**
 * A build config, by file name, that can set how JSX compiles: Babel, SWC,
 * Vite, Vitest, esbuild, webpack, Rspack, Rsbuild, Next.js or tsup.
 */
const BUILD_CONFIG =
  /^(?:\.babelrc(?:\.[cm]?js|\.json)?|babel\.config\.(?:[cm]?[jt]s|json)|\.swcrc|(?:vite|vitest|webpack|rspack|rsbuild|next|esbuild|tsup)\.config\.[cm]?[jt]s)$/;

/**
 * A build setting that compiles JSX other than as React does: a runtime
 * (`jsxImportSource`, `importSource`) other than `react`; a classic factory
 * (`jsxFactory`, `pragma`, a name such as `jsx` or `h`) other than
 * `React.createElement`; or Next.js's `styledComponents` compiler option,
 * which compiles a `css` prop, when it is not `false`.
 */
const BUILD_JSX_RUNTIME =
  /\b(?:jsxImportSource|importSource)['"]?\s*[:=]\s*['"](?!react['"])[^'"\s]+['"]|\b(?:jsxFactory|pragma)['"]?\s*[:=]\s*['"](?!React\.createElement['"])[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*['"]|\bstyledComponents['"]?\s*:(?!\s*false\b)/;

/**
 * The packages that compile a `css` prop at build time, whatever name the
 * build config gives them (Babel reads `styled-components` as
 * `babel-plugin-styled-components`): a config can use one only when the
 * project depends on it, or when it is installed through another package
 * (`gatsby-plugin-emotion` brings emotion's preset).
 */
const CSS_PROP_TRANSFORMS = new Set([
  '@emotion/babel-preset-css-prop',
  'gatsby-plugin-emotion',
  'babel-plugin-styled-components',
  '@swc/plugin-styled-components',
  '@compiled/babel-plugin',
  '@compiled/webpack-loader',
  '@compiled/vite-plugin',
  '@compiled/parcel-config',
  '@compiled/parcel-transformer',
]);

/**
 * What compiles the JSX of a page other than as React does, in the folder of
 * the page or a folder above it, up to the project's workspace root (as
 * `findWorkspaceRoot` reads it): a build config
 * that sets another runtime or factory (a config file, or the `babel` key of
 * a `package.json`), a `package.json` that depends on a transform that
 * compiles a `css` prop, or such a transform installed where the project
 * finds packages. Null when nothing does.
 * @param {string[]} pages
 * @param {string} projectDir
 * @returns {{file: string, transform: string | null, installed?: boolean} | null}
 *   the config, and the transform it depends on or has installed
 */
function buildJsxRuntime(pages, projectDir) {
  const top = findWorkspaceRoot(projectDir);
  /** @type {Map<string, {file: string, transform: string | null, installed?: boolean} | null>} */
  const configIn = new Map();
  const read = (/** @type {string} */ dir) => {
    /** @type {string[]} */
    let names;
    try {
      names = fs.readdirSync(dir).sort();
    } catch {
      return null;
    }
    for (const name of names) {
      const file = path.join(dir, name);
      /** @type {string | null} */
      let text = null;
      try {
        if (BUILD_CONFIG.test(name)) text = fs.readFileSync(file, 'utf-8');
        else if (name === 'package.json') {
          const manifest = JSON.parse(fs.readFileSync(file, 'utf-8'));
          for (const field of [
            'dependencies',
            'devDependencies',
            'peerDependencies',
            'optionalDependencies',
          ]) {
            const transform = Object.keys(manifest?.[field] ?? {}).find(
              dependency => CSS_PROP_TRANSFORMS.has(dependency),
            );
            if (transform) return {file, transform};
          }
          text =
            manifest?.babel == null ? null : JSON.stringify(manifest.babel);
        }
      } catch {
        continue;
      }
      if (text != null && BUILD_JSX_RUNTIME.test(text))
        return {file, transform: null};
    }
    return null;
  };
  for (const page of pages) {
    for (let dir = path.dirname(page); ; dir = path.dirname(dir)) {
      if (!configIn.has(dir)) configIn.set(dir, read(dir));
      const found = configIn.get(dir);
      if (found) return found;
      if (
        dir === top ||
        path.relative(top, dir).startsWith('..') ||
        dir === path.dirname(dir)
      )
        break;
    }
  }
  // A transform installed where a page finds packages: the project's own
  // folders, or a workspace member's.
  const pageDirs = [
    ...new Set([projectDir, ...pages.map(page => path.dirname(page))]),
  ];
  for (const transform of [...CSS_PROP_TRANSFORMS].sort()) {
    for (const dir of pageDirs) {
      const installed = findInstalledPackage(dir, transform, Infinity);
      if (installed) return {file: installed, transform, installed: true};
    }
  }
  return null;
}

/**
 * The configs TypeScript reads for the pages; pages that share a config
 * share one read.
 * @param {string[]} pages
 */
function readConfigs(pages) {
  /** @type {Map<string, {file: string, options: Record<string, unknown>}>} */
  const configs = new Map();
  /** @type {Map<string, string>} */
  const configOf = new Map();
  for (const file of pages) {
    const config = compilerOptionsFor(file) ?? {file: '', options: {}};
    configs.set(config.file, config);
    configOf.set(file, config.file);
  }
  return {configs, configOf};
}

/**
 * The configs TypeScript reads for the pages, or why their props are not
 * judged: a config or build that compiles JSX with another runtime, or a
 * `css` prop, can give every component props of its own.
 * @param {string[]} pages every page that imports Core
 * @param {string} projectDir
 * @returns {ReturnType<typeof readConfigs> | {skipped: string}}
 */
function jsxRuntimeCheck(pages, projectDir) {
  const read = readConfigs(pages);
  for (const {options} of read.configs.values()) {
    const runtime = otherJsxRuntime(options);
    if (runtime)
      return {
        skipped: `the project compiles JSX with \`${runtime}\`, which can give every component props of its own`,
      };
  }
  const build = buildJsxRuntime(pages, projectDir);
  if (build?.transform) {
    return {
      skipped: `${build.installed ? `\`${build.transform}\` is installed` : `the project depends on \`${build.transform}\``}, which compiles a \`css\` prop that every component can take`,
    };
  }
  if (build) {
    const shown = path
      .relative(projectDir, build.file)
      .split(path.sep)
      .join('/');
    return {
      skipped: `the build config \`${shown}\` sets another JSX runtime or compiles a \`css\` prop, which can give every component props of its own`,
    };
  }
  return read;
}

/**
 * For each component that Core's docs describe, its documented props as
 * `astryx component <Name> --props` prints them, read in batches from the
 * Core of the folder `cwd`. Doctor and the export read the docs through this
 * one reader.
 * @param {(names: string[], options: {cwd: string, package: string, props: boolean}) => Promise<unknown>} answer
 *   the component read (`component` of api/component), which this layer
 *   cannot import
 * @param {string[]} names
 * @param {string} cwd
 * @param {number} batchLimit the most components one read takes
 * @returns {Promise<Map<string, any[]>>}
 */
export async function readCoreDocs(answer, names, cwd, batchLimit) {
  /** @type {Map<string, any[]>} */
  const documented = new Map();
  for (let start = 0; start < names.length; start += batchLimit) {
    const batch = names.slice(start, start + batchLimit);
    const read = /** @type {any} */ (
      await answer(batch, {cwd, package: '@astryxdesign/core', props: true})
    );
    for (const each of read?.data?.results ?? []) {
      const props = each?.status === 'found' ? each.result?.data : null;
      if (Array.isArray(props)) documented.set(each.selector, props);
    }
  }
  return documented;
}

/**
 * The names of a component's documented props, as `readCoreDocs` gives them.
 * @param {any[]} props
 * @returns {string[]}
 */
export function propNamesOf(props) {
  return props.map(prop => prop?.name).filter(Boolean);
}

/**
 * @typedef {import('./core-props.mjs').CorePropUse & {file: string, path: string}} PageCorePropUse
 *   a prop a page gives a Core component, with the page as the caller shows
 *   it (`file`) and its absolute path
 */

/**
 * @typedef {object} UnknownCoreProp
 * @property {string} file as the caller shows it
 * @property {number} line
 * @property {number} column
 * @property {string} component
 * @property {string} prop
 * @property {string | null} suggestion a documented prop with the same
 *   words, when there is one
 */

/**
 * The files of a project that may widen what JSX gives every component (see
 * `JSX_DECLARATION`); null when the project has more source files than the
 * walk reads, since a declaration beyond them could add a prop to every
 * component.
 * @param {string} projectDir
 * @returns {string[] | null}
 */
function jsxDeclarationFiles(projectDir) {
  const files = listProjectSourceFiles(projectDir, '');
  if (files.length >= SOURCE_FILE_LIMIT) return null;
  return files.filter(file => {
    try {
      return widensJsx(file, fs.readFileSync(file, 'utf-8'));
    } catch {
      return false;
    }
  });
}

/**
 * Whether a TypeScript module may widen what JSX gives every component (see
 * `JSX_DECLARATION`). Doctor, which reads each file once, asks it of every
 * file it reads.
 * @param {string} file
 * @param {string} text
 */
export function widensJsx(file, text) {
  return /\.[cm]?tsx?$/.test(file) && JSX_DECLARATION.test(text);
}

/**
 * The props pages give Core components that the component does not take. A
 * prop is a candidate when Core's docs for the component (the props
 * `astryx component <Name> --package @astryxdesign/core` lists) leave it out,
 * and it is reported only when TypeScript, reading Core's own published types
 * as the pages see them, says the component's props do not take it either;
 * the project's own modules that widen React's JSX are read with Core's
 * types. A prop name React's types give an HTML or SVG element is never
 * reported, since a component may pass it on to the element it renders, and
 * neither is a prop JSX gives every component. A component with no docs, one
 * TypeScript cannot read, a generic one, and a page whose config or build
 * compiles JSX with another runtime or a `css` prop are not judged. Each page
 * is judged with the config TypeScript reads for it. Only the docs are read
 * while every prop is documented: TypeScript, configs and the project's
 * files are read for candidates alone. `skipped` says why the candidates
 * were not judged.
 * @param {object} input
 * @param {string} input.projectDir the folder of the pages' project
 * @param {PageCorePropUse[]} input.uses
 * @param {string[]} input.pages every page that imports Core, the pages of
 *   `uses` among them
 * @param {(names: string[], cwd: string) => Promise<Map<string, any[]>>} input.readDocs
 *   for each component the docs describe, its documented props (`readCoreDocs`),
 *   read from the Core of the folder `cwd`
 * @param {() => {ts: any} | {skipped: string}} input.typescript the
 *   compiler to read Core's types with, or why there is none
 * @param {() => string[] | null} [input.jsxDeclarations] the files that may
 *   widen what JSX gives every component (`jsxDeclarationFiles` by default)
 * @param {boolean} [input.runtimeFirst] check the pages' JSX runtime
 *   (`jsxRuntimeCheck`) before the docs, so a project on another runtime is
 *   reported as not checked whatever its props are; by default it is checked
 *   for candidates alone
 * @returns {Promise<{found: UnknownCoreProp[], skipped: string | null}>}
 */
export async function judgeCoreProps({
  projectDir,
  uses,
  pages,
  readDocs,
  typescript,
  jsxDeclarations,
  runtimeFirst = false,
}) {
  const notChecked = (/** @type {string} */ reason) => ({
    found: [],
    skipped: `${reason}, so the props were not checked.`,
  });
  // Each page is read as TypeScript reads it, with Core and React found from
  // the page's own folder.
  /** @type {Map<string, string | null>} */
  const coreFrom = new Map();
  const coreDirFrom = (/** @type {string} */ dir) => {
    if (!coreFrom.has(dir)) {
      const found = findInstalledPackage(dir, '@astryxdesign/core', Infinity);
      let real = found;
      try {
        real = found ? fs.realpathSync(found) : null;
      } catch {
        // A Core folder that does not resolve is read where it is found.
      }
      coreFrom.set(dir, real);
    }
    return coreFrom.get(dir) ?? null;
  };
  // Pages that import Core and find no installed Core have no types to read.
  if (
    pages.length > 0 &&
    pages.every(page => !coreDirFrom(path.dirname(page)))
  ) {
    return notChecked(
      'Core is not installed where the pages that import it can find it',
    );
  }
  const early = runtimeFirst ? jsxRuntimeCheck(pages, projectDir) : null;
  if (early && 'skipped' in early) return notChecked(early.skipped);
  // Batched reads of the props the docs of each Core list, as
  // `astryx component <Name> --props` prints them; a component they do not
  // describe is not judged.
  /** @type {Map<string, {from: string, uses: PageCorePropUse[]}>} */
  const byCore = new Map();
  for (const use of uses) {
    const from = path.dirname(use.path);
    const coreDir = coreDirFrom(from);
    if (!coreDir) continue;
    const group =
      byCore.get(coreDir) ??
      /** @type {any} */ (byCore.set(coreDir, {from, uses: []}).get(coreDir));
    group.uses.push(use);
  }
  /** @type {Map<string, Map<string, string[]>>} */
  const documentedBy = new Map();
  /** @type {PageCorePropUse[]} */
  const candidates = [];
  for (const [coreDir, group] of byCore) {
    const documented = await readDocs(
      [...new Set(group.uses.map(use => use.component))],
      group.from,
    );
    documentedBy.set(
      coreDir,
      new Map(
        [...documented].map(([name, props]) => [name, propNamesOf(props)]),
      ),
    );
    for (const use of group.uses) {
      const props = documentedBy.get(coreDir)?.get(use.component);
      if (props != null && !props.includes(use.prop)) candidates.push(use);
    }
  }
  // A page whose config maps a Core module path elsewhere (`paths`) reads
  // another module, so it is not judged.
  const judged = candidates.filter(
    use => !projectMapsImport(use.source, use.path),
  );
  if (judged.length === 0) return {found: [], skipped: null};
  const config = early ?? jsxRuntimeCheck(pages, projectDir);
  if ('skipped' in config) return notChecked(config.skipped);
  const {configs, configOf} = config;
  const compiler = typescript();
  if (!('ts' in compiler)) return {found: [], skipped: compiler.skipped};
  const declarations = (
    jsxDeclarations ?? (() => jsxDeclarationFiles(projectDir))
  )();
  if (declarations === null)
    return notChecked('the project has more source files than are read');
  /** @type {Map<string, {configFile: string, coreDir: string, from: string, uses: PageCorePropUse[]}>} */
  const groups = new Map();
  for (const use of judged) {
    const from = path.dirname(use.path);
    const coreDir = /** @type {string} */ (coreDirFrom(from));
    const configFile = configOf.get(use.path) ?? '';
    const key = `${configFile}\0${coreDir}`;
    const group =
      groups.get(key) ??
      /** @type {any} */ (
        groups.set(key, {configFile, coreDir, from, uses: []}).get(key)
      );
    group.uses.push(use);
  }
  // Core's types are read for candidates alone.
  const {readCorePropTypes} = await import('./core-prop-types.mjs');
  /** @type {UnknownCoreProp[]} */
  const found = [];
  for (const group of groups.values()) {
    const documented = documentedBy.get(group.coreDir) ?? new Map();
    // What augments Core for a page: the project's files and installed
    // packages, and those of the page's own package, as a workspace member
    // installs its own.
    const memberDir = findPackageRoot(group.from) ?? projectDir;
    const reads = [projectAugmentations(projectDir, group.uses[0].path)];
    if (memberDir !== projectDir)
      reads.push(projectAugmentations(memberDir, group.uses[0].path));
    if (reads.some(read => !read.complete))
      return notChecked(
        "the files that may add to Core's types could not all be read",
      );
    const augmentations = [...new Set(reads.flatMap(read => read.files))];
    /** @type {Map<string, Set<string>>} */
    const asked = new Map();
    /** @type {Map<string, string>} */
    const sources = new Map();
    for (const use of group.uses) {
      (
        asked.get(use.component) ??
        asked.set(use.component, new Set()).get(use.component)
      )?.add(use.prop);
      if (!sources.has(use.component)) sources.set(use.component, use.source);
    }
    const types = readCorePropTypes({
      ts: compiler.ts,
      projectDir: group.from,
      configDir: group.configFile ? path.dirname(group.configFile) : group.from,
      options: configs.get(group.configFile)?.options ?? {},
      augmentations: [...augmentations, ...declarations],
      props: asked,
      sources,
      configFile: group.configFile || undefined,
    });
    if (types.unread) return notChecked(types.unread);
    for (const use of group.uses) {
      if (
        types.attributes.has(use.prop) ||
        types.takes.get(use.component)?.get(use.prop) !== false
      )
        continue;
      const {path: _file, source: _source, ...report} = use;
      found.push({
        ...report,
        suggestion: closestProp(use.prop, documented.get(use.component) ?? []),
      });
    }
  }
  found.sort(
    (a, b) =>
      compareText(a.file, b.file) || a.line - b.line || a.column - b.column,
  );
  return {found, skipped: null};
}

/**
 * The documented prop a name means, when one has the same words: in another
 * order or case, with a plural `s`, or with the `is` or `has` that Core puts
 * in front of a yes-or-no prop (`isLabelHidden` for `labelHidden`,
 * `startIcon` for `iconStart`). Words are read as a failed lookup reads them.
 * A name with another word, or a near spelling, can mean something else
 * (`padding` for `paddingX`, `maxWidth` for `minWidth`), so it is not
 * offered. Null when no prop has the same words.
 * @param {string} name
 * @param {string[]} props
 * @returns {string | null}
 */
function closestProp(name, props) {
  const key = (/** @type {string} */ text) =>
    nameWords(text)
      .filter(word => word !== 'is' && word !== 'has')
      .map(word => (word.length > 3 ? word.replace(/s$/, '') : word))
      .sort()
      .join(' ');
  const wanted = key(name);
  return (
    orderByAffinity(name, props, prop => [prop]).find(
      prop => prop !== name && key(prop) === wanted,
    ) ?? null
  );
}
