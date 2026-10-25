// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenu.test.tsx
 * @input Uses vitest, @testing-library/react, DropdownMenu component
 * @output Unit tests for DropdownMenu behavior and derived bottom-sheet item padding
 * @position Testing; validates DropdownMenu.tsx implementation
 *
 * SYNC: When DropdownMenu.tsx changes, update tests to match new behavior
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {readFileSync} from 'node:fs';
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {DropdownMenu, type DropdownMenuTriggerProps} from './DropdownMenu';
import {DropdownMenuItem} from './DropdownMenuItem';
import {DropdownMenuDivider} from './DropdownMenuDivider';
import {DropdownMenuGroup} from './DropdownMenuGroup';
import {warmMenuBottomSheet} from './__tests__/warmMenuBottomSheet';
import {DropdownMenuSubMenu} from './DropdownMenuSubMenu';
import {Divider} from '../Divider';
import {rtlStyles} from '../utils';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {spacingVars} from '../theme/tokens.stylex';
import {COMPACT_TOUCH_PRESENTATION_QUERY} from '../hooks/useAdaptivePresentation';

// Mock showPopover and hidePopover methods since they're not implemented in jsdom
beforeEach(() => {
  __resetInteractionModalityForTest();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
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
  const originalMatches = HTMLElement.prototype.matches;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return this.hasAttribute('popover-open');
    }
    return originalMatches.call(this, selector);
  };
});

// The touch sheet is loaded lazily; resolve it once so sheets below render
// synchronously.
beforeAll(warmMenuBottomSheet, 20000);

describe('DropdownMenu', () => {
  it('renders trigger button with label', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Item 1'}]} />,
    );
    expect(screen.getByRole('button', {name: /Actions/})).toBeInTheDocument();
  });

  it('renders menu with role="menu"', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Item 1'}]} />,
    );
    expect(screen.getByRole('menu', {hidden: true})).toBeInTheDocument();
  });

  it('names the menu from the trigger label (menus-13)', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Item 1'}]} />,
    );
    expect(
      screen.getByRole('menu', {name: 'Actions', hidden: true}),
    ).toBeInTheDocument();
  });

  it('does not wrap the menu in a role="dialog" aria-modal element', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Item 1'}]} />,
    );
    // The popup exposes its own role="menu"; it must not be nested inside a
    // modal dialog, which would announce an unnamed dialog around the menu
    // while focus stays on the trigger.
    expect(
      screen.queryByRole('dialog', {hidden: true}),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[aria-modal="true"]'),
    ).not.toBeInTheDocument();
  });

  it('renders data-driven actions in a bottom sheet when requested', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(
      <DropdownMenu
        button={{label: 'Project actions'}}
        presentation="bottom-sheet"
        items={[{label: 'Edit project', onClick: onEdit}]}
      />,
    );

    const trigger = screen.getByRole('button', {name: /Project actions/});
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('menu', {hidden: true})).not.toBeInTheDocument();

    await user.click(trigger);

    expect(
      screen.getByRole('dialog', {name: 'Project actions'}),
    ).toBeInTheDocument();
    const editAction = screen.getByRole('button', {name: 'Edit project'});
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', {name: 'Project actions'}),
      ).toContainElement(document.activeElement as HTMLElement),
    );
    expect(editAction).not.toHaveFocus();
    await user.click(editAction);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('aligns the bottom-sheet heading with the item content edge and keeps item padding', async () => {
    const user = userEvent.setup();

    render(
      <DropdownMenu
        button={{label: 'Project actions'}}
        presentation="bottom-sheet"
        items={[{label: 'Edit project', icon: <span aria-hidden="true" />}]}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Project actions/}));

    const heading = screen.getByRole('heading', {name: 'Project actions'});
    expect(heading).toHaveStyle({marginInlineStart: 'var(--spacing-3)'});
    expect(heading.closest('.astryx-section')).toHaveStyle({
      paddingInlineStart: 'var(--spacing-1)',
      paddingInlineEnd: 'var(--spacing-1)',
    });
    expect(
      screen.getByRole('button', {name: 'Edit project'}).closest('li'),
    ).toHaveStyle({
      paddingInline: 'var(--_item-inset-inline)',
      '--_item-inset-inline': 'var(--spacing-3)',
    });
  });

  it('keeps bottom-sheet section groups inside semantic list items', async () => {
    const user = userEvent.setup();

    render(
      <DropdownMenu
        button={{label: 'File actions'}}
        presentation="bottom-sheet"
        items={[
          {
            type: 'section',
            title: 'Create',
            items: [{label: 'New file'}],
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', {name: /File actions/}));

    const group = screen.getByRole('group', {name: 'Create'});
    expect(group.parentElement).toHaveRole('listitem');
  });

  it('drills into nested data items in bottom-sheet presentation', async () => {
    const user = userEvent.setup();

    render(
      <DropdownMenu
        button={{label: 'Project actions'}}
        presentation="bottom-sheet"
        items={[
          {
            label: 'Move to project',
            items: [{label: 'Apollo launch'}],
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Project actions/}));
    await user.click(screen.getByRole('button', {name: 'Move to project'}));

    const submenuHeading = screen.getByRole('heading', {
      name: 'Move to project',
    });
    expect(submenuHeading).toBeInTheDocument();
    await waitFor(() => expect(submenuHeading).toHaveFocus());
    expect(
      screen.getByRole('button', {name: 'Apollo launch'}),
    ).toBeInTheDocument();

    const backButton = screen.getByRole('button', {name: 'Back'});
    expect(backButton).toHaveAttribute('aria-label', 'Back');
    expect(backButton).not.toHaveTextContent('Back');
    await user.click(backButton);
    const rootHeading = screen.getByRole('heading', {
      name: 'Project actions',
    });
    expect(rootHeading).toBeInTheDocument();
    await waitFor(() => expect(rootHeading).toHaveFocus());
  });

  it('returns to the root after a controlled bottom sheet closes externally', async () => {
    const user = userEvent.setup();

    function ControlledDropdownMenu() {
      const [isOpen, setIsOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setIsOpen(false)}>
            Close externally
          </button>
          <DropdownMenu
            button={{label: 'Project actions'}}
            presentation="bottom-sheet"
            isMenuOpen={isOpen}
            onOpenChange={setIsOpen}
            items={[
              {
                label: 'Move to project',
                items: [{label: 'Apollo launch'}],
              },
            ]}
          />
        </>
      );
    }

    render(<ControlledDropdownMenu />);

    await user.click(screen.getByRole('button', {name: /Project actions/}));
    await user.click(screen.getByRole('button', {name: 'Move to project'}));
    expect(
      screen.getByRole('heading', {name: 'Move to project'}),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Close externally'}));
    await user.click(screen.getByRole('button', {name: /Project actions/}));

    expect(
      screen.getByRole('heading', {name: 'Project actions'}),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Apollo launch'}),
    ).not.toBeInTheDocument();
  });

  it('mirrors bottom-sheet drill-in affordances under RTL', async () => {
    const user = userEvent.setup();
    const {className: mirrorClassName} = stylex.props(rtlStyles.mirror);
    const mirrorClasses = mirrorClassName?.split(' ') ?? [];
    expect(mirrorClasses.length).toBeGreaterThan(0);

    render(
      <div dir="rtl">
        <DropdownMenu
          button={{label: 'Project actions'}}
          presentation="bottom-sheet"
          items={[
            {
              label: 'Move to project',
              items: [{label: 'Apollo launch'}],
            },
          ]}
        />
      </div>,
    );

    await user.click(screen.getByRole('button', {name: /Project actions/}));
    const submenuButton = screen.getByRole('button', {
      name: 'Move to project',
    });
    const forwardIcon = submenuButton
      .closest('li')
      ?.querySelector('.astryx-icon');
    expect(forwardIcon).not.toBeNull();
    for (const className of mirrorClasses) {
      expect(forwardIcon).toHaveClass(className);
    }

    await user.click(submenuButton);
    const backButton = screen.getByRole('button', {name: 'Back'});
    const backIcon = backButton.querySelector('.astryx-icon');
    expect(backIcon).not.toBeNull();
    for (const className of mirrorClasses) {
      expect(backIcon).toHaveClass(className);
    }
  });

  it('uses the BottomSheet for adaptive presentation on compact touch', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === COMPACT_TOUCH_PRESENTATION_QUERY,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        presentation="adaptive"
        items={[{label: 'Edit'}]}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    expect(screen.getByRole('dialog', {name: 'Actions'})).toBeInTheDocument();
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
  });

  it('uses the shared menu BottomSheet frame', () => {
    const source = readFileSync(
      'packages/core/src/DropdownMenu/DropdownMenu.tsx',
      'utf8',
    );

    expect(source).toContain('<MenuBottomSheet');
    expect(source).not.toContain("import {BottomSheet} from '../BottomSheet'");
    expect(source).not.toContain("import {Section} from '../Section'");
  });

  it('keeps adaptive presentation anchored without compact touch', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        presentation="adaptive"
        items={[{label: 'Edit'}]}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledOnce();
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  it('preserves uncontrolled open state when adaptive presentation changes', async () => {
    let matches = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return matches;
        },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) =>
          listeners.delete(listener),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        presentation="adaptive"
        items={[{label: 'Edit'}]}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledOnce();

    matches = true;
    act(() => listeners.forEach(listener => listener()));

    expect(screen.getByRole('dialog', {name: 'Actions'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Actions/})).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('focuses the first action when a bottom sheet opens from the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        presentation="bottom-sheet"
        items={[{label: 'Edit'}, {label: 'Delete'}]}
      />,
    );

    const trigger = screen.getByRole('button', {name: /Actions/});
    trigger.focus();
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Edit'})).toHaveFocus(),
    );
  });

  it('restores touch focus without painting a trigger focus ring', async () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        presentation="bottom-sheet"
        items={[{label: 'Edit'}]}
      />,
    );

    const trigger = screen.getByRole('button', {name: /Actions/});
    fireEvent.pointerDown(trigger, {pointerType: 'touch'});
    fireEvent.click(trigger, {detail: 1});

    const action = screen.getByRole('button', {name: 'Edit'});
    action.focus();
    fireEvent.pointerDown(action, {pointerType: 'touch'});
    fireEvent.click(action, {detail: 1});

    expect(action).not.toHaveFocus();
    trigger.focus();
    expect(trigger).toHaveFocus();
    await waitFor(() =>
      expect(trigger).toHaveClass(
        stylex.props(focusOutlineStyles.suppressed).className!,
      ),
    );
  });

  it('defaults menu placement below', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Item 1'}]} />,
    );
    const popover = screen
      .getByRole('menu', {hidden: true})
      .closest('[popover]');
    expect(popover?.getAttribute('style')).toContain(
      'position-area: self-block-end span-self-inline-end',
    );
  });

  it('supports explicit menu placement', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        placement="above"
        items={[{label: 'Item 1'}]}
      />,
    );
    const popover = screen
      .getByRole('menu', {hidden: true})
      .closest('[popover]');
    expect(popover?.getAttribute('style')).toContain(
      'position-area: self-block-start span-self-inline-end',
    );
  });

  it('supports explicit menu alignment', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        alignment="end"
        items={[{label: 'Item 1'}]}
      />,
    );
    const popover = screen
      .getByRole('menu', {hidden: true})
      .closest('[popover]');
    expect(popover?.getAttribute('style')).toContain(
      'position-area: self-block-end span-self-inline-start',
    );
  });

  it('uses block-axis viewport gutters for side placement', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        placement="end"
        alignment="start"
        items={[{label: 'Item 1'}]}
      />,
    );
    const popover = screen
      .getByRole('menu', {hidden: true})
      .closest('[popover]');
    // The gutter is the layer runtime's (spec:AST-059 FR1, FR7).
    expect(popover?.className).toContain('useLayer__styles.gutterBlockEnd');
    expect(popover?.className).not.toContain(
      'useLayer__styles.gutterInlineEnd',
    );
  });

  it('emits the direction-independent logical mapping under an RTL ancestor (#3389)', async () => {
    // The self-* position-area keywords resolve against the popover's own
    // inherited direction in the browser, so RTL emits the same string as
    // LTR and the mirroring is pure CSS. jsdom can't verify the geometry —
    // the DropdownMenu RTL Storybook story is the visual proof surface.
    const user = userEvent.setup();
    const {container} = render(
      <div style={{direction: 'rtl'}}>
        <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Item 1'}]} />
      </div>,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));

    const popover = container.querySelector('[popover]');
    expect(popover?.getAttribute('style')).toContain(
      'position-area: self-block-end span-self-inline-end',
    );
  });

  it('caps default and custom widths to the available viewport', () => {
    const {unmount} = render(
      <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Item 1'}]} />,
    );
    let menu = screen.getByRole('menu', {hidden: true});
    let popover = menu.closest('[popover]');
    expect(popover?.className).toContain(
      'DropdownMenu__styles.popoverViewport',
    );
    expect(popover?.className).toContain(
      'DropdownMenu__styles.popoverMatchTrigger',
    );
    // The cap is the viewport, never the span beside the trigger
    // (spec:AST-059 FR2, FR7).
    expect(popover).toHaveStyle(
      'min-width: min(anchor-size(width),calc(100vi - calc(max(var(--spacing-4), env(safe-area-inset-left, 0px)) + var(--astryx-layer-inset-inline-start, 0px)) - calc(max(var(--spacing-4), env(safe-area-inset-right, 0px)) + var(--astryx-layer-inset-inline-end, 0px))))',
    );

    unmount();
    render(
      <DropdownMenu
        button={{label: 'Wide actions'}}
        menuWidth={640}
        items={[{label: 'Item 1'}]}
      />,
    );
    menu = screen.getByRole('menu', {hidden: true});
    popover = menu.closest('[popover]');
    expect(popover?.className).toContain(
      'DropdownMenu__styles.popoverViewport',
    );
    expect(popover).toHaveStyle({minWidth: 'var(--x-minWidth)'});
    expect(popover?.getAttribute('style')).toContain('min(640px, calc(100vw');
    expect(popover?.getAttribute('style')).not.toContain('100%');
  });

  it.each(['max-content', 'fit-content', 'auto'])(
    'preserves the valid %s menuWidth while retaining the viewport cap',
    menuWidth => {
      render(
        <DropdownMenu
          button={{label: 'Actions'}}
          menuWidth={menuWidth}
          items={[{label: 'Item 1'}]}
        />,
      );

      const popover = screen
        .getByRole('menu', {hidden: true})
        .closest('[popover]');
      expect(popover?.className).toContain(
        'DropdownMenu__styles.popoverCustomIntrinsicWidth',
      );
      expect(popover?.getAttribute('style')).toContain(menuWidth);
      expect(popover?.className).toContain('useLayer__styles.gutterInlineEnd');
      expect(popover?.getAttribute('style')).not.toContain(`min(${menuWidth},`);
    },
  );

  it('caps menu height and only scrolls when content overflows', async () => {
    const clientHeightSpy = vi
      .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockReturnValue(300);
    const scrollHeightSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(300);

    try {
      render(
        <DropdownMenu
          button={{label: 'Actions'}}
          items={[{label: 'Item 1'}]}
        />,
      );
      const menu = screen.getByRole('menu', {hidden: true});
      fireEvent.click(screen.getByRole('button', {name: /Actions/}));
      await waitFor(() => {
        expect(screen.getByRole('button', {name: /Actions/})).toHaveAttribute(
          'aria-expanded',
          'true',
        );
      });
      expect(menu).toHaveStyle(
        'max-height: min(300px,calc(100dvb - calc(max(var(--spacing-4), env(safe-area-inset-top, 0px)) + var(--astryx-layer-inset-block-start, 0px)) - calc(max(var(--spacing-4), env(safe-area-inset-bottom, 0px)) + var(--astryx-layer-inset-block-end, 0px))))',
      );
      expect(menu).not.toHaveStyle({overflowY: 'auto'});
      expect(menu).toHaveAttribute('tabindex', '-1');

      scrollHeightSpy.mockReturnValue(480);
      fireEvent(window, new Event('resize'));

      await waitFor(() => {
        expect(menu).toHaveStyle({overflowY: 'auto'});
        expect(menu).toHaveStyle({overflowX: 'hidden'});
      });
    } finally {
      clientHeightSpy.mockRestore();
      scrollHeightSpy.mockRestore();
    }
  });

  it('has aria-haspopup and aria-expanded attributes', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Item 1'}]} />,
    );
    const button = screen.getByRole('button', {name: /Actions/});
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens menu when button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Item 1'}]} />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
  });

  it('calls onOpenChange for uncontrolled native open and close transitions', async () => {
    const user = userEvent.setup();
    const handleOpenChange = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Item 1'}]}
        onOpenChange={handleOpenChange}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    expect(handleOpenChange).toHaveBeenCalledWith(true);

    handleOpenChange.mockClear();
    const popoverEl = screen
      .getByRole('menu', {hidden: true})
      .closest('[popover]');
    expect(popoverEl).not.toBeNull();
    const toggleEvent = new Event('toggle');
    Object.defineProperty(toggleEvent, 'newState', {value: 'closed'});
    fireEvent(popoverEl as HTMLElement, toggleEvent);

    expect(handleOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', {name: /Actions/})).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('restores focus to the trigger after keyboard dismissal', async () => {
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0);
        return 0;
      });

    try {
      const user = userEvent.setup();
      render(
        <DropdownMenu
          button={{label: 'Actions'}}
          items={[{label: 'Edit'}, {label: 'Delete'}]}
        />,
      );

      const trigger = screen.getByRole('button', {name: /Actions/});
      trigger.focus();
      await user.keyboard('{Enter}');
      expect(
        screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
      ).toHaveFocus();

      const popoverEl = screen
        .getByRole('menu', {hidden: true})
        .closest('[popover]');
      expect(popoverEl).not.toBeNull();
      trigger.blur();
      const toggleEvent = new Event('toggle');
      Object.defineProperty(toggleEvent, 'newState', {value: 'closed'});
      fireEvent(popoverEl as HTMLElement, toggleEvent);

      expect(trigger).toHaveFocus();
    } finally {
      raf.mockRestore();
    }
  });

  it('returns focus to the trigger after pointer dismissal without a focus ring', async () => {
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0);
        return 0;
      });

    try {
      render(
        <DropdownMenu
          button={{label: 'Actions'}}
          items={[{label: 'Edit'}, {label: 'Delete'}]}
        />,
      );

      const trigger = screen.getByRole('button', {name: /Actions/});
      fireEvent.pointerDown(trigger, {pointerType: 'touch'});
      fireEvent.click(trigger, {detail: 1});
      expect(screen.getByRole('menu', {hidden: true})).toHaveFocus();

      const popoverEl = screen
        .getByRole('menu', {hidden: true})
        .closest('[popover]');
      expect(popoverEl).not.toBeNull();
      // A press on nothing focusable dismissed the menu: focus goes back to
      // the trigger, and the pointer modality suppresses the ring Safari
      // would otherwise paint after a touch pick.
      trigger.blur();
      const toggleEvent = new Event('toggle');
      Object.defineProperty(toggleEvent, 'newState', {value: 'closed'});
      fireEvent(popoverEl as HTMLElement, toggleEvent);

      expect(trigger).toHaveFocus();
      await waitFor(() =>
        expect(trigger).toHaveClass(
          stylex.props(focusOutlineStyles.suppressed).className!,
        ),
      );
    } finally {
      raf.mockRestore();
    }
  });

  it('leaves focus on the control a press outside landed on', () => {
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0);
        return 0;
      });

    try {
      render(
        <>
          <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Edit'}]} />
          <button type="button">Elsewhere</button>
        </>,
      );

      const trigger = screen.getByRole('button', {name: /Actions/});
      fireEvent.pointerDown(trigger, {pointerType: 'touch'});
      fireEvent.click(trigger, {detail: 1});
      const popoverEl = screen
        .getByRole('menu', {hidden: true})
        .closest('[popover]');

      const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
      fireEvent.pointerDown(elsewhere, {pointerType: 'mouse', button: 0});
      elsewhere.focus();
      const toggleEvent = new Event('toggle');
      Object.defineProperty(toggleEvent, 'newState', {value: 'closed'});
      fireEvent(popoverEl as HTMLElement, toggleEvent);

      expect(elsewhere).toHaveFocus();
    } finally {
      raf.mockRestore();
    }
  });

  it('closes the menu when Tab is pressed inside it (APG menu-button)', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Item 1'}]} />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();

    const menu = screen.getByRole('menu', {hidden: true});
    fireEvent.keyDown(menu, {key: 'Tab'});
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });

  it('typeahead focuses the item matching the typed character (menus-11)', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Cut'}, {label: 'Copy'}, {label: 'Delete'}]}
      />,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const menu = screen.getByRole('menu', {hidden: true});
    fireEvent.keyDown(menu, {key: 'd'});
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toHaveFocus();
  });

  it('typeahead advances past an item that already starts with the letter', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Copy'}, {label: 'Copy link'}, {label: 'Delete'}]}
      />,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const menu = screen.getByRole('menu', {hidden: true});
    screen.getByRole('menuitem', {name: 'Copy', hidden: true}).focus();

    fireEvent.keyDown(menu, {key: 'c'});

    // APG: a printable character moves focus to the NEXT item starting with
    // it. Anchoring at the focused item instead makes the press a dead key.
    expect(
      screen.getByRole('menuitem', {name: 'Copy link', hidden: true}),
    ).toHaveFocus();
  });

  it('calls onClick callback when button is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Item 1'}]}
        onClick={handleClick}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies data-testid to button', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Item 1'}]}
        data-testid="my-dropdown"
      />,
    );
    expect(screen.getByTestId('my-dropdown')).toBeInTheDocument();
  });
});

