// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file require-baseprops-passthrough.js
 * @description ESLint rule ensuring components actually forward the styling
 * props they accept via BaseProps: `xstyle`, `className`, and `style`.
 *
 * A component whose props extend BaseProps promises consumers an `xstyle`,
 * `className`, and `style` escape hatch. Two common bugs break that promise:
 *
 *   Mode A — a styling prop is destructured out of props but never referenced,
 *   so the consumer override is silently dropped:
 *     function Foo({xstyle, className, ...rest}: FooProps) {
 *       return <div {...stylex.props(styles.root)} {...rest} />; // xstyle/className lost
 *     }
 *
 *   Mode B — a styling prop the type promises is never destructured and never
 *   reaches a place that can apply it, so it is dropped:
 *     function Bar({icon}: BarProps) {
 *       return <div {...stylex.props(styles.root)} />; // all three dropped
 *     }
 *
 * The fix is to destructure each styling prop and thread it into the root
 * `mergeProps(...)` / `stylex.props(...)` call (or forward it to a composed
 * Astryx component).
 *
 * Forwarding paths differ by prop, because of what each one *is*:
 *   - `className` and `style` are real DOM attributes, so they survive a
 *     `{...rest}` spread onto the root element — a rest spread onto *any* JSX
 *     element (native or composed) counts as forwarding them.
 *   - `xstyle` is a StyleX style object, NOT a DOM attribute. It cannot ride a
 *     rest spread onto a native element (it renders inert). The only valid
 *     un-destructured path is a rest spread onto a composed Astryx component,
 *     which re-accepts `xstyle` through its own BaseProps.
 *
 * Opt out by omitting the prop from the props type (e.g.
 * `Omit<BaseProps, 'className' | 'style'>`, as VisuallyHidden does),
 * or by marking an intentionally-unused binding with a leading underscore
 * (e.g. `className: _className`).
 *
 * Scoped to public components — those registered via `<Name>.displayName`.
 */

const STYLING_PROPS = ['xstyle', 'className', 'style'];

/**
 * For every interface in the file, compute the set of styling props it exposes
 * through BaseProps (transitively, within the file), honoring Omit/Pick.
 */
function collectStylingContracts(program) {
  const interfaces = new Map();
  for (const stmt of program.body) {
    const decl =
      stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (decl && decl.type === 'TSInterfaceDeclaration') {
      interfaces.set(decl.id.name, decl);
    }
  }

  const cache = new Map();
  function contract(name, seen) {
    if (cache.has(name)) return cache.get(name);
    if (seen.has(name)) return new Set();
    seen.add(name);
    const node = interfaces.get(name);
    if (!node || !node.extends) {
      cache.set(name, new Set());
      return new Set();
    }
    let result = new Set();
    for (const heritage of node.extends) {
      const expr = heritage.expression;
      if (expr?.type !== 'Identifier') continue;

      if (expr.name === 'BaseProps') {
        result = new Set([...result, ...STYLING_PROPS]);
        continue;
      }
      if (expr.name === 'Omit' || expr.name === 'Pick') {
        const params = heritage.typeArguments?.params;
        const inner = params?.[0]?.typeName?.name;
        const keys = literalStringUnion(params?.[1]);
        let base =
          inner === 'BaseProps'
            ? new Set(STYLING_PROPS)
            : inner && interfaces.has(inner)
              ? contract(inner, seen)
              : new Set();
        if (base.size) {
          if (expr.name === 'Omit') {
            base = new Set([...base].filter(k => !keys.has(k)));
          } else {
            base = new Set([...base].filter(k => keys.has(k)));
          }
          result = new Set([...result, ...base]);
        }
        continue;
      }
      if (expr.name.endsWith('Props') && interfaces.has(expr.name)) {
        result = new Set([...result, ...contract(expr.name, seen)]);
      }
    }
    cache.set(name, result);
    return result;
  }

  const out = new Map();
  for (const name of interfaces.keys())
    out.set(name, contract(name, new Set()));
  return out;
}

/**
 * Extract the string-literal keys from a single literal (`'xstyle'`) or a union
 * (`'xstyle' | 'className'`). Used to read an Omit/Pick key list.
 */
function literalStringUnion(typeNode) {
  const keys = new Set();
  if (!typeNode) return keys;
  if (typeNode.type === 'TSLiteralType' && typeNode.literal?.value != null) {
    keys.add(String(typeNode.literal.value));
  } else if (typeNode.type === 'TSUnionType') {
    for (const t of typeNode.types) {
      if (t.type === 'TSLiteralType' && t.literal?.value != null) {
        keys.add(String(t.literal.value));
      }
    }
  }
  return keys;
}

/**
 * Names assigned a `.displayName` at the top level — the codebase convention
 * for a public component (`Foo.displayName = 'Foo'` or the cast form
 * `(Foo as {...}).displayName = 'Foo'`).
 */
function collectDisplayNamedComponents(program) {
  const names = new Set();
  for (const stmt of program.body) {
    if (
      stmt.type !== 'ExpressionStatement' ||
      stmt.expression.type !== 'AssignmentExpression'
    ) {
      continue;
    }
    const left = stmt.expression.left;
    if (
      left.type !== 'MemberExpression' ||
      left.property.type !== 'Identifier' ||
      left.property.name !== 'displayName'
    ) {
      continue;
    }
    if (left.object.type === 'Identifier') {
      names.add(left.object.name);
    } else if (
      left.object.type === 'TSAsExpression' &&
      left.object.expression.type === 'Identifier'
    ) {
      names.add(left.object.expression.name);
    }
  }
  return names;
}

/**
 * Resolve the binding name of a component function — either its own id
 * (`function Foo() {}`) or the variable it is assigned to
 * (`const Foo = () => {}`).
 */
