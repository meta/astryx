// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.hitArea.test.tsx
 * @input Button, ButtonGroup, and the touch band's StyleX classes
 * @output Unit coverage that a Button that takes taps draws the touch band on
 *   its content wrapper, which leaves a caller's ::after alone, and sets the
 *   band's room on itself. A grouped Button takes the group's room between
 *   members. A disabled or busy-only Button takes no band.
 * @position Button's FR42 touch-target evidence beside Button.test.tsx
 */

import * as stylex from '@stylexjs/stylex';
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
import {ButtonGroup} from '../ButtonGroup/ButtonGroup';
import {HitAreaGroupContext} from '../hooks/pressGroupContext';
import {Button} from './Button';

function classesOf(className: string | undefined): string[] {
  return (className ?? '').split(/\s+/).filter(Boolean);
}

const bandClasses = classesOf(stylex.props(touchHitAreaStyles.band).className);
const memberClasses = classesOf(
  stylex.props(touchHitAreaStyles.member).className,
);

/** The element inside the button that carries the band, if any. */
function bandElementOf(button: Element): Element | undefined {
  return [...button.querySelectorAll('*')].find(element =>
    bandClasses.every(bandClass => element.classList.contains(bandClass)),
  );
}

function isMember(button: Element): boolean {
  return memberClasses.every(name => button.classList.contains(name));
}

const callerStyles = stylex.create({
  dot: {
    '::after': {
      content: '""',
      position: 'absolute',
      top: '4px',
      insetInlineEnd: '4px',
    },
  },
});

describe('Button touch target (AST-094 FR42)', () => {
  it('draws the touch band on a standalone button’s content wrapper', () => {
    render(<Button label="Save" />);
    const button = screen.getByRole('button', {name: 'Save'});
    expect(bandClasses.length).toBeGreaterThan(0);
    expect(bandElementOf(button)).toBeDefined();
    expect(isMember(button)).toBe(false);
    expect(button).toHaveAccessibleName('Save');
  });

  it("leaves a caller's ::after decoration on the button itself, and the band on its content wrapper", () => {
    render(<Button label="Inbox" xstyle={callerStyles.dot} />);
    const button = screen.getByRole('button', {name: 'Inbox'});
    const callerClasses = classesOf(stylex.props(callerStyles.dot).className);
    expect(callerClasses.length).toBeGreaterThan(0);
    for (const callerClass of callerClasses) {
      expect(button).toHaveClass(callerClass);
    }
    for (const bandClass of bandClasses) {
      expect(button).not.toHaveClass(bandClass);
    }
    expect(bandElementOf(button)).toBeDefined();
    expect(button).toHaveAccessibleName('Inbox');
  });

  it('gives a link button the same band', () => {
    render(<Button label="Docs" href="/docs" />);
    expect(
      bandElementOf(screen.getByRole('link', {name: 'Docs'})),
    ).toBeDefined();
  });

  it('gives a disabled or busy-only button no band, since it takes no tap', () => {
    render(
      <>
        <Button label="Delete" isDisabled />
        <Button label="Sending" isLoading />
      </>,
    );
    expect(
      bandElementOf(screen.getByRole('button', {name: 'Delete'})),
    ).toBeUndefined();
    expect(
      bandElementOf(screen.getByRole('button', {name: 'Sending'})),
    ).toBeUndefined();
  });

  it('keeps the band on a busy button that can still be interrupted', () => {
    render(<Button label="Stop upload" isLoading isInterruptible />);
    expect(
      bandElementOf(screen.getByRole('button', {name: 'Stop upload'})),
    ).toBeDefined();
  });

  it('gives a grouped button its own band with the group’s room between members', () => {
    render(
      <>
        <ButtonGroup label="Actions">
          <Button label="Cut" />
          <Button label="Copy" />
        </ButtonGroup>
        <HitAreaGroupContext value>
          <Button label="Bold" />
        </HitAreaGroupContext>
      </>,
    );
    for (const name of ['Cut', 'Bold']) {
      const button = screen.getByRole('button', {name});
      expect(bandElementOf(button)).toBeDefined();
      expect(isMember(button)).toBe(true);
    }
  });
});
