// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNav.test.tsx
 * @input Uses vitest, @testing-library/react, MobileNav component
 * @output Unit tests for MobileNav component behavior
 * @position Testing; validates MobileNav.tsx implementation
 *
 * SYNC: When MobileNav.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeAll} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {MobileNav} from './MobileNav';
import {declaredValue} from '../__tests__/stylexDeclarations';

// jsdom doesn't implement showModal/close on <dialog>, so we mock them
beforeAll(() => {
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

describe('MobileNav', () => {
  it('renders when isOpen is true', () => {
    render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Nav content')).toBeInTheDocument();
  });

  it('does not show dialog as open when isOpen is false', () => {
    render(
      <MobileNav
        isOpen={false}
        onOpenChange={() => {}}
        data-testid="mobile-nav">
        <span>Nav content</span>
      </MobileNav>,
    );
    // The dialog element exists but is not open
    const dialog = screen.getByTestId('mobile-nav');
    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('open');
  });

  it('calls onOpenChange(false) on native cancel event (Escape)', () => {
    const handleClose = vi.fn();
    render(
      <MobileNav isOpen={true} onOpenChange={handleClose}>
        <span>Content</span>
      </MobileNav>,
    );

    // Native <dialog> fires a cancel event on Escape
    const dialog = screen.getByRole('dialog');
    const cancelEvent = new Event('cancel', {bubbles: false, cancelable: true});
    fireEvent(dialog, cancelEvent);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenChange(false) on backdrop click (click on dialog itself)', () => {
    const handleClose = vi.fn();
    render(
      <MobileNav
        isOpen={true}
        onOpenChange={handleClose}
        data-testid="mobile-nav">
        <span>Content</span>
      </MobileNav>,
    );

    // Click directly on the dialog element (the transparent overlay area)
    const dialog = screen.getByTestId('mobile-nav');
    fireEvent.click(dialog);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on drawer content click', () => {
    const handleClose = vi.fn();
    render(
      <MobileNav isOpen={true} onOpenChange={handleClose}>
        <span>Content</span>
      </MobileNav>,
    );

    fireEvent.click(screen.getByText('Content'));
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('renders close button', () => {
    render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Content</span>
      </MobileNav>,
    );

    const closeButton = screen.getByRole('button', {name: /close/i});
    expect(closeButton).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <MobileNav isOpen={true} onOpenChange={handleClose}>
        <span>Content</span>
      </MobileNav>,
    );

    const closeButton = screen.getByRole('button', {name: /close/i});
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders header string when provided', () => {
    render(
      <MobileNav isOpen={true} onOpenChange={() => {}} header="Navigation">
        <span>Content</span>
      </MobileNav>,
    );

    expect(screen.getByText('Navigation')).toBeInTheDocument();
  });

  it('forwards data-testid', () => {
    render(
      <MobileNav isOpen={true} onOpenChange={() => {}} data-testid="custom-nav">
        <span>Content</span>
      </MobileNav>,
    );

    expect(screen.getByTestId('custom-nav')).toBeInTheDocument();
  });

  it('forwards arbitrary pass-through attributes to the dialog', () => {
    render(
      <MobileNav
        isOpen={true}
        onOpenChange={() => {}}
        data-testid="nav"
        id="main-nav"
        data-custom="x"
        aria-describedby="nav-desc">
        <span>Content</span>
      </MobileNav>,
    );

    const dialog = screen.getByTestId('nav');
    expect(dialog).toHaveAttribute('id', 'main-nav');
    expect(dialog).toHaveAttribute('data-custom', 'x');
    expect(dialog).toHaveAttribute('aria-describedby', 'nav-desc');
  });

  it('applies a consumer className and style to the dialog', () => {
    render(
      <MobileNav
        isOpen={true}
        onOpenChange={() => {}}
        data-testid="nav"
        className="consumer-class"
        style={{zIndex: 42}}>
        <span>Content</span>
      </MobileNav>,
    );

    const dialog = screen.getByTestId('nav');
    expect(dialog.className).toContain('consumer-class');
    expect(dialog.style.zIndex).toBe('42');
  });

  it('composes a consumer onClick with the backdrop-dismiss handler', () => {
    const onClick = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <MobileNav
        isOpen={true}
        onOpenChange={onOpenChange}
        data-testid="nav"
        onClick={onClick}>
        <span>Content</span>
      </MobileNav>,
    );

    // Clicking the dialog element itself (the backdrop) dismisses AND calls the
    // consumer handler.
    fireEvent.click(screen.getByTestId('nav'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('uses native dialog element', () => {
    render(
      <MobileNav isOpen={true} onOpenChange={() => {}} data-testid="mobile-nav">
        <span>Content</span>
      </MobileNav>,
    );

    const dialog = screen.getByTestId('mobile-nav');
    expect(dialog.tagName).toBe('DIALOG');
  });

  it('sets aria-label from header string', () => {
    render(
      <MobileNav isOpen={true} onOpenChange={() => {}} header="My Nav">
        <span>Content</span>
      </MobileNav>,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'My Nav');
  });

  it('defaults aria-label to Navigation when no header', () => {
    render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Content</span>
      </MobileNav>,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-label',
      'Navigation',
    );
  });

  it('opens dialog via showModal when isOpen becomes true', () => {
    const {rerender} = render(
      <MobileNav
        isOpen={false}
        onOpenChange={() => {}}
        data-testid="mobile-nav">
        <span>Content</span>
      </MobileNav>,
    );

    const dialog = screen.getByTestId('mobile-nav');
    expect(dialog).not.toHaveAttribute('open');

    rerender(
      <MobileNav isOpen={true} onOpenChange={() => {}} data-testid="mobile-nav">
        <span>Content</span>
      </MobileNav>,
    );

    expect(dialog).toHaveAttribute('open');
  });

  it('caps the drawer at 85 % of the viewport, as its docs promise', () => {
    // On a 320 px phone a 320 px drawer used to cover the whole screen and
    // leave no backdrop to tap; the cap keeps a 48 px strip of the page.
    render(
      <MobileNav
        isOpen
        onOpenChange={() => {}}
        width={300}
        data-testid="mobile-nav">
        <span>Content</span>
      </MobileNav>,
    );

    const drawer = screen
      .getByTestId('mobile-nav')
      .querySelector<HTMLElement>('[tabindex="-1"]');
    if (drawer == null) {
      throw new Error('no drawer panel');
    }
    expect(declaredValue(drawer, 'max-width')).toBe('85vw');
    // The requested width is the width, not a cap on a full-viewport one.
    expect(drawer.style.getPropertyValue('--x-width')).toBe('300px');
    expect(declaredValue(drawer, 'width')).toBe('var(--x-width)');
  });
});
