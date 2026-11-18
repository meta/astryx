// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: keep a theme's chat corners after --radius-chat follows the container
 *
 * `--radius-chat` used to default to 28px, and a radius scale gave it the page
 * step (base × 7 × multiplier), in a theme and in each adaptation rule. It now
 * follows the theme's container radius, and a radius scale no longer sets it.
 * This codemod keeps the old chat corners in each Astryx `defineTheme()` config
 * and each default-exported theme object:
 *
 * - The theme's tokens get `'--radius-chat'`: 28px, or the page step of its
 *   literal radius scale. A theme whose container radius already equals that
 *   value needs nothing, unless an adaptation rule changes its radius.
 * - A theme that extends another one and has no radius scale of its own
 *   inherits that theme's chat radius, so its tokens are left alone.
 * - Each adaptation rule with a radius scale gets its page step in its own
 *   tokens, with `base` and `multiplier` completed from the theme's scale.
 *
 * It leaves a TODO comment where it cannot read the theme: a non-literal
 * config, a spread at the top of the config, tokens that are not an object
 * literal, a radius scale that is not numeric literals, or adaptations it
 * cannot read (api.report is a stub; comments are the only warning channel).
 */

import {
  importedComponents,
  resolveImportedComponent,
} from '../../transform-prop.mjs';

export const meta = {
  title: 'Keep the old chat corners',
  description:
    '`--radius-chat` now follows the container radius, and a radius scale ' +
    'no longer sets it. Adds `--radius-chat` to the tokens of each theme: ' +
    '28px, or the page step of its radius scale, and the page step of each ' +
    "adaptation rule's radius scale to that rule's tokens. This keeps the " +
    'corners of ChatComposer, its drawer and status bar, the buttons inside ' +
    'the composer, and ChatMessageBubble. A theme that extends another theme ' +
    "and has no radius scale of its own inherits that theme's value. Remove " +
    'an added token to adopt the container radius.',
};

const ASTRYX_MODULE = /^@(astryxdesign|xds)\//u;
const TOKEN = '--radius-chat';
const CONTAINER = '--radius-container';
const PREVIOUS_CHAT_RADIUS = 28;
const CORE_CONTAINER_RADIUS = 12;

const TODO_COMMENT =
  ' TODO(astryx upgrade): --radius-chat now follows the container radius. ' +
  'Add "--radius-chat": "28px" (for a theme with a radius scale, the ' +
  "scale's page step: base × 7 × multiplier) to this theme's tokens to " +
  'keep its previous chat corners. ';

const TODO_SCALE_COMMENT =
  ' TODO(astryx upgrade): --radius-chat now follows the container radius, ' +
  'and a radius scale no longer sets it. To keep the previous chat corners, ' +
  'add "--radius-chat" at the page step of each radius scale (base × 7 × ' +
  "multiplier, in px) to the tokens beside it: the theme's and those of " +
  'each adaptation rule. ';

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

/** @param {any} property */
function isSpread(property) {
  return (
    property.type === 'SpreadElement' ||
    property.type === 'SpreadProperty' ||
    property.type === 'RestElement'
  );
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
  return (object.properties ?? []).some(isSpread);
}

