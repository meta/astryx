// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavScrollbarGutter.test.tsx
 * @input Uses vitest, @testing-library/react, MobileNav, a stubbed viewport
 * @output Unit tests for the scrollbar gutter MobileNav reserves while open
 * @position Testing; guards MobileNav.tsx against the open-drawer page shift
 *
 * MobileNav clips the document to lock background scroll, which hides a
 * classic scrollbar and widens the layout viewport by its width — the page
 * behind the drawer jumps sideways. The clip has to be paired with holding
 * that gutter open.
 *
 * SYNC: When MobileNav.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, beforeAll, afterEach} from 'vitest';
import {render, cleanup} from '@testing-library/react';
import {MobileNav} from './MobileNav';

beforeAll(() => {
  // jsdom doesn't implement showModal/close on <dialog>
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ||
    function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ||
    function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
});

const originalCss = Object.getOwnPropertyDescriptor(window, 'CSS');

/**
 * jsdom does no layout, so both halves of the measurement are stubbed, and
 * the engine has `scrollbar-gutter`, as every current one does.
 */
function stubViewport(innerWidth: number, clientWidth: number) {
  Object.defineProperty(window, 'innerWidth', {
    value: innerWidth,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: clientWidth,
    configurable: true,
  });
  Object.defineProperty(window, 'CSS', {
    value: {
      supports: (property: string, value: string) =>
        property === 'scrollbar-gutter' && value === 'stable',
    },
    configurable: true,
    writable: true,
  });
}

const rootGutter = () => document.documentElement.style.scrollbarGutter;

describe('MobileNav scrollbar gutter', () => {
  afterEach(() => {
    cleanup();
    document.documentElement.style.cssText = '';
    // @ts-expect-error -- drop the viewport stub so jsdom's own value comes back
    delete document.documentElement.clientWidth;
    if (originalCss) {
      Object.defineProperty(window, 'CSS', originalCss);
    } else {
      // @ts-expect-error -- jsdom has no CSS object of its own
      delete window.CSS;
    }
  });

  it('holds the gutter open while the drawer is open', () => {
    stubViewport(1024, 1009);

    const view = render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(document.documentElement.style.overflow).toBe('clip');
    expect(rootGutter()).toBe('stable');

    view.unmount();

    expect(document.documentElement.style.overflow).toBe('');
    expect(rootGutter()).toBe('');
  });

  it('gives the gutter back when the drawer closes', () => {
    stubViewport(1024, 1009);

    const view = render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(rootGutter()).toBe('stable');

    view.rerender(
      <MobileNav isOpen={false} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(rootGutter()).toBe('');
  });

  it('holds nothing when the scrollbar is an overlay one', () => {
    stubViewport(1024, 1024);

    render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(document.documentElement.style.overflow).toBe('clip');
    expect(rootGutter()).toBe('');
    expect(document.documentElement.style.paddingRight).toBe('');
  });
});
