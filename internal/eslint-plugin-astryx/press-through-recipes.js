// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file press-through-recipes.js
 * @description Reports press code written outside the press recipes. One
 * engine, the page press controller, writes every pressed state in Core, and
 * each pressable surface uses one of three recipes: a momentary control, a
 * row-wide target, or a cell or menu row. A group slide, a press held through
 * a drag, and a menu's lit row are profiles of that engine.
 *
 * Reported, in shipped Core and Lab source outside the press modules:
 *   - (a) an import of a press profile or a recipe's inner module
 *     (`PressTracker`, the action-group tracker's own module, the menu press
 *     helpers, the engine's gesture module), by relative path or by package
 *     subpath. A recipe's entry point is always
 *     allowed: the engine (`usePressFeedback`, `utils/pressFeedback`), its
 *     group profile (`useGroupPressTracking`, `useActionGroupTracking`,
 *     `pressGroupContext`), the row-wide target (`useClickableContainer`,
 *     `utils/boxHold`), the cell or menu row (`useMenuPress` with its
 *     `menuPressOnItems` and `menuPressGesture` modules), and the recipe
 *     styles. An import that brings
 *     only constants (UPPER_SNAKE_CASE names) is allowed: the guard is about
 *     trackers and pressed state, not shared numbers;
 *   - (b) pressed state of a component's own: a `useState` whose name starts
 *     with `pressed`, `isPressed` or `platter`, or ends in `Pressed` or
 *     `Platter`, set from a pointer-down or touch-start handler;
 *   - (c) a press data attribute of a component's own: a `data-` name with
 *     a `press`, `pressed`, `pressing` or `pressable` word between dashes,
 *     outside the `data-astryx-` namespace (no-raw-private-attribute covers
 *     that namespace);
 *   - (d) a `:active` arm in `stylex.create` or a `stylex.when.*` selector
 *     outside the shared press styles, since the engine paints a mouse press
 *     in place of CSS `:active`.
 *
 * Known limitations: pressed state held in a ref, a reducer or an external
 * store, a handler passed through another component, a press attribute
 * built at run time, and an inner module re-exported through an entry other
 * than the gestures folder index (`internal/touch` re-exports none today)
 * are not seen.
 *
 * Options: `{baseline: {[repoRelativeFile]: string[]}, root: string}`. The
 * baseline lists, per file, each report's token once per site that predates
 * the rule; that many stay allowed until they move into a recipe, and one
 * more is reported. The list only shrinks.
 * `press-through-recipes.baseline.mjs` writes it.
 */

import path from 'node:path';
import {baselineAllowance} from './rule-baseline.mjs';

/**
 * Where the repository config enforces the rule with its baseline: shipped
 * Core and Lab source. Shared with the baseline script so both lint the same
 * files.
 */
export const scope = {
  files: [
    'packages/core/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs}',
    'packages/lab/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs}',
  ],
  ignores: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/*.testing.*',
    '**/*.render-testing.*',
    '**/__tests__/**',
    '**/__fixtures__/**',
    '**/dist/**',
  ],
};

/**
 * Core modules, by path under `packages/core/src` without extension, that a
 * recipe or a profile owns. `entry` modules may be imported from anywhere;
 * the others only from press modules. Every module listed here is exempt from
 * the checks, since it is the press code.
 */
export const PRESS_MODULES = {
  'momentary control and the engine': {
    entry: [
      'hooks/usePressFeedback',
      'utils/pressFeedback',
      'utils/interactionOverlay.stylex',
      'privateAttributes/press',
      'privateAttributes/press.stylex',
      'privateAttributes/pressHeld.stylex',
      'privateAttributes/pressHoldsDrag.stylex',
      'privateAttributes/pressGroupItem.stylex',
      // The group profile: the action-group tracker, reached through these.
      'hooks/useGroupPressTracking',
      'hooks/useActionGroupTracking',
      'hooks/pressGroupContext',
    ],
    inner: [
      'utils/pressGesture',
      'hooks/actionGroupTracker',
      // A press tracker still to fold into the engine.
      'gestures/PressTracker',
      'gestures/usePressTracker',
    ],
  },
  'row-wide target': {
    entry: [
      'hooks/useClickableContainer',
      'utils/boxHold',
      'privateAttributes/pressBox.stylex',
    ],
    inner: [],
  },
  'cell or menu row': {
    entry: [
      'hooks/useMenuPress',
      'hooks/menuPressOnItems',
      'hooks/menuPressGesture',
      'privateAttributes/menuPressLit.stylex',
    ],
    inner: ['hooks/menuPressValues', 'hooks/menuPressMarker'],
  },
};

