// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compiler inputs — every authored descriptor a project reads, listed once.
 *
 * @input A loaded Project: the components, hooks, templates, themes, and doc
 *   topics its discovery found, plus the CLI's own self-documentation.
 * @output One {@link DocInput} per descriptor file, in read order, and the
 *   problems found while listing them: a file two roots both claim, or two
 *   files under one input id.
 * @position Between discovery and the doc compiler. Discovery still decides
 *   what each root contributes; this module lists that result in one shape so
 *   the compiler and the completeness check read the same set. Internal to the
 *   CLI: nothing here is a public type, and an input id is not a published
 *   identifier.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CORE_PACKAGE,
  findComponentReadme,
} from '../discovery/component-discovery.mjs';
import {discoverHooks, findHookDoc} from '../discovery/hook-discovery.mjs';
import {themeImportPackage} from '../discovery/theme-discovery.mjs';
import {astryxIconDefinitions} from '../discovery/icon-definition-discovery.mjs';
import {CLI_ROOT, findCoreDir} from '../fs/paths.mjs';
import {packageSource} from './source.mjs';
import {treeDocFiles} from './tree.mjs';

export {packageSource};

/** The package that owns the CLI's own self-documentation. */
const CLI_PACKAGE = '@astryxdesign/cli';

/** Where the CLI keeps self-documentation, relative to its package root. */
export const SELF_DOC_TREES = ['api', 'clients', 'authoring', 'foundation'];

/** Directories that hold test inputs, never shipped descriptors. */
const NON_DESCRIPTOR_DIRS = new Set([
  '__tests__',
  '__fixtures__',
  'fixtures',
  'node_modules',
]);

/**
 * @typedef {'components' | 'hooks' | 'templates' | 'themes' | 'icon-definitions' | 'docs' | 'self-docs' | 'tree'} DocRoot
 */

/**
 * One authored descriptor, as the compiler will read it.
 * @typedef {object} DocInput
 * @property {string} id `owner:root:name`, unique within a project
 * @property {DocRoot} root the kind of root that reads it
 * @property {string} name the name a reader asks for
 * @property {string} owner the package that contributes it, as discovery
 *   reports it
 * @property {string} file absolute path; never leaves the CLI
 * @property {string} source `<package>/<path inside it>` for the file itself:
 *   where it ships, independent of the machine it was found on
 * @property {'base' | 'extension'} [role] for a doc topic: its own file, or an
 *   extension merged onto it
 * @property {false} [listed] a component doc that `component <Name>` reads but
 *   the component list leaves out
 */

/**
 * @typedef {object} DocInputProblem
 * @property {'duplicate_file' | 'duplicate_id'} code
 * @property {string} provider the package of the input that was not added
 * @property {string} source `<package>/<path>` of its file
 * @property {string} message
 */

/**
 * List every descriptor the project reads.
 *
 * @param {import('../config/project.mjs').Project} project
 * @returns {Promise<{inputs: DocInput[], problems: DocInputProblem[]}>}
 */
export async function collectDocInputs(project) {
  const list = new InputList();

  // A component documented as a member of its family's doc (HStack and VStack
  // in Stack's doc) is read through the family's own entry: one descriptor,
  // one reader. Own docs go first so the family keeps its name.
  /** @type {Array<{name: string, package: string, docPath: string}>} */
  const ownDocs = [];
  /** @type {Array<{name: string, package: string, docPath: string}>} */
  const familyDocs = [];
  for (const record of await project.components()) {
    if (record.docPath == null) continue;
    const stem = path
      .basename(record.docPath)
      .replace(/\.doc\.[cm]?[jt]s$/u, '')
      .replace(/^XDS/u, '');
    const entry = {
      name: record.name,
      package: record.package,
      docPath: record.docPath,
    };
    (stem === record.name ? ownDocs : familyDocs).push(entry);
  }
  for (const record of ownDocs) {
    list.add('components', record.name, record.package, record.docPath);
  }
  for (const record of familyDocs) {
    if (list.claims(record.docPath)) continue;
    list.add('components', record.name, record.package, record.docPath);
  }

  const coreDir =
    typeof project.coreDir === 'function'
      ? project.coreDir()
      : findCoreDir(project.cwd);
  if (coreDir != null) {
    for (const name of Object.values(discoverHooks(coreDir)).flat()) {
      const file = findHookDoc(coreDir, name);
      if (file != null) list.add('hooks', name, CORE_PACKAGE, file);
    }
    // `component <Name>` finds a core doc by its file name even when the
    // component list, which needs a same-stem source, leaves it out.
    for (const {name, file} of unlistedCoreComponentDocs(coreDir, list)) {
      list.add('components', name, CORE_PACKAGE, file, undefined, false);
    }
  }

  // A template is looked up by its type and directory name; its display name
  // is only a title, and a showcase can share it with the block it shows.
  for (const template of /** @type {any[]} */ (await project.templates())) {
    list.add(
      'templates',
      `${template.type}/${template.dirName}`,
      template.package ?? CORE_PACKAGE,
      template.docPath,
    );
  }

  for (const theme of await project.themes()) {
    list.add('themes', theme.slug, themeImportPackage(theme), theme.docPath);
  }

  // Icon definitions: Astryx's, then each installed set's own.
  for (const {doc, file} of astryxIconDefinitions().definitions) {
    list.add('icon-definitions', doc.name, CLI_PACKAGE, file);
  }
  for (const set of (await project.iconSets()).sets) {
    for (const {doc, file} of set.definitions) {
      list.add(
        'icon-definitions',
        `${set.name}/${doc.name}`,
        set.package,
        file,
      );
    }
  }

  for (const topic of (await project.docs()).entries()) {
    list.add('docs', topic.name, topic.package, topic.path, 'base');
    for (const extension of topic.extensions) {
      list.add(
        'docs',
        topic.name,
        extension.package,
        extension.path,
        'extension',
      );
    }
  }

  // The docs tree's own files: its namespaces and the guides it places.
  for (const file of treeDocFiles()) {
    list.add('tree', path.basename(file, '.doc.mjs'), CLI_PACKAGE, file);
  }
  for (const file of selfDocFiles()) {
    const name = path
      .relative(CLI_ROOT, file)
      .split(path.sep)
      .join('/')
      .replace(/\.doc\.mjs$/u, '');
    list.add('self-docs', name, CLI_PACKAGE, file);
  }

  return {inputs: list.inputs, problems: list.problems};
}

