// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Migrate the component-theming compatibility surface removed in 0.7.
 *
 * Static keys directly inside a theme's `components` object move to their
 * canonical target. A theme is a `defineTheme()` call imported from Astryx, an
 * object typed as an Astryx theme (annotation, `as`, or `satisfies`), or the
 * direct theme object a same-stem theme descriptor (`<stem>.doc.mjs`) declares:
 * the top-level binding exported as `<stem>`, with a static `name` and
 * component entries that are style objects. Shape alone is not proof: a
 * look-alike object anywhere else, including another object in the same theme
 * source, is left unchanged. CSS selectors move the same target classes, keep
 * the owner scope of the per-component clear-icon aliases, and replace
 * target-qualified bare prop/state classes with reflected `data-*` selectors
 * using the final 0.6 runtime contract. A known bare class that cannot be
 * classified for its target gets a TODO. Dynamic theme keys, unqualified classes, declarations, comments,
 * and strings containing CSS are left for manual review.
 */

import * as fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import {readThemeDescriptorValue} from '../../../../foundation/discovery/theme-discovery.mjs';
import {
  importedComponents,
  resolveImportedComponent,
} from '../../transform-prop.mjs';
import {
  isCodemodParseError,
  markParseError,
  parseCss,
  processSelector,
} from '../../parse.mjs';
import {migrateAstryxThemeSelectors} from '../v0.6.0/migrate-astryx-theme-selectors-to-data-attrs.mjs';
import {
  V06_THEME_SELECTOR_DYNAMIC_AXES,
  V06_THEME_SELECTOR_TARGETS,
} from './migrate-deprecated-theme-surface-v0.6-data.mjs';

/** @type {Readonly<Record<string, string>>} */
export const DEPRECATED_THEME_TARGETS = Object.freeze({
  'base-table': 'table',
  checkbox: 'checkbox-indicator',
  codeblock: 'code-block',
  'codeblock-copy-button': 'code-block-copy-button',
  'codeblock-header': 'code-block-header',
  'codeblock-title': 'code-block-title',
  'date-input-clear-icon': 'input-clear-icon',
  'date-range-input-clear-icon': 'input-clear-icon',
  hovercard: 'hover-card',
  'multi-selector-clear-icon': 'input-clear-icon',
  navicon: 'nav-icon',
  'popover-surface': 'popover',
  progressbar: 'progress-bar',
  'progressbar-fill': 'progress-bar-fill',
  'progressbar-mark': 'progress-bar-mark',
  'progressbar-track': 'progress-bar-track',
  radio: 'radio-indicator',
  'radio-dot': 'radio-indicator-dot',
  'selector-clear-icon': 'input-clear-icon',
  statusdot: 'status-dot',
  textarea: 'text-area',
});

/**
 * Clear-icon aliases each styled one owner's clear glyph. The shared target
 * styles every input's clear glyph, so CSS keeps the owner as an ancestor scope.
 * @type {Readonly<Record<string, string>>}
 */
export const SCOPED_CLEAR_ICON_OWNERS = Object.freeze({
  'date-input-clear-icon': 'date-input',
  'date-range-input-clear-icon': 'date-range-input',
  'multi-selector-clear-icon': 'multi-selector',
  'selector-clear-icon': 'selector',
});

const SELECTOR_DATA = {
  targets: V06_THEME_SELECTOR_TARGETS,
  dynamicAxes: V06_THEME_SELECTOR_DYNAMIC_AXES,
};

export const meta = {
  title: 'Migrate removed component theme aliases and selectors',
  description:
    'Renames all 21 removed component target aliases in static theme maps and CSS, and replaces target-qualified bare prop/state classes with reflected data attributes.',
  fileExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.css'],
};

