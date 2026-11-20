// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-shorthand-longhand-merge.js
 * @description Disallow a StyleX shorthand after one of its own longhands in
 *   one `stylex.props()` call or one `xstyle` array, such as
 *   `marginInlineStart` in one style and then `marginInline` in a later one.
 *
 * StyleX resolves such a pair by its `styleResolution` option:
 * `application-order` usually lets the later style win, and `property-specificity`
 * lets the longhand win whatever the order. So in the published CSS a
 * shorthand set after its longhand never overrides it, and Storybook may
 * paint the later style instead. A shorthand before its longhand resolves
 * the same way under both. In the later style, set the same longhands the
 * earlier one sets.
 *
 * The rule reads styles from `stylex.create()` objects declared in the same
 * file. A style it cannot read (an import, a prop, a dynamic key) adds nothing.
 * A local constant is matched by its name anywhere in the file.
 * Two styles in different branches of one conditional never merge.
 */

const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
const LOGICAL = ['BlockStart', 'BlockEnd', 'InlineStart', 'InlineEnd'];

/** Shorthand → the longhands it sets. */
const SHORTHANDS = {};
for (const box of ['margin', 'padding', 'scrollMargin', 'scrollPadding']) {
  SHORTHANDS[box] = [
    ...SIDES.map(s => box + s),
    ...LOGICAL.map(s => box + s),
    box + 'Block',
    box + 'Inline',
  ];
  SHORTHANDS[box + 'Block'] = [
    box + 'BlockStart',
    box + 'BlockEnd',
    box + 'Top',
    box + 'Bottom',
  ];
  SHORTHANDS[box + 'Inline'] = [
    box + 'InlineStart',
    box + 'InlineEnd',
    box + 'Left',
    box + 'Right',
  ];
}
SHORTHANDS.inset = [
  'top',
  'right',
  'bottom',
  'left',
  'insetBlock',
  'insetInline',
  ...LOGICAL.map(s => 'inset' + s),
];
SHORTHANDS.insetBlock = ['insetBlockStart', 'insetBlockEnd', 'top', 'bottom'];
SHORTHANDS.insetInline = [
  'insetInlineStart',
  'insetInlineEnd',
  'left',
  'right',
];
SHORTHANDS.gap = ['rowGap', 'columnGap'];
SHORTHANDS.overflow = [
  'overflowX',
  'overflowY',
  'overflowBlock',
  'overflowInline',
];
SHORTHANDS.borderRadius = [
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderStartStartRadius',
  'borderStartEndRadius',
  'borderEndStartRadius',
  'borderEndEndRadius',
];
for (const part of ['Width', 'Style', 'Color']) {
  SHORTHANDS['border' + part] = [
    ...SIDES.map(s => 'border' + s + part),
    ...LOGICAL.map(s => 'border' + s + part),
    'borderBlock' + part,
    'borderInline' + part,
  ];
  SHORTHANDS['borderBlock' + part] = [
    'borderBlockStart' + part,
    'borderBlockEnd' + part,
    'borderTop' + part,
    'borderBottom' + part,
  ];
  SHORTHANDS['borderInline' + part] = [
    'borderInlineStart' + part,
    'borderInlineEnd' + part,
    'borderLeft' + part,
    'borderRight' + part,
  ];
}
SHORTHANDS.placeItems = ['alignItems', 'justifyItems'];
SHORTHANDS.placeContent = ['alignContent', 'justifyContent'];
SHORTHANDS.placeSelf = ['alignSelf', 'justifySelf'];
SHORTHANDS.flex = ['flexGrow', 'flexShrink', 'flexBasis'];
SHORTHANDS.flexFlow = ['flexDirection', 'flexWrap'];
SHORTHANDS.gridArea = [
  'gridRow',
  'gridColumn',
  'gridRowStart',
  'gridRowEnd',
  'gridColumnStart',
  'gridColumnEnd',
];
SHORTHANDS.gridRow = ['gridRowStart', 'gridRowEnd'];
SHORTHANDS.gridColumn = ['gridColumnStart', 'gridColumnEnd'];
SHORTHANDS.outline = ['outlineWidth', 'outlineStyle', 'outlineColor'];
SHORTHANDS.textDecoration = [
  'textDecorationLine',
  'textDecorationStyle',
  'textDecorationColor',
  'textDecorationThickness',
];
SHORTHANDS.background = [
  'backgroundColor',
  'backgroundImage',
  'backgroundPosition',
  'backgroundSize',
  'backgroundRepeat',
  'backgroundClip',
  'backgroundOrigin',
  'backgroundAttachment',
];
SHORTHANDS.listStyle = ['listStyleType', 'listStylePosition', 'listStyleImage'];
SHORTHANDS.transition = [
  'transitionProperty',
  'transitionDuration',
  'transitionTimingFunction',
  'transitionDelay',
  'transitionBehavior',
];

function isStylexCall(node, method) {
  return (
    node?.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    node.callee.object?.type === 'Identifier' &&
    node.callee.object.name === 'stylex' &&
    node.callee.property?.name === method
  );
}

