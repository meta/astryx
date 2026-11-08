// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reusable generator for runtime-sized palette reference modules.
 * @input A theme source, its committed full palette, and theme-specific paths.
 * @output Selected palette-reference content plus synchronized package outputs.
 * @position Shared implementation behind theme-specific palette-ref CLIs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const COPYRIGHT = '// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n';
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const HEX = /^#[0-9a-f]{6}$/u;

function assertNoParseDiagnostics(file, label) {
  const diagnostic = file.parseDiagnostics[0];
  if (!diagnostic) return;
  const position = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  throw new Error(
    `${label}:${position.line + 1}:${position.character + 1}: ${message}`,
  );
}

function unwrap(expression) {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(name) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  throw new Error(`Unsupported computed palette key: ${name.getText()}`);
}

function literalValue(expression) {
  const value = unwrap(expression);
  if (ts.isStringLiteral(value)) return value.text;
  if (!ts.isObjectLiteralExpression(value)) {
    throw new Error(
      `Palette values must be object or string literals: ${value.getText()}`,
    );
  }

  const result = {};
  for (const property of value.properties) {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(`Unsupported palette member: ${property.getText()}`);
    }
    result[propertyName(property.name)] = literalValue(property.initializer);
  }
  return result;
}

function renderedKey(key) {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key);
}

/** Count unique family/mode/stop references. */
export function countSelectedRefs(selected) {
  let count = 0;
  for (const modes of selected.values()) {
    for (const stops of modes.values()) count += stops.size;
  }
  return count;
}

/** Write or compare generated outputs. Returns mismatch descriptions in check mode. */
export function syncOutputs(content, outputs, {check}) {
  const problems = [];
  for (const output of outputs) {
    if (!check) {
      fs.mkdirSync(path.dirname(output), {recursive: true});
      fs.writeFileSync(output, content);
      continue;
    }
    if (!fs.existsSync(output)) {
      problems.push({output, reason: 'is missing'});
    } else if (fs.readFileSync(output, 'utf-8') !== content) {
      problems.push({output, reason: 'differs'});
    }
  }
  return problems;
}

/**
 * Bind the selected-reference parser and renderer to one theme's identifier,
 * source paths, output paths, and regeneration command.
 */
