// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor's audits of the CLI's own shipped files, stored at publish.
 * @input assets/self-audit.generated.json, written at `prepack` by
 *   scripts/generate-self-audit.mjs: for each audit, the value it found and
 *   the state of every file and folder it read.
 * @output `storedSelfAudit(name)`: the stored value while the package version
 *   and every doc, type file and folder the audit read are as they were when
 *   stored, else undefined (the caller audits as before). The audit's own code
 *   is the package's and is not checked again. A checkout has no file, so it
 *   always audits.
 * @position Read by api/doctor/doctor.mjs. These audits read only the
 *   package's own files, so their answer is fixed until one of them changes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT} from '../fs/paths.mjs';
import {readStore, storedKey} from '../doc-compiler/stored-docs.mjs';

/** Where the stored audits are, in the published package. */
export const SELF_AUDIT_FILE = path.join(
  CLI_ROOT,
  'assets',
  'self-audit.generated.json',
);

/**
 * Names a folder's state leaves out, being where and how the package is
 * packed or installed rather than its content: what `prepack` writes (each
 * `*.generated.json`, there or not depending on the order prepack writes
 * in), dependencies placed inside it, and the files every packer adds to a
 * package's root. No audit reads any of them.
 */
const PACKING_NAMES =
  /^(?:.*\.generated\.json|node_modules|(?:LICEN[CS]E|README|CHANGELOG|NOTICE)(?:\..*)?)$/i;

/** The package.json fields a packer leaves as written. */
const PACKAGE_FIELDS = [
  'name',
  'version',
  'type',
  'exports',
  'bin',
  'main',
  'types',
];

/**
 * A file's or folder's state as an audit read it: a file by its content
 * (package.json by its packer-stable fields), a folder by the names it holds
 * (but the names `skip` matches: PACKING_NAMES unless given), `-` when
 * absent.
 * @param {string} file
 * @param {RegExp} [skip] - Folder entries a packer or installer adds or drops.
 * @returns {string}
 */
export function inputState(file, skip = PACKING_NAMES) {
  try {
    if (fs.statSync(file).isDirectory()) {
      const names = fs
        .readdirSync(file)
        .filter(name => !skip.test(name))
        .sort();
      return `dir:${storedKey(names.join('\n'))}`;
    }
    if (path.basename(file) === 'package.json') {
      // A packer rewrites package.json (pnpm resolves `catalog:` ranges and
      // drops lifecycle scripts): only the fields that say what the package
      // is and holds count.
      const pkg = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return `pkg:${storedKey(
        JSON.stringify(PACKAGE_FIELDS.map(field => pkg[field] ?? null)),
      )}`;
    }
    return storedKey(fs.readFileSync(file));
  } catch {
    return '-';
  }
}

/**
 * The inputs a stored answer's work read, by path under `root` (`.` for
 * `root` itself), with their state. Code in a node_modules folder under
 * `root` is the package's dependencies, not its own files. Paths outside
 * `root` are where the work runs (the package manager is found from the
 * working folder, to spell commands in rendered docs); the generator proves
 * the answer is the same wherever it runs, so they are not inputs.
 * @param {Iterable<string>} files every path the work read
 * @param {{root?: string, skip?: RegExp}} [options] - The package folder
 *   (the CLI's unless given) and, as for {@link inputState}, the folder
 *   entries to skip.
 * @returns {Record<string, string>}
 */
export function selfAuditInputs(
  files,
  {root = CLI_ROOT, skip = PACKING_NAMES} = {},
) {
  /** @type {Record<string, string>} */
  const inputs = {};
  for (const file of [...files].sort()) {
    const rel = path.relative(root, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    const parts = rel === '' ? [] : rel.split(path.sep);
    if (parts.includes('node_modules')) continue;
    inputs[parts.join('/') || '.'] = inputState(file, skip);
  }
  return inputs;
}

/**
 * The stored value of the audit `name`, while every file and folder it read
 * is unchanged, else undefined.
 * @param {string} name
 * @returns {unknown}
 */
export function storedSelfAudit(name) {
  /** @type {{inputs: Record<string, string>, value: unknown} | undefined} */
  const entry = readStore(SELF_AUDIT_FILE).get(name);
  if (!entry) return undefined;
  return inputsUnchanged(CLI_ROOT, entry.inputs) ? entry.value : undefined;
}

/**
 * Whether every recorded input under `root` is in its recorded state.
 * @param {string} root
 * @param {Record<string, string>} inputs - State by path under `root`.
 * @param {RegExp} [skip] - As for {@link inputState}.
 * @returns {boolean}
 */
export function inputsUnchanged(root, inputs, skip = PACKING_NAMES) {
  for (const [rel, state] of Object.entries(inputs)) {
    if (inputState(path.join(root, ...rel.split('/')), skip) !== state) {
      return false;
    }
  }
  return true;
}
