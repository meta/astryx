// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.hitArea.test.tsx
 * @input Button, ButtonGroup, and the shared hit area (mocked)
 * @output Unit coverage that a standalone Button takes the shared touch band,
 *   on its content wrapper, which leaves a caller's ::after alone, and that a
 *   grouped, disabled or busy-only Button takes none
 * @position Button's FR42 touch-target evidence beside Button.test.tsx
 */

import * as stylex from '@stylexjs/stylex';
import {describe, it, expect, vi} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import type * as HitAreaModule from '../utils/hitArea';
import type {HitInsets} from '../utils/hitArea';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
import {ButtonGroup} from '../ButtonGroup/ButtonGroup';
import {Button} from './Button';

// On a coarse pointer, the shared hit area measures neighbours in a real
// layout. Here it reports what it was asked to watch, and each test answers
// for it.
const hitAreaWatches = vi.hoisted(
  () => [] as {element: Element; onInsets: (insets: HitInsets) => void}[],
);
vi.mock('../utils/hitArea', async importOriginal => ({
  ...(await importOriginal<typeof HitAreaModule>()),
  watchHitArea: (element: Element, onInsets: (insets: HitInsets) => void) => {
    const watch = {element, onInsets};
    hitAreaWatches.push(watch);
    return () => {
      hitAreaWatches.splice(hitAreaWatches.indexOf(watch), 1);
    };
  },
}));

const bandClasses = (stylex.props(touchHitAreaStyles.layer).className ?? '')
  .split(/\s+/)
  .filter(Boolean);

function isWatched(element: Element): boolean {
  return hitAreaWatches.some(entry => entry.element === element);
}

/** The element inside the button that carries the band, if any. */
function bandElementOf(button: Element): Element | undefined {
  return [...button.querySelectorAll('*')].find(element =>
    bandClasses.every(bandClass => element.classList.contains(bandClass)),
  );
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
  it('grows a standalone button toward 44 px as far as the shared hit area allows', () => {
    render(<Button label="Save" />);
    const button = screen.getByRole('button', {name: 'Save'});
    expect(bandClasses.length).toBeGreaterThan(0);
    const band = bandElementOf(button);
    expect(band).toBeDefined();
    expect(button).toHaveAccessibleName('Save');
    const watch = hitAreaWatches.find(entry => entry.element === button);
    expect(watch).toBeDefined();
    act(() => watch?.onInsets({top: 6, right: 0, bottom: 6, left: 0}));
    expect(button.style.getPropertyValue('--astryx-hit-inset-top')).toBe('6px');
  });

  it("leaves a caller's ::after decoration on the button itself, and the band on its content wrapper", () => {
    render(<Button label="Inbox" xstyle={callerStyles.dot} />);
    const button = screen.getByRole('button', {name: 'Inbox'});
    const callerClasses = (stylex.props(callerStyles.dot).className ?? '')
      .split(/\s+/)
      .filter(Boolean);
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
    expect(isWatched(screen.getByRole('link', {name: 'Docs'}))).toBe(true);
  });

  it('gives a disabled or busy-only button no band, since it takes no tap', () => {
    render(
      <>
        <Button label="Delete" isDisabled />
        <Button label="Sending" isLoading />
      </>,
    );
    const disabled = screen.getByRole('button', {name: 'Delete'});
    const busy = screen.getByRole('button', {name: 'Sending'});
    expect(isWatched(disabled)).toBe(false);
    expect(isWatched(busy)).toBe(false);
    expect(bandElementOf(disabled)).toBeUndefined();
    expect(bandElementOf(busy)).toBeUndefined();
  });

  it('keeps the band on a busy button that can still be interrupted', () => {
    render(<Button label="Stop upload" isLoading isInterruptible />);
    expect(isWatched(screen.getByRole('button', {name: 'Stop upload'}))).toBe(
      true,
    );
  });

  it('leaves a grouped button to the group: it draws no band of its own', () => {
    render(
      <ButtonGroup label="Actions">
        <Button label="Cut" />
        <Button label="Copy" />
      </ButtonGroup>,
    );
    const cut = screen.getByRole('button', {name: 'Cut'});
    expect(isWatched(cut)).toBe(false);
    expect(bandElementOf(cut)).toBeUndefined();
  });
});
