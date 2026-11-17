// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: keep a theme's chat corners after --radius-chat follows the container
 *
 * `--radius-chat` used to default to 28px, and a radius scale gave it the page
 * step (base × 7 × multiplier). It now follows the theme's container radius.
 * This codemod keeps the old chat corners in each theme that sets neither
 * `--radius-chat` nor `extends`: it adds `'--radius-chat'` to the theme's
 * tokens, 28px or the page step of its literal radius scale. A theme whose
 * container radius already equals that value needs nothing.
 *
 * A theme that extends another one inherits that theme's chat radius. The
 * Astryx themes that kept 28px set it, so the codemod leaves such a theme
 * alone. It leaves a TODO comment where it cannot read the theme: a spread at
 * the top of the config, tokens that are not an object literal, or a radius
 * scale that is not numeric literals (api.report is a stub; comments are the
 * only warning channel).
 */

import {
  importedComponents,
  resolveImportedComponent,
} from '../../transform-prop.mjs';

export const meta = {
  title: 'Keep 28px chat corners',
  description:
    '`--radius-chat` now follows the container radius, and a radius scale ' +
    'no longer sets it. Adds `--radius-chat` to the tokens ' +
    'of each `defineTheme` that sets neither `--radius-chat` nor `extends`: ' +
    '28px, or the page step of its radius scale. This keeps the corners of ' +
    'ChatComposer, its drawer and status bar, the buttons inside the ' +
    'composer, and ChatMessageBubble. A theme that extends another theme ' +
    "inherits that theme's value, so it is left alone. Remove the added " +
    'token to adopt the container radius.',
};

const ASTRYX_MODULE = /^@(astryxdesign|xds)\//u;
const TOKEN = '--radius-chat';
const CORE_CONTAINER_RADIUS = 12;

const TODO_COMMENT =
  ' TODO(astryx upgrade): --radius-chat now defaults to the container ' +
  'radius. Add "--radius-chat": "28px" (or the value you want) to this ' +
  "theme's tokens to keep its previous chat corners. ";

/** @param {any} node */
function keyName(node) {
  if (node?.computed) return null;
  const key = node?.key;
  if (key?.type === 'Identifier') return key.name;
  if (key?.type === 'StringLiteral' || key?.type === 'Literal') {
    return typeof key.value === 'string' ? key.value : null;
  }
  return null;
}

/** @param {any} object @param {string} name */
function findProperty(object, name) {
  return (object.properties ?? []).find(
    (/** @type {any} */ property) =>
      (property.type === 'ObjectProperty' || property.type === 'Property') &&
      keyName(property) === name,
  );
}

/** @param {any} object */
function hasSpread(object) {
  return (object.properties ?? []).some(
    (/** @type {any} */ property) =>
      property.type === 'SpreadElement' ||
      property.type === 'SpreadProperty' ||
      property.type === 'RestElement',
  );
}

/** Strips TypeScript `as`, `satisfies` and `!` wrappers. @param {any} node */
function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ParenthesizedExpression')
  ) {
    current = current.expression;
  }
  return current;
}

/** @param {any} node */
function numericLiteral(node) {
  const value = unwrap(node);
  if (value?.type === 'NumericLiteral') return value.value;
  if (value?.type === 'Literal' && typeof value.value === 'number') {
    return value.value;
  }
  return null;
}

/** A length from a string literal in px ('8px', or '0'), else null. @param {any} node */
function pxLiteral(node) {
  const value = unwrap(node);
  const text =
    value?.type === 'StringLiteral' ||
    (value?.type === 'Literal' && typeof value.value === 'string')
      ? value.value.trim()
      : null;
  const match = text == null ? null : /^(\d+(?:\.\d+)?)(px)?$/u.exec(text);
  if (!match || (!match[2] && Number(match[1]) !== 0)) return null;
  return Number(match[1]);
}

