// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TopNavMegaMenu.test.tsx
 * @input Uses vitest, @testing-library/react, TopNavMegaMenu and sub-components
 * @output Unit tests for TopNavMegaMenu slots API and mobile modes
 * @position Testing; validates TopNavMegaMenu behavior
 *
 * SYNC: When TopNavMegaMenu changes, update tests to match new behavior
 */

import {createRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {describe, it, expect, vi, beforeAll, afterAll, afterEach} from 'vitest';
import {render, screen, act, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {TopNavMegaMenu} from './TopNavMegaMenu';
import {TopNavMegaMenuItem} from './TopNavMegaMenuItem';
import {TopNavRenderContext} from './TopNavRenderContext';

// =============================================================================
// Popover API mock — jsdom implements no Popover API, so default-mode tests
// that actually open/close the panel install these shims on HTMLElement.
// =============================================================================

let originalMatches: typeof HTMLElement.prototype.matches;

function installPopoverApiMock() {
  originalMatches = HTMLElement.prototype.matches;
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    // Model the browser's auto-popover stack: opening one auto popover evicts
    // any currently open auto popover before showing the new one.
    if (this.getAttribute('popover') === 'auto') {
      document
        .querySelectorAll<HTMLElement>('[popover="auto"][popover-open]')
        .forEach(openPopover => {
          if (openPopover === this) {
            return;
          }
          openPopover.removeAttribute('popover-open');
          const closeEvent = new Event('toggle', {bubbles: false});
          Object.defineProperty(closeEvent, 'newState', {value: 'closed'});
          openPopover.dispatchEvent(closeEvent);
        });
    }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return this.hasAttribute('popover-open');
    }
    return originalMatches.call(this, selector);
  };
}

function restorePopoverApiMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = originalMatches;
}

// =============================================================================
// Default (desktop) mode
// =============================================================================

describe('TopNavMegaMenu — default mode', () => {
  it('renders the trigger button with label', () => {
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
      />,
    );
    expect(screen.getByRole('button', {name: 'Products'})).toBeInTheDocument();
  });

  it('trigger has aria-haspopup and aria-expanded attributes', () => {
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Products'});
    expect(trigger).toHaveAttribute('aria-haspopup', 'true');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders with multiple menu items', () => {
    render(
      <TopNavMegaMenu
        label="Products"
        items={
          <>
            <TopNavMegaMenuItem title="Analytics" href="/analytics" />
            <TopNavMegaMenuItem title="Reports" href="/reports" />
          </>
        }
      />,
    );
    expect(screen.getByRole('button', {name: 'Products'})).toBeInTheDocument();
  });

  it('renders with featured content', () => {
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
        featured={<span data-testid="featured">Featured content</span>}
      />,
    );
    expect(screen.getByRole('button', {name: 'Products'})).toBeInTheDocument();
  });

  it('renders without items or featured', () => {
    render(<TopNavMegaMenu label="Empty" />);
    expect(screen.getByRole('button', {name: 'Empty'})).toBeInTheDocument();
  });
});

// =============================================================================
// Popup semantics (default mode)
// =============================================================================