const TODO_PREFIX = ' TODO(astryx upgrade): merge deprecated theme target ';
const SCOPE_TODO_PREFIX = ' TODO(astryx upgrade): ';
const KNOWN_SELECTOR_TARGETS = new Set([
  ...Object.keys(V06_THEME_SELECTOR_TARGETS),
  ...Object.keys(V06_THEME_SELECTOR_DYNAMIC_AXES),
]);
/** Every bare class token any 0.6 target emitted. */
const KNOWN_BARE_TOKENS = new Set(
  Object.values(V06_THEME_SELECTOR_TARGETS).flatMap(tokens =>
    Object.keys(tokens),
  ),
);

/** @param {string} target @param {string} token */
function targetEmittedBareClass(target, token) {
  if (V06_THEME_SELECTOR_TARGETS[target]?.[token] != null) return true;
  return (V06_THEME_SELECTOR_DYNAMIC_AXES[target] ?? []).some(rule =>
    rule.token === 'class-value'
      ? true
      : typeof rule.prefix === 'string' &&
        token.startsWith(rule.prefix) &&
        /^\d/.test(token.slice(rule.prefix.length)),
  );
}

/** @param {any} pseudo @returns {Set<string>} */
function compoundTargetsForPseudo(pseudo) {
  const parent = pseudo.parent;
  if (parent?.type !== 'selector' || !Array.isArray(parent.nodes)) {
    return new Set();
  }

  const index = parent.nodes.indexOf(pseudo);
  const compound = [];
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const node = parent.nodes[cursor];
    if (node.type === 'combinator') break;
    compound.push(node);
  }
  for (let cursor = index + 1; cursor < parent.nodes.length; cursor++) {
    const node = parent.nodes[cursor];
    if (node.type === 'combinator') break;
    compound.push(node);
  }

  const targets = new Set();
  for (const node of compound) {
    if (node.type !== 'class' || !node.value.startsWith('astryx-')) continue;
    const target = node.value.slice('astryx-'.length);
    if (KNOWN_SELECTOR_TARGETS.has(target)) targets.add(target);
  }
  return targets;
}

/** @param {any} selector */
function finishSelectorMigration(selector) {
  selector.walkPseudos((/** @type {any} */ pseudo) => {
    if (pseudo.value !== ':is' || !Array.isArray(pseudo.nodes)) return;
    const targets = compoundTargetsForPseudo(pseudo);
    if (targets.size === 0) return;
    const hasAttributeArm = pseudo.nodes.some(
      (/** @type {any} */ arm) =>
        arm.type === 'selector' &&
        arm.nodes.some((/** @type {any} */ node) => node.type === 'attribute'),
    );
    if (!hasAttributeArm) return;

    for (const arm of [...pseudo.nodes]) {
      if (arm.type !== 'selector' || arm.nodes.length !== 1) continue;
      const only = arm.nodes[0];
      if (
        only.type !== 'class' ||
        only.value.startsWith('astryx-') ||
        ![...targets].some(target => targetEmittedBareClass(target, only.value))
      ) {
        continue;
      }
      arm.remove();
    }
  });

  selector.walkClasses((/** @type {any} */ classNode) => {
    if (!classNode.value.startsWith('astryx-')) return;
    const oldKey = classNode.value.slice('astryx-'.length);
    const newKey = DEPRECATED_THEME_TARGETS[oldKey];
    if (!newKey) return;
    classNode.value = `astryx-${newKey}`;
    const owner = SCOPED_CLEAR_ICON_OWNERS[oldKey];
    if (owner) classNode.parent.insertAfter(classNode, ownerScope(owner));
  });
}

/**
 * `:where(.astryx-<owner> *)` keeps the alias's owner scope without changing
 * the selector's specificity.
 * @param {string} owner
 */
function ownerScope(owner) {
  return selectorParser.pseudo({
    value: ':where',
    nodes: [
      selectorParser.selector({
        value: '',
        nodes: [
          selectorParser.className({value: `astryx-${owner}`}),
          selectorParser.combinator({value: ' '}),
          selectorParser.universal({value: '*'}),
        ],
      }),
    ],
  });
}

/**
 * Bare classes that still qualify a known target after migration and that some
 * 0.6 target emitted. They can no longer match Astryx output.
 * @param {string} selectorText
 * @returns {string[]}
 */
