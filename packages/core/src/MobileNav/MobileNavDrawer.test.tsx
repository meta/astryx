// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavDrawer.test.tsx
 * @input AppShell with a SideNav below its mobile breakpoint, rendered from a
 *   fresh module graph in each case, so each case starts before the drawer
 *   module has loaded
 * @output Proof that the shell renders an empty, closed placeholder for the
 *   drawer until a first intent or open loads it, that an open made before the
 *   load opens the drawer once it has mounted, and that a failed load leaves
 *   the toggle working
 * @position Testing; the drawer slot in MobileNavToggle.tsx. Other drawer
 *   tests load the drawer first.
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';

beforeAll(async () => {
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
  // Warm the runner's transforms outside the test. The module reset below
  // still gives each case a drawer loader that has not run.
  await import('./MobileNav');
});

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

function createMockMatchMedia(matches: boolean) {
  return {
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue(createMockMatchMedia(true)),
  );
});

afterEach(() => {
  vi.doUnmock('./MobileNav');
  vi.restoreAllMocks();
});

const LOAD = {timeout: 15_000};

/**
 * Makes the drawer's load fail when the case says so. `started` resolves once
 * the load has begun, so a case fails it only while it is pending.
 */
function holdFailingLoad() {
  let fail = () => {};
  let markStarted = () => {};
  const started = new Promise<void>(resolve => {
    markStarted = resolve;
  });
  vi.doMock('./MobileNav', async () => {
    markStarted();
    await new Promise<void>(resolve => {
      fail = resolve;
    });
    throw new Error('offline');
  });
  return {started, fail: () => fail()};
}

async function renderShell() {
  const {AppShell} = await import('../AppShell/AppShell');
  const {SideNav, SideNavItem} = await import('../SideNav');
  render(
    <AppShell
      sideNav={
        <SideNav>
          <SideNavItem label="Home" href="/" />
        </SideNav>
      }
      mobileNav={{breakpoint: 'md'}}>
      <div>Content</div>
    </AppShell>,
  );
  const toggle = screen.getByRole('button', {name: /open navigation/i});
  const dialog = () => screen.getAllByRole('dialog', {hidden: true})[0];
  return {toggle, dialog};
}

describe('the AppShell drawer before it has loaded', () => {
  it('shows a drawer another copy of Core loaded, before its own copy loads one', async () => {
    const {dialog} = await renderShell();
    // A second module graph stands in for a second copy of Core, such as a
    // swizzled SideNav inside the package AppShell.
    vi.resetModules();
    const otherCopy = await import('./MobileNavToggle');
    // A pending import must not leave an act scope open if this test times out.
    const load = otherCopy.loadMobileNavDrawer();
    expect(
      await screen.findByText('Home', undefined, LOAD),
    ).toBeInTheDocument();
    expect(await load).toBe(true);
    expect(dialog()).not.toHaveAttribute('open');
  });

  it('is an empty, closed dialog that the toggle names', async () => {
    const {toggle, dialog} = await renderShell();
    const placeholder = dialog();
    expect(placeholder).not.toHaveAttribute('open');
    expect(placeholder).toBeEmptyDOMElement();
    expect(placeholder.id).not.toBe('');
    expect(toggle).toHaveAttribute('aria-controls', placeholder.id);
    expect(screen.queryByText('Home')).toBeNull();
  });

  it('loads on focus, stays closed, and keeps focus on the toggle', async () => {
    const {toggle, dialog} = await renderShell();
    act(() => {
      toggle.focus();
    });
    expect(
      await screen.findByText('Home', undefined, LOAD),
    ).toBeInTheDocument();
    expect(dialog()).not.toHaveAttribute('open');
    expect(dialog().id).toBe(toggle.getAttribute('aria-controls'));
    expect(toggle).toHaveFocus();
  });

  it('loads on a mouse hover but not on a touch hover', async () => {
    const {toggle} = await renderShell();
    fireEvent.pointerEnter(toggle, {pointerType: 'touch'});
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('Home')).toBeNull();
    fireEvent.pointerEnter(toggle, {pointerType: 'mouse'});
    expect(
      await screen.findByText('Home', undefined, LOAD),
    ).toBeInTheDocument();
  });

  it('opens once it has mounted when an open came before the load', async () => {
    const {toggle, dialog} = await renderShell();
    // A press with no hover or focus first: the open waits for the load.
    fireEvent.click(toggle);
    expect(dialog()).not.toHaveAttribute('open');
    await waitFor(() => {
      expect(dialog()).toHaveAttribute('open');
    }, LOAD);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('reports a failed load once when the handler changes while it loads', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = holdFailingLoad();
    const {AppShell} = await import('../AppShell/AppShell');
    const {SideNav, SideNavItem} = await import('../SideNav');
    const onOpenChange = vi.fn();
    function Shell({isOpen}: {isOpen: boolean}) {
      return (
        <AppShell
          sideNav={
            <SideNav>
              <SideNavItem label="Home" href="/" />
            </SideNav>
          }
          // A new handler on every render re-runs the open's load.
          mobileNav={{
            breakpoint: 'md',
            isOpen,
            onOpenChange: (open: boolean) => {
              onOpenChange(open);
            },
          }}>
          <div>Content</div>
        </AppShell>
      );
    }
    const {rerender} = render(<Shell isOpen />);
    rerender(<Shell isOpen />);
    await load.started;
    await act(async () => {
      load.fail();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    }, LOAD);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it('does not close a drawer that closed before its load failed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = holdFailingLoad();
    const {AppShell} = await import('../AppShell/AppShell');
    const {SideNav, SideNavItem} = await import('../SideNav');
    const onOpenChange = vi.fn();
    function Shell({isOpen}: {isOpen: boolean}) {
      return (
        <AppShell
          sideNav={
            <SideNav>
              <SideNavItem label="Home" href="/" />
            </SideNav>
          }
          mobileNav={{breakpoint: 'md', isOpen, onOpenChange}}>
          <div>Content</div>
        </AppShell>
      );
    }
    const {rerender} = render(<Shell isOpen />);
    rerender(<Shell isOpen={false} />);
    await load.started;
    await act(async () => {
      load.fail();
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('drops the open and keeps the toggle working when the load fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.doMock('./MobileNav', () => {
      throw new Error('offline');
    });
    const {toggle, dialog} = await renderShell();
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }, LOAD);
    expect(dialog()).not.toHaveAttribute('open');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('The navigation drawer could not load.'),
    );

    // A later intent asks again.
    vi.doUnmock('./MobileNav');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(dialog()).toHaveAttribute('open');
    }, LOAD);
  });
});