function keyName(property) {
  if (property.type !== 'Property' || property.computed) return null;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal') return String(property.key.value);
  return null;
}

/** The CSS properties one style (an object or a dynamic-style arrow) sets. */
function styleProperties(value) {
  let body = value;
  if (
    body?.type === 'ArrowFunctionExpression' ||
    body?.type === 'FunctionExpression'
  ) {
    body = body.body;
    if (body?.type === 'BlockStatement') {
      const ret = body.body.find(s => s.type === 'ReturnStatement');
      body = ret?.argument;
    }
  }
  if (body?.type !== 'ObjectExpression') return null;
  const names = new Set();
  for (const property of body.properties) {
    const name = keyName(property);
    if (name !== null) names.add(name);
  }
  return names;
}

/**
 * Style references (`styles.key`, `styles.key(x)`) inside an argument, in
 * merge order. Each carries the conditional branches it sits in.
 */
function collectRefs(
  node,
  out,
  branches = [],
  locals = new Map(),
  seen = new Set(),
) {
  if (!node) return;
  const next = (child, childBranches = branches) =>
    collectRefs(child, out, childBranches, locals, seen);
  switch (node.type) {
    case 'Identifier': {
      // A local `const x = cond ? styles.a : styles.b` stands for its value.
      const init = locals.get(node.name);
      if (init && !seen.has(node.name)) {
        seen.add(node.name);
        next(init);
        seen.delete(node.name);
      }
      return;
    }
    case 'MemberExpression':
      if (
        node.object.type === 'Identifier' &&
        !node.computed &&
        node.property.type === 'Identifier'
      ) {
        out.push({
          node,
          object: node.object.name,
          key: node.property.name,
          branches,
        });
      }
      return;
    case 'CallExpression':
      if (node.callee.type === 'MemberExpression') {
        next(node.callee);
      }
      return;
    case 'LogicalExpression':
      if (node.operator !== '&&') next(node.left);
      next(node.right);
      return;
    case 'ConditionalExpression':
      next(node.consequent, [...branches, [node, 0]]);
      next(node.alternate, [...branches, [node, 1]]);
      return;
    case 'ArrayExpression':
      for (const element of node.elements) next(element);
      return;
    default:
      return;
  }
}

/** True when two references sit in different branches of one conditional. */
function exclusive(a, b) {
  return a.branches.some(([node, side]) =>
    b.branches.some(
      ([other, otherSide]) => other === node && otherSide !== side,
    ),
  );
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a StyleX shorthand after one of its own longhands in one ' +
        'stylex.props() call or xstyle array; builds with different ' +
        'styleResolution options resolve that merge differently.',
      recommended: true,
    },
    messages: {
      merge:
        '`{{shorthandKey}}` sets the shorthand `{{shorthand}}` after ' +
        '`{{longhandKey}}` sets its longhand `{{longhand}}`. The published CSS ' +
        'keeps the longhand, and Storybook may not; set the longhands instead.',
    },
    schema: [],
  },
  create(context) {
    /** `styles` → key → set of CSS properties. */
    const sheets = new Map();
    /** Local constants a merge can name instead of a style. */
    const locals = new Map();
    const pending = [];
    const merges = [];

    function check(args) {
      pending.push(args);
    }

    return {
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || !node.init) return;
        if (!isStylexCall(node.init, 'create')) {
          locals.set(node.id.name, node.init);
          return;
        }
        const object = node.init.arguments[0];
        if (object?.type !== 'ObjectExpression') return;
        const keys = new Map();
        for (const property of object.properties) {
          const name = keyName(property);
          const props = name === null ? null : styleProperties(property.value);
          if (props) keys.set(name, props);
        }
        sheets.set(node.id.name, keys);
      },
      CallExpression(node) {
        if (isStylexCall(node, 'props')) check(node.arguments);
      },
      JSXAttribute(node) {
        if (
          node.name?.name === 'xstyle' &&
          node.value?.type === 'JSXExpressionContainer'
        ) {
          check([node.value.expression]);
        }
      },
      'Program:exit'() {
        for (const args of pending) {
          const refs = [];
          for (const arg of args) collectRefs(arg, refs, [], locals);
          if (refs.length > 1) merges.push(refs);
        }
        for (const refs of merges) {
          const resolved = refs
            .map(ref => ({ref, props: sheets.get(ref.object)?.get(ref.key)}))
            .filter(r => r.props);
          resolved.forEach((short, index) => {
            for (const shorthand of short.props) {
              const longhands = SHORTHANDS[shorthand];
              if (!longhands) continue;
              for (const long of resolved.slice(0, index)) {
                if (exclusive(long.ref, short.ref)) continue;
                const longhand = longhands.find(l => long.props.has(l));
                if (!longhand) continue;
                context.report({
                  node: short.ref.node,
                  messageId: 'merge',
                  data: {
                    longhandKey: `${long.ref.object}.${long.ref.key}`,
                    longhand,
                    shorthandKey: `${short.ref.object}.${short.ref.key}`,
                    shorthand,
                  },
                });
              }
            }
          });
        }
      },
    };
  },
};

export default rule;