function unclassifiedBareClasses(selectorText) {
  /** @type {Set<string>} */
  const found = new Set();
  processSelector(selectorText, selectors => {
    selectors.walk((/** @type {any} */ node) => {
      if (node.type !== 'selector') return;
      /** @type {any[][]} */
      const compounds = [[]];
      for (const child of node.nodes) {
        if (child.type === 'combinator') compounds.push([]);
        else compounds[compounds.length - 1].push(child);
      }
      for (const compound of compounds) {
        const hasTarget = compound.some(
          child =>
            child.type === 'class' &&
            child.value.startsWith('astryx-') &&
            KNOWN_SELECTOR_TARGETS.has(child.value.slice('astryx-'.length)),
        );
        if (!hasTarget) continue;
        for (const child of compound) {
          if (
            child.type === 'class' &&
            !child.value.startsWith('astryx-') &&
            KNOWN_BARE_TOKENS.has(child.value)
          ) {
            found.add(child.value);
          }
        }
      }
    });
  });
  return [...found].sort();
}

/** @param {string | import('postcss').Rule} selector selector text, or the rule that holds it */
function finishSelectorText(selector) {
  return processSelector(selector, selectors => {
    selectors.each(finishSelectorMigration);
  });
}

/**
 * Migrate each parenthesized selector group of an `@scope` prelude.
 * @param {string} params
 * @param {(selector: string, start: number) => string} [finish] migrates one group; `start` is its offset in `params`
 */
function finishScopeParams(params, finish = finishSelectorText) {
  let result = '';
  let last = 0;
  let depth = 0;
  let groupStart = -1;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < params.length; index++) {
    const char = params[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') {
      if (depth === 0) {
        result += params.slice(last, index + 1);
        groupStart = index + 1;
      }
      depth++;
      continue;
    }
    if (char === ')' && depth > 0) {
      depth--;
      if (depth === 0 && groupStart >= 0) {
        result += finish(params.slice(groupStart, index), groupStart);
        result += ')';
        last = index + 1;
        groupStart = -1;
      }
    }
  }
  return result + params.slice(last);
}

/** @param {string} source @param {string} from */
function migrateCss(source, from) {
  // Parse every selector of the stylesheet as written first, so one the
  // selector parser rejects is reported at its line and column in the file,
  // not in the migrated text below.
  const original = parseCss(source, {from});
  original.walkRules(rule => {
    processSelector(rule, () => {});
  });
  original.walkAtRules('scope', atRule => {
    const offset =
      `@${atRule.name}`.length + (atRule.raws.afterName ?? '').length;
    finishScopeParams(atRule.params, (selector, start) => {
      try {
        processSelector(selector, () => {});
      } catch (err) {
        if (!isCodemodParseError(err)) throw err;
        throw markParseError(
          atRule.error(/** @type {Error} */ (err).message, {
            index: offset + start,
          }),
        );
      }
      return selector;
    });
  });
  const migrated = migrateAstryxThemeSelectors(source, from, SELECTOR_DATA);
  const root = parseCss(migrated, {from});
  /** @type {Set<string>} */
  const existingComments = new Set();
  root.walkComments(comment => {
    existingComments.add(comment.text.trim());
  });
  root.walkRules(rule => {
    rule.selector = finishSelectorText(rule);
    const tokens = unclassifiedBareClasses(rule.selector);
    if (tokens.length === 0) return;
    const list = tokens.map(token => `.${token}`).join(', ');
    const text =
      `${SCOPE_TODO_PREFIX}Astryx 0.7 no longer emits bare prop/state classes, and ${list} had no known 0.6 meaning on this target. Replace it with the target's data-* attribute or remove it.`.trim();
    if (existingComments.has(text)) return;
    rule.before(postcss.comment({text}));
    existingComments.add(text);
  });
  root.walkAtRules('scope', atRule => {
    atRule.params = finishScopeParams(atRule.params);
  });
  return root.toString();
}

