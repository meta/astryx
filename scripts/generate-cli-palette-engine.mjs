#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/* global process, console */

/**
 * @file Writes the CLI's copy of the tonal palette engine and its token
 * mapping from Core's source. Both have one source, packages/core/src/palette.
 * The CLI runs its own generated copy, so `astryx theme palette generate`
 * works with no Core installed, or with an older one. `--check` compares
 * without writing.
 * @input packages/core/src/palette/{color,generator,mapping,types}.ts
 * @output packages/cli/api/theme/palette/generate/{color,generator,mapping,types}.mjs,
 *   JavaScript with JSDoc types like the CLI's own sources
 * @position Repository maintenance command and the drift guard for the copy
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as prettier from 'prettier';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CORE_DIR = 'packages/core/src/palette';
export const CLI_DIR = 'packages/cli/api/theme/palette/generate';
const MODULES = ['color', 'generator', 'mapping', 'types'];

/** @param {string} name */
const header = name =>
  [
    '// Copyright (c) Meta Platforms, Inc. and affiliates.',
    `// Generated from ${CORE_DIR}/${name}.ts by`,
    '// scripts/generate-cli-palette-engine.mjs. Do not edit: change the Core',
    '// source and run `pnpm generate:cli-palette-engine`.',
    '',
  ].join('\n');

/** @param {string} text @param {string} file */
async function format(text, file) {
  const options = (await prettier.resolveConfig(file)) ?? {};
  return prettier.format(text, {...options, filepath: file});
}

/**
 * Every generated file, by its path from the repository root.
 * @returns {Promise<Record<string, string>>}
 */
export async function renderCliPaletteEngine() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const name of MODULES) {
    const source = fs.readFileSync(
      path.join(ROOT, CORE_DIR, `${name}.ts`),
      'utf8',
    );
    const file = `${CLI_DIR}/${name}.mjs`;
    out[file] = await format(
      header(name) + withoutCopyright(toJsdocJavaScript(source, `${name}.ts`)),
      path.join(ROOT, file),
    );
  }
  return out;
}

/** Drops the source's own copyright line; the header carries it. @param {string} text */
const withoutCopyright = text =>
  text.replace(
    /^\/\/ Copyright \(c\) Meta Platforms, Inc\. and affiliates\.\n/m,
    '',
  );

/**
 * TypeScript as JavaScript whose types are JSDoc, the form the CLI's sources
 * and its published declarations are made from: annotations become `@param`,
 * `@returns` and `@type` tags, type declarations become `@typedef`s, and
 * relative imports name the copy's `.mjs` files.
 * @param {string} source
 * @param {string} fileName
 * @returns {string}
 */
