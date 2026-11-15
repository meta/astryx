// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Write string fields, or lists of strings, in a project's
 * astryx.config, or remove them, in one write.
 *
 * A field is a top-level key or a dotted path into nested object literals
 * (`experimental.iconSet`); a missing object on the path is created.
 *
 * Edits the default-exported object literal in place (comments and other
 * fields kept), or creates `astryx.config.mjs` when the project has no
 * config. A config whose default export is not a static object literal, or
 * whose object on the path spreads another (`{...base}`), is refused rather
 * than rewritten: a key written beside a spread could replace what it sets.
 *
 * Before any write the target is classified like every other consumer-file
 * writer (spec:AST-040 FR2, FR8): a config reached through a symbolic link,
 * marked generated or vendored, ignored, or otherwise protected is refused with
 * `ERR_CODEMOD_PROTECTED` naming the protecting declaration, and an unreadable
 * protection source fails with `ERR_CODEMOD_PROTECTION_SOURCE`.
 *
 * @input A project directory and fields: each a name and its value, a string,
 *   a list of strings, or null to remove it
 * @output The config file written and the values it replaced
 * @position packages/cli/foundation/config — read by `astryx experimental icon use`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {randomUUID} from 'node:crypto';
import {jscodeshift as loadJscodeshift} from '../runtime/lazy-dependencies.mjs';
import {
  findManifestObject,
  unwrapManifestExpression,
} from '../integrations/manifest-writer.mjs';
import {createFileProtectionResolver} from '../fs/file-protection.mjs';
import {CONFIG_BASENAMES} from './project.mjs';

/** A protected astryx.config the writer refused to touch. */
export class ConfigProtectedError extends Error {
  /**
   * @param {string} file
   * @param {import('../fs/file-protection.mjs').FileProtection[]} protections
   */
  constructor(file, protections) {
    const declarations = protections.map(item => item.declaration).join('; ');
    super(
      `Could not update ${path.basename(file)}: it is protected by ${declarations}. Set the value at its source yourself.`,
    );
    this.name = 'ConfigProtectedError';
    this.code = 'ERR_CODEMOD_PROTECTED';
    this.file = file;
    this.protections = protections;
  }
}

/**
 * Refuse to write `file` when the project protects it (spec:AST-040 FR2).
 * @param {string} projectDir
 * @param {string} file
 */
function assertWritable(projectDir, file) {
  const protections = createFileProtectionResolver(projectDir).classify(file);
  if (protections.length > 0) throw new ConfigProtectedError(file, protections);
}

/** @param {any} property a member of an object literal */
function isSpread(property) {
  return [
    'SpreadElement',
    'SpreadProperty',
    'ExperimentalSpreadProperty',
  ].includes(property?.type);
}

/** @param {any} property @param {string} name */
function propertyNamed(property, name) {
  if (
    !property ||
    !['ObjectProperty', 'Property'].includes(property.type) ||
    property.computed
  ) {
    return false;
  }
  return (
    (property.key?.type === 'Identifier' && property.key.name === name) ||
    (['Literal', 'StringLiteral'].includes(property.key?.type) &&
      property.key.value === name)
  );
}

/** @param {string} text */
const quote = text => `'${text.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")}'`;

/** @param {string | readonly string[]} value */
const written = value =>
  typeof value === 'string'
    ? quote(value)
    : `[${value.map(each => quote(each)).join(', ')}]`;

/**
 * The string, or list of strings, a config property holds; null for any
 * other value.
 * @param {any} node
 * @returns {string | string[] | null}
 */
function literalValue(node) {
  if (node?.type === 'StringLiteral' || node?.type === 'Literal') {
    return typeof node.value === 'string' ? node.value : null;
  }
  if (node?.type === 'ArrayExpression') {
    const items = node.elements.map((/** @type {any} */ each) =>
      each?.type === 'StringLiteral' ||
      (each?.type === 'Literal' && typeof each.value === 'string')
        ? String(each.value)
        : null,
    );
    return items.every((/** @type {string | null} */ each) => each != null)
      ? /** @type {string[]} */ (items)
      : null;
  }
  return null;
}