export function createSelectedPaletteRefGenerator({
  themeDisplayName,
  paletteRefsIdentifier,
  themeSourceRel,
  fullPaletteRel,
  selectedRefsRel,
  templateRefsRel,
  regenerateCommand,
}) {
  if (!IDENTIFIER.test(paletteRefsIdentifier)) {
    throw new Error(
      `Palette reference export must be an identifier: ${paletteRefsIdentifier}`,
    );
  }

  /** Parse the `palette` object from its generated TypeScript source. */
  function parseFullPalette(source) {
    const file = ts.createSourceFile(
      fullPaletteRel,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    assertNoParseDiagnostics(file, fullPaletteRel);

    let palette = null;
    const visit = node => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'palette' &&
        node.initializer
      ) {
        palette = literalValue(node.initializer);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);

    if (!palette || typeof palette !== 'object') {
      throw new Error(`${fullPaletteRel} exports no literal palette object.`);
    }
    return palette;
  }

  function destructuredAliases(file) {
    const aliases = new Map();
    const visit = node => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer &&
        ts.isIdentifier(unwrap(node.initializer)) &&
        unwrap(node.initializer).text === paletteRefsIdentifier
      ) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) {
            throw new Error(
              `${themeDisplayName} palette reference aliases must be identifiers.`,
            );
          }
          const family = element.propertyName
            ? propertyName(element.propertyName)
            : element.name.text;
          aliases.set(element.name.text, family);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    return aliases;
  }

  function paletteAccess(expression, aliases) {
    if (!ts.isPropertyAccessExpression(expression)) return null;
    const mode = expression.name.text;
    if (mode !== 'light' && mode !== 'dark') return null;

    const owner = expression.expression;
    if (ts.isIdentifier(owner) && aliases.has(owner.text)) {
      return {family: aliases.get(owner.text), mode};
    }
    if (
      ts.isPropertyAccessExpression(owner) &&
      ts.isIdentifier(owner.expression) &&
      owner.expression.text === paletteRefsIdentifier
    ) {
      return {family: owner.name.text, mode};
    }
    return null;
  }

  function rootedInPalette(expression, aliases) {
    const node = unwrap(expression);
    if (ts.isIdentifier(node)) {
      return node.text === paletteRefsIdentifier || aliases.has(node.text);
    }
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      return rootedInPalette(node.expression, aliases);
    }
    return false;
  }

  function isNonReferenceIdentifier(node) {
    if (!ts.isIdentifier(node)) return false;
    const parent = node.parent;
    if (!parent) return false;
    return (
      (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
      (ts.isPropertyAssignment(parent) && parent.name === node) ||
      (ts.isBindingElement(parent) && parent.propertyName === node) ||
      ((ts.isMethodDeclaration(parent) ||
        ts.isPropertyDeclaration(parent) ||
        ts.isPropertySignature(parent) ||
        ts.isMethodSignature(parent)) &&
        parent.name === node)
    );
  }

  function validatePaletteUses(file, aliases) {
    const visit = node => {
      const isPaletteExpression =
        !isNonReferenceIdentifier(node) &&
        (ts.isIdentifier(node) ||
          ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        rootedInPalette(node, aliases);
      const parent = node.parent;
      const parentContinuesAccess =
        parent != null &&
        (ts.isPropertyAccessExpression(parent) ||
          ts.isElementAccessExpression(parent)) &&
        parent.expression === node;

      if (isPaletteExpression && !parentContinuesAccess) {
        const isBindingName =
          ts.isIdentifier(node) &&
          parent != null &&
          ts.isBindingElement(parent) &&
          parent.name === node;
        const isImportName =
          ts.isIdentifier(node) &&
          parent != null &&
          (ts.isImportSpecifier(parent) ||
            ts.isImportClause(parent) ||
            ts.isNamespaceImport(parent));
        const isRootDestructure =
          ts.isIdentifier(node) &&
          node.text === paletteRefsIdentifier &&
          parent != null &&
          ts.isVariableDeclaration(parent) &&
          parent.initializer === node &&
          ts.isObjectBindingPattern(parent.name);
        const isCompleteReference =
          ts.isElementAccessExpression(node) &&
          paletteAccess(node.expression, aliases) !== null;

        if (
          !isBindingName &&
          !isImportName &&
          !isRootDestructure &&
          !isCompleteReference
        ) {
          throw new Error(
            `Palette references must be used directly as family.light[25] or family.dark[25]; unsupported alias or escape: ${node.getText(file)}`,
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }

  /**
   * Discover selected palette references in lexical order. Family and mode order
   * follow first use; stops are de-duplicated and sorted during rendering.
   */
  function discoverSelectedRefs(source, fullPalette) {
    const file = ts.createSourceFile(
      themeSourceRel,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    assertNoParseDiagnostics(file, themeSourceRel);
    const aliases = destructuredAliases(file);
    validatePaletteUses(file, aliases);
    const families = new Map();

    const visit = node => {
      if (ts.isElementAccessExpression(node)) {
        const access = paletteAccess(node.expression, aliases);
        if (access) {
          const argument = node.argumentExpression;
          if (!argument || !ts.isNumericLiteral(argument)) {
            throw new Error(
              `Palette references must use literal numeric stops: ${node.getText(file)}`,
            );
          }
          const stop = Number(argument.text);
          const value =
            fullPalette?.[access.family]?.[access.mode]?.[String(stop)];
          if (typeof value !== 'string' || !HEX.test(value)) {
            throw new Error(
              `Palette reference ${access.family}.${access.mode}[${stop}] is missing or invalid in the committed full palette.`,
            );
          }

          if (!families.has(access.family)) {
            families.set(access.family, new Map());
          }
          const modes = families.get(access.family);
          if (!modes.has(access.mode)) modes.set(access.mode, new Set());
          modes.get(access.mode).add(stop);
        } else if (rootedInPalette(node.expression, aliases)) {
          throw new Error(
            `Palette references must use family.light[25] or family.dark[25] with literal keys: ${node.getText(file)}`,
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);

    if (families.size === 0) {
      throw new Error(
        `${themeSourceRel} contains no selected palette references.`,
      );
    }
    return families;
  }

  /** Render the complete selected-reference artifact. */
  function renderSelectedRefs(themeSource, fullPaletteSource) {
    const palette = parseFullPalette(fullPaletteSource);
    const selected = discoverSelectedRefs(themeSource, palette);
    const lines = [
      COPYRIGHT.trimEnd(),
      '',
      `// Generated from the committed full palette for the stops used by ${themeDisplayName}'s`,
      `// theme source. Regenerate with \`${regenerateCommand}\`.`,
      '// Keep the complete palette available for authoring and audits without',
      '// making consumers pay for unused palette stops.',
      '// prettier-ignore',
      `export const ${paletteRefsIdentifier} = {`,
    ];

    for (const [family, modes] of selected) {
      lines.push(`  ${renderedKey(family)}: {`);
      for (const [mode, stops] of modes) {
        const entries = [...stops]
          .sort((a, b) => a - b)
          .map(stop => `${stop}: '${palette[family][mode][String(stop)]}'`)
          .join(', ');
        lines.push(`    ${mode}: {${entries}},`);
      }
      lines.push('  },');
    }

    lines.push(
      '} as const;',
      '',
      `export default ${paletteRefsIdentifier};`,
      '',
    );
    return {content: lines.join('\n'), selected};
  }

  /** Generate or check this theme's package and CLI template outputs. */
  function generateSelectedPaletteRefs({root, check = false}) {
    const themeSource = fs.readFileSync(
      path.join(root, themeSourceRel),
      'utf-8',
    );
    const fullPaletteSource = fs.readFileSync(
      path.join(root, fullPaletteRel),
      'utf-8',
    );
    const {content, selected} = renderSelectedRefs(
      themeSource,
      fullPaletteSource,
    );
    const outputs = [selectedRefsRel, templateRefsRel].map(relative =>
      path.join(root, relative),
    );
    const problems = syncOutputs(content, outputs, {check});
    return {content, selected, outputs, problems};
  }

  return {
    parseFullPalette,
    discoverSelectedRefs,
    renderSelectedRefs,
    generateSelectedPaletteRefs,
  };
}
