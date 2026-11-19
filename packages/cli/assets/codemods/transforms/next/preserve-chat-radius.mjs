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
 *   inherits that theme's chat radius, so its tokens are left alone when the
 *   base sets the token: an Astryx theme, or a theme this project defines,
 *   which this upgrade migrates (a relative or aliased import, a
 *   `defineTheme()` binding in the file, or an inline `defineTheme()`). A
 *   relative or aliased import is trusted to be such a theme, so a project
 *   file that re-exports a theme from another package is not detected. Any
 *   other base, such as a theme from another package, gets a TODO that covers
 *   its adaptation rules too: an upgrade never edits installed dependencies.
 * - Each adaptation rule with a radius scale gets its page step in its own
 *   tokens, with `base` and `multiplier` completed from the theme's scale.
 *   A theme's own radius scale also completes its base theme's adaptation
 *   rules, which another file defines, so such a theme gets a TODO too unless
 *   the base is an Astryx theme (they have no radius rules).
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
    'the composer other than the send button, and ChatMessageBubble. A ' +
    'theme that extends an Astryx theme or one this project defines (a ' +
    'relative or aliased import is trusted to be one), and has no radius ' +
    "scale of its own, inherits that theme's value; one that extends " +
    'another theme gets a TODO. Remove ' +
    'an added token to adopt the container radius.',
};

const ASTRYX_MODULE = /^@(astryxdesign|xds)\//u;
const TOKEN = '--radius-chat';
const PREVIOUS_CHAT_RADIUS = 28;

const TODO_COMMENT =
  ' TODO(astryx upgrade): --radius-chat now follows the container radius, ' +
  'and a radius scale no longer sets it. To keep the previous chat corners, ' +
  'add "--radius-chat" to this theme\'s tokens: 28px, or the page step of ' +
  'its radius scale (base × 7 × multiplier, in px). Add the page step of ' +
  "each adaptation rule's radius scale to that rule's tokens too. ";

const BASE_RULES_SENTENCE =
  'If the base has an adaptation rule with a radius scale, add a rule with ' +
  'the same condition here whose tokens set "--radius-chat" to that ' +
  "rule's page step (base × 7 × multiplier, in px, completed from the " +
  "theme's radius scale). ";

const TODO_EXTENDS_COMMENT =
  ' TODO(astryx upgrade): --radius-chat now follows the container radius, ' +
  'and this theme extends a theme this upgrade does not migrate. To keep ' +
  'its previous chat corners, add "--radius-chat" to its tokens: the base ' +
  "theme's own --radius-chat, else 28px, or the page step of the base's " +
  'radius scale (base × 7 × multiplier, in px). ' +
  BASE_RULES_SENTENCE;

const TODO_EXTENDS_RULES_COMMENT =
  ' TODO(astryx upgrade): --radius-chat now follows the container radius, ' +
  'and this theme extends a theme this upgrade does not migrate, whose ' +
  'radius scale no longer sets it. ' +
  BASE_RULES_SENTENCE;

