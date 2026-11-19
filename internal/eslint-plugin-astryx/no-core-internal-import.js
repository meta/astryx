// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-core-internal-import.js
 * @description Reports imports of Core's internal subpaths and of its
 * internal, gesture, motion and touch-support source. The repo config turns it on for
 * every linted file outside packages/core and packages/lab (the global
 * ignores still leave some scripts unlinted), so only Core and Lab may import
 * them.
 *
 * Reported, by `import`, `export … from`, `import()`, `require()` and
 * `typeof import()` (a dynamic import or require named by a string or by a
 * template literal with no expressions):
 *   - `@astryxdesign/core/internal` and any `@astryxdesign/core/internal/*`
 *     subpath, which are reserved for Astryx's own packages and sit outside
 *     the compatibility promise (spec:AST-017 FR21);
 *   - `@astryxdesign/core/gestures`, `@astryxdesign/core/motion` and their
 *     subpaths, and any path into `core/src/internal`, `core/src/gestures`,
 *     `core/src/motion` or `core/src/touch-support`: Core's source, which a
 *     package outside Core and Lab reaches only through public entries
 *     (architecture:react-component-runtime INV13).
 *
 * A custom rule rather than a `no-restricted-imports` block, because flat
 * config overrides a same-named rule per file: a repo-wide block would undo
 * the layer blocks that already use `no-restricted-imports`.
 */

const INTERNAL = /^@astryxdesign\/core\/internal(?:\/|$)/;
// Core's internal entries' sources, gesture core, motion and touch support:
// by package path, or by a path into Core's source.
const DEEP = [
  /^@astryxdesign\/core\/(?:gestures|motion)(?:\/|$)/,
  /(?:^|\/)core\/src\/(?:internal|gestures|motion|touch-support)(?:\/|$)/,
];

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow importing Core's internal subpaths (@astryxdesign/core/internal/*) outside Core and Lab",
    },
    schema: [],
    messages: {
      internal:
        "'{{source}}' is one of Core's internal subpaths, reserved for Astryx's own packages (Core and Lab) and outside the compatibility promise. Use Core's public API instead.",
      deep: "'{{source}}' reaches into Core's internal, gesture, motion or touch-support source, which is for Core and Lab only (architecture:react-component-runtime INV13). Use Core's public API instead.",
    },
  },
  create(context) {
    function check(node, source) {
      if (typeof source !== 'string') {
        return;
      }
      if (INTERNAL.test(source)) {
        context.report({node, messageId: 'internal', data: {source}});
      } else if (DEEP.some(pattern => pattern.test(source))) {
        context.report({node, messageId: 'deep', data: {source}});
      }
    }
    // A dynamic `import()` or `require()` names its module by a string, or
    // by a template literal with no expressions, which is a string too.
    function checkLiteral(node) {
      if (node == null) {
        return;
      }
      if (node.type === 'Literal') {
        check(node, node.value);
      } else if (
        node.type === 'TemplateLiteral' &&
        node.expressions.length === 0
      ) {
        check(node, node.quasis[0]?.value.cooked);
      }
    }
    return {
      ImportDeclaration(node) {
        check(node.source, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source != null) {
          check(node.source, node.source.value);
        }
      },
      ExportAllDeclaration(node) {
        check(node.source, node.source.value);
      },
      ImportExpression(node) {
        checkLiteral(node.source);
      },
      // `require('…')` in CommonJS files.
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length > 0
        ) {
          checkLiteral(node.arguments[0]);
        }
      },
      // `typeof import('…')` in TypeScript types. typescript-eslint wraps
      // the specifier in a TSLiteralType.
      TSImportType(node) {
        const argument = node.argument;
        checkLiteral(
          argument != null && argument.type === 'TSLiteralType'
            ? argument.literal
            : argument,
        );
      },
    };
  },
};

export default rule;