describe('DropdownMenu light-dismiss race', () => {
  function openMenu(onClick?: () => void) {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Edit'}]}
        data-testid="astryx-dropdown-menu"
        onClick={onClick}
      />,
    );
    const trigger = screen.getByTestId('astryx-dropdown-menu');
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    return trigger;
  }

  /**
   * The browser dismisses the menu on pointerup and queues the `toggle` event;
   * on the engines that lose the race it reaches React before the trigger's
   * own click, which then reads a closed menu.
   */
  function lightDismiss() {
    const popover = document.querySelector('[popover]') as HTMLElement;
    act(() => {
      popover.dispatchEvent(
        Object.assign(new Event('toggle'), {
          oldState: 'open',
          newState: 'closed',
        }),
      );
    });
  }

  it('does not re-open or notify on the click from its own light dismiss', () => {
    const onClick = vi.fn();
    const trigger = openMenu(onClick);
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(trigger);
    lightDismiss();
    fireEvent.click(trigger);

    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('re-opens on a press of its own after a light dismiss', () => {
    const trigger = openMenu();

    fireEvent.pointerDown(trigger);
    lightDismiss();
    fireEvent.click(trigger);
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);

    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(2);
  });
});

describe('DropdownMenu controlled mode', () => {
  it('respects isMenuOpen prop', async () => {
    const handleToggle = vi.fn();
    const {rerender} = render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Item 1'}]}
        isMenuOpen={false}
        onOpenChange={handleToggle}
      />,
    );

    const button = screen.getByRole('button', {name: /Actions/});
    expect(button).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Item 1'}]}
        isMenuOpen={true}
        onOpenChange={handleToggle}
      />,
    );

    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
  });

  it('does not move focus into a menu that mounts already open', () => {
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0);
        return 0;
      });

    try {
      render(
        <DropdownMenu
          button={{label: 'Sort'}}
          isMenuOpen
          onOpenChange={vi.fn()}>
          <DropdownMenuItem label="Newest" />
          <DropdownMenuItem label="Oldest" />
        </DropdownMenu>,
      );

      // Nobody opened the menu, so nobody is dropped into it (#5976).
      expect(
        screen.getByRole('menuitem', {name: 'Newest', hidden: true}),
      ).toBeInTheDocument();
      expect(document.body).toHaveFocus();
    } finally {
      raf.mockRestore();
    }
  });

  it('still focuses the first item when a mounted menu opens later', async () => {
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0);
        return 0;
      });

    try {
      const {rerender} = render(
        <DropdownMenu
          button={{label: 'Sort'}}
          isMenuOpen={false}
          onOpenChange={vi.fn()}>
          <DropdownMenuItem label="Newest" />
          <DropdownMenuItem label="Oldest" />
        </DropdownMenu>,
      );

      rerender(
        <DropdownMenu
          button={{label: 'Sort'}}
          isMenuOpen
          onOpenChange={vi.fn()}>
          <DropdownMenuItem label="Newest" />
          <DropdownMenuItem label="Oldest" />
        </DropdownMenu>,
      );

      // A programmatic open after mount keeps the first-item focus (#4594).
      await waitFor(() =>
        expect(
          screen.getByRole('menuitem', {name: 'Newest', hidden: true}),
        ).toHaveFocus(),
      );
    } finally {
      raf.mockRestore();
    }
  });

  it('walks into a mounted-open menu with ArrowDown from the focused trigger', () => {
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0);
        return 0;
      });

    try {
      render(
        <DropdownMenu
          button={{label: 'Sort'}}
          isMenuOpen
          onOpenChange={vi.fn()}>
          <DropdownMenuItem label="Newest" />
          <DropdownMenuItem label="Oldest" />
        </DropdownMenu>,
      );

      // The items sit outside the tab order, so the trigger is the only
      // keyboard way in; ArrowDown must not require closing and reopening.
      const trigger = screen.getByRole('button', {name: /Sort/});
      trigger.focus();
      fireEvent.keyDown(trigger, {key: 'ArrowDown'});

      expect(
        screen.getByRole('menuitem', {name: 'Newest', hidden: true}),
      ).toHaveFocus();
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    } finally {
      raf.mockRestore();
    }
  });

  it('focuses the first item once a mounted-open menu is closed and reopened', async () => {
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0);
        return 0;
      });

    try {
      const menu = (isMenuOpen: boolean) => (
        <DropdownMenu
          button={{label: 'Sort'}}
          isMenuOpen={isMenuOpen}
          onOpenChange={vi.fn()}>
          <DropdownMenuItem label="Newest" />
          <DropdownMenuItem label="Oldest" />
        </DropdownMenu>
      );
      const {rerender} = render(menu(true));
      expect(document.body).toHaveFocus();

      // The mount-open exemption ends with the first close; the next open is
      // a real one and lands on the first item again.
      rerender(menu(false));
      rerender(menu(true));
      await waitFor(() =>
        expect(
          screen.getByRole('menuitem', {name: 'Newest', hidden: true}),
        ).toHaveFocus(),
      );
    } finally {
      raf.mockRestore();
    }
  });

  it('calls onOpenChange when button is clicked', async () => {
    const user = userEvent.setup();
    const handleToggle = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Item 1'}]}
        isMenuOpen={false}
        onOpenChange={handleToggle}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    expect(handleToggle.mock.calls).toEqual([[true]]);
    expect(screen.getByRole('button', {name: /Actions/})).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('DropdownMenu items', () => {
  it('renders items with labels', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Edit'}, {label: 'Delete'}]}
      />,
    );
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toBeInTheDocument();
  });

  it('calls onClick when item is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Edit', onClick: handleClick}]}
      />,
    );

    await user.click(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    );
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('closes the menu after an item is activated', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Edit', onClick: () => {}}]}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    await user.click(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    );
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });

  it('keeps the menu open when the item opts out of closing', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[
          {label: 'Copy ID', onClick: handleClick, hasCloseOnSelect: false},
        ]}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    const item = screen.getByRole('menuitem', {name: 'Copy ID', hidden: true});
    await user.click(item);
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();

    // Second activation still works, and focus never left the item.
    await user.click(item);
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('keeps the menu open on keyboard activation too', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[
          {label: 'Copy ID', onClick: handleClick, hasCloseOnSelect: false},
        ]}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => expect(menu).toHaveFocus());
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    fireEvent.keyDown(menu, {key: 'Enter'});

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
    expect(
      screen.getByRole('menuitem', {name: 'Copy ID', hidden: true}),
    ).toHaveFocus();
  });

  it('closes the menu on activation even when the item carries no handler', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Edit'}]} />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    await user.click(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    );
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });

  it('keeps a row mounted when its label changes, so focus survives (data mode keys by position)', async () => {
    const user = userEvent.setup();

    function CopyMenu() {
      const [copied, setCopied] = useState(false);
      return (
        <DropdownMenu
          button={{label: 'Actions'}}
          items={[
            {
              label: copied ? 'Copied' : 'Copy ID',
              hasCloseOnSelect: false,
              onClick: () => setCopied(true),
            },
            {label: 'Rename'},
          ]}
        />
      );
    }

    render(<CopyMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const item = screen.getByRole('menuitem', {name: 'Copy ID', hidden: true});
    item.focus();
    await user.click(item);

    const renamed = screen.getByRole('menuitem', {
      name: 'Copied',
      hidden: true,
    });
    expect(renamed).toBe(item);
    expect(renamed).toHaveFocus();
  });

  it('follows the item, not the slot, when ids are supplied and the list changes', async () => {
    const user = userEvent.setup();

    // A menu whose rows are filtered by a control outside it: the focused row
    // survives at a new index. Position keys cannot express this — the DOM node
    // at index 0 would be reused for whatever item lands there.
    function FilterableMenu({hideFirst}: {hideFirst: boolean}) {
      const items = [
        {id: 'edit', label: 'Edit'},
        {id: 'duplicate', label: 'Duplicate'},
        {id: 'archive', label: 'Archive'},
      ].filter(item => !hideFirst || item.id !== 'edit');
      return <DropdownMenu button={{label: 'Actions'}} items={items} />;
    }

    const {rerender} = render(<FilterableMenu hideFirst={false} />);
    await user.click(screen.getByRole('button', {name: /Actions/}));

    const duplicate = screen.getByRole('menuitem', {
      name: 'Duplicate',
      hidden: true,
    });
    duplicate.focus();

    rerender(<FilterableMenu hideFirst={true} />);

    // Same node, still focused, even though it moved from index 1 to index 0.
    expect(
      screen.getByRole('menuitem', {name: 'Duplicate', hidden: true}),
    ).toBe(duplicate);
    expect(duplicate).toHaveFocus();
    expect(
      screen.queryByRole('menuitem', {name: 'Edit', hidden: true}),
    ).not.toBeInTheDocument();
  });

  it('does not put id on the rendered row', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{id: 'edit', label: 'Edit'}]}
      />,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));

    // `id` is identity for React, not a DOM attribute the caller is setting.
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).not.toHaveAttribute('id', 'edit');
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Edit', onClick: handleClick, isDisabled: true}]}
      />,
    );

    await user.click(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    );
    expect(handleClick).not.toHaveBeenCalled();
  });
});