/**
 * Core component docs outside the component list that `component <Name>`
 * still reads: every core doc, outside the hooks directory, that is not listed
 * yet and that its own file name resolves back to.
 *
 * @param {string} coreDir
 * @param {InputList} list the inputs so far
 * @returns {Array<{name: string, file: string}>}
 */
function unlistedCoreComponentDocs(coreDir, list) {
  const srcDir = path.join(coreDir, 'src');
  const hooksDir = path.join(srcDir, 'hooks');
  /** @type {Array<{name: string, file: string}>} */
  const found = [];
  /** @param {string} dir */
  const walk = dir => {
    const entries = fs
      .readdirSync(dir, {withFileTypes: true})
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full !== hooksDir && !NON_DESCRIPTOR_DIRS.has(entry.name)) {
          walk(full);
        }
      } else if (entry.isFile() && entry.name.endsWith('.doc.mjs')) {
        if (list.claims(full)) continue;
        const name = entry.name.slice(0, -'.doc.mjs'.length);
        const resolved = findComponentReadme(coreDir, name);
        if (resolved != null && realPath(resolved) === realPath(full)) {
          found.push({name, file: full});
        }
      }
    }
  };
  if (fs.existsSync(srcDir)) walk(srcDir);
  return found;
}

/**
 * Every self-documentation file the CLI ships, in path order.
 * @returns {string[]} absolute paths
 */
export function selfDocFiles() {
  /** @type {string[]} */
  const files = [];
  /** @param {string} dir */
  const walk = dir => {
    const entries = fs
      .readdirSync(dir, {withFileTypes: true})
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!NON_DESCRIPTOR_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.doc.mjs')) {
        files.push(full);
      }
    }
  };
  for (const tree of SELF_DOC_TREES) {
    const dir = path.join(CLI_ROOT, tree);
    if (fs.existsSync(dir)) walk(dir);
  }
  return files;
}

/** Collects inputs in read order and records what could not be added. */
class InputList {
  /** @type {DocInput[]} */
  inputs = [];
  /** @type {DocInputProblem[]} */
  problems = [];
  /** @type {Map<string, DocInput>} real path -> the input that claimed it */
  #byFile = new Map();
  /** @type {Map<string, DocInput>} */
  #byId = new Map();

  /**
   * @param {string} file
   * @returns {boolean} whether an input already reads this file
   */
  claims(file) {
    return this.#byFile.has(realPath(file));
  }

  /**
   * @param {DocRoot} root
   * @param {string} name
   * @param {string} owner
   * @param {string} file
   * @param {'base' | 'extension'} [role]
   * @param {false} [listed]
   */
  add(root, name, owner, file, role, listed) {
    const real = realPath(file);
    const claimed = this.#byFile.get(real);
    if (claimed != null) {
      this.problems.push({
        code: 'duplicate_file',
        provider: owner,
        source: packageSource(real),
        message: `${packageSource(real)} is read as ${root} "${name}" and as ${claimed.root} "${claimed.name}"; one descriptor must have one reader.`,
      });
      return;
    }
    // An extension is named by its file too: one package may extend a topic
    // from more than one file.
    const id =
      role === 'extension'
        ? `${owner}:${root}:${name}+${path.basename(file).replace(/\.doc\.[cm]?[jt]s$/u, '')}`
        : `${owner}:${root}:${name}`;
    const taken = this.#byId.get(id);
    if (taken != null) {
      this.problems.push({
        code: 'duplicate_id',
        provider: owner,
        source: packageSource(real),
        message: `${packageSource(real)} and ${taken.source} both read as ${root} "${name}" from ${owner}.`,
      });
      return;
    }
    /** @type {DocInput} */
    const input = {
      id,
      root,
      name,
      owner,
      file: real,
      source: packageSource(real),
      ...(role == null ? {} : {role}),
      ...(listed === false ? {listed} : {}),
    };
    this.#byFile.set(real, input);
    this.#byId.set(id, input);
    this.inputs.push(input);
  }
}

/** @param {string} file */
function realPath(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
}
