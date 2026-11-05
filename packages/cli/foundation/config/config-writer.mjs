// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Write one string field of a project's astryx.config.
 *
 * The field is a top-level key or a dotted path into nested object literals
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
 * @input A project directory, a field name, and its string value
 * @output The config file written and the value it replaced
 * @position packages/cli/foundation/config — read by `astryx experimental icon use`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {randomUUID} from 'node:crypto';
import jscodeshift from 'jscodeshift';
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

/**
 * Set `key` to `value` in the project's astryx.config.
 * @param {string} projectDir
 * @param {string} key a top-level key, or a dotted path (`experimental.iconSet`)
 * @param {string} value
 * @returns {{file: string, created: boolean, previous: string | null, changed: boolean}}
 */
export function setConfigString(projectDir, key, value) {
  const keys = key.split('.');
  const leaf = /** @type {string} */ (keys[keys.length - 1]);
  const existing = CONFIG_BASENAMES.map(name =>
    path.join(projectDir, name),
  ).find(file => fs.existsSync(file));
  if (!existing) {
    const file = path.join(projectDir, 'astryx.config.mjs');
    assertWritable(projectDir, file);
    const quoted = `'${value.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")}'`;
    // Each key on the path opens one nested object: `experimental: {`.
    const open = keys
      .slice(0, -1)
      .map((each, depth) => `${'  '.repeat(depth + 1)}${each}: {\n`)
      .join('');
    const close = keys
      .slice(0, -1)
      .map((_, depth) => `${'  '.repeat(depth + 1)}},\n`)
      .reverse()
      .join('');
    writeAtomically(
      file,
      `export default {\n${open}${'  '.repeat(keys.length)}${leaf}: ${quoted},\n${close}};\n`,
    );
    return {file, created: true, previous: null, changed: true};
  }
  assertWritable(projectDir, existing);
  const source = fs.readFileSync(existing, 'utf-8');
  const j = jscodeshift.withParser('tsx');
  const ast = j(source);
  let object = findManifestObject(j, ast);
  const refuse = () =>
    new Error(
      `Could not update ${path.basename(existing)} safely: its default export is not a static object literal. Set "${key}: '${value}'" in it yourself.`,
    );
  if (!object) throw refuse();
  // A spread on the path can hold the same keys: a key added beside it would
  // shadow the spread's whole object and drop what it sets, so nothing is
  // written there (`{...base}` may set `experimental.xle`).
  /** @param {any} holder @param {string} where */
  const assertNoSpread = (holder, where) => {
    if (holder.properties.some((/** @type {any} */ each) => isSpread(each))) {
      throw new Error(
        `Could not update ${path.basename(existing)} safely: ${where} spreads another object (\`...\`), whose keys a written "${key}" could replace. Set "${key}: '${value}'" in it yourself.`,
      );
    }
  };
  assertNoSpread(object, 'its default export');
  for (const each of keys.slice(0, -1)) {
    const holder = object.properties.find((/** @type {any} */ property) =>
      propertyNamed(property, each),
    );
    if (!holder) {
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
  const property = object.properties.find((/** @type {any} */ each) =>
    propertyNamed(each, leaf),
  );
  /** @type {string | null} */
  let previous = null;
  if (property) {
    const current = property.value;
    previous =
      current?.type === 'StringLiteral' || current?.type === 'Literal'
        ? String(current.value)
        : null;
    if (previous === value) {
      return {file: existing, created: false, previous, changed: false};
    }
    property.value = j.stringLiteral(value);
  } else {
    object.properties.push(
      j.objectProperty(j.identifier(leaf), j.stringLiteral(value)),
    );
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
