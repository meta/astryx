// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useInputStatusIcon example builds its own bordered field. It composes
 * Core's text field timing right after the shared field box. So a field
 * copied from it shows its focus look at once under a coarse pointer, as
 * Core's text fields do.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {inputWrapperStyles} from '@astryxdesign/core/Field';
import UseInputStatusIconHookUsage from '../../assets/templates/blocks/components/Hooks/useInputStatusIconHookUsage';

// The node project does not compile StyleX. The mock keeps each props call's
// styles, so the test reads which styles the field composes.
const propsCalls = vi.hoisted(() => [] as unknown[][]);
vi.mock('@stylexjs/stylex', async importOriginal => ({
  ...(await importOriginal<object>()),
  create: <T,>(styles: T) => styles,
  props: (...styles: unknown[]) => {
    propsCalls.push(styles);
    return {};
  },
}));

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  propsCalls.length = 0;
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

it('composes the text field timing right after the shared field box', () => {
  act(() => {
    root = createRoot(container);
    root.render(<UseInputStatusIconHookUsage />);
  });
  const fieldCalls = propsCalls.filter(styles =>
    styles.includes(inputWrapperStyles.base),
  );
  expect(fieldCalls.length).toBeGreaterThan(0);
  for (const styles of fieldCalls) {
    const base = styles.indexOf(inputWrapperStyles.base);
    expect(styles[base + 1]).toBe(inputWrapperStyles.textField);
  }
});
