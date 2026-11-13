// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavContract.test.tsx
 * @input Uses vitest, @testing-library/react, MobileNav, MobileNavToggle, AppShellMobileContext
 * @output Unit tests for the MobileNav and MobileNavToggle contract rows that had no focused test
 * @position Testing; validates MobileNav.tsx and MobileNavToggle.tsx against their component record
 */

import {createRef} from 'react';
import {describe, it, expect, vi, beforeAll} from 'vitest';
import {render, screen, within, fireEvent} from '@testing-library/react';
import {MobileNav} from './MobileNav';
import {MobileNavToggle} from './MobileNavToggle';
import {
  AppShellMobileContext,
  type AppShellMobileContextValue,
} from '../AppShell/AppShellMobileContext';

// jsdom has no showModal() or close() on <dialog>.
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

function mobileContext(
  overrides: Partial<AppShellMobileContextValue>,
): AppShellMobileContextValue {
  return {
    isMobile: true,
    isMobileNavOpen: false,
    mobileNavId: 'shell-drawer',
    toggleMobileNav: () => {},
    openMobileNav: () => {},
    closeMobileNav: () => {},
    isMobileNavEnabled: true,
    hasAutoToggle: true,
    ...overrides,
  };
}

describe('MobileNav anatomy and target', () => {
  it('holds a level-2 heading, the Close button, and a navigation region inside the dialog', () => {
    render(
      <MobileNav isOpen={true} onOpenChange={() => {}} header="Menu">
        <a href="#home">Home</a>
      </MobileNav>,
    );

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('heading', {level: 2, name: 'Menu'}),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', {name: 'Close navigation'}),
    ).toBeInTheDocument();
    expect(
      within(within(dialog).getByRole('navigation')).getByRole('link', {
        name: 'Home',
      }),
    ).toBeInTheDocument();
  });

  it('puts the mobile-nav target and the resolved side on the dialog', () => {
    const {rerender} = render(
      <MobileNav isOpen={true} onOpenChange={() => {}} side="start">
        <span>Content</span>
      </MobileNav>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('astryx-mobile-nav');
    expect(dialog).toHaveAttribute('data-side', 'start');

    rerender(
      <MobileNav isOpen={true} onOpenChange={() => {}} side="end">
        <span>Content</span>
      </MobileNav>,
    );
    expect(dialog).toHaveAttribute('data-side', 'end');
  });

  it('gives each standalone dialog its own id', () => {
    render(
      <>
        <MobileNav isOpen={true} onOpenChange={() => {}} data-testid="a">
          <span>A</span>
        </MobileNav>
        <MobileNav isOpen={true} onOpenChange={() => {}} data-testid="b">
          <span>B</span>
        </MobileNav>
      </>,
    );

    const first = screen.getByTestId('a').id;
    const second = screen.getByTestId('b').id;
    expect(first).not.toBe('');
    expect(second).not.toBe('');
    expect(first).not.toBe(second);
  });

  it("keeps AppShell's drawer id when a caller passes id={undefined}", () => {
    render(
      <AppShellMobileContext value={mobileContext({isMobileNavOpen: true})}>
        <MobileNavToggle />
        <MobileNav id={undefined}>
          <span>Content</span>
        </MobileNav>
      </AppShellMobileContext>,
    );

    const toggle = screen.getByRole('button', {name: 'Open navigation'});
    expect(screen.getByRole('dialog')).toHaveAttribute('id', 'shell-drawer');
    expect(toggle).toHaveAttribute('aria-controls', 'shell-drawer');
  });

  it('forwards its ref to the dialog', () => {
    const ref = createRef<HTMLDialogElement>();
    render(
      <MobileNav ref={ref} isOpen={true} onOpenChange={() => {}}>
        <span>Content</span>
      </MobileNav>,
    );

    expect(ref.current).toBe(screen.getByRole('dialog'));
  });
});

describe('MobileNav name', () => {
  it('is named by label over a string header', () => {
    render(
      <MobileNav
        isOpen={true}
        onOpenChange={() => {}}
        label="Site"
        header="Menu">
        <span>Content</span>
      </MobileNav>,
    );

    expect(screen.getByRole('dialog', {name: 'Site'})).toBeInTheDocument();
    expect(screen.getByRole('navigation', {name: 'Site'})).toBeInTheDocument();
  });

  it("is named by a caller's aria-labelledby over label", () => {
    render(
      <>
        <span id="outer-name">Sections</span>
        <MobileNav
          isOpen={true}
          onOpenChange={() => {}}
          label="Site"
          aria-labelledby="outer-name">
          <span>Content</span>
        </MobileNav>
      </>,
    );

    expect(screen.getByRole('dialog', {name: 'Sections'})).toBeInTheDocument();
  });

  it('renders non-string header content as given and keeps the default name', () => {
    render(
      <MobileNav
        isOpen={true}
        onOpenChange={() => {}}
        header={<span data-testid="logo">Logo</span>}>
        <span>Content</span>
      </MobileNav>,
    );

    const dialog = screen.getByRole('dialog', {name: 'Navigation'});
    expect(within(dialog).getByTestId('logo')).toHaveTextContent('Logo');
    expect(within(dialog).queryByRole('heading')).toBeNull();
  });
});

describe('MobileNav backdrop click', () => {
  it("does not close when the caller's onClick prevents the default", () => {
    const onOpenChange = vi.fn();
    render(
      <MobileNav
        isOpen={true}
        onOpenChange={onOpenChange}
        onClick={event => event.preventDefault()}>
        <span>Content</span>
      </MobileNav>,
    );

    fireEvent.click(screen.getByRole('dialog'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('MobileNavToggle', () => {
  it('renders nothing above the mobile layout', () => {
    render(
      <AppShellMobileContext value={mobileContext({isMobile: false})}>
        <MobileNavToggle />
      </AppShellMobileContext>,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing when mobile navigation is disabled', () => {
    render(
      <AppShellMobileContext value={mobileContext({isMobileNavEnabled: false})}>
        <MobileNavToggle />
      </AppShellMobileContext>,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing outside an AppShell', () => {
    render(<MobileNavToggle />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is an icon button named "Open navigation" by default', () => {
    render(
      <AppShellMobileContext value={mobileContext({})}>
        <MobileNavToggle />
      </AppShellMobileContext>,
    );

    const toggle = screen.getByRole('button', {name: 'Open navigation'});
    expect(toggle.querySelector('svg')).not.toBeNull();
  });

  it('takes its name from label and its icon from children', () => {
    render(
      <AppShellMobileContext value={mobileContext({})}>
        <MobileNavToggle label="Menu">
          <span data-testid="custom-icon" />
        </MobileNavToggle>
      </AppShellMobileContext>,
    );

    const toggle = screen.getByRole('button', {name: 'Menu'});
    expect(toggle).toContainElement(screen.getByTestId('custom-icon'));
    expect(toggle.querySelector('svg')).toBeNull();
  });
});