/** Whether a spread follows `property`, so it can replace it. @param {any} object @param {any} property */
function spreadFollows(object, property) {
  const index = object.properties.indexOf(property);
  return object.properties.slice(index + 1).some(isSpread);
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
function isObject(node) {
  return unwrap(node)?.type === 'ObjectExpression';
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
 * A radius scale's `base` and `multiplier`, completed from `fallback`.
 * `undefined` when a field is missing or not a numeric literal.
 * @param {any} node
 * @param {{base?: number, multiplier?: number}} [fallback]
 * @returns {{base: number, multiplier: number} | undefined}
 */
function readScale(node, fallback = {}) {
  const scale = unwrap(node);
  if (scale?.type !== 'ObjectExpression' || hasSpread(scale)) return undefined;
  const readField = (/** @type {'base' | 'multiplier'} */ name) => {
    const property = findProperty(scale, name);
    return property ? numericLiteral(property.value) : (fallback[name] ?? null);
  };
  const base = readField('base');
  const multiplier = readField('multiplier');
  if (base == null || multiplier == null) return undefined;
  return {base, multiplier};
}

/** @param {{base: number, multiplier: number}} scale */
const pageStep = scale => Math.round(scale.base * 7 * scale.multiplier);
/** @param {{base: number, multiplier: number}} scale */
const containerStep = scale => Math.round(scale.base * 3 * scale.multiplier);

/**
 * The adaptation rules of a config. `null` when the config has none, and
 * `undefined` when they cannot be read.
 * @param {any} config
 */
function readRules(config) {
  const adaptations = findProperty(config, 'adaptations');
  if (!adaptations) return null;
  const value = unwrap(adaptations.value);
  if (value?.type !== 'ObjectExpression' || hasSpread(value)) return undefined;
  const rules = findProperty(value, 'rules');
  if (!rules) return null;
  const list = unwrap(rules.value);
  if (list?.type !== 'ArrayExpression') return undefined;
  /** @type {any[]} */
  const values = [];
  for (const rule of list.elements) {
    const ruleObject = unwrap(rule);
    if (ruleObject?.type !== 'ObjectExpression' || hasSpread(ruleObject)) {
      return undefined;
    }
    const ruleValue = findProperty(ruleObject, 'value');
    if (!ruleValue) continue;
    const valueObject = unwrap(ruleValue.value);
    if (valueObject?.type !== 'ObjectExpression' || hasSpread(valueObject)) {
      return undefined;
    }
    const tokens = findProperty(valueObject, 'tokens');
    if (tokens && !isObject(tokens.value)) return undefined;
    values.push(valueObject);
  }
  return values;
}

/** Whether an adaptation rule's value can change the container radius. @param {any} value */
function changesRadius(value) {
  if (findProperty(value, 'radius')) return true;
  const tokensProperty = findProperty(value, 'tokens');
  const tokens = tokensProperty ? unwrap(tokensProperty.value) : null;
  return Boolean(
    tokens && (hasSpread(tokens) || findProperty(tokens, CONTAINER)),
  );
}

/**
 * Put `'--radius-chat': value` first in the object's tokens, so a spread
 * inside them still wins, or give the object tokens.
 * @param {any} j @param {any} object @param {string} value
 */
function addToken(j, object, value) {
  const entry = j.objectProperty(
    j.stringLiteral(TOKEN),
    j.stringLiteral(value),
  );
  const tokensProperty = findProperty(object, 'tokens');
  if (tokensProperty) {
    unwrap(tokensProperty.value).properties.unshift(entry);
  } else {
    object.properties.push(
      j.objectProperty(j.identifier('tokens'), j.objectExpression([entry])),
    );
  }
}

/**
 * Attach a TODO to the enclosing statement, or to the export that holds it,
 * where a reparse keeps it.
 * @param {any} j @param {any} fromPath @param {string} text
 */
function addTodo(j, fromPath, text) {
  let path = fromPath;
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
  if (host.comments.some((/** @type {any} */ c) => c.value === text)) return;
  host.comments.push(j.commentBlock(text, true, false));
}

/**
 * Migrate one theme config. Returns whether it changed the source.
 * @param {any} j @param {any} config @param {any} path
 */
function migrateConfig(j, config, path) {
  const todo = (/** @type {string} */ text) => {
    addTodo(j, path, text);
    return true;
  };

  if (hasSpread(config)) {
    // Tokens after the last spread that set the token keep it.
    const lastSpread = config.properties.findLastIndex(isSpread);
    const tokensProperty = findProperty(config, 'tokens');
    const tokens = tokensProperty ? unwrap(tokensProperty.value) : null;
    const keeps =
      tokensProperty &&
      config.properties.indexOf(tokensProperty) > lastSpread &&
      tokens?.type === 'ObjectExpression' &&
      findProperty(tokens, TOKEN) &&
      !findProperty(config, 'adaptations');
    return keeps ? false : todo(TODO_COMMENT);
  }

  const tokensProperty = findProperty(config, 'tokens');
  if (tokensProperty && !isObject(tokensProperty.value)) {
    return todo(TODO_COMMENT);
  }
  const tokens = tokensProperty ? unwrap(tokensProperty.value) : null;
  const radius = findProperty(config, 'radius');
  const extendsTheme = Boolean(findProperty(config, 'extends'));
  const scale = radius ? readScale(radius.value) : null;
  const rules = readRules(config);
  let changed = false;

  // The theme's own tokens.
  if (radius && scale === undefined) {
    changed = todo(TODO_SCALE_COMMENT);
  } else if (
    !(tokens && findProperty(tokens, TOKEN)) &&
    (radius || !extendsTheme)
  ) {
    const previous = scale ? pageStep(scale) : PREVIOUS_CHAT_RADIUS;
    /** The container radius the theme ends up with; `null` when unknown. */
    let container = scale ? containerStep(scale) : CORE_CONTAINER_RADIUS;
    const explicit = tokens ? findProperty(tokens, CONTAINER) : null;
    if (explicit) {
      container = spreadFollows(tokens, explicit)
        ? null
        : pxLiteral(explicit.value);
    } else if (tokens && hasSpread(tokens)) {
      container = null;
    }
    // The chat radius follows the container into an adaptation rule.
    if (extendsTheme || rules === undefined || rules?.some(changesRadius)) {
      container = null;
    }
    if (container !== previous) {
      addToken(j, config, `${previous}px`);
      changed = true;
    }
  }

  // Each adaptation rule's radius scale.
  if (rules === undefined) {
    changed = todo(TODO_SCALE_COMMENT) || changed;
  } else {
    for (const value of rules ?? []) {
      const ruleRadius = findProperty(value, 'radius');
      if (!ruleRadius) continue;
      const ruleTokensProperty = findProperty(value, 'tokens');
      const ruleTokens = ruleTokensProperty
        ? unwrap(ruleTokensProperty.value)
        : null;
      if (ruleTokens && findProperty(ruleTokens, TOKEN)) continue;
      // Core completes a rule's scale from the theme's own scale only; a
      // base theme's scale is out of reach here.
      const ruleScale = readScale(
        ruleRadius.value,
        extendsTheme && !scale ? {} : (scale ?? {}),
      );
      if (!ruleScale) {
        changed = todo(TODO_SCALE_COMMENT) || changed;
        continue;
      }
      addToken(j, value, `${pageStep(ruleScale)}px`);
      changed = true;
    }
  }
  return changed;
}

/** A default-exported object the theme build reads as a theme: a name, and tokens or a base. @param {any} node */
function isThemeObject(node) {
  const object = unwrap(node);
  if (object?.type !== 'ObjectExpression') return false;
  const name = findProperty(object, 'name');
  const value = unwrap(name?.value);
  const hasName =
    value?.type === 'StringLiteral' ||
    (value?.type === 'Literal' && typeof value.value === 'string');
  const tokens = findProperty(object, 'tokens');
  return Boolean(
    hasName &&
    ((tokens && isObject(tokens.value)) || findProperty(object, 'extends')),
  );
}

/**
 * @param {{source: string, path: string}} file
 * @param {{jscodeshift: any}} api
 */
export default function transform(file, api) {
  if (!/defineTheme|export\s+default/u.test(file.source)) return undefined;
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
    if (config?.type !== 'ObjectExpression') {
      addTodo(j, callPath, TODO_COMMENT);
      changed = true;
      return;
    }
    changed = migrateConfig(j, config, callPath) || changed;
  });

  root
    .find(j.ExportDefaultDeclaration)
    .forEach((/** @type {any} */ exportPath) => {
      const declaration = exportPath.node.declaration;
      if (!isThemeObject(declaration)) return;
      changed = migrateConfig(j, unwrap(declaration), exportPath) || changed;
    });

  return changed ? root.toSource({quote: 'single'}) : undefined;
}