describe('DropdownMenu sections', () => {
  it('renders section with title', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[
          {
            type: 'section',
            title: 'File Actions',
            items: [{label: 'New'}, {label: 'Open'}],
          },
        ]}
      />,
    );

    expect(screen.getByText('File Actions')).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'New', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Open', hidden: true}),
    ).toBeInTheDocument();
  });

  it('renders section without title', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[
          {
            type: 'section',
            items: [{label: 'Item 1'}, {label: 'Item 2'}],
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('menuitem', {name: 'Item 1', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Item 2', hidden: true}),
    ).toBeInTheDocument();
  });

  it('has role="group" with aria-label', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[
          {
            type: 'section',
            title: 'My Section',
            items: [{label: 'Item'}],
          },
        ]}
      />,
    );

    const group = screen.getByRole('group', {name: 'My Section', hidden: true});
    expect(group).toBeInTheDocument();
  });
});

describe('DropdownMenuItem ref', () => {
  it('a ref reaches the menuitem element', () => {
    const ref = vi.fn();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} ref={ref} />
      </DropdownMenu>,
    );
    const row = screen.getByRole('menuitem', {name: 'Edit', hidden: true});
    expect(ref).toHaveBeenCalledWith(row);
    // The row root, not a child of it: what the ref sees is the element the
    // menu's roving focus and role structure are built on.
    expect(ref.mock.calls[0][0]).toBe(row);
  });

  it('a ref object holds the menuitem element', () => {
    const ref = {current: null as HTMLElement | null};
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} ref={ref} />
      </DropdownMenu>,
    );
    expect(ref.current).toBe(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    );
  });
});

describe('DropdownMenuItem host attributes', () => {
  it('puts aria-*, data-* and id on the row root, a link row included', () => {
    render(
      <DropdownMenu button={{label: 'Views'}}>
        <DropdownMenuItem
          label="Inbox"
          href="/inbox"
          aria-current="page"
          data-view="inbox"
          id="inbox-row"
        />
        <DropdownMenuItem
          label="Reload"
          onClick={() => {}}
          aria-busy={true}
          data-pending=""
        />
      </DropdownMenu>,
    );
    const inbox = screen.getByRole('menuitem', {name: 'Inbox', hidden: true});
    expect(inbox.tagName).toBe('A');
    expect(inbox).toHaveAttribute('aria-current', 'page');
    expect(inbox).toHaveAttribute('data-view', 'inbox');
    expect(inbox).toHaveAttribute('id', 'inbox-row');
    const reload = screen.getByRole('menuitem', {name: 'Reload', hidden: true});
    expect(reload).toHaveAttribute('aria-busy', 'true');
    expect(reload).toHaveAttribute('data-pending', '');
  });

  it('runs the DOM handlers the caller attaches, such as a drop target', () => {
    const onDragOver = vi.fn((event: {preventDefault: () => void}) =>
      event.preventDefault(),
    );
    const onDrop = vi.fn();
    render(
      <DropdownMenu button={{label: 'Help'}}>
        <DropdownMenuItem
          label="Report a bug"
          onClick={() => {}}
          onDragOver={onDragOver}
          onDrop={onDrop}
        />
      </DropdownMenu>,
    );
    const row = screen.getByRole('menuitem', {
      name: 'Report a bug',
      hidden: true,
    });
    fireEvent.dragOver(row);
    fireEvent.drop(row);
    expect(onDragOver).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it("keeps the row's own role, tab stop and hover focus beside a caller's onPointerMove", async () => {
    const user = userEvent.setup();
    const onPointerMove = vi.fn();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <DropdownMenuItem
          label="Delete"
          onClick={() => {}}
          onPointerMove={onPointerMove}
        />
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const edit = screen.getByRole('menuitem', {name: 'Edit', hidden: true});
    const del = screen.getByRole('menuitem', {name: 'Delete', hidden: true});
    expect(del).toHaveAttribute('tabindex', '-1');
    edit.focus();

    fireEvent.pointerMove(del, {pointerType: 'mouse'});

    // The row still takes the one focus highlight under the mouse, and the
    // caller's handler runs as well.
    expect(del).toHaveFocus();
    expect(onPointerMove).toHaveBeenCalledTimes(1);
  });

  it("a middle click on a link row runs the caller's onAuxClick and still closes the menu", async () => {
    const user = userEvent.setup();
    const onAuxClick = vi.fn();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Docs" href="/docs" onAuxClick={onAuxClick} />
      </DropdownMenu>,
    );
    const trigger = screen.getByRole('button', {name: 'Actions'});
    await user.click(trigger);
    const row = screen.getByRole('menuitem', {name: 'Docs', hidden: true});

    fireEvent(
      row,
      new MouseEvent('auxclick', {bubbles: true, cancelable: true, button: 1}),
    );

    expect(onAuxClick).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false'),
    );
  });
});

describe('DropdownMenuGroup (compound mode)', () => {
  it('a focusable node in the heading is not reachable by the arrow keys', async () => {
    // The public ReactNode type permits a focusable descendant, but the menu's
    // roving focus model cannot reach it. Pin that shipped gap while the public
    // title contract remains unsettled.
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuGroup
          title={
            <>
              Version history <button type="button">Info</button>
            </>
          }>
          <DropdownMenuItem label="Restore" onClick={() => {}} />
          <DropdownMenuItem label="Compare" onClick={() => {}} />
        </DropdownMenuGroup>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));

    const menu = screen.getByRole('menu', {hidden: true});
    const info = screen.getByRole('button', {name: 'Info', hidden: true});
    const restore = screen.getByRole('menuitem', {
      name: 'Restore',
      hidden: true,
    });
    const compare = screen.getByRole('menuitem', {
      name: 'Compare',
      hidden: true,
    });

    restore.focus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(compare).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(info).not.toHaveFocus();
  });

  it('arrow navigation steps across a group boundary as if the rows were flat', async () => {
    // The group renders a wrapper between the menu and its rows, which is
    // where flat navigation usually breaks.
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Open" onClick={() => {}} />
        <DropdownMenuGroup title="Version history">
          <DropdownMenuItem label="Restore" onClick={() => {}} />
        </DropdownMenuGroup>
        <DropdownMenuGroup title="Danger zone">
          <DropdownMenuItem label="Delete" onClick={() => {}} />
        </DropdownMenuGroup>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));

    const menu = screen.getByRole('menu', {hidden: true});
    const row = (name: string) =>
      screen.getByRole('menuitem', {name, hidden: true});

    row('Open').focus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(row('Restore')).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(row('Delete')).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'ArrowUp'});
    expect(row('Restore')).toHaveFocus();
  });

  it('renders a role="group" named by its heading', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuGroup title="Version history">
          <DropdownMenuItem label="Restore" onClick={() => {}} />
          <DropdownMenuItem label="Compare" onClick={() => {}} />
        </DropdownMenuGroup>
      </DropdownMenu>,
    );

    const group = screen.getByRole('group', {
      name: 'Version history',
      hidden: true,
    });
    const heading = screen.getByText('Version history');
    expect(group).toHaveAttribute('aria-labelledby', heading.id);
    expect(heading.id).not.toBe('');
    expect(group).toContainElement(
      screen.getByRole('menuitem', {name: 'Restore', hidden: true}),
    );
  });

  it('renders the heading with the data-mode theme class', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuGroup title="Version history">
          <DropdownMenuItem label="Restore" onClick={() => {}} />
        </DropdownMenuGroup>
      </DropdownMenu>,
    );

    expect(screen.getByText('Version history')).toHaveClass(
      'astryx-dropdown-menu-section-heading',
    );
  });

  it('the heading is not a menuitem and roving focus skips it', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <DropdownMenuGroup title="Danger zone">
          <DropdownMenuItem label="Delete" onClick={() => {}} />
        </DropdownMenuGroup>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));

    expect(screen.getByText('Danger zone')).not.toHaveAttribute('role');
    expect(screen.getAllByRole('menuitem', {hidden: true})).toHaveLength(2);

    const menu = screen.getByRole('menu', {hidden: true});
    screen.getByRole('menuitem', {name: 'Edit', hidden: true}).focus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'ArrowUp'});
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).toHaveFocus();
  });

  it('typeahead never lands on the heading', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <DropdownMenuGroup title="Danger zone">
          <DropdownMenuItem label="Delete" onClick={() => {}} />
        </DropdownMenuGroup>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const menu = screen.getByRole('menu', {hidden: true});

    // "d" matches both the heading ("Danger zone") and the row ("Delete");
    // only the row is a menu item.
    fireEvent.keyDown(menu, {key: 'd'});
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toHaveFocus();
  });

  it('an untitled group is an unnamed role="group"', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuGroup>
          <DropdownMenuItem label="Only" onClick={() => {}} />
        </DropdownMenuGroup>
      </DropdownMenu>,
    );
    const group = screen.getByRole('group', {hidden: true});
    expect(group).not.toHaveAttribute('aria-labelledby');
    expect(group.querySelector('.astryx-dropdown-menu-section-heading')).toBe(
      null,
    );
  });

  it('forwards a ref to the group element', () => {
    const ref = vi.fn();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuGroup title="T" ref={ref}>
          <DropdownMenuItem label="Only" onClick={() => {}} />
        </DropdownMenuGroup>
      </DropdownMenu>,
    );
    expect(ref).toHaveBeenCalledWith(
      screen.getByRole('group', {name: 'T', hidden: true}),
    );
  });
});

describe('DropdownMenu dividers', () => {
  it('renders dividers between items', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Edit'}, {type: 'divider'}, {label: 'Delete'}]}
      />,
    );

    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toBeInTheDocument();
    expect(screen.getByRole('separator', {hidden: true})).toBeInTheDocument();
  });
});

describe('DropdownMenu theming slots', () => {
  it('exposes a themeable slot on the section heading', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[
          {
            type: 'section',
            title: 'File Actions',
            items: [{label: 'New'}],
          },
        ]}
      />,
    );

    expect(screen.getByText('File Actions')).toHaveClass(
      'astryx-dropdown-menu-section-heading',
    );
  });

  it('exposes a themeable slot on the menu divider', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Edit'}, {type: 'divider'}, {label: 'Delete'}]}
      />,
    );

    const divider = screen.getByRole('separator', {hidden: true});
    expect(divider).toHaveClass('astryx-dropdown-menu-divider');
    // Still carries the base Divider slot so global divider theming applies too.
    expect(divider).toHaveClass('astryx-divider');
  });
});