export function toJsdocJavaScript(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  /** @param {ts.Node} node */
  const typeText = node => node.getText(sourceFile).replace(/\s+/g, ' ');
  /**
   * The node's own JSDoc text without its closing, or null.
   * @param {ts.Node} node
   */
  const ownDoc = node => {
    const ranges =
      ts.getLeadingCommentRanges(source, node.getFullStart()) ?? [];
    const last = ranges.at(-1);
    if (!last) return null;
    const text = source.slice(last.pos, last.end);
    return text.startsWith('/**') ? text : null;
  };
  /**
   * Gives the node one JSDoc comment: its own description with `tags`.
   * @param {ts.Node} original
   * @param {ts.Node} node
   * @param {string[]} tags
   */
  const withDoc = (original, node, tags) => {
    if (!tags.length) return node;
    const own = ownDoc(original);
    /** @type {string[]} */
    const lines = own
      ? own
          .replace(/^\/\*\*\s?/, '')
          .replace(/\s*\*\/$/, '')
          .split('\n')
          .map(line => line.replace(/^\s*\*\s?/, ''))
      : [];
    while (lines.length && !lines.at(-1)?.trim()) lines.pop();
    while (lines.length && !lines[0].trim()) lines.shift();
    const body = [...lines, ...tags];
    ts.setEmitFlags(node, ts.EmitFlags.NoLeadingComments);
    ts.addSyntheticLeadingComment(
      node,
      ts.SyntaxKind.MultiLineCommentTrivia,
      `*\n${body.map(line => ` * ${line}`.trimEnd()).join('\n')}\n `,
      true,
    );
    return node;
  };
  /** @param {ts.SignatureDeclaration} fn */
  const signatureTags = fn => {
    /** @type {string[]} */
    const tags = [];
    for (const param of fn.typeParameters ?? []) {
      tags.push(
        param.constraint
          ? `@template {${typeText(param.constraint)}} ${param.name.text}`
          : `@template ${param.name.text}`,
      );
    }
    for (const param of fn.parameters) {
      const name = param.name.getText(sourceFile);
      const optional = Boolean(param.questionToken || param.initializer);
      const label = optional
        ? `[${name}${param.initializer ? `=${param.initializer.getText(sourceFile)}` : ''}]`
        : name;
      if (param.type) tags.push(`@param {${typeText(param.type)}} ${label}`);
    }
    if (fn.type) tags.push(`@returns {${typeText(fn.type)}}`);
    return tags;
  };
  /** @param {ts.InterfaceDeclaration} decl */
  const interfaceTags = decl => {
    const tags = [`@typedef {object} ${decl.name.text}`];
    for (const member of decl.members) {
      // (A method is written as a property holding a function.)
      const type = ts.isMethodSignature(member)
        ? `(${member.parameters.map(x => x.getText(sourceFile)).join(', ')}) => ${member.type ? typeText(member.type) : 'void'}`
        : ts.isPropertySignature(member) && member.type
          ? typeText(member.type)
          : null;
      if (!type) continue;
      const name = member.name.getText(sourceFile);
      const doc = ownDoc(member)
        ?.replace(/^\/\*\*\s?/, '')
        .replace(/\s*\*\/$/, '')
        .replace(/\n\s*\*\s?/g, ' ')
        .trim();
      tags.push(
        `@property {${type.replace(/\s+/g, ' ')}} ${member.questionToken ? `[${name}]` : name}${doc ? ` ${doc}` : ''}`,
      );
    }
    return tags;
  };
  /** @type {string[]} */
  const typedefs = [];
  /** @type {ts.TransformerFactory<ts.SourceFile>} */
  const toJsdoc = context => root => {
    /** @param {ts.Node} node @returns {ts.Node | undefined} */
    const visit = node => {
      if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) {
        const spec = /** @type {ts.StringLiteral} */ (node.moduleSpecifier)
          .text;
        const bindings = node.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            const imported = (element.propertyName ?? element.name).text;
            typedefs.push(
              `/** @typedef {import('${spec}.mjs').${imported}} ${element.name.text} */`,
            );
          }
        }
        return undefined;
      }
      if (ts.isTypeAliasDeclaration(node)) {
        const own = ownDoc(node);
        typedefs.push(
          `${own ? `${own}\n` : ''}/** @typedef {${typeText(node.type)}} ${node.name.text} */`,
        );
        return undefined;
      }
      if (ts.isInterfaceDeclaration(node)) {
        typedefs.push(withDocText(ownDoc(node), interfaceTags(node)));
        return undefined;
      }
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node)
      ) {
        const tags = signatureTags(node);
        const next = ts.visitEachChild(node, visit, context);
        if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
          return tags.length ? withDoc(node, next, tags) : next;
        }
        return withDoc(node, next, tags);
      }
      if (ts.isVariableStatement(node)) {
        const [decl] = node.declarationList.declarations;
        const next = ts.visitEachChild(node, visit, context);
        if (node.declarationList.declarations.length === 1 && decl.type) {
          return withDoc(node, next, [`@type {${typeText(decl.type)}}`]);
        }
        return next;
      }
      if (ts.isAsExpression(node)) {
        const inner = /** @type {ts.Expression} */ (
          ts.visitNode(node.expression, visit)
        );
        const paren = ts.factory.createParenthesizedExpression(inner);
        ts.addSyntheticLeadingComment(
          paren,
          ts.SyntaxKind.MultiLineCommentTrivia,
          `* @type {${typeText(node.type)}} `,
          false,
        );
        return paren;
      }
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const spec = node.moduleSpecifier;
        if (spec && ts.isStringLiteral(spec) && spec.text.startsWith('./')) {
          const named = ts.factory.createStringLiteral(
            `${spec.text}.mjs`,
            true,
          );
          return ts.isImportDeclaration(node)
            ? ts.factory.updateImportDeclaration(
                node,
                node.modifiers,
                node.importClause,
                named,
                node.attributes,
              )
            : ts.factory.updateExportDeclaration(
                node,
                node.modifiers,
                node.isTypeOnly,
                node.exportClause,
                named,
                node.attributes,
              );
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    return /** @type {ts.SourceFile} */ (ts.visitNode(root, visit));
  };
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    fileName,
    transformers: {before: [toJsdoc]},
  });
  const js = result.outputText;
  // The typedefs follow the imports, where the source declared its types.
  const imports = [...js.matchAll(/^import\b[^;]*;\n/gm)].at(-1);
  const at = imports ? (imports.index ?? 0) + imports[0].length : 0;
  const block = typedefs.map(t => `${t}\n`).join('\n');
  return `${js.slice(0, at)}${block ? `\n${block}\n` : ''}${js.slice(at)}`;
}

/** @param {string | null} own @param {string[]} tags */
function withDocText(own, tags) {
  const lines = own
    ? own
        .replace(/^\/\*\*\s?/, '')
        .replace(/\s*\*\/$/, '')
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, ''))
        .filter((line, i, all) => line.trim() || (i > 0 && i < all.length - 1))
    : [];
  return `/**\n${[...lines, ...tags].map(line => ` * ${line}`.trimEnd()).join('\n')}\n */`;
}

/**
 * Writes the copy, or with `check` reports the files that differ.
 * @param {{check?: boolean}} [options]
 * @returns {Promise<string[]>} the files that differ (check) or were written
 */
export async function syncCliPaletteEngine({check = false} = {}) {
  const files = await renderCliPaletteEngine();
  /** @type {string[]} */
  const changed = [];
  for (const [file, text] of Object.entries(files)) {
    const abs = path.join(ROOT, file);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (current === text) continue;
    changed.push(file);
    if (!check) fs.writeFileSync(abs, text);
  }
  return changed;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const check = process.argv.includes('--check');
  const changed = await syncCliPaletteEngine({check});
  if (check && changed.length) {
    console.error(
      `The CLI's palette engine differs from Core's source: ${changed.join(', ')}. Run \`pnpm generate:cli-palette-engine\`.`,
    );
    process.exit(1);
  }
  console.log(
    changed.length
      ? `${check ? 'Differs' : 'Wrote'}: ${changed.join(', ')}`
      : "The CLI's palette engine matches Core's source.",
  );
}