/** @param {any} property @returns {string | null} */
function staticPropertyName(property) {
  const key = property?.key;
  if (!key) return null;
  if (!property.computed && key.type === 'Identifier') return key.name;
  if (
    (key.type === 'StringLiteral' || key.type === 'Literal') &&
    typeof key.value === 'string'
  ) {
    return key.value;
  }
  return null;
}

const ASTRYX_MODULE = /^@astryxdesign\//u;
const THEME_TYPE_NAMES = new Set([
  'DefineThemeInput',
  'DefinedTheme',
  'ResolvedDefinedTheme',
]);
const TS_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TypeCastExpression',
  'ParenthesizedExpression',
]);

/**
 * The export name a same-stem theme descriptor beside this file declares
 * (`brandTheme` for `brandTheme.ts` beside `brandTheme.doc.mjs`), or null. The
 * descriptor is read statically, never executed; an unreadable or non-theme
 * descriptor is not proof.
 * @param {string} filePath
 * @returns {string | null}
 */
function describedThemeExportName(filePath) {
  const stem = path.basename(filePath, path.extname(filePath));
  const docPath = path.join(path.dirname(filePath), `${stem}.doc.mjs`);
  if (!fs.existsSync(docPath)) return null;
  try {
    return readThemeDescriptorValue(docPath, `Theme descriptor ${docPath}`)
      .type === 'theme'
      ? stem
      : null;
  } catch {
    return null;
  }
}

/**
 * Top-level local names this module exports under `exportName`: an exported
 * declaration of that name, or a source-less `export {local as exportName}`.
 * @param {any} root @param {any} j @param {string} exportName
 */
function localNamesExportedAs(root, j, exportName) {
  /** @type {Set<string>} */
  const locals = new Set();
  root
    .find(j.ExportNamedDeclaration)
    .forEach((/** @type {any} */ exportPath) => {
      const node = exportPath.node;
      if (node.exportKind === 'type' || node.source) return;
      for (const declarator of node.declaration?.declarations ?? []) {
        if (declarator.id?.name === exportName) locals.add(exportName);
      }
      for (const specifier of node.specifiers ?? []) {
        const exported = specifier.exported?.name ?? specifier.exported?.value;
        const local = specifier.local?.name ?? specifier.local?.value;
        if (
          specifier.exportKind !== 'type' &&
          exported === exportName &&
          typeof local === 'string'
        ) {
          locals.add(local);
        }
      }
    });
  return locals;
}

/**
 * Astryx's `defineTheme` imports (resolved at each call site, so a shadowing
 * parameter or local never counts), its theme types, an Astryx namespace
 * import, and the binding a theme descriptor declares.
 * @param {any} root @param {any} j @param {string} filePath
 */
function astryxThemeBindings(root, j, filePath) {
  /** @type {Set<string> | undefined} */
  let describedLocals;
  const bindings = {
    defineTheme: importedComponents(root, j, {
      matchesImport: source => ASTRYX_MODULE.test(source),
      components: new Map([['defineTheme', new Set()]]),
    }),
    themeTypes: new Set(),
    namespaces: new Set(),
    /**
     * Top-level locals exported under the descriptor's name. Read lazily:
     * only a direct theme-shaped object needs the descriptor.
     * @returns {Set<string>}
     */
    describedThemeLocals() {
      if (describedLocals == null) {
        const exportName = describedThemeExportName(filePath);
        describedLocals = exportName
          ? localNamesExportedAs(root, j, exportName)
          : new Set();
      }
      return describedLocals;
    },
  };
  root.find(j.ImportDeclaration).forEach((/** @type {any} */ importPath) => {
    const source = importPath.node.source?.value;
    if (typeof source !== 'string' || !ASTRYX_MODULE.test(source)) return;
    for (const specifier of importPath.node.specifiers ?? []) {
      const local = specifier.local?.name;
      if (!local) continue;
      if (specifier.type === 'ImportNamespaceSpecifier') {
        bindings.namespaces.add(local);
      } else if (specifier.type === 'ImportSpecifier') {
        const imported = specifier.imported?.name ?? specifier.imported?.value;
        if (THEME_TYPE_NAMES.has(imported)) bindings.themeTypes.add(local);
      }
    }
  });
  return bindings;
}

