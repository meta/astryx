// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-prevent-default-in-passive-react-handler.test.mjs
 * @description Tests for the Astryx no-prevent-default-in-passive-react-handler
 * ESLint rule.
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-prevent-default-in-passive-react-handler.js';

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: {jsx: true},
    },
  },
});

const passive = [{messageId: 'passive'}];

// RuleTester registers its own describe/it blocks internally, so it must run
// at the top level (Vitest 4 forbids calling suite functions inside an it()).
tester.run('no-prevent-default-in-passive-react-handler', rule, {
  valid: [
    // ✅ onTouchEnd is not passive.
    {code: `const C = () => <div onTouchEnd={e => e.preventDefault()} />;`},
    // ✅ Pointer handlers are not passive.
    {
      code: `const C = () => <div onPointerDown={e => e.preventDefault()} onPointerMove={e => e.preventDefault()} />;`,
    },
    // ✅ A native listener added with {passive: false}.
    {
      code: `
        function useWheel(ref) {
          useEffect(() => {
            const node = ref.current;
            const onWheel = event => event.preventDefault();
            node.addEventListener('wheel', onWheel, {passive: false});
            return () => node.removeEventListener('wheel', onWheel);
          }, [ref]);
        }
      `,
    },
    // ✅ A passive handler that does not cancel.
    {
      code: `const C = () => <div onWheel={() => { last.current = 'wheel'; }} />;`,
    },
    {code: `const C = () => <div onTouchMove={e => track(e.touches[0])} />;`},
    // ✅ preventDefault on something other than the handler's event.
    {
      code: `const C = ({other}) => <div onWheel={() => other.preventDefault()} />;`,
    },
    // ✅ A handler imported from another module is not followed.
    {
      code: `import {handleWheel} from './wheel'; const C = () => <div onWheel={handleWheel} />;`,
    },
  ],
  invalid: [
    // ❌ An inline arrow.
    {
      code: `const C = () => <div onWheel={e => { e.preventDefault(); }} />;`,
      errors: passive,
    },
    // ❌ A useCallback handler.
    {
      code: `
        function Carousel() {
          const handleWheel = useCallback((event) => {
            if (!event.shiftKey) return;
            event.preventDefault();
            scroll(event.deltaY);
          }, []);
          return <div onWheel={handleWheel} />;
        }
      `,
      errors: passive,
    },
    // ❌ React.useCallback, a function declaration and a function expression.
    {
      code: `
        function C() {
          const onMove = React.useCallback(function (e) { e.preventDefault(); }, []);
          return <div onTouchMove={onMove} />;
        }
      `,
      errors: passive,
    },
    {
      code: `
        function onStart(e) { e.preventDefault(); }
        const C = () => <div onTouchStart={onStart} />;
      `,
      errors: passive,
    },
    // ❌ Capture forms, nativeEvent, optional call.
    {
      code: `const C = () => <div onWheelCapture={e => e.nativeEvent.preventDefault()} />;`,
      errors: passive,
    },
    {
      code: `const C = () => <div onTouchMoveCapture={e => e.preventDefault?.()} />;`,
      errors: passive,
    },
    // ❌ One handler on two passive props is reported once.
    {
      code: `
        function C() {
          const stop = e => e.preventDefault();
          return <div onTouchStart={stop} onTouchMove={stop} />;
        }
      `,
      errors: passive,
    },
  ],
});