const ENTRY_MODULES = new Set(
  Object.values(PRESS_MODULES).flatMap(recipe => recipe.entry),
);
const INNER_MODULES = new Set(
  Object.values(PRESS_MODULES).flatMap(recipe => recipe.inner),
);
const ALL_MODULES = new Set([...ENTRY_MODULES, ...INNER_MODULES]);

/** What to import instead of an inner module, when it is not the recipe's entry. */
const IMPORT_HINTS = {
  'hooks/actionGroupTracker':
    'For a press that slides across a group, use `useGroupPressTracking` or `useActionGroupTracking`',
  'gestures/PressTracker':
    'For a press held through a drag, keep the press in the engine (`usePressFeedback`); the touch press tracker is still to fold into it',
  'gestures/usePressTracker':
    'For a press held through a drag, keep the press in the engine (`usePressFeedback`); the touch press tracker is still to fold into it',
  'utils/pressGesture': 'Import only its constants, or use `usePressFeedback`',
  'hooks/menuPressValues': 'Use `useMenuPress`',
  'hooks/menuPressMarker': 'Use `useMenuPress`',
};

/**
 * The tracker names the gestures folder index re-exports, with their modules.
 * A type-only import through that index escapes the barrel rule.
 */
const GESTURES_INDEX_NAMES = {
  createPressTracker: 'gestures/PressTracker',
  PressTracker: 'gestures/PressTracker',
  PressTrackerOptions: 'gestures/PressTracker',
  usePressTracker: 'gestures/usePressTracker',
  UsePressTrackerOptions: 'gestures/usePressTracker',
};

const CORE_PACKAGE = /^@astryxdesign\/core\//;
// A state name that starts with `pressed`, `isPressed` or `platter`, or ends
// in `Pressed` or `Platter` (`isCompressed` and `unpressedCount` do not).
const PRESSED_NAME =
  /^(?:is)?[Pp]ressed(?![a-z])|^[Pp]latter(?![a-z])|[a-z](?:Pressed|Platter)$/;
const POINTER_DOWN_PROP = /^on(?:PointerDown|TouchStart)(?:Capture)?$/;
const POINTER_DOWN_EVENT = /^(?:pointerdown|touchstart)$/;
// A `press` word between dashes (`data-is-pressed`, `data-card-press-state`);
// `data-expressive` is not one.
const OWN_PRESS_ATTRIBUTE =
  /^data-(?!astryx-)(?:[a-z0-9]+-)*press(?:ed|ing|able)?(?:-|$)/i;
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;

/** The Core module a file is, or null outside Core's source. */
function coreModuleOf(filename) {
  const normalized = filename.split(path.sep).join('/');
  const marker = '/packages/core/src/';
  const at = normalized.lastIndexOf(marker);
  if (at === -1) return null;
  return normalized
    .slice(at + marker.length)
    .replace(SOURCE_EXTENSION, '')
    .replace(/\/index$/, '');
}

/**
 * The folder a Core file is in, under `packages/core/src`, or null outside
 * Core's source. An `index` file resolves from its own folder.
 */
function coreFolderOf(filename) {
  const normalized = filename.split(path.sep).join('/');
  const marker = '/packages/core/src/';
  const at = normalized.lastIndexOf(marker);
  if (at === -1) return null;
  return path.posix.dirname(normalized.slice(at + marker.length));
}

/** The Core module a relative specifier names from a Core folder, or null. */
function resolveRelative(fileFolder, specifier) {
  if (fileFolder == null || !specifier.startsWith('.')) return null;
  const joined = path.posix.normalize(path.posix.join(fileFolder, specifier));
  if (joined.startsWith('..')) return null;
  return joined.replace(SOURCE_EXTENSION, '').replace(/\/index$/, '');
}

/** The recipe a module belongs to, in plain words. */
function recipeOf(module) {
  return (
    Object.entries(PRESS_MODULES).find(
      ([, recipe]) =>
        recipe.entry.includes(module) || recipe.inner.includes(module),
    )?.[0] ?? null
  );
}