/** @param {any} name @param {Set<string>} locals @param {Set<string>} namespaces @param {Set<string>} members */
function namesBinding(name, locals, namespaces, members) {
  if (name?.type === 'Identifier') return locals.has(name.name);
  const object = name?.object ?? name?.left;
  const property = name?.property ?? name?.right;
  return (
    object?.type === 'Identifier' &&
    namespaces.has(object.name) &&
    property?.type === 'Identifier' &&
    members.has(property.name)
  );
}

/** @param {any} typeNode @param {any} usePath @param {ReturnType<typeof astryxThemeBindings>} bindings */
function isAstryxThemeType(typeNode, usePath, bindings) {
  const node = typeNode?.typeAnnotation ?? typeNode;
  if (
    node?.type !== 'TSTypeReference' ||
    !namesBinding(
      node.typeName,
      bindings.themeTypes,
      bindings.namespaces,
      THEME_TYPE_NAMES,
    )
  ) {
    return false;
  }
  const root =
    node.typeName.type === 'Identifier' ? node.typeName : node.typeName.left;
  return isModuleTypeBinding(usePath, root.name);
}

/** @param {any} statement @param {string} name */
function statementDeclares(statement, name) {
  const node =
    statement?.type === 'ExportNamedDeclaration' ||
    statement?.type === 'ExportDefaultDeclaration'
      ? statement.declaration
      : statement;
  if (node?.id?.type === 'Identifier' && node.id.name === name) return true;
  return (node?.declarations ?? []).some(
    (/** @type {any} */ declarator) =>
      declarator.id?.type === 'Identifier' && declarator.id.name === name,
  );
}

/**
 * True when a type-position `name` at `path` can only mean the module-scope
 * import: no enclosing type parameter, parameter, or block-level declaration
 * (type alias, interface, enum, class, namespace, function, or variable)
 * reuses the name. Anything this cannot rule out counts as shadowed.
 * @param {any} path @param {string} name
 */
function isModuleTypeBinding(path, name) {
  const valueScope = path.scope?.lookup(name);
  if (valueScope != null && valueScope.path.node.type !== 'Program') {
    return false;
  }
  for (let current = path; current != null; current = current.parent) {
    const node = current.node;
    if (node.type === 'Program') return true;
    const typeParameters = node.typeParameters?.params ?? [];
    if (
      typeParameters.some(
        (/** @type {any} */ parameter) =>
          (parameter.name?.name ?? parameter.name) === name,
      )
    ) {
      return false;
    }
    const statements =
      node.type === 'SwitchCase'
        ? node.consequent
        : node.type !== 'ClassBody' && Array.isArray(node.body)
          ? node.body
          : [];
    if (
      statements.some((/** @type {any} */ statement) =>
        statementDeclares(statement, name),
      )
    ) {
      return false;
    }
  }
  return false;
}

/**
 * True for a theme object whose shape alone identifies it: a static string
 * `name` beside a `components` map whose entries are all style objects.
 * @param {any} node
 */
function isDirectThemeObject(node) {
  const properties = node.properties ?? [];
  const name = properties.find(
    (/** @type {any} */ property) => staticPropertyName(property) === 'name',
  );
  if (!(
    (name?.value?.type === 'StringLiteral' ||
      name?.value?.type === 'Literal') &&
    typeof name.value.value === 'string'
  )) {
    return false;
  }
  const components = properties.find(
    (/** @type {any} */ property) =>
      staticPropertyName(property) === 'components',
  );
  const map = components?.value;
  if (map?.type === 'Identifier') return true;
  return (
    map?.type === 'ObjectExpression' &&
    map.properties.every(
      (/** @type {any} */ entry) =>
        entry.type === 'SpreadElement' ||
        entry.value?.type === 'ObjectExpression',
    )
  );
}