describe('DropdownMenuItem destructive variant', () => {
  it('marks a compound-mode item destructive via data-variant', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem
          label="Delete"
          variant="destructive"
          onClick={() => {}}
        />
        <DropdownMenuItem label="Edit" onClick={() => {}} />
      </DropdownMenu>,
    );

    const del = screen.getByRole('menuitem', {name: 'Delete', hidden: true});
    const edit = screen.getByRole('menuitem', {name: 'Edit', hidden: true});
    expect(del).toHaveAttribute('data-variant', 'destructive');
    // Default items carry no variant attribute, so existing usage is unchanged.
    expect(edit).not.toHaveAttribute('data-variant');
  });

  it('forwards variant from the data-driven items API', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[
          {label: 'Delete', variant: 'destructive', onClick: () => {}},
          {label: 'Edit', onClick: () => {}},
        ]}
      />,
    );

    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toHaveAttribute('data-variant', 'destructive');
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).not.toHaveAttribute('data-variant');
  });

  it('forwards variant to items nested inside a section', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[
          {
            type: 'section',
            title: 'Danger zone',
            items: [
              {label: 'Delete', variant: 'destructive', onClick: () => {}},
            ],
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toHaveAttribute('data-variant', 'destructive');
  });

  it('defaults to no variant attribute', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
      </DropdownMenu>,
    );
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).not.toHaveAttribute('data-variant');
  });
});

describe('DropdownMenu button customization', () => {
  it('renders with different button variants', () => {
    const {rerender} = render(
      <DropdownMenu
        button={{label: 'Primary', variant: 'primary'}}
        items={[{label: 'Item'}]}
      />,
    );
    expect(screen.getByRole('button', {name: /Primary/})).toBeInTheDocument();

    rerender(
      <DropdownMenu
        button={{label: 'Ghost', variant: 'ghost'}}
        items={[{label: 'Item'}]}
      />,
    );
    expect(screen.getByRole('button', {name: /Ghost/})).toBeInTheDocument();
  });

  it('renders with different button sizes', () => {
    const {rerender} = render(
      <DropdownMenu
        button={{label: 'Small', size: 'sm'}}
        items={[{label: 'Item'}]}
      />,
    );
    expect(screen.getByRole('button', {name: /Small/})).toBeInTheDocument();

    rerender(
      <DropdownMenu
        button={{label: 'Large', size: 'lg'}}
        items={[{label: 'Item'}]}
      />,
    );
    expect(screen.getByRole('button', {name: /Large/})).toBeInTheDocument();
  });
});

describe('DropdownMenu icon-only mode', () => {
  it('renders icon-only button when icon is set without children', () => {
    render(
      <DropdownMenu
        button={{
          label: 'More options',
          icon: <span data-testid="icon">⋯</span>,
          variant: 'ghost',
          isIconOnly: true,
        }}
        items={[{label: 'Edit'}, {label: 'Delete'}]}
      />,
    );
    const button = screen.getByRole('button', {name: 'More options'});
    // label should be aria-label, not visible text
    expect(button).toHaveAttribute('aria-label', 'More options');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders icon + label when children are provided on button', () => {
    render(
      <DropdownMenu
        button={{
          label: 'Settings',
          icon: <span data-testid="icon">⚙️</span>,
          variant: 'ghost',
          children: 'Settings',
        }}
        items={[{label: 'Preferences'}]}
      />,
    );
    const button = screen.getByRole('button', {name: /Settings/});
    expect(button).not.toHaveAttribute('aria-label');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});

describe('DropdownMenu hasChevron', () => {
  it('hides chevron when hasChevron is false', () => {
    render(
      <DropdownMenu
        button={{label: 'Sort by'}}
        hasChevron={false}
        items={[{label: 'Name'}, {label: 'Date'}]}
      />,
    );
    // No chevron SVG in the button's endContent wrapper
    const button = screen.getByRole('button', {name: /Sort by/});
    const endContentWrapper = button.querySelector('[class*="endContent"]');
    expect(endContentWrapper).toBeNull();
  });
});

describe('DropdownMenu compound mode', () => {
  it('renders JSX children as menu items', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <DropdownMenuItem label="Delete" onClick={() => {}} />
      </DropdownMenu>,
    );
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toBeInTheDocument();
  });

  it('renders endContent after the item label', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem
          label="Notifications"
          endContent={<span data-testid="badge">3</span>}
        />
      </DropdownMenu>,
    );

    expect(screen.getByTestId('badge')).toHaveTextContent('3');
  });

  it('calls onClick when compound item is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={handleClick} />
      </DropdownMenu>,
    );

    await user.click(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    );
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when compound item is disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={handleClick} isDisabled />
      </DropdownMenu>,
    );

    await user.click(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    );
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders dividers between compound items', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <Divider />
        <DropdownMenuItem label="Delete" onClick={() => {}} />
      </DropdownMenu>,
    );

    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toBeInTheDocument();
    expect(screen.getByRole('separator', {hidden: true})).toBeInTheDocument();
  });

  it('has aria-disabled on disabled compound items', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} isDisabled />
      </DropdownMenu>,
    );
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('supports mixed static and dynamic compound children', () => {
    const showExtra = true;
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Always" onClick={() => {}} />
        {showExtra && (
          <DropdownMenuItem label="Conditional" onClick={() => {}} />
        )}
      </DropdownMenu>,
    );

    expect(
      screen.getByRole('menuitem', {name: 'Always', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Conditional', hidden: true}),
    ).toBeInTheDocument();
  });
});

describe('DropdownMenu keyboard access for menuitemradio/menuitemcheckbox (#3829)', () => {
  it('arrow navigation reaches consumer-rendered menuitemradio and menuitemcheckbox items', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Sort'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <div role="menuitemradio" tabIndex={-1} aria-checked="false">
          Newest
        </div>
        <div role="menuitemcheckbox" tabIndex={-1} aria-checked="false">
          Archived
        </div>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', {name: /Sort/}));
    const menu = screen.getByRole('menu', {hidden: true});
    screen.getByRole('menuitem', {name: 'Edit', hidden: true}).focus();

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitemradio', {name: 'Newest', hidden: true}),
    ).toHaveFocus();

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitemcheckbox', {name: 'Archived', hidden: true}),
    ).toHaveFocus();
  });

  it('activates a focused menuitemradio with Enter and a menuitemcheckbox with Space', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(
      <DropdownMenu button={{label: 'Sort'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <div
          role="menuitemradio"
          tabIndex={-1}
          aria-checked="false"
          onClick={onSelect}>
          Newest
        </div>
        <div
          role="menuitemcheckbox"
          tabIndex={-1}
          aria-checked="false"
          onClick={onToggle}>
          Archived
        </div>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', {name: /Sort/}));
    const menu = screen.getByRole('menu', {hidden: true});

    screen.getByRole('menuitemradio', {name: 'Newest', hidden: true}).focus();
    fireEvent.keyDown(menu, {key: 'Enter'});
    expect(onSelect).toHaveBeenCalledTimes(1);

    screen
      .getByRole('menuitemcheckbox', {name: 'Archived', hidden: true})
      .focus();
    fireEvent.keyDown(menu, {key: ' '});
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('typeahead matches a menuitemradio label', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Sort'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <div role="menuitemradio" tabIndex={-1} aria-checked="false">
          Newest
        </div>
        <div role="menuitemcheckbox" tabIndex={-1} aria-checked="false">
          Archived
        </div>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', {name: /Sort/}));
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {key: 'n'});
    expect(
      screen.getByRole('menuitemradio', {name: 'Newest', hidden: true}),
    ).toHaveFocus();
  });

  it('typeahead matches a menuitemcheckbox label', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Sort'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <div role="menuitemradio" tabIndex={-1} aria-checked="false">
          Newest
        </div>
        <div role="menuitemcheckbox" tabIndex={-1} aria-checked="false">
          Archived
        </div>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', {name: /Sort/}));
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {key: 'a'});
    expect(
      screen.getByRole('menuitemcheckbox', {name: 'Archived', hidden: true}),
    ).toHaveFocus();
  });

  it('typeahead skips an aria-disabled item and matches the next enabled label', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Sort'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <div role="menuitemradio" tabIndex={-1} aria-disabled="true">
          Newest
        </div>
        <div role="menuitemcheckbox" tabIndex={-1} aria-checked="false">
          Nightly
        </div>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', {name: /Sort/}));
    // Anchor the search on 'Edit' so typeahead scans forward and meets the
    // disabled 'Newest' (also an 'n' match) before the enabled 'Nightly'.
    // This pins the `:not([aria-disabled="true"])` in MENU_ITEM_SELECTOR: the
    // menus never pass useTypeahead's `isDisabled` option, so that clause is
    // the only thing keeping disabled rows out of the typeahead list. An
    // arrow-key test cannot cover it — useListFocus re-filters disabled items
    // independently, so arrow navigation is guarded twice over.
    // The disabled row keeps tabIndex={-1} on purpose: it stays focusable, so
    // the selector clause is the sole reason focus skips it.
    screen.getByRole('menuitem', {name: 'Edit', hidden: true}).focus();
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {key: 'n'});
    expect(
      screen.getByRole('menuitemcheckbox', {name: 'Nightly', hidden: true}),
    ).toHaveFocus();
  });

  it('skips aria-disabled menuitemradio and menuitemcheckbox items during arrow navigation', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Sort'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <div role="menuitemradio" tabIndex={-1} aria-disabled="true">
          Newest
        </div>
        <div role="menuitemcheckbox" tabIndex={-1} aria-disabled="true">
          Archived
        </div>
        <div role="menuitemradio" tabIndex={-1} aria-checked="false">
          Oldest
        </div>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', {name: /Sort/}));
    const menu = screen.getByRole('menu', {hidden: true});
    screen.getByRole('menuitem', {name: 'Edit', hidden: true}).focus();

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitemradio', {name: 'Oldest', hidden: true}),
    ).toHaveFocus();
  });

  it('moves focus to the item the mouse hovers, keeping a single highlight', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <DropdownMenuItem label="Duplicate" onClick={() => {}} />
        <DropdownMenuItem label="Delete" onClick={() => {}} />
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    // Keyboard focus starts on the first item.
    const edit = screen.getByRole('menuitem', {name: 'Edit', hidden: true});
    const del = screen.getByRole('menuitem', {name: 'Delete', hidden: true});
    edit.focus();
    expect(edit).toHaveFocus();

    // A mouse hover over another item moves focus to it, so the single
    // focus-driven highlight follows the pointer instead of leaving two.
    // Focus must be scroll-free: scrolling the focused item into view moves
    // the next item under the stationary pointer, which re-highlights and
    // scrolls again — a runaway auto-scroll loop. And it is the mouse's focus,
    // so it asks the browser not to match :focus-visible.
    const focusSpy = vi.spyOn(del, 'focus');
    fireEvent.pointerMove(del, {pointerType: 'mouse'});
    expect(del).toHaveFocus();
    expect(edit).not.toHaveFocus();
    expect(focusSpy).toHaveBeenCalledWith({
      preventScroll: true,
      focusVisible: false,
    });
  });

  it('after a keyboard open, focus that follows the mouse keeps the keyboard indicator (the last input)', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <DropdownMenuItem label="Delete" onClick={() => {}} />
      </DropdownMenu>,
    );
    screen.getByRole('button', {name: /Actions/}).focus();
    await user.keyboard('{ArrowDown}');
    const edit = screen.getByRole('menuitem', {name: 'Edit', hidden: true});
    await waitFor(() => expect(edit).toHaveFocus());

    // No pointer press since the key: the browser keeps deciding the
    // indicator, as for any focus the keyboard moved.
    const del = screen.getByRole('menuitem', {name: 'Delete', hidden: true});
    const focusSpy = vi.spyOn(del, 'focus');
    fireEvent.pointerMove(del, {pointerType: 'mouse'});
    expect(del).toHaveFocus();
    expect(focusSpy).toHaveBeenCalledWith({preventScroll: true});
  });

  it('does not move focus on hover for a disabled item', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <DropdownMenuItem label="Delete" isDisabled onClick={() => {}} />
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    const edit = screen.getByRole('menuitem', {name: 'Edit', hidden: true});
    const del = screen.getByRole('menuitem', {name: 'Delete', hidden: true});
    edit.focus();

    fireEvent.pointerMove(del, {pointerType: 'mouse'});
    expect(edit).toHaveFocus();
  });

  it('does not move focus for a non-mouse (touch) pointer', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <DropdownMenuItem label="Delete" onClick={() => {}} />
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    const edit = screen.getByRole('menuitem', {name: 'Edit', hidden: true});
    const del = screen.getByRole('menuitem', {name: 'Delete', hidden: true});
    edit.focus();

    fireEvent.pointerMove(del, {pointerType: 'touch'});
    expect(edit).toHaveFocus();
  });
});

