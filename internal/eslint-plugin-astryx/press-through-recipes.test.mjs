// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file press-through-recipes.test.mjs
 * @description Tests for the Astryx press-through-recipes ESLint rule.
 */

import {RuleTester} from 'eslint';
import {describe, expect, it} from 'vitest';
import tseslint from 'typescript-eslint';
import rule from './press-through-recipes.js';

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

const component = '/repo/packages/core/src/Card/Card.tsx';
const labComponent = '/repo/packages/lab/src/Dock/Dock.tsx';
const engine = '/repo/packages/core/src/utils/pressFeedback.ts';
const pressStyles = '/repo/packages/core/src/privateAttributes/press.stylex.ts';
const menuHelper = '/repo/packages/core/src/hooks/useMenuPress.ts';

const baselined = entries => [
  {baseline: {'packages/core/src/Card/Card.tsx': entries}, root: '/repo'},
];

// RuleTester registers its own describe/it blocks.
tester.run('press-through-recipes', rule, {
  valid: [
    // (a) Each recipe's entry point, from a component.
    {
      code: "import {usePressFeedback} from '../hooks/usePressFeedback';",
      filename: component,
    },
    {
      code: "import {pressFeedback} from '../utils/pressFeedback';",
      filename: component,
    },
    {
      code: "import {useClickableContainer} from '../hooks/useClickableContainer';",
      filename: component,
    },
    {
      code: "import {useMenuPress} from '../hooks/useMenuPress';",
      filename: component,
    },
    {
      code: "import {pressOnItemsOnly} from '../hooks/menuPressOnItems';",
      filename: component,
    },
    {
      code: "import type {MenuPressPointerType} from '../hooks/menuPressGesture';",
      filename: component,
    },
    {
      code: "import {pressStyles} from '../privateAttributes/press.stylex';",
      filename: component,
    },
    // (a) Only constants from a recipe's inner module.
    {
      code: "import {PRESS_SLOP_PX} from '../utils/pressGesture';",
      filename: component,
    },
    // (a) A press module importing another press module.
    {
      code: "import {createPressTracker} from '../gestures/PressTracker';",
      filename: engine,
    },
    {
      code: "import {menuPressGesture} from './menuPressGesture';",
      filename: menuHelper,
    },
    // (a) The group profile's entries, relative and through the touch entry.
    {
      code: "import {useGroupPressTracking} from '../hooks/useGroupPressTracking';",
      filename: component,
    },
    {
      code: "import {PressGroupContext} from '../hooks/pressGroupContext';",
      filename: component,
    },
    {
      code: "import {useActionGroupTracking} from '@astryxdesign/core/internal/touch';",
      filename: labComponent,
    },
    // (a) Lab importing a non-press name through the touch entry.
    {
      code: "import {useFingerScroll} from '@astryxdesign/core/internal/touch';",
      filename: labComponent,
    },
    // (a) A baselined import.
    {
      code: "import {createPressTracker} from '../gestures/PressTracker';",
      filename: component,
      options: baselined(['import:gestures/PressTracker']),
    },
    // (b) Pressed-like state set only on a click; other state on pointer down.
    {
      code: 'function C() { const [isPressed, setIsPressed] = useState(false); return <div onClick={() => setIsPressed(true)} />; }',
      filename: component,
    },
    {
      code: 'function C() { const [isOpen, setIsOpen] = useState(false); return <div onPointerDown={() => setIsOpen(true)} />; }',
      filename: component,
    },
    // (b) A controlled `isPressed` prop is not state.
    {
      code: 'function T({isPressed}) { return <button aria-pressed={isPressed} />; }',
      filename: component,
    },
    // (c) The namespace's own press attributes are no-raw-private-attribute's.
    {code: "const a = <div data-astryx-press='on' />;", filename: component},
    {
      code: "el.setAttribute('data-astryx-pressable', '');",
      filename: component,
    },
    {
      code: 'const name = `data-${dataAttrNamespace}-press`;',
      filename: component,
    },
    // (a) Other names through the gestures index.
    {
      code: "import type {GestureRecognizer} from '../gestures';",
      filename: component,
    },
    // (c) A name interpolated right after `data-` may be the namespace.
    {code: 'const name = `data-${part}-pressing`;', filename: component},
    // (b) Names that only contain `pressed` or `platter` are not pressed state.
    {
      code: 'function C() { const [isCompressed, setIsCompressed] = useState(false); return <div onPointerDown={() => setIsCompressed(true)} />; }',
      filename: component,
    },
    {
      code: 'function C() { const [unpressedCount, setUnpressedCount] = useState(0); return <div onPointerDown={() => setUnpressedCount(1)} />; }',
      filename: component,
    },
    // (c) Names that only contain `press` are not press attributes.
    {
      code: "const a = <div data-expressive='' data-compressed='' />;",
      filename: component,
    },
    {code: "const NAME = 'data-impression-id';", filename: component},
    // (c) Other data attributes.
    {
      code: "const a = <div data-state='open' data-testid='x' />;",
      filename: component,
    },
    // (d) The shared press styles own `:active`; other pseudo-classes are fine.
    {
      code: "const s = stylex.create({root: {opacity: {default: 1, ':active': 0.5}}});",
      filename: pressStyles,
    },
    {
      code: "const s = stylex.create({root: {opacity: {default: 1, ':hover': 0.8, ':focus-visible': 0.9}}});",
      filename: component,
    },
    // (d) Baselined arms.
    {
      code: "const s = stylex.create({a: {opacity: {':active': 0.5}}, b: {opacity: {':active': 0.4}}});",
      filename: component,
      options: baselined([':active', ':active']),
    },
  ],
  invalid: [
    // (a) A profile or inner module from a component.
    {
      code: "import {createPressTracker} from '../gestures/PressTracker';",
      filename: component,
      errors: [{messageId: 'innerImport'}],
    },
    {
      code: "import {actionGroupTracker} from '../hooks/actionGroupTracker';",
      filename: component,
      errors: [{messageId: 'innerImport'}],
    },
    {
      code: "import {menuPressValues} from '../hooks/menuPressValues';",
      filename: component,
      errors: [{messageId: 'innerImport'}],
    },
    {
      code: "import {pressGesture, PRESS_SLOP_PX} from '../utils/pressGesture';",
      filename: component,
      errors: [{messageId: 'innerImport'}],
    },
    {
      code: "import type {PressTracker} from '../gestures/PressTracker';",
      filename: component,
      errors: [{messageId: 'innerImport'}],
    },
    {
      code: "export {createPressTracker} from '../gestures/PressTracker';",
      filename: component,
      errors: [{messageId: 'innerImport'}],
    },
    {
      code: "const m = import('../hooks/actionGroupTracker');",
      filename: component,
      errors: [{messageId: 'innerImport'}],
    },
    // (a) The message for the group tracker's own module names the group entries.
    {
      code: "import {trackGroupPress} from '../hooks/actionGroupTracker';",
      filename: component,
      errors: [
        {message: /`useGroupPressTracking` or `useActionGroupTracking`/},
      ],
    },
    // (a) An index file resolves from its own folder.
    {
      code: "export {createPressTracker} from './PressTracker';",
      filename: '/repo/packages/core/src/gestures/index.ts',
      errors: [{messageId: 'innerImport'}],
    },
    // (a) A type-only import of the tracker through the gestures index.
    {
      code: "import type {PressTracker} from '../gestures';",
      filename: component,
      errors: [{messageId: 'innerImport'}],
    },
    // (a) One more import than the baseline allows.
    {
      code: "import {createPressTracker} from '../gestures/PressTracker';\nimport {usePressTracker} from '../gestures/usePressTracker';",
      filename: component,
      options: baselined(['import:gestures/PressTracker']),
      errors: [{messageId: 'innerImport'}],
    },
    // (b) Pressed state set on pointer down, inline, through a named
    //     handler, through useCallback, and through addEventListener.
    {
      code: 'function C() { const [isPressed, setIsPressed] = useState(false); return <div onPointerDown={() => setIsPressed(true)} />; }',
      filename: component,
      errors: [{messageId: 'pressedState'}],
    },
    {
      code: 'function C() { const [pressed, setPressed] = React.useState(false); function down() { setPressed(true); } return <div onTouchStart={down} />; }',
      filename: component,
      errors: [{messageId: 'pressedState'}],
    },
    {
      code: 'function C() { const [platterShown, setPlatterShown] = useState(false); const down = useCallback(() => setPlatterShown(true), []); return <div onPointerDownCapture={down} />; }',
      filename: component,
      errors: [{messageId: 'pressedState'}],
    },
    {
      code: "function C(el) { const [isPressed, setIsPressed] = useState(false); useEffect(() => { el.addEventListener('touchstart', () => setIsPressed(true)); }, []); }",
      filename: component,
      errors: [{messageId: 'pressedState'}],
    },
    // (b) A name that ends in `Pressed`.
    {
      code: 'function C() { const [rowPressed, setRowPressed] = useState(false); return <div onPointerDown={() => setRowPressed(true)} />; }',
      filename: component,
      errors: [{messageId: 'pressedState'}],
    },
    // (c) A press attribute of a component's own.
    {
      code: "const a = <div data-is-pressed='' />;",
      filename: component,
      errors: [{messageId: 'pressAttribute'}],
    },
    {
      code: "const PAINTED = 'data-tab-bar-pressed';",
      filename: labComponent,
      errors: [{messageId: 'pressAttribute'}],
    },
    {
      code: 'const name = `data-card-press-${state}`;',
      filename: component,
      errors: [{messageId: 'pressAttribute'}],
    },
    // (d) A `:active` arm, plain or narrowed, and a stylex.when selector.
    {
      code: "const s = stylex.create({root: {opacity: {default: 1, ':active': 0.5}}});",
      filename: component,
      errors: [{messageId: 'activeArm'}],
    },
    {
      code: "const s = stylex.create({root: {opacity: {':active:where(:not(:disabled))': 0.5}}});",
      filename: component,
      errors: [{messageId: 'activeArm'}],
    },
    {
      code: "const s = stylex.create({root: {opacity: {[stylex.when.ancestor(':active')]: 0.5}}});",
      filename: component,
      errors: [{messageId: 'activeArm'}],
    },
    // (d) One more arm than the baseline allows.
    {
      code: "const s = stylex.create({a: {opacity: {':active': 0.5}}, b: {opacity: {':active': 0.4}}});",
      filename: component,
      options: baselined([':active']),
      errors: [{messageId: 'activeArm'}],
    },
  ],
});

describe('press-through-recipes messages', () => {
  const messages = Object.values(rule.meta.messages);

  it('start with the token, so the baseline can read it', () => {
    for (const message of messages)
      expect(message.startsWith('`{{token}}`')).toBe(true);
  });

  it('name no record or claim id', () => {
    for (const message of messages) {
      expect(message).not.toMatch(
        /\b(?:AST-\d+|INV\d+|architecture:|component:|spec:)/,
      );
    }
  });
});