/**
 * True when this object literal initializes the top-level binding that the
 * file's theme descriptor declares, directly or through TypeScript wrappers.
 * @param {any} objectPath @param {ReturnType<typeof astryxThemeBindings>} bindings
 */
function isDescribedThemeBinding(objectPath, bindings) {
  let parent = objectPath.parent;
  while (parent != null && TS_WRAPPERS.has(parent.node.type)) {
    parent = parent.parent;
  }
  const declarator = parent?.node;
  if (
    declarator?.type !== 'VariableDeclarator' ||
    declarator.id?.type !== 'Identifier'
  ) {
    return false;
  }
  const declaration = parent.parent;
  const container = declaration?.parent?.node;
  const topLevel =
    container?.type === 'Program' ||
    (container?.type === 'ExportNamedDeclaration' &&
      declaration.parent.parent?.node.type === 'Program');
  return topLevel && bindings.describedThemeLocals().has(declarator.id.name);
}

/**
 * True when this object literal is an Astryx theme: the argument of an
 * imported `defineTheme()`, typed as an Astryx theme, or the direct theme
 * object a theme descriptor declares.
 * @param {any} objectPath @param {ReturnType<typeof astryxThemeBindings>} bindings
 */
function isThemeRoot(objectPath, bindings) {
  let child = objectPath;
  let parent = objectPath.parent;
  while (parent != null && TS_WRAPPERS.has(parent.node.type)) {
    if (isAstryxThemeType(parent.node.typeAnnotation, parent, bindings)) {
      return true;
    }
    child = parent;
    parent = parent.parent;
  }
  const node = parent?.node;
  if (
    node?.type === 'CallExpression' &&
    node.arguments?.[0] === child.node &&
    resolveImportedComponent(node.callee, parent, bindings.defineTheme)
  ) {
    return true;
  }
  if (
    node?.type === 'VariableDeclarator' &&
    isAstryxThemeType(node.id?.typeAnnotation, parent, bindings)
  ) {
    return true;
  }
  return (
    isDirectThemeObject(objectPath.node) &&
    isDescribedThemeBinding(objectPath, bindings)
  );
}

/**
 * Walk outward from the object that owns a `components` property, through
 * nested theme sections such as `onDark` and `adaptations.rules[].value`,
 * until reaching a theme root. Leaving literal object/array structure ends
 * the search.
 * @param {any} ownerPath @param {ReturnType<typeof astryxThemeBindings>} bindings
 */
function hasThemeContext(ownerPath, bindings) {
  for (let current = ownerPath; current != null;) {
    if (current.node.type === 'ObjectExpression') {
      if (isThemeRoot(current, bindings)) return true;
    }
    let parent = current.parent;
    while (parent != null && TS_WRAPPERS.has(parent.node.type)) {
      parent = parent.parent;
    }
    const type = parent?.node.type;
    if (type === 'ObjectProperty' || type === 'Property') {
      current = parent.parent;
    } else if (type === 'ArrayExpression') {
      current = parent;
    } else {
      return false;
    }
  }
  return false;
}

/** @param {any} objectPath @param {any} root @param {any} j @param {ReturnType<typeof astryxThemeBindings>} bindings */
function componentsVariableFeedsTheme(objectPath, root, j, bindings) {
  const parent = objectPath.parent?.node;
  if (
    parent?.type !== 'VariableDeclarator' ||
    parent.id?.type !== 'Identifier' ||
    parent.id.name !== 'components'
  ) {
    return false;
  }

  const bindingScope = objectPath.scope.lookup('components');
  let feedsTheme = false;
  root.find(j.ObjectProperty).forEach((/** @type {any} */ propertyPath) => {
    if (feedsTheme) return;
    const property = propertyPath.node;
    if (
      staticPropertyName(property) !== 'components' ||
      property.value?.type !== 'Identifier' ||
      property.value.name !== 'components'
    ) {
      return;
    }
    if (
      bindingScope != null &&
      propertyPath.scope.lookup('components') !== bindingScope
    ) {
      return;
    }
    if (hasThemeContext(propertyPath.parent, bindings)) feedsTheme = true;
  });
  return feedsTheme;
}

