// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-prevent-default-in-passive-react-handler.js
 * @description Reports `preventDefault()` on the event inside a React
 * `onWheel`, `onTouchStart` or `onTouchMove` handler (capture forms too).
 *
 * React attaches its root `wheel`, `touchstart` and `touchmove` listeners as
 * passive. The browser ignores `preventDefault()` in a passive listener, so
 * the default action (scroll, zoom) still runs and `defaultPrevented` stays
 * false. A handler that must cancel the default uses a native listener added
 * with `{passive: false}`, in an Effect or a ref callback.
 *
 * Reported: a call to `<event>.preventDefault()` or
 * `<event>.nativeEvent.preventDefault()`, where `<event>` is the first
 * parameter of a function passed to one of those JSX props as an inline
 * function, or as an identifier that names a function declared in the same
 * file (a function declaration, a function or arrow, or a `useCallback` of
 * one).
 *
 * Not reported: other props (`onTouchEnd`, `onPointer*`), native
 * `addEventListener` listeners, a handler imported from another module or
 * reached through another variable, and a call inside a function that the
 * handler only calls.
 */

const PASSIVE_PROPS = new Set([
  'onWheel',
  'onWheelCapture',
  'onTouchStart',
  'onTouchStartCapture',
  'onTouchMove',
  'onTouchMoveCapture',
]);

const FUNCTIONS = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function isUseCallback(node) {
  if (node?.type !== 'CallExpression') {
    return false;
  }
  const callee = node.callee;
  return (
    (callee.type === 'Identifier' && callee.name === 'useCallback') ||
    (callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'useCallback')
  );
}

/** The function an initializer holds, directly or through `useCallback`. */
function functionOf(node) {
  if (node == null) {
    return null;
  }
  if (FUNCTIONS.has(node.type)) {
    return node;
  }
  if (isUseCallback(node) && FUNCTIONS.has(node.arguments[0]?.type)) {
    return node.arguments[0];
  }
  return null;
}

function isPropertyNamed(member, name) {
  return (
    member.type === 'MemberExpression' &&
    !member.computed &&
    member.property.type === 'Identifier' &&
    member.property.name === name
  );
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow preventDefault() in React onWheel, onTouchStart and onTouchMove handlers, which React attaches as passive listeners',
    },
    schema: [],
    messages: {
      passive:
        'React attaches wheel/touchstart/touchmove listeners as passive; preventDefault() here is ignored. ' +
        'Use a native listener with {passive: false} (addEventListener in an Effect or a ref callback) instead.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    // One handler can serve several props; report each call once.
    const reported = new Set();

    /** The handler function a JSX prop value names, when it can be read. */
    function handlerOf(expression, attribute) {
      const direct = functionOf(expression);
      if (direct != null) {
        return direct;
      }
      if (expression.type !== 'Identifier') {
        return null;
      }
      let scope = sourceCode.getScope(attribute);
      while (scope != null) {
        const variable = scope.set.get(expression.name);
        if (variable != null) {
          const definition = variable.defs[0];
          if (definition?.type === 'FunctionName') {
            return definition.node;
          }
          if (
            definition?.type === 'Variable' &&
            definition.node.id.type === 'Identifier'
          ) {
            return functionOf(definition.node.init);
          }
          return null;
        }
        scope = scope.upper;
      }
      return null;
    }

    function checkHandler(fn) {
      const event = fn.params[0];
      if (event?.type !== 'Identifier') {
        return;
      }
      const variable = sourceCode
        .getDeclaredVariables(fn)
        .find(declared => declared.name === event.name);
      if (variable == null) {
        return;
      }
      for (const reference of variable.references) {
        let target = reference.identifier;
        if (
          isPropertyNamed(target.parent, 'nativeEvent') &&
          target.parent.object === target
        ) {
          target = target.parent;
        }
        const member = target.parent;
        if (
          member == null ||
          member.object !== target ||
          !isPropertyNamed(member, 'preventDefault')
        ) {
          continue;
        }
        const call = member.parent;
        if (
          call?.type !== 'CallExpression' ||
          call.callee !== member ||
          reported.has(call)
        ) {
          continue;
        }
        reported.add(call);
        context.report({node: call, messageId: 'passive'});
      }
    }

    return {
      JSXAttribute(node) {
        if (
          node.name.type !== 'JSXIdentifier' ||
          !PASSIVE_PROPS.has(node.name.name) ||
          node.value?.type !== 'JSXExpressionContainer'
        ) {
          return;
        }
        const fn = handlerOf(node.value.expression, node);
        if (fn != null) {
          checkHandler(fn);
        }
      },
    };
  },
};

export default rule;