/**
 * @param {string | string[] | null} a
 * @param {string | readonly string[]} b
 */
function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Set `key` to `value` in the project's astryx.config.
 * @param {string} projectDir
 * @param {string} key a top-level key, or a dotted path (`experimental.iconSet`)
 * @param {string} value
 * @returns {{file: string, created: boolean, previous: string | null, changed: boolean}}
 */
export function setConfigString(projectDir, key, value) {
  const result = setConfigValue(projectDir, key, value);
  return {
    ...result,
    previous: typeof result.previous === 'string' ? result.previous : null,
  };
}

/**
 * Set `key` to `value`, a string or a list of strings, in the project's
 * astryx.config.
 * @param {string} projectDir
 * @param {string} key a top-level key, or a dotted path (`experimental.iconSet`)
 * @param {string | readonly string[]} value
 * @returns {{file: string, created: boolean, previous: string | string[] | null, changed: boolean}}
 */
export function setConfigValue(projectDir, key, value) {
  const result = setConfigValues(projectDir, [[key, value]]);
  return {...result, previous: result.previous[0] ?? null};
}

/**
 * The sentence that tells a person to make the edits by hand: `Set
 * "experimental.iconSet: 'glyphs'"`, with each further edit after `and`.
 * @param {ReadonlyArray<readonly [string, string | readonly string[] | null]>} fields
 */
function byHand(fields) {
  const edits = fields
    .map(([key, value]) =>
      value == null ? `remove "${key}"` : `set "${key}: ${written(value)}"`,
    )
    .join(' and ');
  return edits[0].toUpperCase() + edits.slice(1);
}

/**
 * The nested objects of a new config: each key's value, or the object a
 * dotted path opens.
 * @typedef {Map<string, string | readonly string[] | ConfigTree>} ConfigTree
 */

/**
 * The text of a new astryx.config.mjs that sets the fields: each key on a
 * path opens one nested object (`experimental: {`), shared by the fields
 * under it.
 * @param {ReadonlyArray<readonly [string, string | readonly string[]]>} fields
 */
function newConfigText(fields) {
  /** @type {ConfigTree} */
  const tree = new Map();
  for (const [key, value] of fields) {
    const keys = key.split('.');
    let node = tree;
    for (const each of keys.slice(0, -1)) {
      let child = node.get(each);
      if (!(child instanceof Map)) {
        child = new Map();
        node.set(each, child);
      }
      node = child;
    }
    node.set(/** @type {string} */ (keys[keys.length - 1]), value);
  }
  /** @param {ConfigTree} node @param {number} depth @returns {string} */
  const render = (node, depth) =>
    [...node]
      .map(([name, value]) =>
        value instanceof Map
          ? `${'  '.repeat(depth)}${name}: {\n${render(value, depth + 1)}${'  '.repeat(depth)}},\n`
          : `${'  '.repeat(depth)}${name}: ${written(value)},\n`,
      )
      .join('');
  return `export default {\n${render(tree, 1)}};\n`;
}

/**
 * Set several fields of the project's astryx.config in one write. Each value
 * is a string, a list of strings, or `null`, which removes the field; a
 * field the config does not set needs no removal. Either every field is
 * written or, when one cannot be, none is.
 * @param {string} projectDir
 * @param {ReadonlyArray<readonly [string, string | readonly string[] | null]>} fields
 *   each a top-level key or a dotted path (`experimental.iconSet`), and its
 *   value
 * @returns {{file: string, created: boolean, previous: Array<string | string[] | null>, changed: boolean}}
 *   `previous`: each field's value before the write, in the order given
 */