/** @param {any} path @param {any} root @param {any} j @param {ReturnType<typeof astryxThemeBindings>} bindings */
function isComponentsMap(path, root, j, bindings) {
  let parentPath = path.parent;
  while (parentPath != null && TS_WRAPPERS.has(parentPath.node.type)) {
    parentPath = parentPath.parent;
  }
  const parent = parentPath?.node;
  if (
    (parent?.type === 'ObjectProperty' || parent?.type === 'Property') &&
    staticPropertyName(parent) === 'components'
  ) {
    return hasThemeContext(parentPath.parent, bindings);
  }
  return componentsVariableFeedsTheme(path, root, j, bindings);
}

/** @param {any} property @param {string} oldKey @param {string} newKey @param {any} j */
function addCollisionTodo(property, oldKey, newKey, j) {
  const message = `${TODO_PREFIX}\`${oldKey}\` into \`${newKey}\`; both keys are present. `;
  if (
    property.comments?.some(
      (/** @type {any} */ comment) => comment.value === message,
    )
  )
    return;
  property.comments = [
    ...(property.comments ?? []),
    j.commentBlock(message, true, false),
  ];
}

/**
 * A theme key cannot carry an ancestor scope, so a renamed clear-icon alias now
 * styles every input's clear icon. Say so where the rename happened.
 * @param {any} property @param {string} oldKey @param {string} owner @param {any} j
 */
function addScopeTodo(property, oldKey, owner, j) {
  const message = `${SCOPE_TODO_PREFIX}\`${oldKey}\` became \`input-clear-icon\`, which styles the clear icon of every input. To keep these styles on one component, move them to CSS under \`.astryx-input-clear-icon:where(.astryx-${owner} *)\`. `;
  property.comments = [
    ...(property.comments ?? []),
    j.commentBlock(message, true, false),
  ];
}

/** @param {string} source @param {string} filePath @param {any} j */
function migrateStaticThemeKeys(source, filePath, j) {
  const root = j(source);
  const bindings = astryxThemeBindings(root, j, filePath);
  let changed = false;

  root.find(j.ObjectExpression).forEach((/** @type {any} */ objectPath) => {
    if (!isComponentsMap(objectPath, root, j, bindings)) return;
    const properties = objectPath.node.properties ?? [];
    const staticKeys = new Set(
      properties.map(staticPropertyName).filter(Boolean),
    );

    for (const property of properties) {
      if (property.type !== 'ObjectProperty' && property.type !== 'Property') {
        continue;
      }
      const oldKey = staticPropertyName(property);
      const newKey = oldKey ? DEPRECATED_THEME_TARGETS[oldKey] : undefined;
      if (!oldKey || !newKey) continue;

      if (staticKeys.has(newKey)) {
        const before = property.comments?.length ?? 0;
        addCollisionTodo(property, oldKey, newKey, j);
        if ((property.comments?.length ?? 0) !== before) changed = true;
        continue;
      }

      property.key = j.stringLiteral(newKey);
      property.computed = false;
      property.shorthand = false;
      const owner = SCOPED_CLEAR_ICON_OWNERS[oldKey];
      if (owner) addScopeTodo(property, oldKey, owner, j);
      staticKeys.delete(oldKey);
      staticKeys.add(newKey);
      changed = true;
    }
  });

  return changed ? root.toSource({quote: 'single'}) : undefined;
}

/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | null | undefined}
 */
export default function migrateDeprecatedThemeSurface(file, api) {
  const extension = path.extname(file.path).toLowerCase();
  if (extension === '.css') {
    const result = migrateCss(file.source, file.path);
    return result === file.source ? undefined : result;
  }
  return migrateStaticThemeKeys(file.source, file.path, api.jscodeshift);
}