describe('TopNavMegaMenu — popup semantics', () => {
  beforeAll(installPopoverApiMock);
  afterAll(restorePopoverApiMock);

  it('trigger aria-controls resolves to the popup element', async () => {
    const user = userEvent.setup();
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
      />,
    );

    const trigger = screen.getByRole('button', {name: 'Products'});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // aria-controls must be present and point at the real popup element.
    const controlsId = trigger.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    const popup = document.getElementById(controlsId as string);
    expect(popup).not.toBeNull();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // The referenced element is the popup that contains the panel content.
    expect(popup).toContainElement(
      screen.getByRole('group', {name: 'Products', hidden: true}),
    );
  });

  it('does not wrap the panel in a role="dialog" aria-modal element', async () => {
    const user = userEvent.setup();
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Products'}));

    // Focus stays on the trigger while the panel is open, so a modal dialog
    // wrapper would tell assistive tech the focused control is inert.
    expect(
      screen.queryByRole('dialog', {hidden: true}),
    ).not.toBeInTheDocument();
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
  });

  it('does not expose role="menu" — a link grid is not an ARIA menu', async () => {
    const user = userEvent.setup();
    render(
      <TopNavMegaMenu
        label="Products"
        items={
          <>
            <TopNavMegaMenuItem title="Analytics" href="/analytics" />
            <TopNavMegaMenuItem title="Reports" href="/reports" />
          </>
        }
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Products'}));

    // Per the WAI-ARIA APG, mega menu panels of navigation links must not use
    // the menu role (reserved for action menus with menuitem children).
    expect(screen.queryByRole('menu', {hidden: true})).not.toBeInTheDocument();
    expect(screen.queryAllByRole('menuitem', {hidden: true})).toHaveLength(0);
  });

  it('exposes the panel as a labeled group', async () => {
    const user = userEvent.setup();
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Products'}));

    expect(
      screen.getByRole('group', {name: 'Products', hidden: true}),
    ).toBeInTheDocument();
  });

  it('keeps item links with accessible names inside the panel', async () => {
    const user = userEvent.setup();
    render(
      <TopNavMegaMenu
        label="Products"
        items={
          <>
            <TopNavMegaMenuItem title="Analytics" href="/analytics" />
            <TopNavMegaMenuItem title="Reports" href="/reports" />
          </>
        }
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Products'}));

    const analytics = screen.getByRole('link', {
      name: /Analytics/,
      hidden: true,
    });
    expect(analytics).toHaveAttribute('href', '/analytics');
    expect(
      screen.getByRole('link', {name: /Reports/, hidden: true}),
    ).toHaveAttribute('href', '/reports');
  });
});

// =============================================================================
// Hover → click guard (default mode) — issue #3121
//
// The trigger opens on hover and on click. A hover-open records a timestamp so
// the click that naturally follows a hover confirms and pins the panel for
// CLICK_GUARD_MS (the panel just appeared under the cursor) instead of toggling
// it shut. Deliberate clicks outside that window still toggle.
// =============================================================================

describe('TopNavMegaMenu — hover/click guard (default mode)', () => {
  beforeAll(installPopoverApiMock);
  afterAll(restorePopoverApiMock);
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderMenu() {
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
      />,
    );
    return screen.getByRole('button', {name: 'Products'});
  }

  it('keeps the panel open when a hover-open is immediately clicked', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    // Hover opens the panel after the show delay (150ms).
    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // The click that naturally follows the hover must NOT toggle it shut.
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // It is still a click interaction, so it pins the panel just like a
    // click-open. Leaving the trigger must not dismiss it.
    await user.unhover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on a click that lands well after the hover-open (past the guard)', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Past the guard window, a click is a deliberate dismissal.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles cleanly for click-only interaction (no hover, no guard)', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();

    // A click with no preceding hover opens...
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // ...and the next click closes — the guard only applies after a hover-open.
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes a hover-opened (transient) panel when the pointer leaves', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Leaving closes it after hideDelay (250ms) — hover opens are transient.
    await user.unhover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps a click-opened (pinned) panel open when the pointer leaves', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    // A click pins the panel open (a deliberate open should persist).
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.unhover(trigger);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('re-entering the trigger cancels a pending hide', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Leave (schedules a hide), then return before hideDelay elapses.
    await user.unhover(trigger);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not reopen when the pointer enters the panel after close', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();
    const panel = screen.getByRole('group', {
      name: 'Products',
      hidden: true,
    });

    await user.click(trigger);
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // The exit transition can leave the closed panel briefly hit-testable.
    fireEvent.mouseEnter(panel);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('re-hovering an open panel does not refresh the click guard', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Wait past the guard window, re-hovering along the way. The re-hover must
    // NOT re-stamp the guard timestamp (only a fresh open may), so the click
    // below is still judged a deliberate close.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opening a sibling mega menu closes the pinned menu through the native auto-popover stack', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    render(
      <>
        <TopNavMegaMenu
          label="Products"
          items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
        />
        <TopNavMegaMenu
          label="Solutions"
          items={<TopNavMegaMenuItem title="Enterprise" href="/enterprise" />}
        />
      </>,
    );

    const products = screen.getByRole('button', {name: 'Products'});
    const solutions = screen.getByRole('button', {name: 'Solutions'});

    await user.click(products);
    expect(products).toHaveAttribute('aria-expanded', 'true');

    await user.hover(solutions);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(products).toHaveAttribute('aria-expanded', 'false');
    expect(solutions).toHaveAttribute('aria-expanded', 'true');
  });
});

