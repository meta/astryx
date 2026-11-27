// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-style-only-wrapper.js
 * @description Disallow a `<div>`/`<span>` that exists only to style a single
 * Astryx component — style the component directly via `xstyle`.
 *
 * Every public component extends `BaseProps`, so it takes `xstyle`
 * (`@astryx/require-base-props` enforces that). Wrapping one in a styled host
 * element to position or transform it adds a DOM node that is not part of the
 * component contract: it drops the component out of its parent's
 * flex/grid child relationship, can break centering and alignment, and gives
 * themes a node they cannot reach.
 *
 * Bad:
 *   <span {...stylex.props(rtlStyles.mirror)}>
 *     <Icon icon="chevronsLeft" />
 *   </span>
 *
 * Good:
 *   <Icon icon="chevronsLeft" xstyle={rtlStyles.mirror} />
 *
 * Scope — the rule only fires when removing the wrapper is a behavior-preserving
 * move, so it stays quiet on wrappers that are doing real work:
 *   - the wrapper carries only style attributes (a `stylex.props()` spread,
 *     `className`, `style`, and optionally `key`). Anything else — `ref`,
 *     `role`, `aria-*`, `data-*`, an event handler, another spread — means the
 *     element has a job beyond styling.
 *   - it has exactly one child, a JSX element imported from Astryx.
 *   - the child can take the style itself: its props have a root `xstyle`.
 *     A Field-composed input omits root `xstyle` (family:input-fields FR10)
 *     and its `containerXstyle` has no box to style inside an InputGroup or
 *     a `horizontal-labels` FormLayout, so the wrapper is the only box that
 *     can carry the style. With type information the rule reads the child's
 *     props; without it, it skips the family's members, read from the
 *     family record (`input-field-family-members.js`).
 *   - the styles it applies contain no *structural* property (`display`, the
 *     flex/grid container properties, `gap`, `padding`). Those change the
 *     child's own formatting context rather than just its box, so the wrapper
 *     is not redundant. Style objects imported from another module are read
 *     from that module (see `stylex-style-source.js`); on the rare style the
 *     rule still cannot resolve it reports, since a wrapper carrying an opaque
 *     style is exactly the shape that motivated this rule.
 *
 * Components that render no root element of their own (providers, overlays)
 * have nowhere to put `xstyle`; they are exempt via `allowComponents`.
 */

import {resolveImportedStyleProperties} from './stylex-style-source.js';
import ts from 'typescript';
import {inputFieldFamilyMembers} from './input-field-family-members.js';

/**
 * Style properties whose effect depends on the wrapper existing as its own
 * box: they set up the formatting context *inside* the element (so moving them
 * onto the child would restyle the child's own content), or they add space
 * around the child's border box that child-side padding cannot reproduce.
 */
const STRUCTURAL_PROPERTIES = new Set([
  // Formatting context
  'display',
  // Flex container
  'flexDirection',
  'flexWrap',
  'flexFlow',
  'justifyContent',
  'justifyItems',
  'alignItems',
  'alignContent',
  'placeItems',
  'placeContent',
  // Grid container
  'grid',
  'gridTemplate',
  'gridTemplateColumns',
  'gridTemplateRows',
  'gridTemplateAreas',
  'gridAutoFlow',
  'gridAutoColumns',
  'gridAutoRows',
  // Multi-column
  'columns',
  'columnCount',
  // Gaps between children
  'gap',
  'rowGap',
  'columnGap',
  // Space around the child's border box
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingBlock',
  'paddingBlockStart',
  'paddingBlockEnd',
  'paddingInline',
  'paddingInlineStart',
  'paddingInlineEnd',
]);

/**
 * Components with no root DOM element to receive `xstyle` — providers and
 * overlay/portal components. Mirrors the "no meaningful root DOM element"
 * entries in shared.js COMPONENT_RULE_ALLOWED.
 */
const DEFAULT_ALLOW_COMPONENTS = [
  'Tooltip',
  'Popover',
  'HoverCard',
  'Overlay',
  'Toast',
  'ToastViewport',
  'LayerProvider',
  'LinkProvider',
  'MediaTheme',
  'InternationalizationProvider',
  'Portal',
  'Slot',
];

/** Attributes that only carry styling, so a wrapper holding them is redundant. */
const STYLE_ATTRIBUTES = new Set(['className', 'style']);

/** `key` is bookkeeping, not a job — it moves to the child with the element. */
const NEUTRAL_ATTRIBUTES = new Set(['key']);

