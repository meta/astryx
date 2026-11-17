// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-react-introspection.js
 * @description ESLint rule banning React child introspection and prop inspection.
 *
 * React introspection (Children.map, Children.forEach, Children.toArray,
 * Children.count, cloneElement, child.type, child.props)
 * creates fragile coupling between parent and child components:
 *
 * - Breaks when children are wrapped in HOCs, forwardRef, or memo
 * - Prevents React from optimizing rendering
 * - Creates implicit contracts that types can't enforce
 * - Makes composition unpredictable (fragments, portals, etc.)
 *
 * Alternatives:
 * - Compound components with context
 * - Render props or slot props
 * - Data-driven APIs (array of config objects)
 * - CSS-based solutions (grid, flexbox, :nth-child, etc.)
 *
 * @see https://github.com/meta/astryx/wiki/API-Conventions
 */

// React.Children methods that introspect the children tree
const CHILDREN_METHODS = new Set([
  'map',
  'forEach',
  'toArray',
  'count',
  'only',
]);

const noReactIntrospectionRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban React child introspection (Children.map, cloneElement, child.props, child.type)',
      category: 'Astryx Architecture',
      recommended: true,
      url: 'https://github.com/meta/astryx/wiki/API-Conventions',
    },
    messages: {
      childrenMethod:
        'React.Children.{{method}}() introspects the children tree. ' +
        'Use a data-driven API (array prop), compound components with context, or CSS layout instead.',
      cloneElement:
        'cloneElement() injects props into children. ' +
        'Use context, a wrapper component, or a render-prop API instead.',
      propAccess:
        'Accessing .props on a React element inspects child internals. ' +
        'Use context or a data-driven API to pass information between components.',
      typeAccess:
        'Accessing .type on a React element inspects child identity. ' +
        'Use a data-driven API (discriminated union) or compound components with context.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          // Specific files that are allowed to use introspection
          // (escape hatch for legitimate cases like DevTools, test utils)
          allowFiles: {
            type: 'array',
            items: {type: 'string'},
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = context.options[0] || {};
    const allowFiles = options.allowFiles || [];

    // Check if this file is explicitly allowed. Patterns are written with
    // forward slashes; normalize before matching so this also works on
    // Windows, where context.filename comes back with backslashes.
    const filename = (context.filename ?? context.getFilename()).replace(
      /\\/g,
      '/',
    );
    if (allowFiles.some(pattern => filename.includes(pattern))) {
      return {};
    }

    return {
      // Catch: React.Children.map(), Children.forEach(), etc.
      // Also catches: React.isValidElement(), React.cloneElement()
      CallExpression(node) {
        const callee = node.callee;

        // React.Children.method() or Children.method()
        if (callee.type === 'MemberExpression') {
          const obj = callee.object;
          const prop = callee.property;

          // Children.map(), Children.forEach(), etc.
          if (
            obj.type === 'Identifier' &&
            obj.name === 'Children' &&
            prop.type === 'Identifier' &&
            CHILDREN_METHODS.has(prop.name)
          ) {
            context.report({
              node,
              messageId: 'childrenMethod',
              data: {method: prop.name},
            });
            return;
          }

          // React.Children.method()
          if (
            obj.type === 'MemberExpression' &&
            obj.object?.type === 'Identifier' &&
            obj.object.name === 'React' &&
            obj.property?.type === 'Identifier' &&
            obj.property.name === 'Children' &&
            prop.type === 'Identifier' &&
            CHILDREN_METHODS.has(prop.name)
          ) {
            context.report({
              node,
              messageId: 'childrenMethod',
              data: {method: prop.name},
            });
            return;
          }

          // React.cloneElement()
          if (
            obj.type === 'Identifier' &&
            obj.name === 'React' &&
            prop.type === 'Identifier' &&
            prop.name === 'cloneElement'
          ) {
            context.report({node, messageId: 'cloneElement'});
            return;
          }
        }

        // Direct call: cloneElement()
        if (callee.type === 'Identifier') {
          if (callee.name === 'cloneElement') {
            context.report({node, messageId: 'cloneElement'});
            return;
          }
        }
      },

      // Catch: child.props.X, child.type
      MemberExpression(node) {
        // Only flag on identifiers (not computed access like obj[key])
        if (node.computed) return;

        const prop = node.property;
        if (prop.type !== 'Identifier') return;

        // child.props or child.type — but only on variables that came from
        // Children iteration or isValidElement checks.
        // Heuristic: flag .props and .type access on variables named
        // 'child', 'item', 'element', or 'el' — common iteration variable names.
        // This avoids false positives on data objects.
        if (prop.name === 'props' || prop.name === 'type') {
          const obj = node.object;
          if (obj.type === 'Identifier') {
            const name = obj.name.toLowerCase();
            // Common child-iteration variable names
            if (
              name === 'child' ||
              name === 'element' ||
              name === 'el' ||
              name === 'item'
            ) {
              const messageId =
                prop.name === 'props' ? 'propAccess' : 'typeAccess';
              context.report({node, messageId});
            }
          }
        }
      },
    };
  },
};

export default noReactIntrospectionRule;