function resolveFunctionName(fn) {
  if (fn.id?.name) return fn.id.name;
  const parent = fn.parent;
  if (
    parent?.type === 'VariableDeclarator' &&
    parent.id.type === 'Identifier'
  ) {
    return parent.id.name;
  }
  return null;
}

/** Get the destructured property name/value pairs from an object pattern. */
function getDestructuredProps(objectPattern) {
  const named = new Map();
  let restName = null;
  for (const prop of objectPattern.properties) {
    if (prop.type === 'RestElement' && prop.argument.type === 'Identifier') {
      restName = prop.argument.name;
    } else if (prop.type === 'Property' && prop.key.type === 'Identifier') {
      const local =
        prop.value.type === 'Identifier'
          ? prop.value.name
          : prop.value.type === 'AssignmentPattern' &&
              prop.value.left.type === 'Identifier'
            ? prop.value.left.name
            : null;
      named.set(prop.key.name, local);
    }
  }
  return {named, restName};
}

/** Where is `{...restName}` spread — onto a native element, a component, both? */
function restSpreadTargets(body, restName) {
  let dom = false;
  let domElement = null;
  let component = false;
  const visited = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.type === 'JSXOpeningElement') {
      const nameNode = node.name;
      const isDom =
        nameNode.type === 'JSXIdentifier' && /^[a-z]/.test(nameNode.name);
      const isComponent =
        (nameNode.type === 'JSXIdentifier' && /^[A-Z]/.test(nameNode.name)) ||
        nameNode.type === 'JSXMemberExpression';
      for (const attr of node.attributes) {
        if (
          attr.type === 'JSXSpreadAttribute' &&
          attr.argument.type === 'Identifier' &&
          attr.argument.name === restName
        ) {
          if (isDom) {
            dom = true;
            domElement ??= nameNode.name;
          }
          if (isComponent) component = true;
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = node[key];
      if (child && typeof child === 'object') walk(child);
    }
  }
  walk(body);
  return {dom, domElement, component};
}

/** Count identifier references to `name` inside a body subtree. */
function countReferences(body, name) {
  let count = 0;
  const visited = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.type === 'Identifier' && node.name === name) count += 1;
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = node[key];
      if (child && typeof child === 'object') walk(child);
    }
  }
  walk(body);
  return count;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require components to forward the styling props (xstyle/className/style) they accept via BaseProps',
      category: 'Possible Errors',
      recommended: true,
    },
    messages: {
      unusedStylingProp:
        '`{{prop}}` is destructured from props but never forwarded, so the ' +
        'consumer override is silently dropped. Thread it into the root ' +
        '`mergeProps(...)` / `stylex.props(...)` call, or forward it to a ' +
        'composed component.',
      droppedStylingProp:
        'This component accepts `{{prop}}` via BaseProps but never forwards it, ' +
        'so the consumer override is silently dropped. Destructure `{{prop}}` ' +
        'and thread it into the root `mergeProps(...)` / `stylex.props(...)` ' +
        'call.',
      xstyleInertOnRest:
        'This component accepts `xstyle` via BaseProps but only spreads ' +
        '`...{{rest}}` onto a native `<{{element}}>` element. `xstyle` is a ' +
        'StyleX style object, not an HTML attribute, so it is inert there. ' +
        'Destructure `xstyle` and pass it into the element’s ' +
        '`stylex.props(...)` call.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const contracts = collectStylingContracts(sourceCode.ast);
    const componentNames = collectDisplayNamedComponents(sourceCode.ast);

    function checkComponent(fn) {
      const name = resolveFunctionName(fn);
      if (!name || !componentNames.has(name)) return;

      const param = fn.params[0];
      if (!param || param.type !== 'ObjectPattern') return;

      const ann = param.typeAnnotation?.typeAnnotation;
      const typeName =
        ann?.type === 'TSTypeReference' && ann.typeName.type === 'Identifier'
          ? ann.typeName.name
          : null;
      const carried = typeName ? contracts.get(typeName) : null;
      if (!carried || carried.size === 0) return;

      const {named, restName} = getDestructuredProps(param);
      const rest = restName
        ? restSpreadTargets(fn.body, restName)
        : {dom: false, domElement: null, component: false};

      for (const prop of STYLING_PROPS) {
        if (!carried.has(prop)) continue;

        if (named.has(prop)) {
          // Destructured: must be referenced somewhere in the body.
          const local = named.get(prop) ?? prop;
          if (local.startsWith('_')) continue; // intentional opt-out
          if (countReferences(fn.body, local) === 0) {
            const propNode = param.properties.find(
              p =>
                p.type === 'Property' &&
                p.key.type === 'Identifier' &&
                p.key.name === prop,
            );
            context.report({
              node: propNode ?? param,
              messageId: 'unusedStylingProp',
              data: {prop},
            });
          }
          continue;
        }

        // Not destructured: can it still be forwarded via a rest spread?
        if (prop === 'xstyle') {
          // xstyle is not a DOM attribute — only a rest spread onto a composed
          // component forwards it.
          if (rest.component) continue;
          context.report({
            node: param,
            messageId: rest.dom ? 'xstyleInertOnRest' : 'droppedStylingProp',
            data: {
              prop,
              rest: restName,
              element: rest.domElement ?? 'native',
            },
          });
        } else {
          // className/style survive a rest spread onto any element.
          if (rest.dom || rest.component) continue;
          context.report({
            node: param,
            messageId: 'droppedStylingProp',
            data: {prop},
          });
        }
      }
    }

    return {
      FunctionDeclaration: checkComponent,
      FunctionExpression: checkComponent,
      ArrowFunctionExpression: checkComponent,
    };
  },
};

export default rule;
