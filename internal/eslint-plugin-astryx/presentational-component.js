// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentational-component.js
 * @description ESLint rule enforcing presentational component constraints.
 *
 * Presentational components must not:
 * 1. Remember things — no useState, useReducer, useTransition
 * 2. Watch things — no useEffect, useLayoutEffect, useRef, ResizeObserver, etc.
 * 3. Boss children around — no createContext
 *
 * Applied to components listed in PRESENTATIONAL_COMPONENTS.
 * useId, useMemo, useCallback, useContext (read-only) are allowed.
 *
 * See: https://github.com/meta/astryx/issues/493
 */

/**
 * Components that must remain presentational.
 * A component is presentational if: same props → same output, always.
 * It never remembers, watches, or coordinates on its own.
 */
const PRESENTATIONAL_COMPONENTS = new Set([
  'AspectRatio',
  'Badge',
  'Card',
  'Center',
  'Divider',
  'EmptyState',
  'Field',
  'FormLayout',
  'Grid',
  'Layout',
  'Link',
  'NavIcon',
  'ProgressBar',
  'Section',
  'Skeleton',
  'Stack',
  'StatusDot',
  'Token',
]);

/**
 * Hooks that mean the component "remembers" things.
 */
const REMEMBERS = new Set([
  'useState',
  'useReducer',
  'useTransition',
  'useDeferredValue',
  'useOptimistic',
]);

/**
 * Hooks/APIs that mean the component "watches" things.
 * useRef is included because in practice it's used for DOM observation.
 */
const WATCHES = new Set([
  'useEffect',
  'useLayoutEffect',
  'useInsertionEffect',
  'useRef',
  'ResizeObserver',
  'IntersectionObserver',
  'MutationObserver',
  'requestAnimationFrame',
  'requestIdleCallback',
]);

/**
 * APIs that mean the component "bosses children around".
 */
const COORDINATES = new Set([
  'createContext',
]);

/**
 * Get the filename without path or extension.
 */
function getFileStem(filename) {
  return filename.split('/').pop().replace(/\.(tsx?|jsx?)$/, '');
}

/**
 * Check if the current file is a presentational component file.
 */
function isPresentationalFile(filename) {
  const stem = getFileStem(filename);
  return PRESENTATIONAL_COMPONENTS.has(stem);
}

const presentationalComponentRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent presentational components from remembering, watching, or coordinating',
      category: 'Astryx Architecture',
      recommended: true,
      url: 'https://github.com/meta/astryx/issues/493',
    },
    messages: {
      remembers:
        "'{{name}}' makes {{component}} stateful. Presentational components must not remember things. " +
        'Move state to the consumer or a wrapper component.',
      watches:
        "'{{name}}' makes {{component}} observe the environment. Presentational components must not watch things. " +
        'Move observation to a wrapper component (e.g. {{shortName}}Wrapper).',
      coordinates:
        "'{{name}}' makes {{component}} coordinate its children. Presentational components must not boss children around. ' +" +
        'Move coordination to a dedicated compound component.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();

    if (!isPresentationalFile(filename)) {
      return {};
    }

    const componentName = getFileStem(filename);
    const shortName = componentName;

    function report(node, name, category) {
      context.report({
        node,
        messageId: category,
        data: {name, component: componentName, shortName},
      });
    }

    return {
      // Catch hook calls: useState(), useEffect(), createContext(), etc.
      CallExpression(node) {
        const callee = node.callee;

        // Direct call: useState(), createContext()
        if (callee.type === 'Identifier') {
          const name = callee.name;
          if (REMEMBERS.has(name)) report(node, name, 'remembers');
          else if (WATCHES.has(name)) report(node, name, 'watches');
          else if (COORDINATES.has(name)) report(node, name, 'coordinates');
        }

        // Member call: React.useState(), React.createContext()
        if (
          callee.type === 'MemberExpression' &&
          callee.object?.name === 'React'
        ) {
          const name = callee.property?.name;
          if (!name) return;
          if (REMEMBERS.has(name)) report(node, `React.${name}`, 'remembers');
          else if (WATCHES.has(name)) report(node, `React.${name}`, 'watches');
          else if (COORDINATES.has(name))
            report(node, `React.${name}`, 'coordinates');
        }
      },

      // Catch `new ResizeObserver()`, `new IntersectionObserver()`, etc.
      NewExpression(node) {
        const name = node.callee?.name;
        if (name && WATCHES.has(name)) {
          report(node, name, 'watches');
        }
      },
    };
  },
};

export default presentationalComponentRule;
