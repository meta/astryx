// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `debug` accepts handlers from integrations, so both public entries for
 * it — the exported `AstryxConfig` type and `astryx docs authoring config` —
 * must state how those handlers combine with the app's own: the contribution
 * form, the order, what a failing handler does, and the refusal control.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';
import {doc} from './config.doc.mjs';

const TYPE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'type.ts',
);
const source = ts.createSourceFile(
  TYPE_FILE,
  fs.readFileSync(TYPE_FILE, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);

/** @param {ts.Node} node @returns {string} */
function jsdocText(node) {
  return ts
    .getJSDocCommentsAndTags(node)
    .map(jsdoc => ts.getTextOfJSDocComment(jsdoc.comment) ?? '')
    .join('\n');
}

/** @param {(node: ts.Node) => boolean} match @returns {ts.Node} */
function findTopLevel(match) {
  const node = source.statements.find(match);
  if (!node) throw new Error('declaration not found in config/type.ts');
  return node;
}

const configInterface = /** @type {ts.InterfaceDeclaration} */ (
  findTopLevel(
    node => ts.isInterfaceDeclaration(node) && node.name.text === 'AstryxConfig',
  )
);
const debugMember = configInterface.members.find(
  member =>
    ts.isPropertySignature(member) && member.name.getText(source) === 'debug',
);
if (!debugMember) throw new Error('AstryxConfig has no debug member');

const debugConfigAlias = findTopLevel(
  node => ts.isTypeAliasDeclaration(node) && node.name.text === 'DebugConfig',
);

const schemaField = doc.fields.find(field => field.name === 'debug');

const ENTRIES = {
  'the AstryxConfig type': jsdocText(debugMember),
  'astryx docs authoring config': schemaField?.description ?? '',
};

describe.each(Object.entries(ENTRIES))('debug entry in %s', (_, text) => {
  it('says integrations contribute, and in what form', () => {
    expect(text).toMatch(/integration/i);
    expect(text).toMatch(/`debug` named export/);
  });

  it('says every handler runs, the app first, then integrations in load order', () => {
    expect(text).toMatch(/\bfirst\b/i);
    expect(text).toMatch(/load order/i);
  });

  it('says a handler that throws is skipped without affecting the others', () => {
    expect(text).toMatch(/throws is skipped/i);
    expect(text).toMatch(/others still run/i);
  });

  it('names the one control that refuses inherited handlers', () => {
    expect(text).toContain('{"astryx": {"inheritDebug": false}}');
  });
});

describe('DebugConfig', () => {
  it('does not claim that leaving debug out records nothing', () => {
    const text = jsdocText(debugConfigAlias);
    expect(text).not.toMatch(/nothing is recorded/i);
    expect(text).toMatch(/integration/i);
  });
});
