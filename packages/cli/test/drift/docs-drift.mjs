// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Drift checks for every production AuthoredDoc in the repository. Keeps
 * the hand-authored docs honest against their sources of truth:
 *   - every `*.doc.mjs` under a production doc root parses via `parseDoc`;
 *   - each CommandDoc's `fn` resolves to a FunctionDoc, its arg/option `param`s
 *     exist on that function, and its `name` is a real manifest command (or a
 *     hidden one, which the manifest leaves out);
 *   - the error-codes EnumDoc == ERROR_CODES exactly;
 *   - the response-types EnumDoc == the manifest's response discriminants plus
 *     the root types (help, version) no single command owns.
 *
 * @position packages/cli/test/drift — colocated-docs drift harness
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseDoc} from '../../authoring/index.mjs';
import {allErrorCodes} from '../../foundation/response/error-codes.mjs';
import {ROOT_RESPONSE_TYPES} from '../../clients/cli/lib/manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(CLI_ROOT, '../..');
const BIN = path.join(CLI_ROOT, 'clients/cli/bin/astryx.mjs');
const DOC_ROOTS = [
  'packages/cli/authoring',
  'packages/cli/api',
  'packages/cli/clients/cli/commands',
  'packages/cli/foundation',
  'packages/cli/assets',
  'packages/cli/test/authoring-types',
  'packages/core/src',
  'packages/lab/src',
  'packages/charts/src',
  'packages/richtext/src',
  'packages/vega/src',
].map(root => path.join(REPO_ROOT, root));

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.doc.mjs') ? [p] : [];
  });
}

/** @returns {Promise<{file: string, doc: any}[]>} */
export async function collectDocs() {
  const files = DOC_ROOTS.flatMap(walk);
  const out = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(f).href);
    out.push({
      file: path.relative(REPO_ROOT, f),
      doc: mod.doc ?? mod.docs ?? mod.default,
    });
  }
  return out;
}

/** @returns {any} the manifest `data` object. */
export function getManifest() {
  const res = spawnSync('node', [BIN, 'manifest', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(res.stdout).data;
}

/** Run all drift checks. @returns {Promise<{count: number, errors: string[]}>} */
export async function runDrift() {
  /** @type {string[]} */
  const errors = [];
  const docs = await collectDocs();

  for (const {file, doc} of docs) {
    if (!doc) {
      errors.push(`${file}: no \`doc\` export`);
      continue;
    }
    try {
      parseDoc(doc);
    } catch (e) {
      errors.push(`${file}: parse failed: ${/** @type {Error} */ (e).message}`);
    }
  }

  // The typed examples under test/authoring-types must parse, but they
  // document nothing real, so they take no part in the cross-reference checks.
  const production = docs.filter(
    d => !d.file.startsWith('packages/cli/test/authoring-types/'),
  );
  const of = (/** @type {string} */ t) =>
    production.filter(d => d.doc && d.doc.type === t);
  const fnByName = new Map(of('function').map(d => [d.doc.name, d.doc]));

  // Command drift: fn resolves, params resolve, name is real.
  const manifest = getManifest();
  const manifestNames = new Set();
  /** @type {Map<string, any>} */
  const manifestByName = new Map();
  const walkCmd = (/** @type {any} */ c) => {
    manifestNames.add(c.name);
    manifestByName.set(c.name, c);
    (c.subcommands || []).forEach(walkCmd);
  };
  manifest.commands.forEach(walkCmd);
  // Hidden commands (a package-script hook) have a CommandDoc but no manifest
  // entry, by design.
  const {program} = await import('../../clients/cli/index.mjs');
  const hiddenNames = new Set(
    program.commands
      .filter(c => /** @type {any} */ (c)._hidden)
      .map(c => c.name()),
  );

  for (const {file, doc} of of('command')) {
    if (doc.name && !manifestNames.has(doc.name) && !hiddenNames.has(doc.name)) {
      errors.push(`${file}: command "${doc.name}" is not in the manifest`);
    }
    if (doc.fn) {
      const fnDoc = fnByName.get(doc.fn);
      if (!fnDoc) {
        errors.push(`${file}: fn "${doc.fn}" has no FunctionDoc`);
      } else {
        const params = new Set(
          (fnDoc.params || []).map((/** @type {any} */ p) => p.name),
        );
        for (const a of doc.args || [])
          if (a.param && !params.has(a.param))
            errors.push(
              `${file}: arg param "${a.param}" is not a param of ${doc.fn}()`,
            );
        for (const o of doc.options || [])
          if (o.param && !params.has(o.param))
            errors.push(
              `${file}: option param "${o.param}" is not a param of ${doc.fn}()`,
            );
      }
    }
  }

  // Command structure drift: doc args/options/subcommands mirror the live CLI.
  const argKey = (/** @type {any} */ a) =>
    `${a.name}:${a.required ? 'req' : 'opt'}${a.variadic ? ':var' : ''}`;
  for (const {file, doc} of of('command')) {
    const mc = manifestByName.get(doc.name);
    if (!mc) continue;
    const docArgs = (doc.args || []).map(argKey);
    const mArgs = (mc.arguments || []).map(argKey);
    if (JSON.stringify(docArgs) !== JSON.stringify(mArgs))
      errors.push(
        `${file}: args ${JSON.stringify(docArgs)} != manifest ${JSON.stringify(mArgs)}`,
      );
    const docFlags = new Set(
      (doc.options || []).map((/** @type {any} */ o) => o.flag),
    );
    const mFlags = new Set(
      (mc.options || []).map((/** @type {any} */ o) => o.flag),
    );
    for (const f of mFlags)
      if (!docFlags.has(f))
        errors.push(
          `${file}: option "${f}" is in the CLI but missing from the doc`,
        );
    for (const f of docFlags)
      if (!mFlags.has(f))
        errors.push(`${file}: option "${f}" is in the doc but not the CLI`);
    const docSubs = new Set(doc.subcommands || []);
    const mSubs = new Set(
      (mc.subcommands || []).map((/** @type {any} */ s) =>
        s.name.split(' ').pop(),
      ),
    );
    for (const s of mSubs)
      if (!docSubs.has(s))
        errors.push(
          `${file}: subcommand "${s}" is in the CLI but missing from the doc`,
        );
    for (const s of docSubs)
      if (!mSubs.has(s))
        errors.push(`${file}: subcommand "${s}" is in the doc but not the CLI`);
  }

  // Enum drift: error-codes == ERROR_CODES; response-types == the manifest's
  // per-command set plus the root types (help, version) no command owns.
  checkEnumSet(errors, docs, 'error-codes', new Set(allErrorCodes()));
  checkEnumSet(
    errors,
    docs,
    'response-types',
    new Set([...Object.values(manifest.responseTypes).flat(), ...ROOT_RESPONSE_TYPES]),
  );

  return {count: docs.length, errors};
}

/** @param {string[]} errors @param {{doc:any}[]} docs @param {string} name @param {Set<string>} realSet */
function checkEnumSet(errors, docs, name, realSet) {
  const entry = docs.find(
    d => d.doc && d.doc.type === 'enum' && d.doc.name === name,
  );
  if (!entry) {
    errors.push(`missing ${name} EnumDoc`);
    return;
  }
  const docSet = new Set(
    entry.doc.members.map((/** @type {any} */ m) => m.value),
  );
  for (const v of realSet)
    if (!docSet.has(v)) errors.push(`${name}: missing member "${v}"`);
  for (const v of docSet)
    if (!realSet.has(v)) errors.push(`${name}: extra member "${v}"`);
}