describe('DropdownMenu open focus follows input modality (#4477)', () => {
  const items = [{label: 'Edit'}, {label: 'Duplicate'}, {label: 'Delete'}];

  it('pointer open focuses the menu container, not the first item (items mode)', async () => {
    const user = userEvent.setup();
    render(<DropdownMenu button={{label: 'Actions'}} items={items} />);

    await user.click(screen.getByRole('button', {name: /Actions/}));

    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => expect(menu).toHaveFocus());
    expect(menu).toHaveStyle({outline: 'none'});
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).not.toHaveFocus();
  });

  it('pointer open focuses the menu container in compound mode', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
        <DropdownMenuItem label="Delete" onClick={() => {}} />
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));

    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => expect(menu).toHaveFocus());
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).not.toHaveFocus();
  });

  it('first ArrowDown after a pointer open moves focus to the first enabled item', async () => {
    const user = userEvent.setup();
    render(<DropdownMenu button={{label: 'Actions'}} items={items} />);

    await user.click(screen.getByRole('button', {name: /Actions/}));
    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => expect(menu).toHaveFocus());

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).toHaveFocus();
  });

  it('ArrowDown after a pointer open skips a disabled leading item', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Edit', isDisabled: true}, {label: 'Delete'}]}
      />,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => expect(menu).toHaveFocus());

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toHaveFocus();
  });

  it('keyboard open via Enter focuses the first enabled item', async () => {
    const user = userEvent.setup();
    render(<DropdownMenu button={{label: 'Actions'}} items={items} />);

    screen.getByRole('button', {name: /Actions/}).focus();
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(
        screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
      ).toHaveFocus(),
    );
  });

  it('keyboard open via ArrowDown skips a disabled leading item', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Edit', isDisabled: true}, {label: 'Delete'}]}
      />,
    );

    screen.getByRole('button', {name: /Actions/}).focus();
    await user.keyboard('{ArrowDown}');

    await waitFor(() =>
      expect(
        screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
      ).toHaveFocus(),
    );
  });

  it('a synthesized click (detail 0, AT activation) still focuses the first item', async () => {
    render(<DropdownMenu button={{label: 'Actions'}} items={items} />);

    // fireEvent.click dispatches a MouseEvent with detail 0 (the shape of a
    // screen reader / AT activation), so it must keep the keyboard behavior.
    fireEvent.click(screen.getByRole('button', {name: /Actions/}));

    await waitFor(() =>
      expect(
        screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
      ).toHaveFocus(),
    );
  });

  it('controlled pointer open focuses the menu container', async () => {
    function Controlled() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <DropdownMenu
          button={{label: 'Actions'}}
          items={items}
          isMenuOpen={isOpen}
          onOpenChange={setIsOpen}
        />
      );
    }
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('button', {name: /Actions/}));

    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => expect(menu).toHaveFocus());
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).not.toHaveFocus();
  });

  it('programmatic controlled open still focuses the first item', async () => {
    const {rerender} = render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={items}
        isMenuOpen={false}
        onOpenChange={() => {}}
      />,
    );

    rerender(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={items}
        isMenuOpen={true}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
      ).toHaveFocus(),
    );
  });

  it('Escape still closes the menu after a pointer open', async () => {
    const user = userEvent.setup();
    render(<DropdownMenu button={{label: 'Actions'}} items={items} />);

    await user.click(screen.getByRole('button', {name: /Actions/}));
    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => expect(menu).toHaveFocus());

    fireEvent.keyDown(menu, {key: 'Escape'});
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });

  it('Tab still closes the menu after a pointer open (APG menu-button)', async () => {
    const user = userEvent.setup();
    render(<DropdownMenu button={{label: 'Actions'}} items={items} />);

    await user.click(screen.getByRole('button', {name: /Actions/}));
    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => expect(menu).toHaveFocus());

    fireEvent.keyDown(menu, {key: 'Tab'});
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });
});

describe('DropdownMenu data/compound parity', () => {
  it('renders an identical divider from either mode', () => {
    const {unmount} = render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Edit'}, {type: 'divider'}, {label: 'Delete'}]}
      />,
    );
    const fromData = screen.getByRole('separator', {hidden: true}).outerHTML;
    unmount();

    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" />
        <DropdownMenuDivider />
        <DropdownMenuItem label="Delete" />
      </DropdownMenu>,
    );
    const fromCompound = screen.getByRole('separator', {hidden: true});

    expect(fromCompound.outerHTML).toBe(fromData);
    expect(fromCompound).toHaveClass('astryx-dropdown-menu-divider');
  });

  it('forwards host attributes to a compound divider while keeping its role', () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" />
        <DropdownMenuDivider
          id="menu-sep"
          data-testid="menu-separator"
          aria-label="Danger zone"
          // @ts-expect-error role is component-owned
          role="presentation"
        />
        <DropdownMenuItem label="Delete" />
      </DropdownMenu>,
    );
    const separator = screen.getByTestId('menu-separator');
    expect(separator).toHaveAttribute('id', 'menu-sep');
    expect(separator).toHaveAttribute('aria-label', 'Danger zone');
    expect(separator).toHaveAttribute('role', 'separator');
    expect(separator).toHaveClass('astryx-dropdown-menu-divider');
  });

  it('composes the complete public root surface on the separator', () => {
    const ref = createRef<HTMLDivElement>();
    const onClick = vi.fn();
    const customStyles = stylex.create({
      divider: {marginBlock: spacingVars['--spacing-5']},
    });
    const customClass = stylex
      .props(customStyles.divider)
      .className!.split(' ')
      .pop()!;

    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" />
        <DropdownMenuDivider
          ref={ref}
          data-testid="menu-separator"
          className="consumer-divider"
          style={{backgroundColor: 'rgb(1, 2, 3)'}}
          xstyle={customStyles.divider}
          onClick={onClick}
        />
        <DropdownMenuItem label="Delete" />
      </DropdownMenu>,
    );

    const separator = screen.getByTestId('menu-separator');
    expect(ref.current).toBe(separator);
    expect(separator).toHaveClass(
      'astryx-dropdown-menu-divider',
      'astryx-divider',
      'consumer-divider',
      customClass,
    );
    expect(separator).toHaveStyle({backgroundColor: 'rgb(1, 2, 3)'});
    fireEvent.click(separator);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('skips a compound divider in the arrow-key order', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" />
        <DropdownMenuDivider />
        <DropdownMenuItem label="Delete" />
      </DropdownMenu>,
    );

    await user.tab();
    await user.keyboard('{ArrowDown}');
    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() =>
      expect(
        screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
      ).toHaveFocus(),
    );

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toHaveFocus();
    expect(screen.getByRole('separator', {hidden: true})).not.toHaveFocus();
  });

  it('carries endContent and description through the items data API', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[
          {
            label: 'Search',
            description: 'Find anything',
            endContent: <span data-testid="shortcut">⌘K</span>,
          },
        ]}
      />,
    );

    const item = screen.getByRole('menuitem', {hidden: true});
    expect(item).toHaveTextContent('Find anything');
    expect(item).toContainElement(screen.getByTestId('shortcut'));
  });

  it('takes a ReactNode label through the items data API', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: <em data-testid="rich">Rename</em>}]}
      />,
    );

    const item = screen.getByRole('menuitem', {hidden: true});
    expect(item).toContainElement(screen.getByTestId('rich'));
    // Still typeahead- and screen-reader-addressable: both read text content.
    expect(item).toHaveAccessibleName('Rename');
  });
});

describe('DropdownMenu press model', () => {
  const mouse = {pointerType: 'mouse', pointerId: 1, button: 0};
  const touch = {pointerType: 'touch', pointerId: 1};

  function renderMenu(onPick: (label: string) => void = () => {}) {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => onPick('Edit')} />
        <DropdownMenuItem
          label="Duplicate"
          onClick={() => onPick('Duplicate')}
        />
        <DropdownMenuItem label="Delete" onClick={() => onPick('Delete')} />
      </DropdownMenu>,
    );
    return screen.getByRole('button', {name: /Actions/});
  }

  const item = (name: string) =>
    screen.getByRole('menuitem', {name, hidden: true});

  it('a finger that lands on one row and lifts on another acts on the second, once', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    const trigger = renderMenu(onPick);
    await user.click(trigger);
    fireEvent.pointerDown(item('Edit'), touch);
    fireEvent.pointerMove(item('Delete'), touch);
    expect(item('Delete')).toHaveFocus();
    fireEvent.pointerUp(item('Delete'), touch);
    // The WebKit tail: a click aimed at the row the touch began on.
    fireEvent.click(item('Edit'), {detail: 1});
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('Delete');
  });

  it('a mouse released outside closes the menu; a finger released outside leaves it open', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();
    await user.click(trigger);
    fireEvent.pointerDown(item('Edit'), touch);
    fireEvent.pointerUp(document.body, touch);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.pointerDown(item('Edit'), mouse);
    fireEvent.pointerUp(document.body, mouse);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('marks the menu as carrying the press model and owns touch scrolling', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();
    await user.click(trigger);
    const menu = screen.getByRole('menu', {hidden: true});
    expect(menu).toHaveAttribute('data-astryx-menu-press');
    // jsdom does not compute `touch-action`; StyleX class names are a hash of
    // property and value, so the same declaration yields the same class (the
    // dev build prefixes a debug name; the hash is the last token).
    const touchStyles = stylex.create({
      none: {touchAction: 'none'},
      pinchZoom: {touchAction: 'pinch-zoom'},
      panYPinchZoom: {touchAction: 'pan-y pinch-zoom'},
    });
    const hash = (style: stylex.StyleXStyles) =>
      stylex.props(style).className!.split(' ').pop()!;
    // Rows that fit keep every one-finger move and leave a pinch to the
    // browser, so the page stays zoomable over the open menu.
    expect(menu).toHaveClass(hash(touchStyles.pinchZoom));
    expect(menu).not.toHaveClass(hash(touchStyles.none));
    expect(menu).not.toHaveClass(hash(touchStyles.panYPinchZoom));
  });

  it('a mouse press on the trigger opens the menu and a drag-release acts on the row under it', () => {
    const onPick = vi.fn();
    const trigger = renderMenu(onPick);
    fireEvent.pointerDown(trigger, mouse);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(item('Duplicate'), mouse);
    expect(item('Duplicate')).toHaveFocus();
    fireEvent.pointerUp(item('Duplicate'), mouse);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('Duplicate');
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });

  it('a press-opened menu returns focus to its trigger, not to the control focused before the press', async () => {
    // A browser's popover remembers the focused element when it is shown
    // and, when it hides with focus inside it, hands focus back to that
    // element before the layer's own hide handler runs. jsdom has no popover,
    // so the mocks carry that one rule here. A mouse press opens the menu
    // before the browser's mousedown would have focused the trigger: the
    // popover must still remember the trigger, or Escape lands focus on
    // whatever control was focused before the press.
    let rememberedFocus: Element | null = null;
    const showPopover = HTMLElement.prototype.showPopover;
    const hidePopover = HTMLElement.prototype.hidePopover;
    HTMLElement.prototype.showPopover = function (this: HTMLElement) {
      rememberedFocus = document.activeElement;
      showPopover.call(this);
    };
    HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
      if (
        rememberedFocus instanceof HTMLElement &&
        this.contains(document.activeElement)
      ) {
        rememberedFocus.focus();
      }
      hidePopover.call(this);
    };

    render(
      <>
        <button type="button">Before</button>
        <DropdownMenu
          button={{label: 'Actions'}}
          items={[{label: 'Edit'}, {label: 'Delete'}]}
        />
      </>,
    );
    const before = screen.getByRole('button', {name: 'Before'});
    const trigger = screen.getByRole('button', {name: /Actions/});
    before.focus();

    fireEvent.pointerDown(trigger, mouse);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // The popover recorded the trigger, not the control focused before.
    expect(rememberedFocus).toBe(trigger);
    fireEvent.pointerUp(trigger, mouse);
    fireEvent.click(trigger, {detail: 1});
    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => expect(menu).toHaveFocus());

    fireEvent.keyDown(menu, {key: 'Escape'});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    expect(before).not.toHaveFocus();
  });

  it('the opening release before the settle time acts on nothing and the menu stays', () => {
    vi.useFakeTimers();
    try {
      const onPick = vi.fn();
      const trigger = renderMenu(onPick);
      fireEvent.pointerDown(trigger, mouse);
      fireEvent.pointerUp(trigger, mouse);
      fireEvent.click(trigger, {detail: 1});
      expect(onPick).not.toHaveBeenCalled();
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pressing the trigger of an open menu closes it and does not reopen it in the same gesture', () => {
    const trigger = renderMenu();
    fireEvent.pointerDown(trigger, mouse);
    fireEvent.pointerUp(trigger, mouse);
    fireEvent.click(trigger, {detail: 1});
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.pointerDown(trigger, mouse);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.pointerUp(trigger, mouse);
    fireEvent.click(trigger, {detail: 1});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
  });

  it('a held touch on the trigger opens with the finger down and a slide picks', () => {
    vi.useFakeTimers();
    try {
      const onPick = vi.fn();
      const trigger = renderMenu(onPick);
      fireEvent.pointerDown(trigger, touch);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      fireEvent.pointerMove(item('Delete'), touch);
      expect(item('Delete')).toHaveFocus();
      fireEvent.pointerUp(item('Delete'), touch);
      expect(onPick).toHaveBeenCalledWith('Delete');
      // The click the browser aims at the trigger for this gesture is spent.
      fireEvent.click(trigger, {detail: 1});
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a menu a held finger opens keeps its trigger as the invoker until the finger lifts', () => {
    // A release on the trigger is outside the `popover="auto"` menu, so the
    // browser's light dismiss would close it; holding the invoker through
    // the press exempts the trigger, as it does for a mouse press.
    vi.useFakeTimers();
    try {
      const trigger = renderMenu();
      fireEvent.pointerDown(trigger, touch);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(trigger).toHaveAttribute('popovertarget');
      fireEvent.pointerUp(trigger, touch);
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(trigger).not.toHaveAttribute('popovertarget');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a tap on the trigger still opens through its click', () => {
    const trigger = renderMenu();
    fireEvent.pointerDown(trigger, touch);
    fireEvent.pointerUp(trigger, touch);
    fireEvent.click(trigger, {detail: 1});
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('DropdownMenu trigger handler composition', () => {
  it('still calls a consumer onClickCapture passed through button', () => {
    // The press model needs its own click-capture handler on the trigger to
    // swallow the click that follows a press-open. Setting it directly after
    // spreading the caller's button props dropped theirs silently, while the
    // pointer and context-menu handlers either side composed correctly.
    const onClickCapture = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Actions', onClickCapture}}
        items={[{label: 'Edit'}]}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Actions'}));
    expect(onClickCapture).toHaveBeenCalled();
  });
});

describe('DropdownMenu custom trigger', () => {
  it('a custom trigger opens, toggles and names the menu', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        renderTrigger={props => (
          <span {...props} role="button" tabIndex={0}>
            Ada Lovelace
          </span>
        )}>
        <DropdownMenuItem label="Profile" onClick={() => {}} />
      </DropdownMenu>,
    );
    const trigger = screen.getByRole('button', {name: 'Ada Lovelace'});
    expect(trigger.tagName).toBe('SPAN');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const menu = screen.getByRole('menu', {hidden: true});
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    // The menu is named by the control it hangs off.
    expect(menu).toHaveAttribute('aria-labelledby', trigger.id);
    expect(menu).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('menu', {name: 'Ada Lovelace', hidden: true})).toBe(
      menu,
    );

    await user.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    await user.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false'),
    );
  });

  it('a disabled custom trigger never opens the bottom sheet', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        items={[{label: 'Edit'}, {label: 'Delete'}]}
        presentation="bottom-sheet"
        renderTrigger={({ref, ...props}) => (
          <button type="button" ref={ref} aria-disabled="true" {...props}>
            Project actions
          </button>
        )}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Project actions'});
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('dialog', {name: 'Project actions'}),
    ).not.toBeInTheDocument();
  });

  it('a disabled custom trigger never opens the menu', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        items={[{label: 'Edit'}, {label: 'Delete'}]}
        renderTrigger={({ref, ...props}) => (
          <button type="button" ref={ref} aria-disabled="true" {...props}>
            Row actions
          </button>
        )}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Row actions'});
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.pointer([
      {keys: '[MouseLeft>]', target: trigger},
      {keys: '[/MouseLeft]'},
    ]);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('a custom trigger opens from the keyboard and lands on the first row', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        renderTrigger={props => (
          <button type="button" {...props}>
            More
          </button>
        )}>
        <DropdownMenuItem label="Profile" onClick={() => {}} />
      </DropdownMenu>,
    );
    const trigger = screen.getByRole('button', {name: 'More'});
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(
        screen.getByRole('menuitem', {name: 'Profile', hidden: true}),
      ).toHaveFocus(),
    );
  });

  it('a mouse press on a custom trigger opens the menu', () => {
    render(
      <DropdownMenu
        renderTrigger={props => (
          <button type="button" {...props}>
            More
          </button>
        )}>
        <DropdownMenuItem label="Profile" onClick={() => {}} />
      </DropdownMenu>,
    );
    const trigger = screen.getByRole('button', {name: 'More'});
    fireEvent.pointerDown(trigger, {
      pointerType: 'mouse',
      pointerId: 1,
      button: 0,
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('warns when both button and trigger are given in the bottom-sheet presentation too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(
        <DropdownMenu
          button={{label: 'Actions'}}
          presentation="bottom-sheet"
          renderTrigger={props => (
            <button type="button" {...props}>
              More
            </button>
          )}
          items={[{label: 'Profile'}]}
        />,
      );
      expect(screen.getByRole('button', {name: 'More'})).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {name: /Actions/}),
      ).not.toBeInTheDocument();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('mutually exclusive'),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('warns when both button and trigger are given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(
        <DropdownMenu
          button={{label: 'Actions'}}
          renderTrigger={props => (
            <button type="button" {...props}>
              More
            </button>
          )}>
          <DropdownMenuItem label="Profile" onClick={() => {}} />
        </DropdownMenu>,
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('mutually exclusive'),
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe('DropdownMenu menuMaxHeight', () => {
  it('a menu taller than the cap keeps the height it is given', () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        menuMaxHeight={528}
        items={Array.from({length: 12}, (_, i) => ({label: `Row ${i + 1}`}))}
      />,
    );
    const menu = screen.getByRole('menu', {hidden: true});
    // The cap is lifted to the given height, still bounded by the viewport.
    expect(menu).toHaveStyle({maxHeight: 'var(--x-maxHeight)'});
    expect(menu.getAttribute('style')).toContain('min(528px, calc(100dvb');
    expect(menu.getAttribute('style')).not.toContain('min(300px');
    // The popover viewport that holds the menu lifts its cap with it.
    const popover = menu.closest('[popover]');
    expect(popover?.getAttribute('style')).toContain('min(528px, calc(100dvb');
  });

  it('keeps the viewport bound below the raised cap', () => {
    // The cap is the smaller of the two terms, so a tall menu on a short
    // screen is still bounded by the viewport rather than by the number the
    // caller asked for.
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        menuMaxHeight={720}
        items={[{label: 'Row'}]}
      />,
    );
    const menu = screen.getByRole('menu', {hidden: true});
    expect(menu.getAttribute('style')).toContain('min(720px, calc(100dvb');
  });
});

