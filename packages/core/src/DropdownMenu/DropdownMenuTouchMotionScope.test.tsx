// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file DropdownMenuTouchMotionScope.test.tsx
 * @input DropdownMenu, its touch surface motion (menuSurfaceMotion.ts) under
 *   a counting stand-in, and stubbed pointer media queries
 * @output Proof that the touch surface motion exists only for a finger's
 *   open in the touch modes: a mouse open creates none, on any device, and a
 *   finger's open creates one
 * @position Sibling of DropdownMenu.test.tsx; its own file because the
 *   motion module is replaced here for every case
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {DropdownMenu} from './DropdownMenu';
import {DropdownMenuItem} from './DropdownMenuItem';
import {TOUCH_QUERY} from '../utils/touchPresentation';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';

const motions = vi.hoisted(() => ({created: 0}));

vi.mock('./menuSurfaceMotion', async importOriginal => {
  const actual = await importOriginal<typeof import('./menuSurfaceMotion')>();
  return {
    ...actual,
    createMenuSurfaceMotion: (
      ...args: Parameters<typeof actual.createMenuSurfaceMotion>
    ) => {
      motions.created += 1;
      return actual.createMenuSurfaceMotion(...args);
    },
  };
});

function stubPointer(coarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: coarse && query === TOUCH_QUERY,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

const originalShow = HTMLElement.prototype.showPopover;
const originalHide = HTMLElement.prototype.hidePopover;
const originalAnimate = HTMLElement.prototype.animate;

beforeEach(() => {
  __resetInteractionModalityForTest();
  motions.created = 0;
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  // jsdom runs no animations.
  HTMLElement.prototype.animate = vi.fn(function () {
    return {
      cancel: vi.fn(),
      finished: new Promise(() => {}),
      startTime: null,
    } as unknown as Animation;
  });
});

afterEach(() => {
  HTMLElement.prototype.showPopover = originalShow;
  HTMLElement.prototype.hidePopover = originalHide;
  HTMLElement.prototype.animate = originalAnimate;
  vi.unstubAllGlobals();
});

function renderMenu() {
  render(
    <DropdownMenu button={{label: 'Actions'}}>
      <DropdownMenuItem label="Edit" onClick={() => {}} />
      <DropdownMenuItem label="Delete" onClick={() => {}} />
    </DropdownMenu>,
  );
  return screen.getByRole('button', {name: /Actions/});
}

describe('DropdownMenu touch surface motion', () => {
  it('a mouse open creates no touch motion (spec:AST-094 FR24)', async () => {
    stubPointer(false);
    const trigger = renderMenu();
    await userEvent.setup().click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(motions.created).toBe(0);
  });

  it('a mouse open on a touch device creates none either: the motion is a finger’s', async () => {
    stubPointer(true);
    const trigger = renderMenu();
    await userEvent.setup().click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(motions.created).toBe(0);
  });

  it('a finger’s open creates it', () => {
    stubPointer(true);
    const trigger = renderMenu();
    const finger = {pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 0};
    fireEvent.pointerDown(trigger, finger);
    fireEvent.pointerUp(trigger, finger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(motions.created).toBe(1);
  });
});