// =============================================================================
// Dismissal (default mode) — issue #3121
//
// The panel stays an *auto* popover for native light dismiss and stack
// exclusivity. `popoverTarget` makes the button its native invoker so trigger
// activation is not treated as an outside click before the guard can run.
// jsdom cannot exercise that native event ordering; these tests lock in the
// required wiring, while the end-to-end interaction is browser-verified in the
// PR's manual test plan.
// =============================================================================

describe('TopNavMegaMenu — dismissal (default mode)', () => {
  beforeAll(installPopoverApiMock);
  afterAll(restorePopoverApiMock);

  function renderAndOpen() {
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
      />,
    );
    return screen.getByRole('button', {name: 'Products'});
  }

  it('renders an auto popover and registers the trigger as its native invoker', () => {
    const trigger = renderAndOpen();
    const popup = document.getElementById(
      trigger.getAttribute('aria-controls') as string,
    );
    expect(popup).toHaveAttribute('popover', 'auto');
    expect(trigger).toHaveAttribute('popovertarget', popup?.id);
  });

  it('prevents the native invoker toggle so the click guard owns activation', async () => {
    const trigger = renderAndOpen();

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    fireEvent(trigger, clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('reconciles a browser-initiated native light dismiss', async () => {
    const user = userEvent.setup();
    const trigger = renderAndOpen();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const popup = document.getElementById(
      trigger.getAttribute('aria-controls') as string,
    ) as HTMLElement;
    popup.removeAttribute('popover-open');
    const toggleEvent = new Event('toggle', {bubbles: false});
    Object.defineProperty(toggleEvent, 'newState', {value: 'closed'});
    fireEvent(popup, toggleEvent);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

// =============================================================================
// Keyboard (default mode) — issue #3121
//
// Keyboard activation always OPENS (never toggles the panel closed) and moves
// focus into the panel; Escape closes it and returns focus to the trigger.
// =============================================================================

describe('TopNavMegaMenu — keyboard (default mode)', () => {
  beforeAll(installPopoverApiMock);
  afterAll(restorePopoverApiMock);

  it('opens on Enter (keyboard activation)', async () => {
    const user = userEvent.setup();
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Products'});
    trigger.focus();

    await user.keyboard('{Enter}');

    // aria-expanded is the observable signal. Enter also auto-focuses the first
    // link (unlike pointer/hover opens, which keep focus on the trigger), but
    // that focus landing is only verifiable in a real browser — jsdom renders
    // the popover content display:none, so activeElement can't move onto it
    // (browser-verified via the Playwright checks for #3121). Panel content
    // presence is deliberately NOT asserted: useLayer renders it into the DOM
    // even while closed, so such an assertion would be vacuous.
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens on Space', async () => {
    const user = userEvent.setup();
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Products'});
    trigger.focus();

    await user.keyboard(' ');

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('keyboard activation never toggles an open panel closed', async () => {
    const user = userEvent.setup();
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Products'});

    // Open via pointer (focus stays on the trigger).
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Enter on an already-open panel keeps it open — no toggle-close.
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Products'});

    // Pointer open leaves focus on the trigger.
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});

// =============================================================================
// Mobile-bar mode — should be hidden
// =============================================================================

describe('TopNavMegaMenu — mobile-bar mode', () => {
  it('returns null in mobile-bar mode', () => {
    const {container} = render(
      <TopNavRenderContext value="mobile-bar">
        <TopNavMegaMenu
          label="Products"
          items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
        />
      </TopNavRenderContext>,
    );
    expect(container.innerHTML).toBe('');
  });
});

// =============================================================================
// Drawer mode — inline collapsible
// =============================================================================

describe('TopNavMegaMenu — drawer mode', () => {
  it('renders a collapsible trigger with label', () => {
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu
          label="Products"
          items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
        />
      </TopNavRenderContext>,
    );
    const trigger = screen.getByRole('button', {name: 'Products'});
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands to show items when tapped', async () => {
    const user = userEvent.setup();

    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu
          label="Products"
          items={
            <>
              <TopNavMegaMenuItem title="Analytics" href="/analytics" />
              <TopNavMegaMenuItem title="Reports" href="/reports" />
            </>
          }
        />
      </TopNavRenderContext>,
    );

    const trigger = screen.getByRole('button', {name: 'Products'});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('collapses when trigger is clicked again', async () => {
    const user = userEvent.setup();

    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu
          label="Products"
          items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
        />
      </TopNavRenderContext>,
    );

    const trigger = screen.getByRole('button', {name: 'Products'});
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows item descriptions when provided', async () => {
    const user = userEvent.setup();

    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu
          label="Products"
          items={
            <TopNavMegaMenuItem
              title="Analytics"
              description="Track behavior"
              href="/analytics"
            />
          }
        />
      </TopNavRenderContext>,
    );

    await user.click(screen.getByRole('button', {name: 'Products'}));

    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Track behavior')).toBeInTheDocument();
  });

  it('renders items as links when href is provided', async () => {
    const user = userEvent.setup();

    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu
          label="Products"
          items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
        />
      </TopNavRenderContext>,
    );

    await user.click(screen.getByRole('button', {name: 'Products'}));

    const link = screen.getByRole('link', {name: 'Analytics'});
    expect(link).toHaveAttribute('href', '/analytics');
  });

  it('renders items as buttons when onClick is provided without href', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu
          label="Tools"
          items={<TopNavMegaMenuItem title="Export" onClick={handleClick} />}
        />
      </TopNavRenderContext>,
    );

    await user.click(screen.getByRole('button', {name: 'Tools'}));
    await user.click(screen.getByRole('button', {name: 'Export'}));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('makes collapsed items inert and hidden from assistive technology', async () => {
    const user = userEvent.setup();
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu
          label="Products"
          items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
        />
      </TopNavRenderContext>,
    );
    const trigger = screen.getByRole('button', {name: 'Products'});
    const region = document.getElementById(
      trigger.getAttribute('aria-controls') ?? '',
    );

    expect(region).toHaveAttribute('inert');
    expect(region).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('link', {name: 'Analytics'})).toBeNull();

    await user.click(trigger);
    expect(region).not.toHaveAttribute('inert');
    expect(region).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByRole('link', {name: 'Analytics'})).toBeInTheDocument();
  });

  it('clips the drawer section only while it is collapsed', async () => {
    // The ring paints outside the item, so a permanent clip would cut it off.
    const user = userEvent.setup();
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu
          label="Products"
          items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
        />
      </TopNavRenderContext>,
    );
    const trigger = screen.getByRole('button', {name: 'Products'});
    const section = document.getElementById(
      trigger.getAttribute('aria-controls') ?? '',
    )!;
    expect(getComputedStyle(section).overflow).toBe('hidden');
    expect(getComputedStyle(section.firstElementChild!).overflow).toBe('');

    await user.click(trigger);
    expect(getComputedStyle(section).overflow).toBe('visible');
  });

  it('renders featured content when expanded', async () => {
    const user = userEvent.setup();

    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu
          label="Products"
          items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
          featured={<span>Featured: New AI Tools</span>}
        />
      </TopNavRenderContext>,
    );

    await user.click(screen.getByRole('button', {name: 'Products'}));

    expect(screen.getByText('Featured: New AI Tools')).toBeInTheDocument();
  });
});

// =============================================================================
// TopNavMegaMenuItem — standalone rendering
// =============================================================================

describe('TopNavMegaMenuItem', () => {
  it('renders as a desktop item by default', () => {
    render(<TopNavMegaMenuItem title="Analytics" href="/analytics" />);
    expect(screen.getByRole('link', {name: /Analytics/})).toBeInTheDocument();
  });

  it('renders description in desktop mode', () => {
    render(
      <TopNavMegaMenuItem
        title="Analytics"
        description="Track behavior"
        href="/analytics"
      />,
    );
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Track behavior')).toBeInTheDocument();
  });

  it('renders as a drawer item in drawer context', () => {
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenuItem title="Analytics" href="/analytics" />
      </TopNavRenderContext>,
    );
    expect(screen.getByRole('link', {name: /Analytics/})).toBeInTheDocument();
  });
});

// =============================================================================
// The shared focus ring (#4654) — see the note in SideNav.test.tsx: jsdom will
// not derive `:focus-visible` here, so what is pinned is that the focusable
// element composes the shared utility's classes rather than falling back to
// the browser's own outline.
// =============================================================================

const sharedFocusRingClasses = stylex
  .props(focusOutlineStyles.focusVisible)
  .className!.split(' ');

function expectSharedFocusRing(el: Element) {
  const classes = el.className.split(' ');
  for (const c of sharedFocusRingClasses) {
    expect(classes).toContain(c);
  }
}

describe('TopNavMegaMenu — drawer focus ring', () => {
  it('draws the shared ring on the drawer section header', () => {
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu
          label="Products"
          items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
        />
      </TopNavRenderContext>,
    );
    expectSharedFocusRing(screen.getByRole('button', {name: 'Products'}));
  });

  it('draws the shared ring on a drawer item', () => {
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenuItem title="Analytics" href="/analytics" />
      </TopNavRenderContext>,
    );
    expectSharedFocusRing(screen.getByRole('link', {name: /Analytics/}));
  });
});