describe('DropdownMenu focus return after a pointer pick', () => {
  function renderMenu(onPick: (label: string) => void = () => {}) {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => onPick('Edit')} />
        <DropdownMenuItem label="Delete" onClick={() => onPick('Delete')} />
      </DropdownMenu>,
    );
    return screen.getByRole('button', {name: /Actions/});
  }

  const item = (name: string) =>
    screen.getByRole('menuitem', {name, hidden: true});

  it('returns focus to the trigger after a pointer pick without a ring', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();
    await user.click(trigger);
    await user.click(item('Edit'));
    expect(trigger).toHaveFocus();
    await waitFor(() =>
      expect(trigger).toHaveClass(
        stylex.props(focusOutlineStyles.suppressed).className!,
      ),
    );
  });

  it('gives the ring back when the keyboard returns to the trigger', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();
    await user.click(trigger);
    await user.click(item('Edit'));
    await waitFor(() =>
      expect(trigger).toHaveClass(
        stylex.props(focusOutlineStyles.suppressed).className!,
      ),
    );

    // The suppression belongs to the pointer that dismissed the menu, not to
    // the trigger. A keyboard user who tabs away and back is asking to see
    // where they are, so the ring must come back: the trigger's own `onFocus`
    // clears the suppression once the modality is keyboard again.
    trigger.blur();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    trigger.focus();

    await waitFor(() =>
      expect(trigger).not.toHaveClass(
        stylex.props(focusOutlineStyles.suppressed).className!,
      ),
    );
  });

  it("asks the browser for no ring on the design system's Button too", async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();
    await user.click(trigger);
    const focus = vi.spyOn(trigger, 'focus');
    await user.click(item('Edit'));
    expect(trigger).toHaveFocus();
    expect(focus.mock.calls.at(-1)).toEqual([
      {preventScroll: true, focusVisible: false},
    ]);
  });

  describe('a trigger the caller renders', () => {
    // The style that keeps the ring off the design system's Button cannot
    // reach a caller's control, so the focus move itself has to: after
    // pointer input the browser is asked not to match `:focus-visible`, which
    // it otherwise does on the returned focus (Chromium after a mouse pick,
    // WebKit after a touch).
    function renderCustomMenu() {
      render(
        <DropdownMenu
          renderTrigger={props => (
            <button type="button" {...props}>
              More
            </button>
          )}>
          <DropdownMenuItem label="Edit" onClick={() => {}} />
          <DropdownMenuItem label="Delete" onClick={() => {}} />
        </DropdownMenu>,
      );
      return screen.getByRole('button', {name: 'More'});
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns focus after a pointer pick with the browser asked for no ring', async () => {
      const user = userEvent.setup();
      const trigger = renderCustomMenu();
      await user.click(trigger);
      const focus = vi.spyOn(trigger, 'focus');
      await user.click(item('Edit'));
      expect(trigger).toHaveFocus();
      expect(focus.mock.calls.at(-1)).toEqual([
        {preventScroll: true, focusVisible: false},
      ]);
    });

    it('returns focus after a keyboard pick with the ring left to the browser', async () => {
      const user = userEvent.setup();
      const trigger = renderCustomMenu();
      trigger.focus();
      await user.keyboard('{ArrowDown}');
      await waitFor(() => expect(item('Edit')).toHaveFocus());
      const focus = vi.spyOn(trigger, 'focus');
      await user.keyboard('{Enter}');
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(focus.mock.calls.at(-1)).toEqual([{preventScroll: true}]);
    });

    it('clears a ring the browser already drew before refocusing after a pointer pick', async () => {
      const user = userEvent.setup();
      const trigger = renderCustomMenu();
      await user.click(trigger);
      // WebKit's own popover focus restoration can focus the trigger, with a
      // ring, before the menu moves focus, and focusing the focused element
      // changes nothing.
      const hidePopover = HTMLElement.prototype.hidePopover;
      HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
        hidePopover.call(this);
        trigger.focus();
      });
      const matches = HTMLElement.prototype.matches;
      vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
        this: HTMLElement,
        selector: string,
      ) {
        return selector === ':focus-visible'
          ? this === trigger
          : matches.call(this, selector);
      });
      const blur = vi.spyOn(trigger, 'blur');
      const focus = vi.spyOn(trigger, 'focus');
      await user.click(item('Edit'));
      expect(blur).toHaveBeenCalledTimes(1);
      expect(focus.mock.calls.at(-1)).toEqual([
        {preventScroll: true, focusVisible: false},
      ]);
      expect(blur.mock.invocationCallOrder[0]).toBeLessThan(
        focus.mock.invocationCallOrder.at(-1) ?? 0,
      );
      expect(trigger).toHaveFocus();
    });
  });
});

describe('DropdownMenuItem href', () => {
  it('renders an anchor when given href', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <DropdownMenu button={{label: 'Places'}}>
        <DropdownMenuItem
          label="Inbox"
          href="/inbox"
          target="_blank"
          onClick={onClick}
        />
      </DropdownMenu>,
    );
    const row = screen.getByRole('menuitem', {name: 'Inbox', hidden: true});
    expect(row.tagName).toBe('A');
    expect(row).toHaveAttribute('href', '/inbox');
    expect(row).toHaveAttribute('target', '_blank');
    expect(row).toHaveAttribute('rel', 'noopener noreferrer');
    expect(row).toHaveAttribute('tabindex', '-1');
    // The anchor IS the row: no inner anchor or button doubles the control.
    expect(row.querySelector('a, button')).toBeNull();

    await user.click(screen.getByRole('button', {name: /Places/}));
    // onClick runs on the row's click, before the browser navigates, and the
    // row closes the menu after it.
    const order: string[] = [];
    onClick.mockImplementation(() => order.push('onClick'));
    (HTMLElement.prototype.hidePopover as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(row);
    expect(order).toEqual(['onClick']);
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });

  it('a modified click is left to the browser', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <DropdownMenu button={{label: 'Places'}}>
        <DropdownMenuItem label="Inbox" href="/inbox" onClick={onClick} />
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Places/}));
    const row = screen.getByRole('menuitem', {name: 'Inbox', hidden: true});

    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });
    row.dispatchEvent(event);
    // Nothing prevents the browser's meaning of a ⌘-click (a new tab), and
    // the row's own handler stays out of it — the browser is acting.
    expect(event.defaultPrevented).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Enter on an href row synthesizes a click that keeps the key modifiers', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Places'}}>
        <DropdownMenuItem label="Inbox" href="/inbox" />
      </DropdownMenu>,
    );
    const trigger = screen.getByRole('button', {name: /Places/});
    trigger.focus();
    await user.keyboard('{Enter}');
    const row = screen.getByRole('menuitem', {name: 'Inbox', hidden: true});
    await waitFor(() => expect(row).toHaveFocus());

    const clicks: MouseEvent[] = [];
    row.addEventListener('click', e => {
      clicks.push(e);
      e.preventDefault();
    });
    fireEvent.keyDown(row, {key: 'Enter', metaKey: true, shiftKey: true});
    expect(clicks).toHaveLength(1);
    expect(clicks[0].metaKey).toBe(true);
    expect(clicks[0].shiftKey).toBe(true);
    expect(clicks[0].ctrlKey).toBe(false);
  });

  it('a data item with href is a real link in the bottom sheet and still closes it', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Places'}}
        presentation="bottom-sheet"
        items={[
          {label: 'Inbox', href: '/inbox', target: '_blank', onClick},
          {label: 'Rename', onClick: () => {}},
        ]}
      />,
    );
    const trigger = screen.getByRole('button', {name: /Places/});
    await user.click(trigger);
    const row = await screen.findByRole('link', {name: 'Inbox'});
    expect(row).toHaveAttribute('href', '/inbox');
    expect(row).toHaveAttribute('target', '_blank');
    expect(row).toHaveAttribute('rel', 'noopener noreferrer');
    // The plain row stays a button.
    expect(screen.getByRole('button', {name: 'Rename'})).toBeInTheDocument();

    // A plain click runs onClick and closes the sheet (the browser navigates).
    const plain = new MouseEvent('click', {bubbles: true, cancelable: true});
    row.dispatchEvent(plain);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(plain.defaultPrevented).toBe(false);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false'),
    );
  });

  it('a modified click on a bottom-sheet link row is left to the browser', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Places'}}
        presentation="bottom-sheet"
        items={[{label: 'Inbox', href: '/inbox', onClick}]}
      />,
    );
    await user.click(screen.getByRole('button', {name: /Places/}));
    const row = await screen.findByRole('link', {name: 'Inbox'});
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });
    row.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('a disabled href row renders no address', () => {
    render(
      <DropdownMenu button={{label: 'Places'}}>
        <DropdownMenuItem label="Inbox" href="/inbox" isDisabled />
      </DropdownMenu>,
    );
    const row = screen.getByRole('menuitem', {name: 'Inbox', hidden: true});
    expect(row.tagName).toBe('A');
    expect(row).not.toHaveAttribute('href');
    expect(row).toHaveAttribute('aria-disabled', 'true');
  });

  it('a link row is not draggable; a row without an address keeps the default', () => {
    // A link is draggable by default, and a mouse press that moves a few
    // pixels on one starts the browser's link drag, which cancels the press
    // model's pointer stream before the row under the release can act.
    render(
      <DropdownMenu button={{label: 'Places'}}>
        <DropdownMenuItem label="Inbox" href="/inbox" />
        <DropdownMenuItem label="Archive" onClick={() => {}} />
      </DropdownMenu>,
    );
    const inbox = screen.getByRole('menuitem', {name: 'Inbox', hidden: true});
    expect(inbox.tagName).toBe('A');
    expect(inbox).toHaveAttribute('draggable', 'false');
    expect(inbox.draggable).toBe(false);
    const archive = screen.getByRole('menuitem', {
      name: 'Archive',
      hidden: true,
    });
    expect(archive).not.toHaveAttribute('draggable');
  });
});