function isStylexPropsCall(node) {
  return (
    node?.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    node.callee.object?.name === 'stylex' &&
    node.callee.property?.name === 'props'
  );
}

/** Root identifier of a JSX name: `Icon` → Icon, `Card.Body` → Card. */
function jsxNameRoot(nameNode) {
  let current = nameNode;
  while (current?.type === 'JSXMemberExpression') {
    current = current.object;
  }
  return current?.type === 'JSXIdentifier' ? current.name : null;
}

/** Full JSX name as written, for the report message. */
function jsxNameText(nameNode) {
  if (nameNode?.type === 'JSXIdentifier') {
    return nameNode.name;
  }
  if (nameNode?.type === 'JSXMemberExpression') {
    return `${jsxNameText(nameNode.object)}.${nameNode.property.name}`;
  }
  return 'component';
}

/** Children that render nothing: whitespace-only text and comment expressions. */
function isIgnorableChild(child) {
  if (child.type === 'JSXText') {
    return child.value.trim() === '';
  }
  if (child.type === 'JSXExpressionContainer') {
    return child.expression?.type === 'JSXEmptyExpression';
  }
  return false;
}

const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow div/span wrappers that only style a single Astryx component — use the xstyle prop',
      category: 'Best Practices',
      recommended: true,
    },
    hasSuggestions: true,
    messages: {
      styleOnlyWrapper:
        '<{{wrapper}}> exists only to style <{{component}}>. Astryx components ' +
        'extend BaseProps, so pass the styles to <{{component}}> via xstyle and ' +
        "drop the wrapper — an extra DOM node changes the parent's flex/grid " +
        'child relationship and can break alignment.',
      moveToXstyle: 'Move the styles onto <{{component}}> via xstyle',
    },
    schema: [
      {
        type: 'object',
        properties: {
          wrapperElements: {
            type: 'array',
            items: {type: 'string'},
            description: 'Host elements treated as candidate wrappers.',
          },
          componentSources: {
            type: 'array',
            items: {type: 'string'},
            description:
              'Regex patterns for import sources whose components take xstyle.',
          },
          allowComponents: {
            type: 'array',
            items: {type: 'string'},
            description:
              'Components exempt from the rule (no root element for xstyle).',
          },
          allowFiles: {
            type: 'array',
            items: {type: 'string'},
            description:
              'Substring match on the filename — grandfathers files that ' +
              'predate the rule and still need migrating.',
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] ?? {};
    const allowFiles = options.allowFiles ?? [];
    const filename = context.filename ?? context.getFilename();
    if (allowFiles.some(pattern => filename.includes(pattern))) {
      return {};
    }

    const wrapperElements = new Set(options.wrapperElements ?? ['div', 'span']);
    const componentSources = (
      options.componentSources ?? ['^@astryxdesign/', '^@xds/', '^\\.\\.?/']
    ).map(pattern => new RegExp(pattern));
    const allowComponents = new Set(
      options.allowComponents ?? DEFAULT_ALLOW_COMPONENTS,
    );

    /** Local name → true when imported from a source that ships xstyle components. */
    const astryxImports = new Set();
    /** Local name of a `stylex.create()` result → its style-key → property names. */
    const stylexCreateProperties = new Map();
    /** Local name → the module it was imported from, for cross-file styles. */
    const importedBindings = new Map();
    /** JSX elements to check once the whole file (imports + styles) is known. */
    const candidates = [];

    const sourceCodeForTypes = context.sourceCode ?? context.getSourceCode();
    const services = sourceCodeForTypes.parserServices;
    const checker =
      services?.program != null && services.esTreeNodeToTSNodeMap != null
        ? services.program.getTypeChecker()
        : null;

    /**
     * Whether the child can take the wrapper's style itself. With types,
     * whether its props have an `xstyle`. A props type that names no
     * properties it can read (`any`, `unknown`, an index signature, or a
     * union with any such member or an `xstyle` member) counts as yes, so the
     * rule still reports. Without types, every component except a
     * family:input-fields member.
     */
    function childTakesXstyle(child) {
      if (checker != null) {
        const tsNode = services.esTreeNodeToTSNodeMap.get(child.openingElement);
        const signature =
          tsNode == null ? undefined : checker.getResolvedSignature(tsNode);
        const propsSymbol = signature?.getParameters()[0];
        if (propsSymbol == null || tsNode == null) {
          return true;
        }
        const propsType = checker.getTypeOfSymbolAtLocation(
          propsSymbol,
          tsNode,
        );
        return propsTakeXstyle(propsType);
      }
      return !inputFieldFamilyMembers().has(
        jsxNameRoot(child.openingElement.name),
      );
    }

    function propsTakeXstyle(type) {
      if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
        return true;
      }
      if (type.isUnion()) {
        return type.types.some(propsTakeXstyle);
      }
      if (type.getStringIndexType() != null) {
        return true;
      }
      return type.getProperty('xstyle') != null;
    }

    function isAstryxComponent(nameNode) {
      const root = jsxNameRoot(nameNode);
      return root != null && astryxImports.has(root);
    }

    /**
     * Property names for `<binding>.<key>`, looking in this file first and
     * then in the module the binding was imported from.
     */
    function lookupStyleKey(binding, key) {
      if (key == null) {
        return null;
      }
      const local = stylexCreateProperties.get(binding);
      if (local != null) {
        return local.get(key) ?? null;
      }
      const imported = importedBindings.get(binding);
      if (imported == null) {
        return null;
      }
      return resolveImportedStyleProperties(
        context.filename ?? context.getFilename(),
        imported.source,
        imported.name,
        key,
      );
    }

    /**
     * Property names a style expression applies, or null when the expression
     * cannot be resolved to a `stylex.create()` entry — locally or in the
     * module it was imported from.
     */
    function resolveStyleProperties(expression) {
      // `styles.root`
      if (
        expression.type === 'MemberExpression' &&
        !expression.computed &&
        expression.object?.type === 'Identifier'
      ) {
        return lookupStyleKey(
          expression.object.name,
          expression.property.name ?? expression.property.value,
        );
      }
      // `styles.variant(size)` — a dynamic style function, same key lookup.
      if (
        expression.type === 'CallExpression' &&
        expression.callee?.type === 'MemberExpression' &&
        !expression.callee.computed &&
        expression.callee.object?.type === 'Identifier'
      ) {
        return lookupStyleKey(
          expression.callee.object.name,
          expression.callee.property.name ?? expression.callee.property.value,
        );
      }
      // `cond && styles.root` / `cond ? styles.a : styles.b` — union of branches.
      if (expression.type === 'LogicalExpression') {
        return resolveStyleProperties(expression.right);
      }
      if (expression.type === 'ConditionalExpression') {
        const consequent = resolveStyleProperties(expression.consequent);
        const alternate = resolveStyleProperties(expression.alternate);
        if (consequent == null || alternate == null) {
          return null;
        }
        return [...consequent, ...alternate];
      }
      if (expression.type === 'ArrayExpression') {
        const all = [];
        for (const element of expression.elements) {
          if (element == null) continue;
          const resolved = resolveStyleProperties(element);
          if (resolved == null) {
            return null;
          }
          all.push(...resolved);
        }
        return all;
      }
      return null;
    }

    function hasStructuralStyles(styleExpressions) {
      return styleExpressions.some(expression => {
        const properties = resolveStyleProperties(expression);
        // Unresolvable styles (imported objects) are treated as non-structural:
        // the wrapper still looks purely decorative from here.
        if (properties == null) {
          return false;
        }
        return properties.some(name => STRUCTURAL_PROPERTIES.has(name));
      });
    }

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string') {
          return;
        }
        for (const specifier of node.specifiers) {
          const local = specifier.local?.name;
          if (!local) continue;
          if (specifier.type === 'ImportSpecifier') {
            importedBindings.set(local, {
              source,
              name: specifier.imported?.name ?? local,
            });
          } else if (specifier.type === 'ImportDefaultSpecifier') {
            importedBindings.set(local, {source, name: 'default'});
          }
        }
        if (!componentSources.some(pattern => pattern.test(source))) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.local?.name) {
            astryxImports.add(specifier.local.name);
          }
        }
      },

      // Record `const styles = stylex.create({key: {prop: ...}})` so the rule
      // can tell a decorative wrapper from a layout container.
      VariableDeclarator(node) {
        if (
          node.id?.type !== 'Identifier' ||
          node.init?.type !== 'CallExpression' ||
          node.init.callee?.type !== 'MemberExpression' ||
          node.init.callee.object?.name !== 'stylex' ||
          node.init.callee.property?.name !== 'create'
        ) {
          return;
        }
        const definition = node.init.arguments[0];
        if (definition?.type !== 'ObjectExpression') {
          return;
        }
        const byKey = new Map();
        for (const styleEntry of definition.properties) {
          if (styleEntry.type !== 'Property') continue;
          const key = styleEntry.key?.name ?? styleEntry.key?.value;
          if (key == null) continue;
          // A dynamic style is an arrow function returning the style object.
          let body = styleEntry.value;
          if (
            body?.type === 'ArrowFunctionExpression' &&
            body.body?.type === 'ObjectExpression'
          ) {
            body = body.body;
          }
          if (body?.type !== 'ObjectExpression') {
            byKey.set(key, []);
            continue;
          }
          byKey.set(
            key,
            body.properties
              .filter(property => property.type === 'Property')
              .map(property => property.key?.name ?? property.key?.value)
              .filter(name => name != null),
          );
        }
        stylexCreateProperties.set(node.id.name, byKey);
      },

      // Collected, not checked inline: `stylex.create()` usually sits at the
      // bottom of a component file, so the style table is only complete once
      // the whole program has been walked.
      JSXElement(node) {
        candidates.push(node);
      },

      'Program:exit'() {
        const sourceCode = context.sourceCode ?? context.getSourceCode();

        function checkElement(node) {
          const opening = node.openingElement;
          if (
            opening.name?.type !== 'JSXIdentifier' ||
            !wrapperElements.has(opening.name.name)
          ) {
            return;
          }

          // Every attribute must be styling or bookkeeping, and at least one
          // must actually carry style.
          const styleExpressions = [];
          let carriesStyle = false;
          for (const attribute of opening.attributes) {
            if (attribute.type === 'JSXSpreadAttribute') {
              if (!isStylexPropsCall(attribute.argument)) {
                return; // {...rest} — the wrapper forwards props, leave it alone.
              }
              carriesStyle = true;
              styleExpressions.push(...attribute.argument.arguments);
              continue;
            }
            const name = attribute.name?.name;
            if (typeof name !== 'string') {
              return;
            }
            if (STYLE_ATTRIBUTES.has(name)) {
              carriesStyle = true;
              continue;
            }
            if (!NEUTRAL_ATTRIBUTES.has(name)) {
              return; // ref, role, aria-*, onClick, … — the wrapper has a job.
            }
          }
          if (!carriesStyle) {
            return;
          }

          const children = node.children.filter(
            child => !isIgnorableChild(child),
          );
          if (children.length !== 1) {
            return;
          }
          const child = children[0];
          if (child.type !== 'JSXElement') {
            return;
          }

          const childName = child.openingElement.name;
          if (!isAstryxComponent(childName)) {
            return;
          }
          const componentName = jsxNameText(childName);
          if (allowComponents.has(jsxNameRoot(childName))) {
            return;
          }

          if (hasStructuralStyles(styleExpressions)) {
            return;
          }

          if (!childTakesXstyle(child)) {
            return;
          }

          const data = {wrapper: opening.name.name, component: componentName};
          const report = {node, messageId: 'styleOnlyWrapper', data};

          // Offer a rewrite only for the unambiguous shape: a lone
          // `{...stylex.props(x)}` over a child with no xstyle of its own.
          const onlyStylexSpread =
            opening.attributes.length === 1 &&
            opening.attributes[0].type === 'JSXSpreadAttribute';
          const childHasXstyle = child.openingElement.attributes.some(
            attribute =>
              attribute.type === 'JSXSpreadAttribute' ||
              attribute.name?.name === 'xstyle',
          );
          if (onlyStylexSpread && !childHasXstyle && styleExpressions.length) {
            const styleText = styleExpressions
              .map(expression => sourceCode.getText(expression))
              .join(', ');
            const xstyleValue =
              styleExpressions.length === 1
                ? `xstyle={${styleText}}`
                : `xstyle={[${styleText}]}`;
            report.suggest = [
              {
                messageId: 'moveToXstyle',
                data,
                fix(fixer) {
                  const childText = sourceCode.getText(child);
                  const insertAt = child.openingElement.name.range[1];
                  const offset = insertAt - child.range[0];
                  const rewritten =
                    childText.slice(0, offset) +
                    ` ${xstyleValue}` +
                    childText.slice(offset);
                  return fixer.replaceText(node, rewritten);
                },
              },
            ];
          }

          context.report(report);
        }

        // Walk every JSX element in the file.
        for (const node of candidates) {
          checkElement(node);
        }
      },
    };
  },
};

export default rule;
