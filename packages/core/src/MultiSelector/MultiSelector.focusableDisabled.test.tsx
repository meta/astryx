// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MultiSelector.focusableDisabled.test.tsx
 * @input Uses vitest, @testing-library/react, StyleX, MultiSelector
 * @output Conformance tests for spec:AST-085 FR1–FR3 and FR6 on MultiSelector;
 *   FR4 needs a real engine (MultiSelector.disabledFocus.a11y.chromium.spec.ts)
 * @position Testing; validates the disabled trigger of MultiSelector.tsx
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {MultiSelector} from './MultiSelector';

type Handler = () => void;
function Harness(props: {
  isDisabled: boolean;
  variant?: 'input' | 'secondary' | 'ghost';
  onClick?: Handler;
  onKeyDown?: Handler;
  onMouseDown?: Handler;
  onDoubleClick?: Handler;
}) {
  return (
    <form aria-label="Form">
      <button type="button">Before</button>
      <MultiSelector
        label="Fruit"
        htmlName="fruit"
        options={['Apple', 'Banana']}
        value={['Banana']}
        onChange={() => {}}
        {...props}
      />
      <button type="button">After</button>
    </form>
  );
}

const trigger = () => screen.getByRole('combobox', {name: 'Fruit'});

describe('MultiSelector disabled (spec:AST-085)', () => {
  it('FR1: renders no native disabled and keeps its tab stop', async () => {
    const user = userEvent.setup();
    const {container} = render(<Harness isDisabled />);
    expect(container.querySelector('[disabled]')).toBeNull();
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', {name: 'Before'}));
    await user.tab();
    expect(trigger()).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
  });

  it('FR2: no press or key opens it or reaches a caller or ancestor handler', async () => {
    const user = userEvent.setup();
    const handlers = {
      onClick: vi.fn(),
      onKeyDown: vi.fn(),
      onMouseDown: vi.fn(),
      onDoubleClick: vi.fn(),
    };
    const onAncestorClick = vi.fn();
    render(
      <div onClick={onAncestorClick}>
        <Harness isDisabled {...handlers} />
      </div>,
    );
    await user.dblClick(trigger());
    trigger().focus();
    for (const key of ['{Enter}', ' ', '{ArrowDown}', 'b']) {
      await user.keyboard(key);
    }
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
    for (const handler of [...Object.values(handlers), onAncestorClick]) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it('FR3: submits no value while disabled', () => {
    const {rerender} = render(<Harness isDisabled={false} />);
    const form = () =>
      screen.getByRole<HTMLFormElement>('form', {name: 'Form'});
    expect(new FormData(form()).getAll('fruit')).toEqual(['Banana']);
    rerender(<Harness isDisabled />);
    expect(new FormData(form()).getAll('fruit')).toEqual([]);
  });

  // jsdom cannot match `:focus-visible`: compare the ring's StyleX class hash.
  const RING = stylex
    .props(
      stylex.create({
        ring: {
          boxShadow: {
            default: null,
            ':has(> [aria-disabled="true"]:focus-visible)': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
          },
        },
      }).ring,
    )
    .className!.split(' ')
    .pop()!;

  it.each([
    ['input', true],
    ['secondary', false],
    ['ghost', false],
  ] as const)(
    'FR6: a disabled %s trigger carries its own ring: %s',
    (variant, ring) => {
      render(<Harness isDisabled variant={variant} />);
      const wrapper = trigger().parentElement!;
      expect(wrapper.classList.contains(RING)).toBe(ring);
      expect(getComputedStyle(wrapper).cursor).toBe('default');
    },
  );
});