export function setConfigValues(projectDir, fields) {
  const existing = CONFIG_BASENAMES.map(name =>
    path.join(projectDir, name),
  ).find(file => fs.existsSync(file));
  /** @type {Array<readonly [string, string | readonly string[]]>} */
  const set = [];
  for (const [key, value] of fields) {
    if (value != null) set.push([key, value]);
  }
  if (!existing) {
    const file = path.join(projectDir, 'astryx.config.mjs');
    const previous = fields.map(() => null);
    if (set.length === 0)
      return {file, created: false, previous, changed: false};
    assertWritable(projectDir, file);
    writeAtomically(file, newConfigText(set));
    return {file, created: true, previous, changed: true};
  }
  assertWritable(projectDir, existing);
  const source = fs.readFileSync(existing, 'utf-8');
  const j = loadJscodeshift().withParser('tsx');
  const ast = j(source);
  const root = findManifestObject(j, ast);
  const refuse = () =>
    new Error(
      `Could not update ${path.basename(existing)} safely: its default export is not a static object literal. ${byHand(fields)} in it yourself.`,
    );
  if (!root) throw refuse();
  // A spread on the path can hold the same keys: a key added beside it would
  // shadow the spread's whole object and drop what it sets, so nothing is
  // written there (`{...base}` may set `experimental.xle`).
  /** @param {any} holder @param {string} where */
  const assertNoSpread = (holder, where) => {
    if (holder.properties.some((/** @type {any} */ each) => isSpread(each))) {
      throw new Error(
        `Could not update ${path.basename(existing)} safely: ${where} spreads another object (\`...\`), whose keys a written ${fields.map(([key]) => `"${key}"`).join(' or ')} could replace. ${byHand(fields)} in it yourself.`,
      );
    }
  };
  /** @param {string | readonly string[]} value */
  const nodeOf = value =>
    typeof value === 'string'
      ? j.stringLiteral(value)
      : j.arrayExpression(value.map(each => j.stringLiteral(each)));
  /** @type {Array<string | string[] | null>} */
  const previous = [];
  let changed = false;
  for (const [key, value] of fields) {
    const keys = key.split('.');
    const leaf = /** @type {string} */ (keys[keys.length - 1]);
    let object = root;
    assertNoSpread(object, 'its default export');
    let absent = false;
    for (const each of keys.slice(0, -1)) {
      const holder = object.properties.find((/** @type {any} */ property) =>
        propertyNamed(property, each),
      );
      if (!holder) {
        // A field the config does not reach is already removed.
        if (value == null) {
          absent = true;
          break;
        }
        const created = j.objectExpression([]);
        object.properties.push(j.objectProperty(j.identifier(each), created));
        object = created;
        continue;
      }
      const nested = unwrapManifestExpression(holder.value);
      if (!j.ObjectExpression.check(nested)) throw refuse();
      assertNoSpread(nested, `its "${each}" object`);
      object = nested;
    }
    if (absent) {
      previous.push(null);
      continue;
    }
    const at = object.properties.findIndex((/** @type {any} */ each) =>
      propertyNamed(each, leaf),
    );
    const property = at === -1 ? null : object.properties[at];
    const before = property ? literalValue(property.value) : null;
    previous.push(before);
    if (value == null) {
      if (property) {
        object.properties.splice(at, 1);
        changed = true;
      }
      continue;
    }
    if (property) {
      if (sameValue(before, value)) continue;
      property.value = nodeOf(value);
    } else {
      object.properties.push(
        j.objectProperty(j.identifier(leaf), nodeOf(value)),
      );
    }
    changed = true;
  }
  if (!changed) {
    return {file: existing, created: false, previous, changed: false};
  }
  let next = ast.toSource({quote: 'single', reuseWhitespace: true});
  if (source.endsWith('\n') && !next.endsWith('\n')) next += '\n';
  writeAtomically(existing, next);
  return {file: existing, created: false, previous, changed: true};
}

/**
 * @param {string} file
 * @param {string} text
 */
function writeAtomically(file, text) {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.tmp-${randomUUID()}`,
  );
  try {
    fs.writeFileSync(temporary, text, 'utf-8');
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, {force: true});
    throw error;
  }
}