describe("DropdownMenu link rows — the browser's own clicks", () => {
  async function openWithLinkRow(props: {
    onClick?: () => void;
    isDisabled?: boolean;
  }) {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Docs" href="/docs" {...props} />
      </DropdownMenu>,
    );
    const trigger = screen.getByRole('button', {name: 'Actions'});
    await user.click(trigger);
    return {
      trigger,
      row: screen.getByRole('menuitem', {name: 'Docs', hidden: true}),
    };
  }

  const auxClick = (el: Element, button: number) =>
    fireEvent(
      el,
      new MouseEvent('auxclick', {bubbles: true, cancelable: true, button}),
    );

  it('closes the menu on a middle click, which fires auxclick not click', async () => {
    // A middle click never fires `click`, so the row's click handler never
    // saw it: the browser opened the tab and the menu stayed open behind it.
    const onClick = vi.fn();
    const {trigger, row} = await openWithLinkRow({onClick});
    expect(row.tagName).toBe('A');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    auxClick(row, 1);

    // The browser does the navigating, so the row's own handler stays out of
    // it exactly as it does for a modified click — but the row acted, so the
    // menu closes.
    expect(onClick).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false'),
    );
  });

  it('leaves a right click to the context menu', async () => {
    const {trigger, row} = await openWithLinkRow({});

    // Button 2 is the right button: it opens the browser's context menu over
    // the link, and closing the menu out from under it would be wrong.
    auxClick(row, 2);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not navigate a disabled link row on a middle click', async () => {
    const {trigger, row} = await openWithLinkRow({isDisabled: true});

    // A disabled row keeps its place in the tree but carries no address, so
    // there is nothing for the browser to open and the menu stays put.
    expect(row).not.toHaveAttribute('href');
    auxClick(row, 1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders a blocked destination inertly', async () => {
    // A menu row is a place an address can arrive from data. The row's root
    // is the application's link component, so the shared destination rule
    // applies by construction rather than by a check of this component's
    // own: a rejected scheme renders with no href at all and goes nowhere.
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        {/* eslint-disable-next-line @eslint-react/dom-no-script-url -- the test proves this URL never navigates */}
        <DropdownMenuItem label="Trap" href="javascript:window.__fired=true" />
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: 'Actions'}));
    const row = screen.getByRole('menuitem', {name: 'Trap', hidden: true});

    expect(row).not.toHaveAttribute('href');
    await user.click(row);
    expect((window as unknown as {__fired?: boolean}).__fired).toBeUndefined();
  });
});

