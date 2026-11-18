// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: keep a theme's chat corners after --radius-chat follows the container
 *
 * `--radius-chat` used to default to 28px, and a radius scale gave it the page
 * step (base × 7 × multiplier), in a theme and in each adaptation rule. It now
 * follows the theme's container radius, and a radius scale no longer sets it.
 * This codemod keeps the old chat corners in each Astryx `defineTheme()` config:
 *
 * - The theme's tokens get `'--radius-chat'`: 28px, or the page step of its
 *   literal radius scale, also where its container radius has that value, so a
 *   theme that extends it and sets its own container keeps it.
 * - A theme that extends another one and has no radius scale of its own
 *   inherits that theme's chat radius, so its tokens are left alone: every
 *   Astryx theme, and every theme this codemod migrates, sets the token.
 * - Each adaptation rule with a radius scale gets its page step in its own
 *   tokens, with `base` and `multiplier` completed from the theme's scale.
 *
 * It leaves a TODO comment where it cannot read the theme: a non-literal
 * config, a spread at the top of the config, tokens that are not an object
 * literal, a radius scale that is not numeric literals, or adaptations it
 * cannot read. A default-exported object shaped like a theme is not proven to
 * be one, so it stays unchanged and the file is reported for manual migration.
 */

import {ManualMigrationRequired} from '../../outcome.mjs';
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
const PREVIOUS_CHAT_RADIUS = 28;

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
 * @typedef {object} Edits
 * @property {(object: any, value: string) => void} token Add the token to an object's tokens.
 * @property {(text: string) => void} todo Leave a TODO comment.
 */

/**
 * Migrate one theme config. Returns whether it needs a change.
 * @param {any} config @param {Edits} edits
 */
function migrateConfig(config, edits) {
  const todo = (/** @type {string} */ text) => {
    edits.todo(text);
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
    edits.token(config, `${scale ? pageStep(scale) : PREVIOUS_CHAT_RADIUS}px`);
    changed = true;
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
      // A base theme's scale completes the rule in Core, but this file cannot
      // read it.
      const ruleScale = readScale(
        ruleRadius.value,
        extendsTheme && !scale ? {} : (scale ?? {}),
      );
      if (!ruleScale) {
        changed = todo(TODO_SCALE_COMMENT) || changed;
        continue;
      }
      edits.token(value, `${pageStep(ruleScale)}px`);
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
    const edits = {
      token: (/** @type {any} */ object, /** @type {string} */ value) =>
        addToken(j, object, value),
      todo: (/** @type {string} */ text) => addTodo(j, callPath, text),
    };
    changed = migrateConfig(config, edits) || changed;
  });

  // A default-exported object shaped like a theme is not proven to be one:
  // it stays unchanged, and the file is reported with what to add.
  /** @type {string[]} */
  const steps = [];
  /** @type {number | undefined} */
  let line;
  root
    .find(j.ExportDefaultDeclaration)
    .forEach((/** @type {any} */ exportPath) => {
      const config = unwrap(exportPath.node.declaration);
      if (!isThemeObject(config)) return;
      const edits = {
        token: (/** @type {any} */ object, /** @type {string} */ value) =>
          steps.push(
            object === config
              ? `add '--radius-chat': '${value}' to its tokens`
              : `add '--radius-chat': '${value}' to the tokens of the adaptation rule with that radius scale`,
          ),
        todo: () =>
          steps.push(
            "add '--radius-chat' at its previous chat radius (28px, or the page step of its radius scale) to its tokens",
          ),
      };
      if (migrateConfig(config, edits)) {
        line = line ?? exportPath.node.loc?.start.line;
      }
    });
  if (steps.length > 0) {
    throw new ManualMigrationRequired(
      '--radius-chat now follows the container radius. The default export ' +
        'looks like a theme, but nothing proves it is an Astryx theme, so ' +
        `it is unchanged. To keep its chat corners, ${[...new Set(steps)].join('; ')}.` +
        (changed
          ? ' Then run the upgrade again to migrate the defineTheme() themes in this file.'
          : ''),
      {line},
    );
  }

  return changed ? root.toSource({quote: 'single'}) : undefined;
}