/**
 * The chat radius to keep: 28px, or the page step of the theme's radius
 * scale. `null` when the container radius the theme ends up with gives the
 * same value, `undefined` when the radius scale is unreadable.
 * @param {any} config @param {any} tokens
 * @returns {string | null | undefined}
 */
function chatRadiusToKeep(config, tokens) {
  let previous = 28;
  let container = CORE_CONTAINER_RADIUS;
  const radius = findProperty(config, 'radius');
  if (radius) {
    const scale = unwrap(radius.value);
    if (scale?.type !== 'ObjectExpression' || hasSpread(scale))
      return undefined;
    const base = numericLiteral(findProperty(scale, 'base')?.value);
    const multiplier = numericLiteral(findProperty(scale, 'multiplier')?.value);
    if (base == null || multiplier == null) return undefined;
    previous = Math.round(base * 7 * multiplier);
    container = Math.round(base * 3 * multiplier);
  }
  const explicit = tokens ? findProperty(tokens, '--radius-container') : null;
  if (explicit) {
    container = pxLiteral(explicit.value);
  } else if (tokens && hasSpread(tokens)) {
    // A spread can set the container radius, so keep the old value.
    container = null;
  }
  return container === previous ? null : `${previous}px`;
}

/**
 * Attach the TODO to the enclosing statement, or to the export that holds it,
 * where a reparse keeps it.
 * @param {any} j @param {any} callPath
 */
function addTodo(j, callPath) {
  let path = callPath;
  while (path && !j.Statement.check(path.node)) {
    path = path.parent;
  }
  if (!path) return;
  const parentType = path.parent?.node?.type;
  if (
    parentType === 'ExportNamedDeclaration' ||
    parentType === 'ExportDefaultDeclaration'
  ) {
    path = path.parent;
  }
  const host = path.node;
  host.comments = host.comments ?? [];
  if (host.comments.some((/** @type {any} */ c) => c.value === TODO_COMMENT)) {
    return;
  }
  host.comments.push(j.commentBlock(TODO_COMMENT, true, false));
}

/**
 * @param {{source: string, path: string}} file
 * @param {{jscodeshift: any}} api
 */
export default function transform(file, api) {
  if (!file.source.includes('defineTheme')) return undefined;
  const j = api.jscodeshift;
  const root = j(file.source);
  const defineTheme = importedComponents(root, j, {
    matchesImport: (/** @type {string} */ source) => ASTRYX_MODULE.test(source),
    components: new Map([['defineTheme', new Set()]]),
  });
  let changed = false;

  root.find(j.CallExpression).forEach((/** @type {any} */ callPath) => {
    if (
      !resolveImportedComponent(callPath.node.callee, callPath, defineTheme)
    ) {
      return;
    }
    const config = unwrap(callPath.node.arguments?.[0]);
    if (config?.type !== 'ObjectExpression') return;
    if (hasSpread(config)) {
      addTodo(j, callPath);
      changed = true;
      return;
    }
    if (findProperty(config, 'extends')) return;

    const tokensProperty = findProperty(config, 'tokens');
    const tokens = tokensProperty ? unwrap(tokensProperty.value) : null;
    if (tokensProperty && tokens?.type !== 'ObjectExpression') {
      addTodo(j, callPath);
      changed = true;
      return;
    }
    if (tokens && findProperty(tokens, TOKEN)) return;

    const value = chatRadiusToKeep(config, tokens);
    if (value === null) return;
    if (value === undefined) {
      addTodo(j, callPath);
      changed = true;
      return;
    }

    const entry = j.objectProperty(
      j.stringLiteral(TOKEN),
      j.stringLiteral(value),
    );
    if (tokens) {
      // First, so a spread inside the tokens that sets the token still wins.
      tokens.properties.unshift(entry);
    } else {
      config.properties.push(
        j.objectProperty(j.identifier('tokens'), j.objectExpression([entry])),
      );
    }
    changed = true;
  });

  return changed ? root.toSource({quote: 'single'}) : undefined;
}