describe('DropdownMenu keyboard', () => {
  const items = [{label: 'Edit'}, {label: 'Duplicate'}, {label: 'Delete'}];
  const item = (name: string | RegExp) =>
    screen.getByRole('menuitem', {name, hidden: true});

  it('ArrowDown on the last row wraps to the first, ArrowUp on the first to the last', async () => {
    const user = userEvent.setup();
    render(<DropdownMenu button={{label: 'Actions'}} items={items} />);
    screen.getByRole('button', {name: /Actions/}).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(item('Edit')).toHaveFocus());
    const menu = screen.getByRole('menu', {hidden: true});
    fireEvent.keyDown(menu, {key: 'ArrowUp'});
    expect(item('Delete')).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(item('Edit')).toHaveFocus();
  });

  it('ArrowUp on the trigger opens with the last row highlighted', async () => {
    const user = userEvent.setup();
    render(<DropdownMenu button={{label: 'Actions'}} items={items} />);
    screen.getByRole('button', {name: /Actions/}).focus();
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(item('Delete')).toHaveFocus());
  });

  it('PageDown moves to the last row and PageUp back to the first', async () => {
    const user = userEvent.setup();
    render(<DropdownMenu button={{label: 'Actions'}} items={items} />);
    screen.getByRole('button', {name: /Actions/}).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(item('Edit')).toHaveFocus());
    const menu = screen.getByRole('menu', {hidden: true});
    fireEvent.keyDown(menu, {key: 'PageDown'});
    expect(item('Delete')).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'PageDown'});
    expect(item('Delete')).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'PageUp'});
    expect(item('Edit')).toHaveFocus();
  });

  it("the opening key's auto-repeat does not act on the highlighted row", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[{label: 'Edit', onClick}]}
      />,
    );
    screen.getByRole('button', {name: /Actions/}).focus();
    await user.keyboard('{Enter>}');
    await waitFor(() => expect(item('Edit')).toHaveFocus());
    fireEvent.keyDown(item('Edit'), {key: 'Enter', repeat: true});
    fireEvent.keyDown(item('Edit'), {key: 'Enter', repeat: true});
    fireEvent.keyUp(item('Edit'), {key: 'Enter'});
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.keyDown(item('Edit'), {key: 'Enter'});
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('DropdownMenu header and footer', () => {
  function LabelsMenu({onCreate}: {onCreate?: () => void}) {
    return (
      <DropdownMenu
        button={{label: 'Labels'}}
        header={<input aria-label="Filter labels" />}
        footer={
          <button type="button" onClick={onCreate}>
            Create label
          </button>
        }>
        <DropdownMenuItem label="Bug" />
        <DropdownMenuItem label="Feature" />
      </DropdownMenu>
    );
  }

  async function open() {
    const user = userEvent.setup();
    render(<LabelsMenu />);
    await user.click(screen.getByRole('button', {name: /Labels/}));
    const menu = screen.getByRole('menu', {hidden: true});
    // A pointer open focuses the menu itself; let that land first.
    await waitFor(() => expect(menu).toHaveFocus());
    return {user, menu};
  }

  it('renders the regions in the popover, outside the role="menu" element', async () => {
    const {menu} = await open();
    const field = screen.getByRole('textbox', {
      name: 'Filter labels',
      hidden: true,
    });
    const create = screen.getByRole('button', {
      name: 'Create label',
      hidden: true,
    });
    // The menu holds only its rows.
    expect(menu).not.toContainElement(field);
    expect(menu).not.toContainElement(create);
    expect(
      Array.from(menu.querySelectorAll('[role]')).map(el =>
        el.getAttribute('role'),
      ),
    ).toEqual(['menuitem', 'menuitem']);
    // Header before the menu, footer after it, in one popover.
    const popoverEl = menu.closest('[popover]');
    expect(popoverEl).toContainElement(field);
    expect(popoverEl).toContainElement(create);
    expect(
      field.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      menu.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('makes the menu one Tab stop between the regions', async () => {
    const {menu} = await open();
    expect(menu).toHaveAttribute('tabindex', '0');
  });

  it('Tab from the menu moves on to the footer and keeps the menu open', async () => {
    const {menu} = await open();
    const hide = vi.mocked(HTMLElement.prototype.hidePopover);
    hide.mockClear();
    fireEvent.keyDown(menu, {key: 'Tab'});
    expect(hide).not.toHaveBeenCalled();
    fireEvent.keyDown(menu, {key: 'Tab', shiftKey: true});
    expect(hide).not.toHaveBeenCalled();
  });

  it('Shift+Tab from a row moves straight to the header and keeps the menu open', async () => {
    const {menu} = await open();
    const hide = vi.mocked(HTMLElement.prototype.hidePopover);
    hide.mockClear();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    const row = screen.getByRole('menuitem', {name: 'Bug', hidden: true});
    await waitFor(() => expect(row).toHaveFocus());
    fireEvent.keyDown(row, {key: 'Tab', shiftKey: true});
    expect(
      screen.getByRole('textbox', {name: 'Filter labels', hidden: true}),
    ).toHaveFocus();
    expect(hide).not.toHaveBeenCalled();
  });

  it('a pointer open draws no focus ring on the menu; keyboard focus on it does', async () => {
    const {menu} = await open();
    // Opened with a pointer: the menu is focused but must not ring.
    const ringClasses = stylex
      .props(focusOutlineStyles.focusVisible)
      .className!.split(' ')
      .filter(Boolean);
    const hasRing = () => ringClasses.every(c => menu.classList.contains(c));
    expect(menu).toHaveFocus();
    expect(hasRing()).toBe(false);
    // Keyboard: leave to the header and come back by Tab.
    const field = screen.getByRole('textbox', {
      name: 'Filter labels',
      hidden: true,
    });
    fireEvent.keyDown(document, {key: 'Tab', shiftKey: true});
    act(() => field.focus());
    fireEvent.keyDown(document, {key: 'Tab'});
    act(() => menu.focus());
    await waitFor(() => expect(hasRing()).toBe(true));
  });

  describe('with only hidden controls in a region', () => {
    async function openHidden(
      header: React.ReactNode,
      footer: React.ReactNode,
    ) {
      const user = userEvent.setup();
      render(
        <DropdownMenu
          button={{label: 'Labels'}}
          header={header}
          footer={footer}>
          <DropdownMenuItem label="Bug" />
          <DropdownMenuSubMenu label="Move to">
            <DropdownMenuItem label="Folder A" />
          </DropdownMenuSubMenu>
        </DropdownMenu>,
      );
      const trigger = screen.getByRole('button', {name: /Labels/});
      await user.click(trigger);
      const menu = screen.getByRole('menu', {name: 'Labels', hidden: true});
      await waitFor(() => expect(menu).toHaveFocus());
      const hide = vi.mocked(HTMLElement.prototype.hidePopover);
      hide.mockClear();
      return {user, trigger, menu, hide};
    }

    it.each([
      [
        'hidden',
        <button key="h" type="button" hidden>
          Gone
        </button>,
      ],
      [
        'display: none',
        <button key="d" type="button" style={{display: 'none'}}>
          Gone
        </button>,
      ],
      [
        'visibility: hidden',
        <button key="v" type="button" style={{visibility: 'hidden'}}>
          Gone
        </button>,
      ],
    ])(
      'treats a %s footer control as unreachable: Tab from the menu stays on the menu',
      async (_label, control) => {
        const {menu, hide} = await openHidden(null, control);
        fireEvent.keyDown(menu, {key: 'Tab'});
        expect(menu).toHaveFocus();
        expect(hide).not.toHaveBeenCalled();
      },
    );

    it('treats a footer control inside a display: none wrapper as unreachable', async () => {
      const {menu, hide} = await openHidden(
        null,
        <div style={{display: 'none'}}>
          <button type="button">Create label</button>
        </div>,
      );
      fireEvent.keyDown(menu, {key: 'Tab'});
      expect(menu).toHaveFocus();
      expect(hide).not.toHaveBeenCalled();
    });

    it('treats a header control inside a display: none wrapper as unreachable: Shift+Tab from a row stays', async () => {
      const {menu, hide} = await openHidden(
        <div style={{display: 'none'}}>
          <input aria-label="Filter labels" />
        </div>,
        null,
      );
      fireEvent.keyDown(menu, {key: 'ArrowDown'});
      const row = screen.getByRole('menuitem', {name: 'Bug', hidden: true});
      await waitFor(() => expect(row).toHaveFocus());
      fireEvent.keyDown(row, {key: 'Tab', shiftKey: true});
      expect(row).toHaveFocus();
      expect(hide).not.toHaveBeenCalled();
    });

    it('Tab past the last visible footer control wraps to the menu, ignoring a wrapped hidden one after it', async () => {
      const {hide} = await openHidden(
        null,
        <>
          <button type="button">Create label</button>
          <div style={{display: 'none'}}>
            <button type="button">Gone</button>
          </div>
        </>,
      );
      const create = screen.getByRole('button', {
        name: 'Create label',
        hidden: true,
      });
      act(() => create.focus());
      fireEvent.keyDown(create, {key: 'Tab'});
      expect(
        screen.getByRole('menu', {name: 'Labels', hidden: true}),
      ).toHaveFocus();
      expect(hide).not.toHaveBeenCalled();
    });

    it('Tab from an open sub-menu returns to the menu when the footer control is in a hidden wrapper', async () => {
      const {user, menu} = await openHidden(
        null,
        <div style={{display: 'none'}}>
          <button type="button">Create label</button>
        </div>,
      );
      const subTrigger = screen.getByRole('menuitem', {
        name: /Move to/,
        hidden: true,
      });
      act(() => subTrigger.focus());
      await user.keyboard('{ArrowRight}');
      const folder = screen.getByRole('menuitem', {
        name: 'Folder A',
        hidden: true,
      });
      await waitFor(() => expect(folder).toHaveFocus());
      fireEvent.keyDown(folder, {key: 'Tab'});
      expect(subTrigger).toHaveAttribute('aria-expanded', 'false');
      expect(menu).toHaveFocus();
      expect(menu.closest('[popover]')).toHaveAttribute('popover-open');
    });

    it('treats a hidden header control as unreachable: Shift+Tab from a row stays on the row', async () => {
      const {menu, hide} = await openHidden(
        <input aria-label="Filter labels" hidden />,
        null,
      );
      fireEvent.keyDown(menu, {key: 'ArrowDown'});
      const row = screen.getByRole('menuitem', {name: 'Bug', hidden: true});
      await waitFor(() => expect(row).toHaveFocus());
      fireEvent.keyDown(row, {key: 'Tab', shiftKey: true});
      expect(row).toHaveFocus();
      expect(hide).not.toHaveBeenCalled();
    });

    it('Tab past the last visible footer control wraps to the menu, ignoring a hidden one after it', async () => {
      const {hide} = await openHidden(
        null,
        <>
          <button type="button">Create label</button>
          <button type="button" style={{display: 'none'}}>
            Gone
          </button>
        </>,
      );
      const create = screen.getByRole('button', {
        name: 'Create label',
        hidden: true,
      });
      act(() => create.focus());
      fireEvent.keyDown(create, {key: 'Tab'});
      expect(
        screen.getByRole('menu', {name: 'Labels', hidden: true}),
      ).toHaveFocus();
      expect(hide).not.toHaveBeenCalled();
    });

    it('Tab from an open sub-menu returns to the menu when the footer holds only hidden controls', async () => {
      const {user, menu} = await openHidden(
        null,
        <button type="button" hidden>
          Gone
        </button>,
      );
      const subTrigger = screen.getByRole('menuitem', {
        name: /Move to/,
        hidden: true,
      });
      act(() => subTrigger.focus());
      await user.keyboard('{ArrowRight}');
      const folder = screen.getByRole('menuitem', {
        name: 'Folder A',
        hidden: true,
      });
      await waitFor(() => expect(folder).toHaveFocus());
      fireEvent.keyDown(folder, {key: 'Tab'});
      expect(subTrigger).toHaveAttribute('aria-expanded', 'false');
      expect(menu).toHaveFocus();
      expect(menu.closest('[popover]')).toHaveAttribute('popover-open');
    });
  });

  describe('with a sub-menu open', () => {
    async function openFlyout() {
      const user = userEvent.setup();
      render(
        <DropdownMenu
          button={{label: 'Labels'}}
          header={<input aria-label="Filter labels" />}
          footer={<button type="button">Create label</button>}>
          <DropdownMenuItem label="Bug" />
          <DropdownMenuSubMenu label="Move to">
            <DropdownMenuItem label="Folder A" />
            <DropdownMenuItem label="Folder B" />
          </DropdownMenuSubMenu>
        </DropdownMenu>,
      );
      await user.click(screen.getByRole('button', {name: /Labels/}));
      const root = screen.getByRole('menu', {name: 'Labels', hidden: true});
      await waitFor(() => expect(root).toHaveFocus());
      const subTrigger = screen.getByRole('menuitem', {
        name: /Move to/,
        hidden: true,
      });
      act(() => subTrigger.focus());
      await user.keyboard('{ArrowRight}');
      await waitFor(() =>
        expect(subTrigger).toHaveAttribute('aria-expanded', 'true'),
      );
      const folder = screen.getByRole('menuitem', {
        name: 'Folder A',
        hidden: true,
      });
      await waitFor(() => expect(folder).toHaveFocus());
      const hide = vi.mocked(HTMLElement.prototype.hidePopover);
      return {root, subTrigger, folder, hide};
    }

    it('Tab from a flyout row closes the flyout and moves to the footer', async () => {
      const {root, subTrigger, folder} = await openFlyout();
      fireEvent.keyDown(folder, {key: 'Tab'});
      expect(subTrigger).toHaveAttribute('aria-expanded', 'false');
      expect(
        screen.getByRole('button', {name: 'Create label', hidden: true}),
      ).toHaveFocus();
      expect(root.closest('[popover]')).toHaveAttribute('popover-open');
    });

    it('Shift+Tab from a flyout row closes the flyout and moves to the header', async () => {
      const {subTrigger, folder} = await openFlyout();
      fireEvent.keyDown(folder, {key: 'Tab', shiftKey: true});
      expect(subTrigger).toHaveAttribute('aria-expanded', 'false');
      expect(
        screen.getByRole('textbox', {name: 'Filter labels', hidden: true}),
      ).toHaveFocus();
    });
  });

  it('Tab past the last footer control wraps to the first header control', async () => {
    await open();
    const hide = vi.mocked(HTMLElement.prototype.hidePopover);
    hide.mockClear();
    const create = screen.getByRole('button', {
      name: 'Create label',
      hidden: true,
    });
    create.focus();
    fireEvent.keyDown(create, {key: 'Tab', shiftKey: true});
    expect(hide).not.toHaveBeenCalled();
    create.focus();
    expect(create).toHaveFocus();
    fireEvent.keyDown(create, {key: 'Tab'});
    expect(
      screen.getByRole('textbox', {name: 'Filter labels', hidden: true}),
    ).toHaveFocus();
    expect(hide).not.toHaveBeenCalled();
  });

  it('Shift+Tab before the first header control wraps to the last footer control', async () => {
    await open();
    const hide = vi.mocked(HTMLElement.prototype.hidePopover);
    hide.mockClear();
    const field = screen.getByRole('textbox', {
      name: 'Filter labels',
      hidden: true,
    });
    field.focus();
    fireEvent.keyDown(field, {key: 'Tab'});
    expect(hide).not.toHaveBeenCalled();
    field.focus();
    expect(field).toHaveFocus();
    fireEvent.keyDown(field, {key: 'Tab', shiftKey: true});
    expect(
      screen.getByRole('button', {name: 'Create label', hidden: true}),
    ).toHaveFocus();
    expect(hide).not.toHaveBeenCalled();
  });

  it('is a modal dialog named like the menu, holding the menu, and the trigger points at it', async () => {
    const {menu} = await open();
    const dialog = screen.getByRole('dialog', {name: 'Labels', hidden: true});
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toContainElement(menu);
    expect(dialog).toContainElement(
      screen.getByRole('textbox', {name: 'Filter labels', hidden: true}),
    );
    const trigger = screen.getByRole('button', {name: /Labels/});
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    const controlled = document.getElementById(
      trigger.getAttribute('aria-controls') ?? '',
    );
    expect(controlled).not.toBeNull();
    expect(controlled).toContainElement(dialog);
    expect(controlled).not.toContainElement(trigger);
  });

  it('a custom trigger with a header names the dialog and logs no unnamed-dialog warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(
        <DropdownMenu
          header={<input aria-label="Filter labels" />}
          renderTrigger={props => (
            <span {...props} role="button" tabIndex={0}>
              Labels
            </span>
          )}>
          <DropdownMenuItem label="Bug" />
        </DropdownMenu>,
      );
      const trigger = screen.getByRole('button', {name: 'Labels'});
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
      await user.click(trigger);
      expect(
        screen.getByRole('dialog', {name: 'Labels', hidden: true}),
      ).toHaveAttribute('aria-modal', 'true');
      expect(
        warn.mock.calls.some(args =>
          String(args[0]).includes('unnamed dialog'),
        ),
      ).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('an icon-only custom trigger with a header still gets a named dialog', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        header={<input aria-label="Filter labels" />}
        renderTrigger={props => (
          <button {...props} type="button">
            <img alt="Labels" src="" />
          </button>
        )}>
        <DropdownMenuItem label="Bug" />
      </DropdownMenu>,
    );
    const trigger = screen.getByRole('button', {name: 'Labels'});
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(trigger);
    expect(
      screen.getByRole('dialog', {name: 'Labels', hidden: true}),
    ).toHaveAttribute('aria-modal', 'true');
  });

  it.each([
    [
      'its own <label>',
      (props: DropdownMenuTriggerProps) => (
        <>
          <label htmlFor={props.id}>Labels</label>
          <button {...props} type="button" />
        </>
      ),
    ],
    [
      "an input button's value",
      (props: DropdownMenuTriggerProps) => (
        <input {...props} type="button" value="Labels" />
      ),
    ],
  ])(
    'a custom trigger named by %s names the dialog like the menu',
    async (_label, renderTrigger) => {
      const user = userEvent.setup();
      render(
        <DropdownMenu
          header={<input aria-label="Filter labels" />}
          renderTrigger={renderTrigger}>
          <DropdownMenuItem label="Bug" />
        </DropdownMenu>,
      );
      await user.click(screen.getByRole('button', {name: 'Labels'}));
      expect(
        screen.getByRole('dialog', {name: 'Labels', hidden: true}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('menu', {name: 'Labels', hidden: true}),
      ).toBeInTheDocument();
    },
  );

  it('a custom trigger with no readable name still gets a dialog, named by the default label', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        footer={<button type="button">Create label</button>}
        renderTrigger={props => (
          <button {...props} type="button" data-testid="bare" />
        )}>
        <DropdownMenuItem label="Bug" />
      </DropdownMenu>,
    );
    await user.click(screen.getByTestId('bare'));
    const dialog = screen.getByRole('dialog', {hidden: true});
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.getAttribute('aria-label')?.trim()).not.toBe('');
  });

  describe('with a radio group in the header', () => {
    async function openWithRadios(checked: string | null) {
      const user = userEvent.setup();
      render(
        <DropdownMenu
          button={{label: 'Labels'}}
          header={
            <fieldset>
              {['Name', 'Date', 'Size'].map(option => (
                <input
                  key={option}
                  type="radio"
                  name="sort"
                  aria-label={option}
                  defaultChecked={option === checked}
                />
              ))}
            </fieldset>
          }
          footer={<button type="button">Create label</button>}>
          <DropdownMenuItem label="Bug" />
        </DropdownMenu>,
      );
      await user.click(screen.getByRole('button', {name: /Labels/}));
      const menu = screen.getByRole('menu', {name: 'Labels', hidden: true});
      await waitFor(() => expect(menu).toHaveFocus());
      const radio = (name: string) =>
        screen.getByRole('radio', {name, hidden: true});
      const create = screen.getByRole('button', {
        name: 'Create label',
        hidden: true,
      });
      return {menu, radio, create};
    }

    it('Shift+Tab from the menu lands on the checked radio, and Tab leaves the group in one step', async () => {
      const {menu, radio} = await openWithRadios('Date');
      fireEvent.keyDown(menu, {key: 'Tab', shiftKey: true});
      expect(radio('Date')).toHaveFocus();
      fireEvent.keyDown(radio('Date'), {key: 'Tab'});
      expect(menu).toHaveFocus();
    });

    it('Tab wrapping past the footer lands on the checked radio', async () => {
      const {radio, create} = await openWithRadios('Size');
      act(() => create.focus());
      fireEvent.keyDown(create, {key: 'Tab'});
      expect(radio('Size')).toHaveFocus();
    });

    it('with none checked, the group is entered at its first radio forward and its last backward', async () => {
      const {menu, radio, create} = await openWithRadios(null);
      fireEvent.keyDown(menu, {key: 'Tab', shiftKey: true});
      expect(radio('Size')).toHaveFocus();
      act(() => create.focus());
      fireEvent.keyDown(create, {key: 'Tab'});
      expect(radio('Name')).toHaveFocus();
      fireEvent.keyDown(radio('Name'), {key: 'Tab', shiftKey: true});
      expect(create).toHaveFocus();
    });
  });

  it('without a header or footer, there is no dialog and the trigger points at the menu', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Item 1" />
      </DropdownMenu>,
    );
    const trigger = screen.getByRole('button', {name: /Actions/});
    await user.click(trigger);
    const menu = screen.getByRole('menu', {name: 'Actions', hidden: true});
    expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
  });

  it('leaves keys typed in the header to the field', async () => {
    const {user} = await open();
    const field = screen.getByRole('textbox', {
      name: 'Filter labels',
      hidden: true,
    });
    await user.click(field);
    await user.keyboard('bug');
    expect(field).toHaveValue('bug');
    expect(field).toHaveFocus();
  });

  it('a footer button acts on its own click and the menu stays open', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<LabelsMenu onCreate={onCreate} />);
    const trigger = screen.getByRole('button', {name: /Labels/});
    await user.click(trigger);
    await user.click(
      screen.getByRole('button', {name: 'Create label', hidden: true}),
    );
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('without a header or footer, Tab still closes and the menu stays out of the Tab order', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Item 1" />
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const menu = screen.getByRole('menu', {hidden: true});
    expect(menu).toHaveAttribute('tabindex', '-1');
    expect(menu.parentElement?.closest('[role="menu"]')).toBeNull();
    fireEvent.keyDown(menu, {key: 'Tab'});
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });

  it('a false or empty region renders no wrapper', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}} header={false} footer="">
        <DropdownMenuItem label="Item 1" />
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const menu = screen.getByRole('menu', {hidden: true});
    expect(menu).toHaveAttribute('tabindex', '-1');
  });

  it('renders the regions above and below the actions in the bottom sheet', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Labels'}}
        presentation="bottom-sheet"
        header={<input aria-label="Filter labels" />}
        footer={<button type="button">Create label</button>}
        items={[{label: 'Bug'}, {label: 'Feature'}]}
      />,
    );
    await user.click(screen.getByRole('button', {name: /Labels/}));
    const sheet = screen.getByRole('dialog', {name: 'Labels'});
    const field = screen.getByRole('textbox', {name: 'Filter labels'});
    const bug = screen.getByRole('button', {name: 'Bug'});
    const create = screen.getByRole('button', {name: 'Create label'});
    expect(sheet).toContainElement(field);
    expect(sheet).toContainElement(create);
    expect(
      field.compareDocumentPosition(bug) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      bug.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