const TODO_BASE_RULES_COMMENT =
  ' TODO(astryx upgrade): --radius-chat now follows the container radius, ' +
  "and this theme's radius scale also completes its base theme's adaptation " +
  'rules. If the base has a rule with a radius scale, add a rule with the ' +
  'same condition here whose tokens set "--radius-chat" to that rule\'s ' +
  "page step, completed from this theme's scale (base × 7 × multiplier, in " +
  'px). ';

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
 * @property {(node: any) => 'astryx' | 'project' | 'other'} base Classify the theme `extends` names.
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

  // A spread can bring a radius scale or adaptation rules this file cannot read.
  if (hasSpread(config)) return todo(TODO_COMMENT);

  const tokensProperty = findProperty(config, 'tokens');
  if (tokensProperty && !isObject(tokensProperty.value)) {
    return todo(TODO_COMMENT);
  }
  const tokens = tokensProperty ? unwrap(tokensProperty.value) : null;
  const radius = findProperty(config, 'radius');
  const extendsProperty = findProperty(config, 'extends');
  const extendsTheme = Boolean(extendsProperty);
  const base = extendsProperty
    ? edits.base(unwrap(extendsProperty.value))
    : null;
  const scale = radius ? readScale(radius.value) : null;
  const rules = readRules(config);
  const setsToken = Boolean(tokens && findProperty(tokens, TOKEN));
  let changed = false;

  // The theme's own tokens.
  if (radius && scale === undefined) {
    changed = todo(TODO_COMMENT);
  } else if (!setsToken && (radius || !extendsTheme)) {
    edits.token(config, `${scale ? pageStep(scale) : PREVIOUS_CHAT_RADIUS}px`);
    changed = true;
  } else if (!radius && base === 'other') {
    // The base's own adaptation rules lose their chat radius too.
    changed = todo(
      setsToken ? TODO_EXTENDS_RULES_COMMENT : TODO_EXTENDS_COMMENT,
    );
  }
  if (radius && extendsTheme && base !== 'astryx') {
    changed = todo(TODO_BASE_RULES_COMMENT) || changed;
  }

  // Each adaptation rule's radius scale.
  if (rules === undefined) {
    changed = todo(TODO_COMMENT) || changed;
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
        changed = todo(TODO_COMMENT) || changed;
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

/** An Astryx theme package, which sets the chat radius. */
const ASTRYX_THEME_MODULE = /^@(astryxdesign|xds)\/theme-/u;
/** A file in this project: relative, absolute, or a common path alias. */
const PROJECT_MODULE = /^(\.{1,2}\/|\/|@\/|~\/|#)/u;

/**
 * Classify the theme an `extends` value names: an Astryx theme, a theme this
 * project defines (which this upgrade migrates), or another one.
 * @param {any} j @param {any} node @param {any} scopePath
 * @param {(callee: any, path: any) => boolean} isDefineTheme
 * @returns {'astryx' | 'project' | 'other'}
 */
function classifyBase(j, node, scopePath, isDefineTheme, depth = 0) {
  const value = unwrap(node);
  if (depth > 4 || !value) return 'other';
  if (value.type === 'CallExpression') {
    return isDefineTheme(value.callee, scopePath) ? 'project' : 'other';
  }
  const name =
    value.type === 'Identifier'
      ? value.name
      : value.type === 'MemberExpression' &&
          !value.computed &&
          value.object?.type === 'Identifier'
        ? value.object.name
        : null;
  if (name == null) return 'other';
  const scope = scopePath.scope?.lookup(name);
  const bindingPath = scope?.getBindings()[name]?.[0];
  const declaration = bindingPath?.parent;
  if (!declaration) return 'other';
  const declarationType = declaration.node.type;
  if (
    declarationType === 'ImportSpecifier' ||
    declarationType === 'ImportDefaultSpecifier' ||
    declarationType === 'ImportNamespaceSpecifier'
  ) {
    const source = declaration.parent?.node?.source?.value;
    if (typeof source !== 'string') return 'other';
    if (ASTRYX_THEME_MODULE.test(source)) return 'astryx';
    return PROJECT_MODULE.test(source) ? 'project' : 'other';
  }
  if (
    declarationType === 'VariableDeclarator' &&
    value.type === 'Identifier' &&
    declaration.node.id === bindingPath.node
  ) {
    return classifyBase(
      j,
      declaration.node.init,
      declaration,
      isDefineTheme,
      depth + 1,
    );
  }
  return 'other';
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
  const isDefineTheme = (/** @type {any} */ callee, /** @type {any} */ path) =>
    Boolean(resolveImportedComponent(callee, path, defineTheme));
  /** What the file's defineTheme() themes need, for a manual report. */
  /** @type {string[]} */
  const defineSteps = [];

  root.find(j.CallExpression).forEach((/** @type {any} */ callPath) => {
    if (
      !resolveImportedComponent(callPath.node.callee, callPath, defineTheme)
    ) {
      return;
    }
    const config = unwrap(callPath.node.arguments?.[0]);
    if (config?.type !== 'ObjectExpression') {
      addTodo(j, callPath, TODO_COMMENT);
      defineSteps.push(
        `set --radius-chat in the theme passed to the defineTheme() call on line ${callPath.node.loc?.start.line}`,
      );
      changed = true;
      return;
    }
    const at = `the defineTheme() call on line ${callPath.node.loc?.start.line}`;
    const edits = {
      token: (/** @type {any} */ object, /** @type {string} */ value) => {
        addToken(j, object, value);
        defineSteps.push(
          object === config
            ? `add '--radius-chat': '${value}' to the tokens of ${at}`
            : `add '--radius-chat': '${value}' to the tokens of the adaptation rule with that radius scale in ${at}`,
        );
      },
      base: (/** @type {any} */ node) =>
        classifyBase(j, node, callPath, isDefineTheme),
      todo: (/** @type {string} */ text) => {
        addTodo(j, callPath, text);
        defineSteps.push(
          `in ${at}, add '--radius-chat' to its tokens (28px, or the page step of its radius scale) and the page step of each adaptation rule's radius scale to that rule's tokens`,
        );
      },
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
        base: (/** @type {any} */ node) =>
          classifyBase(j, node, exportPath, isDefineTheme),
        todo: () =>
          steps.push(
            "add '--radius-chat' to its tokens (28px, or the page step of its radius scale) and the page step of each adaptation rule's radius scale to that rule's tokens",
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
        `it is unchanged. If it is a theme, keep its chat corners: ${[...new Set(steps)].join('; ')}.` +
        (defineSteps.length > 0
          ? ` This file's defineTheme() themes were not edited either, so ${defineSteps.join('; ')}; or run the upgrade again once the default export is migrated.`
          : ''),
      {line},
    );
  }

  return changed ? root.toSource({quote: 'single'}) : undefined;
}