const RECIPES_IN_WORDS =
  'one of the three press recipes the press feedback record describes: a momentary control (`usePressFeedback`), a row-wide target (`useClickableContainer`), or a cell or menu row (`useMenuPress`)';

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report press trackers, pressed state, press attributes and :active arms outside the press recipes',
    },
    schema: [
      {
        type: 'object',
        properties: {
          baseline: {type: 'object'},
          root: {type: 'string'},
        },
        additionalProperties: false,
      },
    ],
    messages: {
      innerImport:
        '`{{token}}` is a press module inside the {{recipe}} recipe. Press code goes through {{recipes}}. {{hint}}, or ask the record’s owner to change a recipe.',
      pressedState:
        '`{{token}}` is pressed state of this component’s own. Press code goes through {{recipes}}. The engine keeps the pressed state; mark the element pressable instead.',
      pressAttribute:
        '`{{token}}` is a press attribute of this component’s own. Press code goes through {{recipes}}. The recipe owns the press attribute.',
      activeArm:
        '`{{token}}` paints a press with CSS outside the shared press styles. Press code goes through {{recipes}}. The engine paints every pointer’s press; use the recipe styles.',
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    const fileModule = coreModuleOf(filename);
    const fileFolder = coreFolderOf(filename);
    if (fileModule != null && ALL_MODULES.has(fileModule)) return {};
    const isAllowed = baselineAllowance(context);
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function report(node, messageId, token, data = {}) {
      if (isAllowed(token)) return;
      context.report({
        node,
        messageId,
        data: {token, recipes: RECIPES_IN_WORDS, ...data},
      });
    }

    /** Check (a) for one import, export-from or import() of `specifier`. */
    function checkSource(node, specifier, importedNames) {
      if (typeof specifier !== 'string') return;
      const onlyConstants =
        importedNames != null &&
        importedNames.length > 0 &&
        importedNames.every(name => CONSTANT_NAME.test(name));
      const relative = resolveRelative(fileFolder, specifier);
      const modules = new Set();
      if (relative != null && INNER_MODULES.has(relative)) {
        modules.add(relative);
      } else if (relative === 'gestures') {
        for (const name of importedNames ?? []) {
          const module = GESTURES_INDEX_NAMES[name];
          if (module != null) modules.add(module);
        }
      } else if (CORE_PACKAGE.test(specifier)) {
        const subpath = specifier.replace(CORE_PACKAGE, '');
        if (INNER_MODULES.has(subpath)) modules.add(subpath);
      }
      if (onlyConstants) return;
      for (const module of modules) {
        report(node, 'innerImport', `import:${module}`, {
          recipe: recipeOf(module),
          hint: IMPORT_HINTS[module] ?? 'Import the recipe’s entry point',
        });
      }
    }

    function importedNamesOf(specifiers) {
      return specifiers.map(specifier =>
        specifier.type === 'ImportSpecifier'
          ? (specifier.imported.name ?? specifier.imported.value)
          : specifier.type === 'ExportSpecifier'
            ? (specifier.local.name ?? specifier.local.value)
            : '*',
      );
    }

    // Check (b): pressed-state setters, and the handlers that run on a
    // pointer down or touch start.
    const pressedSetters = new Map();
    const setterCalls = [];
    const handlerNodes = new Set();
    const handlerNames = new Set();

    function noteHandler(value) {
      if (value == null) return;
      const expression =
        value.type === 'JSXExpressionContainer' ? value.expression : value;
      if (expression.type === 'Identifier') {
        handlerNames.add(expression.name);
      } else {
        handlerNodes.add(expression);
      }
    }

    function isStylexCall(node, method) {
      return (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'stylex' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === method
      );
    }

    function isStylexWhen(node) {
      const callee = node.callee;
      return (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'MemberExpression' &&
        callee.object.object.type === 'Identifier' &&
        callee.object.object.name === 'stylex' &&
        callee.object.property.type === 'Identifier' &&
        callee.object.property.name === 'when'
      );
    }

    function keyText(property) {
      if (property.computed) {
        return property.key.type === 'Literal' &&
          typeof property.key.value === 'string'
          ? property.key.value
          : null;
      }
      if (property.key.type === 'Literal') return String(property.key.value);
      return null;
    }

    function checkActiveArms(node) {
      if (node == null || typeof node !== 'object') return;
      if (node.type === 'Property') {
        const key = keyText(node);
        if (key != null && /:active\b/.test(key)) {
          report(node.key, 'activeArm', ':active');
        }
      }
      for (const [field, child] of Object.entries(node)) {
        if (field === 'parent' || field === 'loc' || field === 'range')
          continue;
        if (Array.isArray(child)) child.forEach(checkActiveArms);
        else if (child && typeof child.type === 'string')
          checkActiveArms(child);
      }
    }

    return {
      ImportDeclaration(node) {
        checkSource(node, node.source.value, importedNamesOf(node.specifiers));
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          checkSource(
            node,
            node.source.value,
            importedNamesOf(node.specifiers),
          );
        }
      },
      ExportAllDeclaration(node) {
        checkSource(node, node.source.value, ['*']);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') {
          checkSource(node, node.source.value, null);
        }
      },

      VariableDeclarator(node) {
        if (
          node.id.type !== 'ArrayPattern' ||
          node.init?.type !== 'CallExpression'
        ) {
          return;
        }
        const callee = node.init.callee;
        const name =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' &&
                callee.property.type === 'Identifier'
              ? callee.property.name
              : null;
        const [state, setter] = node.id.elements;
        if (
          name === 'useState' &&
          state?.type === 'Identifier' &&
          setter?.type === 'Identifier' &&
          PRESSED_NAME.test(state.name)
        ) {
          pressedSetters.set(setter.name, state.name);
        }
      },
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null;
        if (name == null) return;
        if (POINTER_DOWN_PROP.test(name)) noteHandler(node.value);
        if (OWN_PRESS_ATTRIBUTE.test(name)) {
          report(node.name, 'pressAttribute', name);
        }
      },
      Property(node) {
        const key =
          node.key.type === 'Identifier' ? node.key.name : keyText(node);
        if (key != null && POINTER_DOWN_PROP.test(key)) noteHandler(node.value);
      },
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'addEventListener' &&
          node.arguments[0]?.type === 'Literal' &&
          POINTER_DOWN_EVENT.test(String(node.arguments[0].value))
        ) {
          noteHandler(node.arguments[1]);
        }
        if (node.callee.type === 'Identifier') {
          setterCalls.push({node, ancestors: sourceCode.getAncestors(node)});
        }
        if (isStylexCall(node, 'create')) {
          node.arguments.forEach(checkActiveArms);
        }
        if (
          isStylexWhen(node) &&
          node.arguments[0]?.type === 'Literal' &&
          /:active\b/.test(String(node.arguments[0].value))
        ) {
          report(node.arguments[0], 'activeArm', ':active');
        }
      },
      Literal(node) {
        if (
          typeof node.value === 'string' &&
          OWN_PRESS_ATTRIBUTE.test(node.value) &&
          /^data-[\w$-]+$/.test(node.value) &&
          node.parent?.type !== 'ImportDeclaration' &&
          node.parent?.type !== 'ExportNamedDeclaration'
        ) {
          report(node, 'pressAttribute', node.value);
        }
      },
      TemplateLiteral(node) {
        const text = node.quasis
          .map(quasi => quasi.value.cooked ?? '')
          .join('${}');
        const match =
          /^data-(?:[a-z0-9]+-)*press(?:ed|ing|able)?(?:-[\w${}-]*)?$/i.exec(
            text,
          ) ?? /^data-(?:[a-z0-9]+-)*press(?:ed|ing|able)?-/i.exec(text);
        if (
          match &&
          !text.startsWith('data-astryx-') &&
          !text.startsWith('data-${}')
        ) {
          report(node, 'pressAttribute', match[0]);
        }
      },

      'Program:exit'() {
        if (pressedSetters.size === 0) return;
        const namedHandlers = new Set();
        for (const name of handlerNames) {
          const variable = sourceCode.scopeManager?.globalScope
            ? findVariable(sourceCode, name)
            : null;
          for (const definition of variable?.defs ?? []) {
            if (definition.type === 'FunctionName') {
              namedHandlers.add(definition.node);
            } else if (definition.type === 'Variable' && definition.node.init) {
              namedHandlers.add(definition.node.init);
            }
          }
        }
        for (const {node, ancestors} of setterCalls) {
          const state = pressedSetters.get(node.callee.name);
          if (state == null) continue;
          if (
            ancestors.some(
              ancestor =>
                handlerNodes.has(ancestor) || namedHandlers.has(ancestor),
            )
          ) {
            report(node, 'pressedState', `pressed-state:${state}`);
          }
        }
      },
    };
  },
};

/** The variable a name refers to anywhere in the file's scopes. */
function findVariable(sourceCode, name) {
  const stack = [sourceCode.scopeManager.globalScope];
  while (stack.length > 0) {
    const scope = stack.pop();
    const variable = scope.set.get(name);
    if (variable && variable.defs.length > 0) return variable;
    stack.push(...scope.childScopes);
  }
  return null;
}
