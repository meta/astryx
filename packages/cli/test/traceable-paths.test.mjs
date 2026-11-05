// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shipped CLI code builds no `path.resolve()` path from a template
 * string.
 *
 * Hosts that bundle the CLI into a server function (the docs site's search)
 * trace the files it may read at run time. The tracer cannot resolve
 * `path.resolve(dir, `${a}${b}`)`, and treats it as possibly any file under
 * the process's working folder, so it packs that whole folder into the
 * function: one such line grew the docs site's search function from about
 * 50 MB to about 5 GB, past the host's limit, and every deploy failed. Build
 * the string first, or join plain strings (`a + b`), as the rest of the CLI
 * does.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '@babel/parser';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPED = ['api', 'authoring', 'clients', 'foundation', 'host'];

/**
 * Every shipped source file: not a test, not a fixture.
 * @param {string} dir
 * @returns {string[]}
 */
function sources(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === '__fixtures__'
        ? []
        : sources(full);
    }
    return entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')
      ? [full]
      : [];
  });
}

/**
 * Each `path.resolve(...)` call with an interpolated template string argument.
 * @param {string} file
 * @returns {string[]}
 */
function templateResolves(file) {
  const ast = parse(fs.readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: ['jsx'],
    errorRecovery: true,
  });
  /** @type {string[]} */
  const found = [];
  /** @param {any} node */
  const visit = node => {
    if (!node || typeof node.type !== 'string') return;
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === 'path' &&
      node.callee.property.name === 'resolve' &&
      node.arguments.some(
        (/** @type {any} */ arg) =>
          arg.type === 'TemplateLiteral' && arg.expressions.length > 0,
      )
    ) {
      found.push(`${path.relative(CLI, file)}:${node.loc.start.line}`);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast.program);
  return found;
}

describe('traceable paths', () => {
  it('builds no path.resolve() path from a template string', () => {
    const found = SHIPPED.flatMap(root =>
      sources(path.join(CLI, root)),
    ).flatMap(templateResolves);
    expect(found).toEqual([]);
  });
});