describe('TopNavMegaMenu pass-through props', () => {
  it('forwards pass-through props to the trigger button', () => {
    render(
      <TopNavMegaMenu
        label="Products"
        aria-label="Products mega menu"
        id="mega-trigger"
        data-source="nav"
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Products mega menu'});
    expect(trigger).toHaveAttribute('id', 'mega-trigger');
    expect(trigger).toHaveAttribute('data-source', 'nav');
  });

  it('forwards pass-through props to the drawer trigger', () => {
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu label="Products" id="mega-drawer" data-source="nav" />
      </TopNavRenderContext>,
    );
    const trigger = screen.getByRole('button', {name: /Products/});
    expect(trigger).toHaveAttribute('id', 'mega-drawer');
    expect(trigger).toHaveAttribute('data-source', 'nav');
  });
});

describe('TopNavMegaMenu — owned handlers on the trigger', () => {
  beforeAll(installPopoverApiMock);
  afterAll(restorePopoverApiMock);
  afterEach(() => {
    vi.useRealTimers();
  });

  it("composes a caller's onClick with the trigger's own open behavior", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
        onClick={handleClick}
      />,
    );

    const trigger = screen.getByRole('button', {name: 'Products'});
    await user.click(trigger);

    expect(handleClick).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it("composes a caller's hover handlers with the trigger's hover-open behavior", async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const handleMouseEnter = vi.fn();
    const handleMouseLeave = vi.fn();
    render(
      <TopNavMegaMenu
        label="Products"
        items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />,
    );

    const trigger = screen.getByRole('button', {name: 'Products'});
    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(handleMouseEnter).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.unhover(trigger);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(handleMouseLeave).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it("composes a caller's onClick with the drawer section toggle", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu
          label="Products"
          items={<TopNavMegaMenuItem title="Analytics" href="/analytics" />}
          onClick={handleClick}
        />
      </TopNavRenderContext>,
    );

    const trigger = screen.getByRole('button', {name: /Products/});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(handleClick).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('TopNavMegaMenuItem pass-through props', () => {
  it('forwards pass-through props in default mode', () => {
    render(
      <TopNavMegaMenuItem
        title="Analytics"
        aria-label="Open analytics"
        id="mega-analytics"
        data-tracking="mega-item"
        data-testid="item"
      />,
    );
    const item = screen.getByTestId('item');
    expect(item).toHaveAttribute('aria-label', 'Open analytics');
    expect(item).toHaveAttribute('id', 'mega-analytics');
    expect(item).toHaveAttribute('data-tracking', 'mega-item');
  });

  it('forwards event handlers in default mode', () => {
    const handleMouseEnter = vi.fn();
    render(
      <TopNavMegaMenuItem
        title="Analytics"
        onMouseEnter={handleMouseEnter}
        data-testid="item"
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('item'));
    expect(handleMouseEnter).toHaveBeenCalledOnce();
  });

  it('forwards pass-through props in drawer mode', () => {
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenuItem
          title="Analytics"
          data-tracking="mega-item"
          data-testid="item"
        />
      </TopNavRenderContext>,
    );
    expect(screen.getByTestId('item')).toHaveAttribute(
      'data-tracking',
      'mega-item',
    );
  });

  it('composes consumer styling and forwards tabIndex in drawer mode', () => {
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenuItem
          title="Analytics"
          className="consumer-item"
          style={{outlineColor: 'red'}}
          tabIndex={-1}
          data-testid="item"
        />
      </TopNavRenderContext>,
    );
    const item = screen.getByTestId('item');
    expect(item).toHaveClass('consumer-item');
    expect(item.style.outlineColor).toBe('red');
    expect(item).toHaveAttribute('tabindex', '-1');
  });

  it('composes consumer styling in default mode', () => {
    render(
      <TopNavMegaMenuItem
        title="Analytics"
        className="consumer-item"
        style={{outlineColor: 'red'}}
        data-testid="item"
      />,
    );
    const item = screen.getByTestId('item');
    expect(item).toHaveClass('consumer-item');
    // The internal classes are still applied alongside the consumer's.
    expect(item.className.split(' ').length).toBeGreaterThan(1);
    expect(item.style.outlineColor).toBe('red');
  });

  it('applies xstyle as extra classes in both modes', () => {
    const xstyleTestStyles = stylex.create({
      custom: {marginInlineEnd: '7px'},
    });
    const renderBoth = (xstyle?: (typeof xstyleTestStyles)['custom']) => (
      <>
        <TopNavMegaMenuItem
          title="Analytics"
          xstyle={xstyle}
          data-testid="default-item"
        />
        <TopNavRenderContext value="drawer">
          <TopNavMegaMenuItem
            title="Analytics"
            xstyle={xstyle}
            data-testid="drawer-item"
          />
        </TopNavRenderContext>
      </>
    );
    const {rerender} = render(renderBoth());
    const defaultWithout = screen
      .getByTestId('default-item')
      .getAttribute('class');
    const drawerWithout = screen
      .getByTestId('drawer-item')
      .getAttribute('class');

    // xstyle values are compiled StyleX styles; passing one adds classes.
    rerender(renderBoth(xstyleTestStyles.custom));
    expect(
      screen.getByTestId('default-item').getAttribute('class'),
    ).not.toEqual(defaultWithout);
    expect(screen.getByTestId('drawer-item').getAttribute('class')).not.toEqual(
      drawerWithout,
    );
  });
});

describe('TopNavMegaMenu ref', () => {
  const items = <TopNavMegaMenuItem title="Analytics" href="/analytics" />;

  it('forwards its ref to the trigger button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<TopNavMegaMenu ref={ref} label="Products" items={items} />);
    expect(ref.current).toBe(screen.getByRole('button', {name: 'Products'}));
  });

  it('forwards its ref to the drawer trigger', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMegaMenu ref={ref} label="Products" items={items} />
      </TopNavRenderContext>,
    );
    expect(ref.current).toBe(screen.getByRole('button', {name: /Products/}));
  });
});
