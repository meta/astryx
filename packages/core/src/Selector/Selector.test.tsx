// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.test.tsx
 * @input Uses vitest, @testing-library/react, @testing-library/user-event
 * @output Unit tests for Selector behavior and selected-item geometry
 * @position Tests; validates Selector behavior
 *
 * SYNC: When Selector.tsx API changes, update these tests.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {useState} from 'react';
import type {ReactNode} from 'react';
import {Selector} from './Selector';
import {SelectorOption} from './SelectorOption';
import {Item} from '../Item';
import type {SelectorOptionData} from './types';
import {Icon} from '../Icon';
import {RadioIndicator} from '../Indicator';
import {InputGroup, InputGroupText} from '../InputGroup';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import {InternationalizationProvider} from '../i18n';
import {defineTheme} from '../theme/defineTheme';
import {Theme} from '../theme/Theme';
import {generateThemeCSS} from '../theme/generateThemeRules';
import {colorVars, spacingVars} from '../theme/tokens.stylex';
import {selectorPresentationStyles} from './selectorPresentation.stylex';
import {groupStyles} from '../InputGroup/groupStyles';
import {COMPACT_TOUCH_PRESENTATION_QUERY} from '../hooks/useAdaptivePresentation';

/**
 * Enters a search query as one change. Typing it key by key can land several
 * keystrokes in one frame, whose result announcements are then joined into
 * one (spec:AST-086 FR9), so a test of what one query announces pastes it.
 */
async function enterQuery(
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLElement,
  query: string,
): Promise<void> {
  await user.click(input);
  await user.paste(query);
}

function generateThemeTestCSS(theme: Parameters<typeof generateThemeCSS>[0]) {
  const {prose, component} = generateThemeCSS(theme);
  return [prose, component].filter(Boolean).join('\n\n');
}

// Mock showPopover and hidePopover methods since they're not implemented in jsdom
beforeEach(() => {
  // The live regions are a document-level singleton; start each test clean.
  __resetLiveRegionsForTest();
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

afterEach(() => {
  __resetLiveRegionsForTest();
});

// Helper: jsdom popover content is in the DOM but may not be
// "visible" in the accessibility tree. Use hidden: true to find it.
const h = {hidden: true} as const;

const OPTIONS = ['Apple', 'Banana', 'Cherry'];

// Mirrors useTypeahead's default resetMs — how long the typed buffer survives.
const TYPEAHEAD_RESET_MS = 750;

const politeRegion = () =>
  document.querySelector('[data-astryx-live-region="polite"]');

/**
 * Type onto an element with no awaits between keystrokes. Typeahead only
 * accumulates while keys land inside the reset window, so an awaited
 * `user.keyboard` per character would put CI stalls on the critical path.
 */
function type(text: string, element: HTMLElement) {
  for (const key of text) {
    fireEvent.keyDown(element, {key});
  }
}

function rect({
  top,
  bottom,
  left = 0,
  right = 100,
  width = right - left,
  height = bottom - top,
}: {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
  width?: number;
  height?: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    top,
    bottom,
    left,
    right,
    width,
    height,
    toJSON: () => ({}),
  };
}

function mockSelectorRects({
  anchor = rect({top: 160, bottom: 190, height: 30}),
  trigger = rect({top: 160, bottom: 190, height: 30}),
  listbox = rect({top: 190, bottom: 310, height: 120}),
  selectedItem = rect({top: 220, bottom: 250, height: 30}),
  listboxLayoutHeight = listbox.height,
  selectedItemLayoutTop = selectedItem.top - listbox.top,
  selectedItemLayoutHeight = selectedItem.height,
  viewportHeight = 200,
}: {
  anchor?: DOMRect;
  trigger?: DOMRect;
  listbox?: DOMRect;
  selectedItem?: DOMRect;
  listboxLayoutHeight?: number;
  selectedItemLayoutTop?: number;
  selectedItemLayoutHeight?: number;
  viewportHeight?: number;
} = {}) {
  const originalGetBoundingClientRect =
    HTMLElement.prototype.getBoundingClientRect;
  const originalInnerHeight = Object.getOwnPropertyDescriptor(
    window,
    'innerHeight',
  );
  const originalOffsetTop = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetTop',
  );
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight',
  );
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('astryx-selector')) {
      return anchor;
    }
    // The trigger is role="combobox" by default, or a plain button with
    // aria-haspopup="listbox" in hasSearch mode — match either.
    if (
      this.getAttribute('role') === 'combobox' ||
      this.getAttribute('aria-haspopup') === 'listbox'
    ) {
      return trigger;
    }
    if (this.getAttribute('role') === 'listbox') {
      return listbox;
    }
    if (this.id.endsWith('-item-1')) {
      return selectedItem;
    }
    return originalGetBoundingClientRect.call(this);
  };
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get() {
      if (this.getAttribute('role') === 'listbox') {
        return 0;
      }
      if (this.id.endsWith('-item-1')) {
        return selectedItemLayoutTop;
      }
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      if (this.getAttribute('role') === 'listbox') {
        return listboxLayoutHeight;
      }
      if (this.id.endsWith('-item-1')) {
        return selectedItemLayoutHeight;
      }
      return 0;
    },
  });
  Object.defineProperty(window, 'innerHeight', {
    value: viewportHeight,
    configurable: true,
  });
  return () => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    if (originalOffsetTop) {
      Object.defineProperty(
        HTMLElement.prototype,
        'offsetTop',
        originalOffsetTop,
      );
    }
    if (originalOffsetHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        'offsetHeight',
        originalOffsetHeight,
      );
    }
    if (originalInnerHeight) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    }
  };
}

/** A busy control's Spinner is decorative and silent (spec:AST-086 FR8). */
function expectSilentBusySpinner() {
  const spinner = document.querySelector('.astryx-spinner');
  expect(spinner).not.toBeNull();
  expect(spinner).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('status', {name: 'Loading'})).toBeNull();
}

describe('Selector', () => {
  it('uses a bottom sheet and closes after a selection when requested', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        onChange={onChange}
        presentation="bottom-sheet"
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    expect(
      await screen.findByRole('dialog', {name: 'Fruit'}),
    ).toBeInTheDocument();
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();

    await user.click(screen.getByRole('option', {name: /Banana/}));
    expect(onChange).toHaveBeenCalledWith('Banana');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('restores touch focus without painting a trigger focus ring', async () => {
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        onChange={() => {}}
        presentation="bottom-sheet"
      />,
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.pointerDown(trigger, {pointerType: 'touch'});
    fireEvent.click(trigger, {detail: 1});
    const option = await screen.findByRole('option', {name: /Banana/});
    fireEvent.pointerDown(option, {pointerType: 'touch'});
    fireEvent.click(option, {detail: 1});

    trigger.focus();
    expect(trigger).toHaveFocus();
    expect(trigger.parentElement).toHaveClass(
      stylex.props(selectorPresentationStyles.pointerRestoredFocus).className!,
    );
  });

  it('shows no disabled focus ring after a pointer pick (spec:AST-085 FR6)', async () => {
    const field = (isDisabled: boolean) => (
      <Selector
        label="Fruit"
        options={OPTIONS}
        onChange={() => {}}
        presentation="bottom-sheet"
        isDisabled={isDisabled}
      />
    );
    const {rerender} = render(field(false));
    const trigger = screen.getByRole('combobox');
    fireEvent.pointerDown(trigger, {pointerType: 'touch'});
    fireEvent.click(trigger, {detail: 1});
    const option = await screen.findByRole('option', {name: /Banana/});
    fireEvent.pointerDown(option, {pointerType: 'touch'});
    fireEvent.click(option, {detail: 1});
    rerender(field(true));

    const ring = stylex
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
    const wrapper = screen.getByRole('combobox').parentElement!;
    expect(wrapper).toHaveClass(
      stylex.props(selectorPresentationStyles.pointerRestoredFocus).className!,
    );
    expect(wrapper).not.toHaveClass(ring);
  });

  it('uses content-hugging height without extra bottom content padding', () => {
    const source = readFileSync(
      'packages/core/src/Selector/SelectorBottomSheet.tsx',
      'utf8',
    );

    expect(source).toContain('height="hug"');
    expect(source).toContain('paddingBlockStart={4}');
    expect(source).toContain('paddingBlockEnd={0}');
  });

  it('moves keyboard focus into a bottom-sheet listbox', async () => {
    const user = userEvent.setup();
    render(
      <Selector label="Fruit" options={OPTIONS} presentation="bottom-sheet" />,
    );

    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByRole('listbox')).toHaveFocus());
  });

  it('uses a bottom sheet for adaptive presentation on compact touch', async () => {
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
      <Selector label="Fruit" options={OPTIONS} presentation="adaptive" />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(
      await screen.findByRole('dialog', {name: 'Fruit'}),
    ).toBeInTheDocument();
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
  });

  it('keeps adaptive presentation anchored without compact touch', async () => {
    const user = userEvent.setup();
    render(
      <Selector label="Fruit" options={OPTIONS} presentation="adaptive" />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledOnce();
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  it('renders with placeholder when no value', () => {
    render(<Selector label="Fruit" options={OPTIONS} placeholder="Pick one" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Pick one');
  });

  it('renders selected value label', () => {
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Banana');
  });

  it('draws the selected mark through the check indicator', () => {
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
      />,
    );

    const selected = screen.getByRole('option', {name: /Banana/, hidden: true});
    // The default check indicator IS the glyph — no wrapper element, so the
    // host's theme target sits on the same node as astryx-icon.
    const mark = selected.querySelector('.astryx-selector-check');
    expect(mark).not.toBeNull();
    expect(mark).toHaveClass('astryx-icon');
  });

  it('lets a theme replace the mark with a radio, which draws when unselected too', () => {
    // The point of the indicator layer: one theme entry, and every
    // single-selection mark becomes a radio — including the empty circle on
    // rows that are NOT selected, which a check-only mark never drew.
    const theme = defineTheme({
      name: 'selector-radio-mark-test',
      indicators: {check: RadioIndicator},
    });

    render(
      <Theme theme={theme}>
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
        />
      </Theme>,
    );

    const options = screen.getAllByRole('option', {hidden: true});
    expect(options.length).toBeGreaterThan(1);

    // Every row has a radio, selected or not.
    for (const option of options) {
      expect(option.querySelector('.astryx-radio-indicator')).not.toBeNull();
    }

    // And exactly the selected one is filled.
    const filled = options.filter(
      o => o.querySelector('.astryx-radio-indicator-dot') != null,
    );
    expect(filled).toHaveLength(1);
    expect(filled[0]).toHaveTextContent('Banana');
  });

  it('renders custom option endContent', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Role"
        options={[{value: 'admin', label: 'Admin'}]}
        value={undefined}
        onChange={() => {}}
        renderOption={option => (
          <SelectorOption
            label={option.label}
            endContent={<span data-testid="option-badge">Owner</span>}
          />
        )}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByTestId('option-badge')).toHaveTextContent('Owner');
  });

  it('exposes the popup as a listbox, not a modal dialog', () => {
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
      />,
    );
    // The combobox trigger keeps DOM focus; the popup must expose its own
    // role="listbox" and must not be wrapped in a role="dialog" aria-modal
    // element, which would tell AT the focused trigger is inert.
    expect(screen.getByRole('listbox', {hidden: true})).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', {hidden: true}),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[aria-modal="true"]'),
    ).not.toBeInTheDocument();
  });

  it('supports explicit menu placement', () => {
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
        placement="above"
      />,
    );
    const popover = screen
      .getByRole('listbox', {hidden: true})
      .closest('[popover]');
    expect(popover?.getAttribute('style')).toContain(
      'position-area: self-block-start span-self-inline-end',
    );
  });

  it('emits the direction-independent logical mapping under an RTL ancestor (#3389)', async () => {
    // The self-* position-area keywords resolve against the popover's own
    // inherited direction in the browser, so RTL emits the same string as
    // LTR and the mirroring is pure CSS — jsdom can only assert the string.
    const user = userEvent.setup();
    render(
      <div style={{direction: 'rtl'}}>
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
        />
      </div>,
    );

    await user.click(screen.getByRole('combobox'));

    const popover = screen
      .getByRole('listbox', {hidden: true})
      .closest('[popover]');
    expect(popover?.getAttribute('style')).toContain(
      'position-area: self-block-end span-self-inline-end',
    );
  });

  it('clamps the default selected-item overlay to the viewport', async () => {
    const restoreRects = mockSelectorRects();
    const user = userEvent.setup();
    try {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
        />,
      );

      await user.click(screen.getByRole('combobox'));
      const popover = screen
        .getByRole('listbox', {hidden: true})
        .closest('[popover]');
      await waitFor(() => {
        expect(popover?.getAttribute('style')).toContain(
          'margin-block-start: -110px',
        );
      });
    } finally {
      restoreRects();
    }
  });

  it('aligns the selected item using untransformed layout geometry', async () => {
    const restoreRects = mockSelectorRects({
      anchor: rect({top: 160, bottom: 192, height: 32}),
      trigger: rect({top: 166, bottom: 186, height: 20}),
      // Simulate the 0.95 entry scale in visual rects while retaining the
      // untransformed 120px list / 36px item offset used for positioning.
      listbox: rect({top: 190, bottom: 304, height: 114}),
      selectedItem: rect({
        top: 224.2,
        bottom: 254.6,
        height: 30.4,
      }),
      listboxLayoutHeight: 120,
      selectedItemLayoutTop: 36,
      selectedItemLayoutHeight: 32,
      viewportHeight: 900,
    });
    const user = userEvent.setup();
    try {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
        />,
      );

      await user.click(screen.getByRole('combobox'));
      const popover = screen
        .getByRole('listbox', {hidden: true})
        .closest('[popover]');
      await waitFor(() => {
        // 68px geometric alignment plus the 1px optical correction.
        expect(popover?.getAttribute('style')).toContain(
          'margin-block-start: -69px',
        );
      });
    } finally {
      restoreRects();
    }
  });

  it('adds the border inset only to input-variant dropdowns', async () => {
    const user = userEvent.setup();
    const {unmount} = render(
      <Selector
        label="Input fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const inputDropdownClass = screen.getByRole('listbox', h).className;
    unmount();

    const ghostRender = render(
      <Selector
        label="Ghost fruit"
        options={OPTIONS}
        value="Banana"
        variant="ghost"
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const ghostDropdownClass = screen.getByRole('listbox', h).className;
    ghostRender.unmount();

    render(
      <Selector
        label="Secondary fruit"
        options={OPTIONS}
        value="Banana"
        variant="secondary"
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const secondaryDropdownClass = screen.getByRole('listbox', h).className;

    // The bordered input gets one extra StyleX rule for its border-width
    // correction; the borderless secondary/ghost keep the base menu inset.
    expect(inputDropdownClass).not.toBe(ghostDropdownClass);
    expect(secondaryDropdownClass).toBe(ghostDropdownClass);
  });

  it('does not apply selected-item overlay offset when placement is explicit', async () => {
    const restoreRects = mockSelectorRects();
    const user = userEvent.setup();
    try {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
          placement="above"
        />,
      );

      await user.click(screen.getByRole('combobox'));
      const popover = screen
        .getByRole('listbox', {hidden: true})
        .closest('[popover]');
      await waitFor(() => {
        expect(popover?.getAttribute('style')).not.toContain(
          'margin-block-start',
        );
      });
    } finally {
      restoreRects();
    }
  });

  describe('menu clearance', () => {
    it('clears the trigger by the standard menu offset when placement is explicit', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
          placement="above"
        />,
      );

      await user.click(screen.getByRole('combobox'));
      const popover = screen
        .getByRole('listbox', {hidden: true})
        .closest('[popover]') as HTMLElement;
      // The clearance rides the edge facing the trigger — the block end for
      // placement="above" — and a position-try flip carries it to the other
      // side with the area, so the gap survives the flip (#4803).
      await waitFor(() => {
        expect(popover.style.getPropertyValue('--x-marginBlockEnd')).toBe(
          spacingVars['--spacing-1'],
        );
      });
      expect(popover.style.getPropertyValue('--x-marginBlockStart')).toBe('');
    });

    it('clears the trigger in search mode', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
          hasSearch
        />,
      );

      // In hasSearch mode the trigger is a plain button, not a combobox.
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      const popover = screen
        .getByRole('listbox', {hidden: true})
        .closest('[popover]') as HTMLElement;
      await waitFor(() => {
        expect(popover.style.getPropertyValue('--x-marginBlockStart')).toBe(
          spacingVars['--spacing-1'],
        );
      });
    });

    it('stays flush in the default selected-item overlay', async () => {
      const restoreRects = mockSelectorRects();
      const user = userEvent.setup();
      try {
        render(
          <Selector
            label="Fruit"
            options={OPTIONS}
            value="Banana"
            onChange={() => {}}
          />,
        );

        await user.click(screen.getByRole('combobox'));
        const popover = screen
          .getByRole('listbox', {hidden: true})
          .closest('[popover]') as HTMLElement;
        await waitFor(() => {
          expect(popover.getAttribute('style')).toContain(
            'margin-block-start: -110px',
          );
        });
        expect(popover.style.getPropertyValue('--x-marginBlockStart')).toBe('');
        expect(popover.style.getPropertyValue('--x-marginBlockEnd')).toBe('');
      } finally {
        restoreRects();
      }
    });
  });

  describe('hasClear', () => {
    it('shows selected value label when hasClear is enabled', () => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
          hasClear
        />,
      );
      expect(screen.getByRole('combobox')).toHaveTextContent('Banana');
    });

    it('shows clear button when hasClear is true and value is selected', () => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
          hasClear
        />,
      );
      expect(
        screen.getByRole('button', {name: 'Clear Fruit'}),
      ).toBeInTheDocument();
    });

    it('does not show clear button when value is null', () => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value={null}
          onChange={() => {}}
          hasClear
        />,
      );
      expect(
        screen.queryByRole('button', {name: 'Clear Fruit'}),
      ).not.toBeInTheDocument();
    });

    it('does not show clear button when hasClear is false', () => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
        />,
      );
      expect(
        screen.queryByRole('button', {name: 'Clear Fruit'}),
      ).not.toBeInTheDocument();
    });

    it('does not show clear button when disabled', () => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
          hasClear
          isDisabled
        />,
      );
      expect(
        screen.queryByRole('button', {name: 'Clear Fruit'}),
      ).not.toBeInTheDocument();
    });

    it('calls onChange with null when clear is clicked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={onChange}
          hasClear
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Clear Fruit'}));
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('returns focus to the trigger when the clear button is activated by keyboard', async () => {
      function Controlled() {
        const [value, setValue] = useState<string | null>('Banana');
        return (
          <Selector
            label="Fruit"
            options={OPTIONS}
            value={value}
            onChange={setValue}
            hasClear
          />
        );
      }
      const user = userEvent.setup();
      render(<Controlled />);
      screen.getByRole('button', {name: 'Clear Fruit'}).focus();
      await user.keyboard('{Enter}');
      expect(
        screen.queryByRole('button', {name: 'Clear Fruit'}),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveFocus();
    });

    it('leaves focus in the search input when the clear button is clicked with the list open', async () => {
      function Controlled() {
        const [value, setValue] = useState<string | null>('Banana');
        return (
          <Selector
            label="Fruit"
            options={OPTIONS}
            value={value}
            onChange={setValue}
            hasClear
            hasSearch
          />
        );
      }
      const user = userEvent.setup();
      render(<Controlled />);
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      const search = screen.getByRole('combobox', {
        name: 'Search options',
        hidden: true,
      });
      search.focus();
      await user.click(screen.getByRole('button', {name: 'Clear Fruit'}));
      expect(
        screen.queryByRole('button', {name: 'Clear Fruit'}),
      ).not.toBeInTheDocument();
      expect(search).toHaveFocus();
    });

    it('clears the value via Delete on the focused trigger', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={onChange}
          hasClear
        />,
      );
      const trigger = screen.getByRole('combobox');
      trigger.focus();
      await user.keyboard('{Delete}');
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('clears the value via Backspace on the focused trigger', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={onChange}
          hasClear
        />,
      );
      const trigger = screen.getByRole('combobox');
      trigger.focus();
      await user.keyboard('{Backspace}');
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('does not clear via Delete when hasClear is not set', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={onChange}
        />,
      );
      const trigger = screen.getByRole('combobox');
      trigger.focus();
      await user.keyboard('{Delete}');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('shows placeholder after clearing', () => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value={null}
          onChange={() => {}}
          hasClear
          placeholder="Select a fruit..."
        />,
      );
      expect(screen.getByRole('combobox')).toHaveTextContent(
        'Select a fruit...',
      );
    });

    it('renders selected label with object options and hasClear', () => {
      render(
        <Selector
          label="Fruit"
          options={[
            {value: 'apple', label: 'Red Apple'},
            {value: 'banana', label: 'Yellow Banana'},
          ]}
          value="banana"
          onChange={() => {}}
          hasClear
        />,
      );
      expect(screen.getByRole('combobox')).toHaveTextContent('Yellow Banana');
    });
  });

  describe('hasSearch', () => {
    it('renders search input when hasSearch is true', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      expect(screen.getByRole('combobox', h)).toBeInTheDocument();
    });

    // The search input's expanded state, popup relationship, and active option
    // are bound to the shared Combobox contract (Selector.combobox.a11y.test.tsx,
    // search-active); this keeps only the Selector-specific wiring.
    it('moves combobox semantics to the list-autocomplete search input (comboboxes-4)', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
        />,
      );
      const triggerBtn = screen.getByRole('button', {name: 'Fruit'});
      // In hasSearch mode the trigger is a plain button, not a combobox.
      expect(triggerBtn).not.toHaveAttribute('role', 'combobox');
      await user.click(triggerBtn);
      const search = screen.getByRole('combobox', h);
      expect(search).toHaveAttribute('aria-autocomplete', 'list');
    });

    it('PageDown/PageUp jump the highlight to the last/first filtered option', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      const search = screen.getByRole('combobox', h);
      // Filter to Apple and Banana so "last" means last *visible* option.
      await user.type(search, 'a');
      const options = screen.getAllByRole('option', h);
      expect(options).toHaveLength(2);
      await user.keyboard('{PageDown}');
      expect(search).toHaveAttribute(
        'aria-activedescendant',
        options[options.length - 1].id,
      );
      await user.keyboard('{PageUp}');
      expect(search).toHaveAttribute('aria-activedescendant', options[0].id);
    });

    it('Home/End move the search caret, not the option highlight', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      const search = screen.getByRole<HTMLInputElement>('combobox', h);
      await user.type(search, 'an');
      expect(search.selectionStart).toBe(2);
      const activeBefore = search.getAttribute('aria-activedescendant');
      // Home/End stay on the input for caret movement (APG editable
      // combobox); the option highlight must not move.
      await user.keyboard('{Home}');
      expect(search.selectionStart).toBe(0);
      expect(search.getAttribute('aria-activedescendant')).toBe(activeBefore);
      await user.keyboard('{End}');
      expect(search.selectionStart).toBe(2);
      expect(search.getAttribute('aria-activedescendant')).toBe(activeBefore);
    });

    it('does not render search input when hasSearch is false', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
        />,
      );
      // hasSearch is false, so the trigger itself is the combobox and there is
      // no separate search input inside the popup.
      await user.click(screen.getByRole('combobox'));
      expect(screen.queryByRole('searchbox', h)).not.toBeInTheDocument();
    });

    it('filters options by search query', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await user.type(screen.getByRole('combobox', h), 'ban');
      const options = screen.getAllByRole('option', h);
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Banana');
    });

    it('shows empty state when no options match', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await user.type(screen.getByRole('combobox', h), 'xyz');
      expect(screen.queryAllByRole('option', h)).toHaveLength(0);
      // Scope to the listbox: the polite live region also announces "No results
      // found", so an unscoped query matches both the visible empty state and
      // the a11y announcement.
      const listbox = screen.getByRole('listbox', h);
      expect(within(listbox).getByText('No results found')).toBeInTheDocument();
    });

    it('empty-state message is not exposed as a listbox child', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await user.type(screen.getByRole('combobox', h), 'xyz');

      // role="listbox" only permits option/group children — the visual
      // empty-state message must be presentational (it is announced through
      // the result-count live region instead).
      const listbox = screen.getByRole('listbox', h);
      const empty = within(listbox).getByText('No results found');
      expect(empty).toHaveAttribute('role', 'presentation');
    });

    it('renders emptySearchText in place of the default message', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
          emptySearchText="Nothing like that here"
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await user.type(screen.getByRole('combobox', h), 'xyz');

      const listbox = screen.getByRole('listbox', h);
      expect(
        within(listbox).getByText('Nothing like that here'),
      ).toBeInTheDocument();
      expect(
        within(listbox).queryByText('No results found'),
      ).not.toBeInTheDocument();
    });

    it('renders emptyText, not emptySearchText, with no options and no query', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={[]}
          onChange={() => {}}
          hasSearch
          emptySearchText="Nothing like that here"
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));

      const listbox = screen.getByRole('listbox', h);
      expect(within(listbox).getByText('No options')).toBeInTheDocument();
      expect(
        within(listbox).queryByText('Nothing like that here'),
      ).not.toBeInTheDocument();
    });

    it('announces emptySearchText, not the catalog default', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
          emptySearchText="Nothing like that here"
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await enterQuery(user, screen.getByRole('combobox', h), 'xyz');

      // The panel message is role="presentation", so the live region is the
      // only thing a screen reader gets — it has to say the same words.
      await waitFor(() =>
        expect(politeRegion()?.textContent).toBe('Nothing like that here'),
      );
    });

    // `emptySearchText` is typed ReactNode, which invites an element — a
    // "no results, create one" row is exactly what a dead end is for. The
    // announcement used to take the prop only when it was a string and
    // announce the catalog default otherwise, so a screen-reader user was
    // told something the sighted user was not reading (`spec:AST-056` AR1).
    it('announces the text of an element emptySearchText', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
          emptySearchText={
            <span>
              Nothing like that here. <a href="/new">Add a fruit</a>
            </span>
          }
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await enterQuery(user, screen.getByRole('combobox', h), 'xyz');

      await waitFor(() =>
        expect(politeRegion()?.textContent).toBe(
          'Nothing like that here. Add a fruit',
        ),
      );
    });

    it('announces the text of an element emptyText', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={[]}
          onChange={() => {}}
          emptyText={
            <span>
              Add a fruit first<span aria-hidden="true"> →</span>
            </span>
          }
        />,
      );
      await user.click(screen.getByRole('combobox', {name: 'Fruit'}));

      // The decorative arrow is hidden from the accessibility tree on screen,
      // so it stays out of the announcement too.
      await waitFor(() =>
        expect(politeRegion()?.textContent).toBe('Add a fruit first'),
      );
    });

    it('announces text a child component renders, which is only in the DOM', async () => {
      const user = userEvent.setup();
      // The words exist nowhere in the node the caller passed — they are
      // produced inside this component's own render. Reading the DOM after
      // render is what makes them announceable.
      function Message() {
        return <span>Nothing like that here</span>;
      }
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
          emptySearchText={<Message />}
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await enterQuery(user, screen.getByRole('combobox', h), 'xyz');

      await waitFor(() =>
        expect(politeRegion()?.textContent).toBe('Nothing like that here'),
      );
    });

    it('announces an empty result that arrives after the keystroke', async () => {
      const user = userEvent.setup();
      // The query is typed while the options are still loading, so the
      // keystroke-time announcement cannot know the outcome. When the load
      // lands with nothing that matches, the message appears on screen and
      // the region has to say so too.
      //
      // The load lands through a rerender rather than a click on something
      // outside the panel: a real browser light-dismisses the panel on any
      // outside click, and a closed panel is a different scenario. jsdom
      // implements no light dismiss, so a button would pass here while
      // modelling something that cannot happen.
      function Deferred({loaded}: {loaded: boolean}) {
        return (
          <Selector
            label="Fruit"
            options={loaded ? OPTIONS : []}
            onChange={() => {}}
            hasSearch
            isLoading={!loaded}
            isDefaultOpen
            emptySearchText="Nothing like that here"
          />
        );
      }
      const {rerender} = render(<Deferred loaded={false} />);

      await enterQuery(user, screen.getByRole('combobox', h), 'xyz');
      // Loading: the panel shows nothing, so the region claims nothing.
      expect(politeRegion()?.textContent ?? '').toBe('');

      rerender(<Deferred loaded />);

      await waitFor(() =>
        expect(politeRegion()?.textContent).toBe('Nothing like that here'),
      );
    });

    it('announces the empty state when opened with no options', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={[]}
          onChange={() => {}}
          emptyText="Add a fruit first"
        />,
      );
      await user.click(screen.getByRole('combobox', {name: 'Fruit'}));

      await waitFor(() =>
        expect(politeRegion()?.textContent).toBe('Add a fruit first'),
      );
    });

    it('shows and announces nothing while isLoading', async () => {
      const user = userEvent.setup();
      render(
        <Selector label="Fruit" options={[]} onChange={() => {}} isLoading />,
      );
      const trigger = screen.getByRole('combobox', {name: 'Fruit'});
      expectSilentBusySpinner();

      await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      // useAnnounce writes on the next animation frame, so an immediate read
      // would pass whether or not anything was announced.
      await act(
        async () =>
          void (await new Promise(resolve => requestAnimationFrame(resolve))),
      );

      // The options have not arrived, so "No options" would be a claim the
      // component cannot make; the trigger's spinner carries the state.
      const listbox = screen.getByRole('listbox', h);
      expect(within(listbox).queryByText('No options')).not.toBeInTheDocument();
      // Only the busy start is spoken (spec:AST-086 FR8), never an empty or
      // no-results message the panel is suppressing.
      // (The channel clears its text on a timer, so it may already be empty.)
      expect(['', 'Loading']).toContain(politeRegion()?.textContent ?? '');
    });

    it('announces nothing while isLoading, matching the silent panel', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
          isLoading
          emptySearchText="Nothing like that here"
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await user.type(screen.getByRole('combobox', h), 'xyz');

      // useAnnounce writes on the next animation frame, so an immediate read
      // would pass whether or not anything was announced.
      await act(
        async () =>
          void (await new Promise(resolve => requestAnimationFrame(resolve))),
      );

      // The panel is deliberately blank while loading; the live region is the
      // only channel left, so a result there would be a claim the screen
      // refuses to make.
      const listbox = screen.getByRole('listbox', h);
      expect(
        within(listbox).queryByText('Nothing like that here'),
      ).not.toBeInTheDocument();
      // Only the busy start is spoken (spec:AST-086 FR8), never an empty or
      // no-results message the panel is suppressing.
      // (The channel clears its text on a timer, so it may already be empty.)
      expect(['', 'Loading']).toContain(politeRegion()?.textContent ?? '');
    });

    it('announces the seeded query from type-to-open', async () => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
          emptySearchText="Nothing like that here"
        />,
      );
      // Typing on the closed trigger opens the popup and seeds the query. That
      // path bypasses the search input's own change handler, so it has to
      // announce for itself.
      const trigger = screen.getByRole('button', {name: 'Fruit'});
      trigger.focus();
      fireEvent.keyDown(trigger, {key: 'z'});

      await waitFor(() =>
        expect(politeRegion()?.textContent).toBe('Nothing like that here'),
      );
    });

    it('announces the empty state when a load finishes with no options', async () => {
      const user = userEvent.setup();
      function Fetching() {
        const [isLoading, setIsLoading] = useState(true);
        return (
          <>
            <button type="button" onClick={() => setIsLoading(false)}>
              land
            </button>
            <Selector
              label="Fruit"
              options={[]}
              onChange={() => {}}
              isLoading={isLoading}
              emptyText="Add a fruit first"
            />
          </>
        );
      }
      render(<Fetching />);
      await user.click(screen.getByRole('combobox', {name: 'Fruit'}));

      // Open while loading: nothing on screen, nothing spoken.
      await act(
        async () =>
          void (await new Promise(resolve => requestAnimationFrame(resolve))),
      );
      // Only the busy start is spoken (spec:AST-086 FR8), never an empty or
      // no-results message the panel is suppressing.
      // (The channel clears its text on a timer, so it may already be empty.)
      expect(['', 'Loading']).toContain(politeRegion()?.textContent ?? '');

      // The fetch lands empty while the panel is open. The message appears, so
      // the region owes the same words — an open-only announcement misses this.
      await user.click(screen.getByRole('button', {name: 'land'}));
      await waitFor(() =>
        expect(politeRegion()?.textContent).toBe('Add a fruit first'),
      );
    });

    it('renders emptyText when there are no options and no search input', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={[]}
          onChange={() => {}}
          emptyText="Add a fruit first"
        />,
      );
      // Without hasSearch the trigger itself is the combobox.
      await user.click(screen.getByRole('combobox', {name: 'Fruit'}));

      const listbox = screen.getByRole('listbox', h);
      expect(
        within(listbox).getByText('Add a fruit first'),
      ).toBeInTheDocument();
    });

    it('calls onChange when selecting a filtered option', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={onChange}
          hasSearch
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await user.type(screen.getByRole('combobox', h), 'ban');
      await user.click(screen.getByRole('option', {name: /Banana/, ...h}));
      expect(onChange).toHaveBeenCalledWith('Banana');
    });

    it('closes the search dropdown on Tab without preventing default focus movement', async () => {
      const user = userEvent.setup();
      render(
        <>
          <Selector
            label="Fruit"
            options={OPTIONS}
            value="Apple"
            onChange={() => {}}
            hasSearch
          />
          <button type="button">Next</button>
        </>,
      );

      // In hasSearch mode the trigger is a plain button (the popup's search
      // input is the combobox); it still owns aria-expanded.
      const trigger = screen.getByRole('button', {name: 'Fruit'});
      await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      await user.keyboard('{Tab}');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('uses custom search placeholder', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasSearch
          searchPlaceholder="Find a fruit..."
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      expect(
        screen.getByPlaceholderText('Find a fruit...'),
      ).toBeInTheDocument();
    });

    it('does not select the highlighted option on a composing Enter (IME)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          onChange={onChange}
          hasSearch
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      const search = screen.getByRole('combobox', h);
      // Filter to Banana and highlight it so an unguarded Enter would commit a
      // selection.
      await user.type(search, 'ban');
      await user.keyboard('{ArrowDown}');
      expect(search).toHaveAttribute('aria-activedescendant');

      // The browser fires this composing keydown for the Enter that commits an
      // IME candidate (isComposing: true, or the legacy keyCode 229) before
      // compositionend writes the syllable. It must NOT be read as "select the
      // highlighted option".
      fireEvent.keyDown(search, {key: 'Enter', isComposing: true});
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.keyDown(search, {key: 'Enter', keyCode: 229});
      expect(onChange).not.toHaveBeenCalled();

      // A real, non-composing Enter still selects the highlighted option.
      fireEvent.keyDown(search, {key: 'Enter'});
      expect(onChange).toHaveBeenCalledWith('Banana');
    });

    describe('result announcements', () => {
      it('announces the match count politely while searching', async () => {
        const user = userEvent.setup();
        render(
          <InternationalizationProvider
            locale="fr"
            overrides={{
              fr: {
                '@astryx.selector.resultCount':
                  '{count, number} {count, plural, one {résultat} other {résultats}}',
              },
            }}>
            <Selector
              label="Fruit"
              options={OPTIONS}
              value="Apple"
              onChange={() => {}}
              hasSearch
            />
          </InternationalizationProvider>,
        );
        await user.click(screen.getByRole('button', {name: 'Fruit'}));
        // "a" matches Apple and Banana.
        await user.type(screen.getByRole('combobox', h), 'a');
        await waitFor(() => {
          // The plural branch of a message no catalog supplies.
          expect(politeRegion()?.textContent).toBe('2 résultats');
        });
      });

      it('announces the singular form when one option matches', async () => {
        const user = userEvent.setup();
        render(
          <InternationalizationProvider
            locale="fr"
            overrides={{
              fr: {
                '@astryx.selector.resultCount':
                  '{count, number} {count, plural, one {résultat} other {résultats}}',
              },
            }}>
            <Selector
              label="Fruit"
              options={OPTIONS}
              value="Apple"
              onChange={() => {}}
              hasSearch
            />
          </InternationalizationProvider>,
        );
        await user.click(screen.getByRole('button', {name: 'Fruit'}));
        // "ban" matches only Banana. Exact, so "1 résultats" would fail.
        await enterQuery(user, screen.getByRole('combobox', h), 'ban');
        await waitFor(() => {
          expect(politeRegion()?.textContent).toBe('1 résultat');
        });
      });

      it('announces the empty-results message when nothing matches', async () => {
        const user = userEvent.setup();
        render(
          <InternationalizationProvider
            locale="fr"
            overrides={{
              fr: {'@astryx.selector.emptySearchResults': 'Aucun résultat'},
            }}>
            <Selector
              label="Fruit"
              options={OPTIONS}
              value="Apple"
              onChange={() => {}}
              hasSearch
            />
          </InternationalizationProvider>,
        );
        await user.click(screen.getByRole('button', {name: 'Fruit'}));
        await enterQuery(user, screen.getByRole('combobox', h), 'xyz');
        await waitFor(() => {
          expect(politeRegion()?.textContent).toBe('Aucun résultat');
        });
      });

      it('does not announce results until the user searches', async () => {
        const user = userEvent.setup();
        render(
          <Selector
            label="Fruit"
            options={OPTIONS}
            value="Apple"
            onChange={() => {}}
            hasSearch
          />,
        );
        // Popover closed: nothing announced.
        expect(politeRegion()?.textContent ?? '').toBe('');
        // Open with an empty query: still nothing announced.
        await user.click(screen.getByRole('button', {name: 'Fruit'}));
        expect(politeRegion()?.textContent ?? '').toBe('');
      });
    });

    describe('grouped search', () => {
      const GROUPED = [
        {
          type: 'section' as const,
          title: 'Citrus',
          options: [
            {value: 'orange', label: 'Orange'},
            {value: 'lemon', label: 'Lemon'},
          ],
        },
        {
          type: 'section' as const,
          title: 'Berries',
          options: [
            {value: 'strawberry', label: 'Strawberry'},
            {value: 'blueberry', label: 'Blueberry'},
          ],
        },
      ];

      it('keeps the group header above matching items while searching', async () => {
        const user = userEvent.setup();
        render(
          <Selector
            label="Fruit"
            options={GROUPED}
            onChange={() => {}}
            hasSearch
          />,
        );
        await user.click(screen.getByRole('button', {name: 'Fruit'}));
        // "orange" only matches within the Citrus group.
        await user.type(screen.getByRole('combobox', h), 'orange');

        expect(
          screen.getByRole('group', {name: 'Citrus', ...h}),
        ).toBeInTheDocument();
        const options = screen.getAllByRole('option', h);
        expect(options).toHaveLength(1);
        expect(options[0]).toHaveTextContent('Orange');
      });

      it('hides a group whose items have no match', async () => {
        const user = userEvent.setup();
        render(
          <Selector
            label="Fruit"
            options={GROUPED}
            onChange={() => {}}
            hasSearch
          />,
        );
        await user.click(screen.getByRole('button', {name: 'Fruit'}));
        // "berry" only matches items inside the Berries group.
        await user.type(screen.getByRole('combobox', h), 'berry');

        expect(
          screen.getByRole('group', {name: 'Berries', ...h}),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('group', {name: 'Citrus', ...h}),
        ).not.toBeInTheDocument();
        expect(screen.getAllByRole('option', h)).toHaveLength(2);
      });

      it('lands keyboard focus on the correct option after filtering', async () => {
        const user = userEvent.setup();
        render(
          <Selector
            label="Fruit"
            options={GROUPED}
            onChange={() => {}}
            hasSearch
          />,
        );
        await user.click(screen.getByRole('button', {name: 'Fruit'}));
        const search = screen.getByRole('combobox', h);
        // "berry" leaves Strawberry, Blueberry (in that document order).
        await user.type(search, 'berry');
        const options = screen.getAllByRole('option', h);
        expect(options.map(o => o.textContent)).toEqual([
          'Strawberry',
          'Blueberry',
        ]);
        await user.keyboard('{ArrowDown}');
        expect(search).toHaveAttribute('aria-activedescendant', options[0].id);
        await user.keyboard('{ArrowDown}');
        expect(search).toHaveAttribute('aria-activedescendant', options[1].id);
      });

      it('shows the empty state when no group has a match', async () => {
        const user = userEvent.setup();
        render(
          <Selector
            label="Fruit"
            options={GROUPED}
            onChange={() => {}}
            hasSearch
          />,
        );
        await user.click(screen.getByRole('button', {name: 'Fruit'}));
        await user.type(screen.getByRole('combobox', h), 'zzz');
        expect(screen.queryAllByRole('option', h)).toHaveLength(0);
        expect(
          screen.queryByRole('group', {name: 'Citrus', ...h}),
        ).not.toBeInTheDocument();
        const listbox = screen.getByRole('listbox', h);
        expect(
          within(listbox).getByText('No results found'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('keyboard accessibility', () => {
    it('Tab from the open listbox moves focus to the next control', async () => {
      const user = userEvent.setup();
      render(
        <>
          <Selector
            label="Fruit"
            options={OPTIONS}
            value="Apple"
            onChange={() => {}}
          />
          <button type="button">Next</button>
        </>,
      );

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      await user.keyboard('{Tab}');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByRole('button', {name: 'Next'})).toHaveFocus();
    });

    it('trigger is focusable via Tab when enabled', async () => {
      const user = userEvent.setup();
      render(<Selector label="Fruit" options={OPTIONS} />);

      await user.tab();
      expect(screen.getByRole('combobox')).toHaveFocus();
    });

    it('trigger keeps its tab stop when disabled (spec:AST-085 FR1)', () => {
      render(<Selector label="Fruit" options={OPTIONS} isDisabled />);
      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveAttribute('tabIndex', '0');
      expect(trigger).toHaveAttribute('aria-disabled', 'true');
    });

    it('opens the listbox with ArrowDown from a focused trigger', async () => {
      const user = userEvent.setup();
      render(<Selector label="Fruit" options={OPTIONS} />);

      const trigger = screen.getByRole('combobox');
      await user.tab();
      expect(trigger).toHaveFocus();

      await user.keyboard('{ArrowDown}');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('End/Home jump the highlight to the last/first option (non-search)', async () => {
      const user = userEvent.setup();
      render(<Selector label="Fruit" options={OPTIONS} />);

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);
      const options = screen.getAllByRole('option', h);

      await user.keyboard('{End}');
      expect(trigger).toHaveAttribute(
        'aria-activedescendant',
        options[options.length - 1].id,
      );
      await user.keyboard('{Home}');
      expect(trigger).toHaveAttribute('aria-activedescendant', options[0].id);
    });

    it('opens and selects an option with Enter (no mouse)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Selector label="Fruit" options={OPTIONS} onChange={onChange} />);

      await user.tab();
      await user.keyboard('{Enter}'); // open
      await user.keyboard('{ArrowDown}'); // move highlight
      await user.keyboard('{Enter}'); // select

      expect(onChange).toHaveBeenCalled();
    });

    it('clear button is reachable by keyboard', () => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={() => {}}
          hasClear
        />,
      );
      const clear = screen.getByRole('button', {name: 'Clear Fruit'});
      expect(clear).not.toHaveAttribute('tabIndex', '-1');
    });

    it('scrolls the highlighted option into view during arrow navigation', async () => {
      const scrollIntoView = vi.fn();
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: scrollIntoView,
      });
      try {
        const user = userEvent.setup();
        const longOptions = Array.from(
          {length: 20},
          (_, i) => `Option ${i + 1}`,
        );
        render(<Selector label="Fruit" options={longOptions} />);

        await user.tab();
        await user.keyboard('{Enter}'); // open
        scrollIntoView.mockClear();
        await user.keyboard('{ArrowDown}'); // move highlight
        await user.keyboard('{ArrowDown}');

        expect(scrollIntoView).toHaveBeenCalledWith({block: 'nearest'});
      } finally {
        delete (HTMLElement.prototype as unknown as {scrollIntoView?: unknown})
          .scrollIntoView;
      }
    });

    it('highlights on hover without scrolling, keyboard still scrolls (#6077)', async () => {
      // Hover must highlight only: scrollIntoView under a stationary pointer
      // moves the next option under it, re-highlighting and scrolling again —
      // a runaway auto-scroll loop with no user input.
      const scrollIntoView = vi.fn();
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: scrollIntoView,
      });
      try {
        const user = userEvent.setup();
        const longOptions = Array.from(
          {length: 20},
          (_, i) => `Option ${i + 1}`,
        );
        render(<Selector label="Fruit" options={longOptions} />);

        await user.tab();
        await user.keyboard('{Enter}'); // open
        scrollIntoView.mockClear();

        const options = screen.getAllByRole('option', {hidden: true});
        fireEvent.mouseEnter(options[3]);

        const trigger = screen.getByRole('combobox');
        expect(trigger.getAttribute('aria-activedescendant')).toBe(
          options[3].id,
        );
        expect(scrollIntoView).not.toHaveBeenCalled();

        await user.keyboard('{ArrowDown}');
        expect(scrollIntoView).toHaveBeenCalledWith({block: 'nearest'});
      } finally {
        delete (HTMLElement.prototype as unknown as {scrollIntoView?: unknown})
          .scrollIntoView;
      }
    });
  });

  describe('typeahead', () => {
    it('selects the matching option by typing on the closed trigger', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Selector label="Fruit" options={OPTIONS} onChange={onChange} />);

      await user.tab();
      await user.keyboard('c');

      expect(onChange).toHaveBeenCalledWith('Cherry');
      // Native select parity: the value changes without opening the menu.
      expect(screen.getByRole('combobox')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    it('cycles through options sharing a first letter on repeated presses', async () => {
      const user = userEvent.setup();
      function Harness() {
        const [value, setValue] = useState<string | undefined>(undefined);
        return (
          <Selector
            label="City"
            options={['Austin', 'Chicago', 'Cleveland', 'Columbus']}
            value={value}
            onChange={setValue}
          />
        );
      }
      render(<Harness />);

      await user.tab();
      await user.keyboard('c');
      expect(screen.getByRole('combobox')).toHaveTextContent('Chicago');
      await user.keyboard('c');
      expect(screen.getByRole('combobox')).toHaveTextContent('Cleveland');
      await user.keyboard('c');
      expect(screen.getByRole('combobox')).toHaveTextContent('Columbus');
      // Wraps back around past non-matching options.
      await user.keyboard('c');
      expect(screen.getByRole('combobox')).toHaveTextContent('Chicago');
    });

    it('advances past the current selection on a fresh single-letter press', async () => {
      const user = userEvent.setup();
      function Harness() {
        const [value, setValue] = useState<string | undefined>('Chicago');
        return (
          <Selector
            label="City"
            options={['Austin', 'Chicago', 'Cleveland', 'Columbus']}
            value={value}
            onChange={setValue}
          />
        );
      }
      render(<Harness />);

      const trigger = screen.getByRole('combobox');
      await user.tab();
      // Native select parity: the selected option's own initial moves on to
      // the next match. Anchoring the search AT the selection instead of after
      // it re-matches the current value, and the duplicate-select guard then
      // swallows the keystroke entirely.
      type('c', trigger);

      expect(trigger).toHaveTextContent('Cleveland');
    });

    it('advances the highlight past the current one with the menu open', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="City"
          options={['Austin', 'Chicago', 'Cleveland', 'Columbus']}
          value="Chicago"
          onChange={() => {}}
        />,
      );

      const trigger = screen.getByRole('combobox');
      await user.tab();
      await user.keyboard('{Enter}'); // opens with the highlight on Chicago
      type('c', trigger);

      const activeId = trigger.getAttribute('aria-activedescendant');
      expect(document.getElementById(activeId ?? '')).toHaveTextContent(
        'Cleveland',
      );
    });

    it('treats a space mid-buffer as part of the match, not as open', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="State"
          options={['New Jersey', 'New York']}
          onChange={onChange}
        />,
      );

      const trigger = screen.getByRole('combobox');
      await user.tab();
      // Synchronous keydowns: the buffer only accumulates while keystrokes
      // land inside the TYPEAHEAD_RESET_MS window, and awaiting between them
      // would put a CI stall on the critical path.
      type('new y', trigger);

      expect(onChange).toHaveBeenLastCalledWith('New York');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens and seeds the search input when typing on a closed hasSearch trigger', async () => {
      const user = userEvent.setup();
      render(<Selector label="Fruit" options={OPTIONS} hasSearch />);

      await user.tab();
      await user.keyboard('c');

      const search = screen.getByPlaceholderText('Search…');
      expect(search).toHaveValue('c');
      await waitFor(() => expect(search).toHaveFocus());
    });

    it('accumulates a multi-character prefix and resets it after the timeout', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      // Controlled: the committed value has to feed back in, or the match
      // anchor stays -1 for the whole test and never gets exercised.
      function Harness() {
        const [value, setValue] = useState<string | undefined>(undefined);
        return (
          <Selector
            label="Fruit"
            options={['Apple', 'Banana', 'Blueberry']}
            value={value}
            onChange={next => {
              setValue(next);
              onChange(next);
            }}
          />
        );
      }
      render(<Harness />);

      const trigger = screen.getByRole('combobox');
      await user.tab();
      type('b', trigger);
      expect(trigger).toHaveTextContent('Banana');
      // Within the window the buffer accumulates: "bl" → Blueberry. A
      // multi-character buffer refines, so it may keep the current match.
      type('l', trigger);
      expect(trigger).toHaveTextContent('Blueberry');

      // Past the window the buffer starts fresh: "a" → Apple. A surviving
      // buffer would search "bla" and match nothing, so only a real reset
      // gets here — worth the one real wait in the suite.
      await new Promise(resolve =>
        setTimeout(resolve, TYPEAHEAD_RESET_MS + 100),
      );
      type('a', trigger);
      expect(trigger).toHaveTextContent('Apple');
    });

    it('skips disabled options when matching', async () => {
      const user = userEvent.setup();
      function Harness() {
        const [value, setValue] = useState<string | undefined>(undefined);
        return (
          <Selector
            label="Fruit"
            options={[{value: 'Cherry', disabled: true}, 'Coconut']}
            value={value}
            onChange={setValue}
          />
        );
      }
      render(<Harness />);

      const trigger = screen.getByRole('combobox');
      await user.tab();
      type('c', trigger);
      expect(trigger).toHaveTextContent('Coconut');

      // The skip has to survive cycling too: with Coconut current, the next
      // press wraps onto the disabled Cherry and must pass over it.
      type('c', trigger);
      expect(trigger).toHaveTextContent('Coconut');
      expect(trigger).not.toHaveTextContent('Cherry');
    });

    it('moves the highlight without committing when typing with the menu open', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="City"
          options={['Austin', 'Chicago', 'Cleveland']}
          onChange={onChange}
        />,
      );

      await user.tab();
      await user.keyboard('{Enter}'); // open
      const trigger = screen.getByRole('combobox');

      await user.keyboard('c');
      let activeId = trigger.getAttribute('aria-activedescendant');
      expect(document.getElementById(activeId ?? '')).toHaveTextContent(
        'Chicago',
      );

      // Repeated press cycles the highlight, still without committing.
      await user.keyboard('c');
      activeId = trigger.getAttribute('aria-activedescendant');
      expect(document.getElementById(activeId ?? '')).toHaveTextContent(
        'Cleveland',
      );
      expect(onChange).not.toHaveBeenCalled();
      // aria-activedescendant already announces each match, so announcing
      // again here would make a screen reader say every match twice.
      // useAnnounce writes its text in a rAF callback, so let a frame pass —
      // asserting before it runs would pass no matter what the code does.
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
      expect(politeRegion()?.textContent ?? '').toBe('');

      await user.keyboard('{Enter}');
      expect(onChange).toHaveBeenCalledWith('Cleveland');
    });

    it('does not fire onChange when the only match is already selected', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Cherry"
          onChange={onChange}
        />,
      );

      await user.tab();
      await user.keyboard('c');

      expect(onChange).not.toHaveBeenCalled();
    });

    it('ignores printable keys pressed with ctrl or meta modifiers', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Selector label="Fruit" options={OPTIONS} onChange={onChange} />);

      await user.tab();
      await user.keyboard('{Control>}c{/Control}{Meta>}b{/Meta}');

      expect(onChange).not.toHaveBeenCalled();
    });

    it('announces the committed option to screen readers', async () => {
      const user = userEvent.setup();
      render(<Selector label="Fruit" options={OPTIONS} onChange={() => {}} />);

      await user.tab();
      await user.keyboard('c');

      // The trigger keeps focus and the menu never opens, so nothing else
      // prompts a re-read. The polite live region carries the new value.
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Cherry');
      });
    });

    it('does not select while focusable-disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          onChange={onChange}
          isDisabled
          disabledMessage="Ask an admin"
        />,
      );

      // aria-disabled keeps the trigger focusable, so keydowns still arrive.
      screen.getByRole('combobox').focus();
      await user.keyboard('c');

      expect(onChange).not.toHaveBeenCalled();
    });

    it('cycles without duplicating changeAction while an action is pending', async () => {
      const user = userEvent.setup();
      const calls: string[] = [];
      render(
        <Selector
          label="City"
          options={['Chicago', 'Cleveland', 'Columbus']}
          value={undefined}
          changeAction={async value => {
            calls.push(value);
            // Never settles, so the value prop never catches up to what the
            // trigger already shows.
            await new Promise<void>(() => {});
          }}
        />,
      );

      const trigger = screen.getByRole('combobox');
      await user.tab();
      type('ccc', trigger);

      // The anchor must come from the optimistic value, not the stale prop.
      // Three options make that observable: with a stale anchor every press
      // re-matches Chicago, which the duplicate guard then swallows.
      expect(calls).toEqual(['Chicago', 'Cleveland', 'Columbus']);
    });

    it('starts a fresh buffer after selecting from the open menu', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="Animal"
          options={['Cat', 'Dog']}
          onChange={onChange}
        />,
      );

      await user.tab();
      await user.keyboard('{Enter}'); // open
      await user.keyboard('d'); // highlight Dog
      await user.keyboard('{Enter}'); // commit Dog, closes
      onChange.mockClear();

      // The stale 'd' must not linger: 'c' is a fresh buffer, not "dc".
      await user.keyboard('c');
      expect(onChange).toHaveBeenCalledWith('Cat');
    });

    it('starts a fresh buffer after the value is cleared', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      function Harness() {
        const [value, setValue] = useState<string | null>('Dog');
        return (
          <Selector
            label="Animal"
            options={['Cat', 'Dog']}
            hasClear
            value={value}
            onChange={next => {
              setValue(next);
              onChange(next);
            }}
          />
        );
      }
      render(<Harness />);

      const trigger = screen.getByRole('combobox');
      await user.tab();
      // Fills the buffer with 'd' without committing — Dog is already current.
      type('d', trigger);
      fireEvent.keyDown(trigger, {key: 'Delete'});
      expect(onChange).toHaveBeenLastCalledWith(null);

      // The stale 'd' must not survive the clear: 'c' is a fresh buffer, not
      // "dc", which would match nothing and leave the value cleared.
      type('c', trigger);
      expect(onChange).toHaveBeenLastCalledWith('Cat');
    });

    it('matches on the label and commits the value', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      // Values deliberately crossed against labels: a native select matches
      // the rendered text and reports the value.
      function Harness() {
        const [value, setValue] = useState<string | undefined>(undefined);
        return (
          <Selector
            label="Fruit"
            options={[
              {value: 'zzz', label: 'Apple'},
              {value: 'apple', label: 'Zebra'},
            ]}
            value={value}
            onChange={next => {
              setValue(next);
              onChange(next);
            }}
          />
        );
      }
      render(<Harness />);

      const trigger = screen.getByRole('combobox');
      await user.tab();
      type('a', trigger);

      expect(onChange).toHaveBeenCalledWith('zzz');
      expect(trigger).toHaveTextContent('Apple');

      // No other label starts with "a" — the option whose *value* is 'apple'
      // is labelled Zebra — so a second press stays put and commits nothing.
      type('a', trigger);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('matches across sections, ignoring dividers and group titles', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="Fruit"
          options={[
            'Almond',
            {type: 'divider'},
            {
              type: 'section',
              title: 'Tropical',
              options: [
                {value: 'mango', label: 'Mango'},
                {value: 'papaya', label: 'Papaya'},
              ],
            },
          ]}
          onChange={onChange}
        />,
      );

      const trigger = screen.getByRole('combobox');
      await user.tab();
      type('p', trigger);
      expect(onChange).toHaveBeenCalledWith('papaya');

      // The section title "Tropical" is decoration, not an option.
      onChange.mockClear();
      type('t', trigger);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('keeps aria-activedescendant on the matched option across a section', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={[
            'Almond',
            {type: 'divider'},
            {
              type: 'section',
              title: 'Berries',
              options: [{value: 'blueberry', label: 'Blueberry'}],
            },
          ]}
          value="Almond"
          onChange={() => {}}
        />,
      );

      const trigger = screen.getByRole('combobox');
      await user.tab();
      await user.keyboard('{Enter}'); // opens on Almond
      type('b', trigger);

      const activeId = trigger.getAttribute('aria-activedescendant');
      expect(document.getElementById(activeId ?? '')).toHaveTextContent(
        'Blueberry',
      );
    });

    it('anchors at the top when the value matches no option', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="Fruit"
          options={['Apple', 'Apricot']}
          value="Durian"
          onChange={onChange}
        />,
      );

      const trigger = screen.getByRole('combobox');
      await user.tab();
      type('a', trigger);

      // Nothing is really selected, so the first match must stay reachable.
      expect(onChange).toHaveBeenCalledWith('Apple');
    });

    it('lets Space open the menu after an abandoned typeahead', async () => {
      const user = userEvent.setup();
      render(<Selector label="Fruit" options={OPTIONS} />);

      const trigger = screen.getByRole('combobox');
      await user.tab();
      await user.keyboard('{Enter}'); // open
      await user.keyboard('z'); // no match; buffer holds "z"
      await user.keyboard('{Escape}'); // close, abandoning the buffer

      // A live "z" buffer would swallow Space as a match character.
      await user.keyboard(' ');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('seeds every character typed before the search input takes focus', async () => {
      const user = userEvent.setup();
      render(<Selector label="Fruit" options={OPTIONS} hasSearch />);

      await user.tab();
      // The popup opens on the first key, but focus only moves to the search
      // input on the next frame — the second key still lands on the trigger.
      await user.keyboard('ch');

      const search = screen.getByPlaceholderText('Search…');
      await waitFor(() => expect(search).toHaveValue('ch'));
    });
  });

  describe('InputGroup integration', () => {
    it('uses the group Field chrome and composes group and selector labels', () => {
      render(
        <InputGroup
          label="Destination"
          description="Where the alert should route"
          status={{type: 'error', message: 'Destination is required'}}>
          <InputGroupText>#</InputGroupText>
          <Selector
            label="Channel"
            isLabelHidden
            options={OPTIONS}
            placeholder="Choose a channel"
          />
        </InputGroup>,
      );

      const group = screen.getByRole('group', {name: 'Destination'});
      const groupLabelID = group.getAttribute('aria-labelledby');
      const trigger = screen.getByRole('combobox', {
        name: 'Destination Channel',
      });
      const labelledByIDs =
        trigger.getAttribute('aria-labelledby')?.split(' ') ?? [];

      expect(labelledByIDs).toHaveLength(2);
      expect(labelledByIDs[0]).toBe(groupLabelID);
      expect(document.getElementById(labelledByIDs[1])).toHaveTextContent(
        'Channel',
      );
      expect(trigger).toHaveAttribute(
        'aria-describedby',
        group.getAttribute('aria-describedby'),
      );
      expect(screen.getByText('#')).toBeInTheDocument();
    });

    it.each(['input', 'secondary'] as const)(
      'gives a grouped %s trigger the connected group geometry in every position',
      variant => {
        const groupClasses = stylex
          .props(groupStyles.inGroup)
          .className!.split(' ');
        const selector = (label: string) => (
          <Selector
            label={label}
            isLabelHidden
            variant={variant}
            options={OPTIONS}
          />
        );
        render(
          <>
            <InputGroup label="First">
              {selector('Channel first')}
              <InputGroupText>#</InputGroupText>
            </InputGroup>
            <InputGroup label="Middle">
              <InputGroupText>#</InputGroupText>
              {selector('Channel middle')}
              <InputGroupText>@</InputGroupText>
            </InputGroup>
            <InputGroup label="Last">
              <InputGroupText>#</InputGroupText>
              {selector('Channel last')}
            </InputGroup>
          </>,
        );

        // The group's row height, seam radii, and focus stacking all come from
        // these classes; their :first-child and last-item selectors resolve the
        // position. A secondary trigger keeps its fill but must not keep its
        // own standalone edges or width.
        for (const position of ['first', 'middle', 'last']) {
          const trigger = screen.getByRole('combobox', {
            name: new RegExp(`Channel ${position}`),
          });
          const box = trigger.closest('.astryx-selector') as HTMLElement;
          const classes = new Set(box.className.split(' '));
          expect(groupClasses.every(c => classes.has(c))).toBe(true);
        }
      },
    );

    it('keeps a standalone secondary trigger out of the group geometry', () => {
      const groupClasses = stylex
        .props(groupStyles.inGroup)
        .className!.split(' ');
      render(
        <Selector label="Channel" variant="secondary" options={OPTIONS} />,
      );
      const box = screen
        .getByRole('combobox')
        .closest('.astryx-selector') as HTMLElement;
      const classes = new Set(box.className.split(' '));
      expect(groupClasses.some(c => classes.has(c))).toBe(false);
    });

    it('keeps disabled reasons described when grouped', () => {
      render(
        <InputGroup label="Destination">
          <InputGroupText>#</InputGroupText>
          <Selector
            label="Channel"
            isLabelHidden
            options={OPTIONS}
            isDisabled
            disabledMessage="Choose a project first"
          />
        </InputGroup>,
      );

      const trigger = screen.getByRole('combobox', {
        name: 'Destination Channel',
      });
      const tooltip = screen.getByRole('tooltip', h);

      expect(trigger).not.toBeDisabled();
      expect(trigger).toHaveAttribute('aria-disabled', 'true');
      expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);
    });
  });

  describe('disabledMessage', () => {
    it('shows the reason tooltip on hover when disabled with a reason', async () => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          isDisabled
          disabledMessage="You need the Editor role"
          data-testid="fruit-selector"
        />,
      );

      // data-testid lands on the trigger; the reason tooltip anchors to the
      // control box around it.
      const container = screen
        .getByTestId('fruit-selector')
        .closest('.astryx-selector') as HTMLElement;
      const tooltip = screen.getByRole('tooltip', h);
      expect(tooltip).toHaveTextContent('You need the Editor role');

      fireEvent.mouseEnter(container);
      await waitFor(() => {
        expect(tooltip).toHaveAttribute('popover-open');
      });

      fireEvent.mouseLeave(container);
      await waitFor(() => {
        expect(tooltip).not.toHaveAttribute('popover-open');
      });
    });

    it('shows the reason tooltip on keyboard focus', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const tooltip = screen.getByRole('tooltip', h);
      await user.tab();
      expect(screen.getByRole('combobox')).toHaveFocus();
      await waitFor(() => {
        expect(tooltip).toHaveAttribute('popover-open');
      });
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          disabledMessage="You need the Editor role"
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(<Selector label="Fruit" options={OPTIONS} isDisabled />);
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the trigger focusable via aria-disabled when a reason is provided', () => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const trigger = screen.getByRole('combobox');
      expect(trigger).not.toBeDisabled();
      expect(trigger).toHaveAttribute('aria-disabled', 'true');
      expect(trigger).toHaveAttribute('tabIndex', '0');
    });

    it('links the reason tooltip from the trigger via aria-describedby', () => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const trigger = screen.getByRole('combobox');
      const tooltip = screen.getByRole('tooltip', h);
      expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks activation while focusable-disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          onChange={onChange}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      await user.keyboard('{Enter}');
      await user.keyboard('{ArrowDown}');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('stays focusable when disabled without a reason (spec:AST-085 FR1)', () => {
      render(<Selector label="Fruit" options={OPTIONS} isDisabled />);
      const trigger = screen.getByRole('combobox');
      expect(trigger).not.toHaveAttribute('disabled');
      expect(trigger).toHaveAttribute('aria-disabled', 'true');
      expect(trigger).toHaveAttribute('tabIndex', '0');
    });
  });
  describe('isReadOnly', () => {
    const readOnlyCases = [
      {presentation: 'popover', hasSearch: false},
      {presentation: 'popover', hasSearch: true},
      {presentation: 'bottom-sheet', hasSearch: false},
      {presentation: 'bottom-sheet', hasSearch: true},
      {presentation: 'adaptive', hasSearch: false},
      {presentation: 'adaptive', hasSearch: true},
    ] as const;

    const sheetTransitionCases = [
      {presentation: 'bottom-sheet', hasSearch: false},
      {presentation: 'bottom-sheet', hasSearch: true},
      {presentation: 'adaptive', hasSearch: false},
      {presentation: 'adaptive', hasSearch: true},
    ] as const;

    const disabledPrecedenceCases = (
      ['popover', 'bottom-sheet', 'adaptive'] as const
    ).flatMap(presentation =>
      [false, true].flatMap(hasSearch =>
        [false, true].map(hasDisabledMessage => ({
          presentation,
          hasSearch,
          hasDisabledMessage,
        })),
      ),
    );

    function stubCompactTouch(presentation: 'bottom-sheet' | 'adaptive') {
      if (presentation !== 'adaptive') {
        return;
      }
      vi.mocked(matchMedia).mockImplementation(
        (query: string) =>
          ({
            matches: query === COMPACT_TOUCH_PRESENTATION_QUERY,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
          }) as MediaQueryList,
      );
    }

    it.each(readOnlyCases)(
      'uses a read-only combobox with no rendered popup ($presentation, search=$hasSearch)',
      async ({presentation, hasSearch}) => {
        const user = userEvent.setup();
        const {container} = render(
          <form>
            <Selector
              label="Fruit"
              htmlName="fruit"
              options={OPTIONS}
              value="Banana"
              onChange={() => {}}
              hasClear
              hasSearch={hasSearch}
              presentation={presentation}
              isDefaultOpen
              isReadOnly
            />
          </form>,
        );

        const trigger = screen.getByRole('combobox', {name: 'Fruit'});
        expect(trigger.tagName).toBe('BUTTON');
        expect(trigger).toHaveTextContent('Banana');
        expect(trigger).toHaveAttribute('aria-readonly', 'true');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        const readOnlyDescription = screen.getByText('Read only');
        expect(trigger.getAttribute('aria-describedby')).toContain(
          readOnlyDescription.id,
        );
        expect(trigger).not.toHaveAttribute('aria-controls');
        expect(trigger).not.toHaveAttribute('aria-haspopup');
        expect(screen.getAllByRole('combobox', h)).toHaveLength(1);
        expect(screen.queryByRole('listbox', h)).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog', h)).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', {name: 'Clear Fruit'}),
        ).not.toBeInTheDocument();
        expect(
          container.querySelector('.astryx-selector-indicator-icon'),
        ).toBeNull();
        expect(container.querySelector('.astryx-selector')).toHaveAttribute(
          'data-readonly',
          'readonly',
        );
        expect(
          new FormData(container.querySelector('form')!).get('fruit'),
        ).toBe('Banana');

        await user.tab();
        expect(trigger).toHaveFocus();
      },
    );

    it('localizes the accessible read-only description', () => {
      render(
        <InternationalizationProvider
          locale="fr"
          overrides={{fr: {'@astryx.input.readOnly': 'Lecture seule'}}}>
          <Selector label="Fruit" options={OPTIONS} value="Banana" isReadOnly />
        </InternationalizationProvider>,
      );

      const trigger = screen.getByRole('combobox', {name: 'Fruit'});
      const description = screen.getByText('Lecture seule');
      expect(trigger.getAttribute('aria-describedby')).toContain(
        description.id,
      );
    });

    it('keeps loading feedback while blocking the selection surface', async () => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          isLoading
          isReadOnly
        />,
      );

      const trigger = screen.getByRole('combobox', {name: 'Fruit'});
      expect(trigger).toHaveAttribute('aria-busy', 'true');
      expectSilentBusySpinner();

      await user.click(trigger);
      expect(screen.queryByRole('listbox', h)).not.toBeInTheDocument();
    });

    it('blocks pointer, keyboard, and typeahead changes', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const changeAction = vi.fn();
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Apple"
          onChange={onChange}
          changeAction={changeAction}
          isReadOnly
        />,
      );

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);
      trigger.focus();
      await user.keyboard('{Enter}{ArrowDown}c{Backspace}');

      expect(screen.queryByRole('listbox', h)).not.toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
      expect(changeAction).not.toHaveBeenCalled();
    });

    it.each([false, true])(
      'restores popover focus when an open selector becomes read-only (search=%s)',
      async hasSearch => {
        const user = userEvent.setup();
        const selector = (isReadOnly: boolean) => (
          <Selector
            label="Fruit"
            options={OPTIONS}
            value="Apple"
            hasSearch={hasSearch}
            isReadOnly={isReadOnly}
          />
        );
        const {rerender} = render(selector(false));
        const editableTrigger = screen.getByRole(
          hasSearch ? 'button' : 'combobox',
          {name: 'Fruit'},
        );
        await user.click(editableTrigger);
        if (hasSearch) {
          await waitFor(() =>
            expect(screen.getByRole('combobox', h)).toHaveFocus(),
          );
        }

        rerender(selector(true));

        const readOnlyTrigger = screen.getByRole('combobox', {name: 'Fruit'});
        await waitFor(() => expect(readOnlyTrigger).toHaveFocus());
        expect(screen.queryByRole('listbox', h)).not.toBeInTheDocument();
      },
    );

    it.each(sheetTransitionCases)(
      'finishes $presentation close and restores focus when read-only changes (search=$hasSearch)',
      async ({presentation, hasSearch}) => {
        stubCompactTouch(presentation);
        const user = userEvent.setup();
        const selector = (isReadOnly: boolean) => (
          <Selector
            label="Fruit"
            options={OPTIONS}
            value="Apple"
            hasSearch={hasSearch}
            presentation={presentation}
            isReadOnly={isReadOnly}
          />
        );
        const {rerender} = render(selector(false));
        const editableTrigger = screen.getByRole(
          hasSearch ? 'button' : 'combobox',
          {name: 'Fruit'},
        );
        await user.click(editableTrigger);
        const dialog = await screen.findByRole('dialog', {name: 'Fruit'});
        const panel = dialog.querySelector<HTMLElement>('.astryx-bottom-sheet');
        expect(panel).not.toBeNull();
        await waitFor(() =>
          expect(
            hasSearch
              ? screen.getByRole('combobox', h)
              : screen.getByRole('listbox'),
          ).toHaveFocus(),
        );

        rerender(selector(true));

        await waitFor(() => expect(dialog).toHaveAttribute('inert'));
        fireEvent.transitionEnd(panel!, {propertyName: 'transform'});
        const readOnlyTrigger = screen.getByRole('combobox', {name: 'Fruit'});
        await waitFor(() => expect(readOnlyTrigger).toHaveFocus());
        expect(screen.queryByRole('dialog', h)).not.toBeInTheDocument();
        expect(screen.queryByRole('listbox', h)).not.toBeInTheDocument();
      },
    );

    it.each(disabledPrecedenceCases)(
      'matches disabled-only semantics for $presentation (search=$hasSearch, reason=$hasDisabledMessage)',
      async ({presentation, hasSearch, hasDisabledMessage}) => {
        if (presentation === 'adaptive') {
          stubCompactTouch(presentation);
        }
        const user = userEvent.setup();
        const onChange = vi.fn();
        const selector = (isReadOnly: boolean) => (
          <form>
            <Selector
              label="Fruit"
              htmlName="fruit"
              options={OPTIONS}
              value="Banana"
              onChange={onChange}
              hasClear
              hasSearch={hasSearch}
              presentation={presentation}
              isDisabled
              isReadOnly={isReadOnly}
              disabledMessage={
                hasDisabledMessage ? 'Locked by policy' : undefined
              }
            />
          </form>
        );
        const {container, rerender} = render(selector(false));
        const getTrigger = () =>
          screen.getByRole(hasSearch ? 'button' : 'combobox', {name: 'Fruit'});
        const snapshot = () => {
          const trigger = getTrigger();
          const root = container.querySelector('.astryx-selector');
          return {
            tagName: trigger.tagName,
            role: trigger.getAttribute('role'),
            hasPopup: trigger.getAttribute('aria-haspopup'),
            expanded: trigger.getAttribute('aria-expanded'),
            controls: trigger.getAttribute('aria-controls'),
            readOnly: trigger.getAttribute('aria-readonly'),
            disabled: trigger.matches(':disabled'),
            ariaDisabled: trigger.getAttribute('aria-disabled'),
            tabIndex: trigger.tabIndex,
            rootClassName: root?.className,
            rootDisabled: root?.getAttribute('data-disabled'),
            rootReadOnly: root?.getAttribute('data-readonly'),
            hasIndicator:
              root?.querySelector('.astryx-selector-indicator-icon') != null,
            listboxes: screen.queryAllByRole('listbox', h).length,
            dialogs: screen.queryAllByRole('dialog', h).length,
            formEntries: [
              ...new FormData(container.querySelector('form')!).entries(),
            ],
          };
        };
        const disabledOnly = snapshot();

        rerender(selector(true));

        expect(snapshot()).toEqual(disabledOnly);
        expect(disabledOnly.rootDisabled).toBe('disabled');
        expect(disabledOnly.rootReadOnly).toBeNull();
        expect(disabledOnly.readOnly).toBeNull();
        expect(disabledOnly.formEntries).toEqual([]);
        const trigger = getTrigger();
        await user.click(trigger);
        trigger.focus();
        await user.keyboard('{Enter}{ArrowDown}c{Backspace}');
        expect(onChange).not.toHaveBeenCalled();
      },
    );
  });

  describe('form participation', () => {
    it('submits the selected value under htmlName', () => {
      const {container} = render(
        <form>
          <Selector
            label="Fruit"
            htmlName="fruit"
            options={OPTIONS}
            value="Banana"
          />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.get('fruit')).toBe('Banana');
    });

    it('submits an empty string when nothing is selected', () => {
      const {container} = render(
        <form>
          <Selector label="Fruit" htmlName="fruit" options={OPTIONS} />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.get('fruit')).toBe('');
    });

    it('is excluded from form data when disabled', () => {
      const {container} = render(
        <form>
          <Selector
            label="Fruit"
            htmlName="fruit"
            options={OPTIONS}
            value="Banana"
            isDisabled
          />
        </form>,
      );
      expect([
        ...new FormData(container.querySelector('form')!).keys(),
      ]).toEqual([]);
    });
  });
});

describe('Selector caller-supplied id', () => {
  it('names the listbox with the id the caller put on the trigger', () => {
    render(<Selector label="Fruit" options={OPTIONS} id="fruit-picker" />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('id', 'fruit-picker');

    const labelledBy = screen
      .getByRole('listbox', h)
      .getAttribute('aria-labelledby');
    expect(document.getElementById(labelledBy!)).toBe(trigger);
  });

  it('names the search-variant listbox with the caller id', () => {
    render(
      <Selector label="Fruit" options={OPTIONS} id="fruit-picker" hasSearch />,
    );

    const trigger = document.getElementById('fruit-picker');
    expect(trigger?.tagName).toBe('BUTTON');

    const labelledBy = screen
      .getByRole('listbox', h)
      .getAttribute('aria-labelledby');
    expect(document.getElementById(labelledBy!)).toBe(trigger);
  });

  it('points the field label at the caller id', () => {
    render(<Selector label="Fruit" options={OPTIONS} id="fruit-picker" />);

    const trigger = screen.getByRole('combobox', {name: 'Fruit'});
    expect(trigger).toHaveAttribute('id', 'fruit-picker');
    expect(screen.getByLabelText('Fruit')).toBe(trigger);
  });

  it('generates the trigger id when the caller supplies none', () => {
    render(<Selector label="Fruit" options={OPTIONS} />);

    const trigger = screen.getByRole('combobox', {name: 'Fruit'});
    expect(trigger.id).not.toBe('');
    expect(screen.getByLabelText('Fruit')).toBe(trigger);

    const labelledBy = screen
      .getByRole('listbox', h)
      .getAttribute('aria-labelledby');
    expect(document.getElementById(labelledBy!)).toBe(trigger);
  });
});

describe('Selector statusVariant forwarding', () => {
  it('defaults to attached (status renders with data-variant="attached")', () => {
    const {container} = render(
      <Selector
        label="Fruit"
        options={['Apple', 'Banana']}
        status={{type: 'error', message: 'Required'}}
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'attached',
    );
  });

  it('forwards statusVariant="detached" to the underlying Field status', () => {
    const {container} = render(
      <Selector
        label="Fruit"
        options={['Apple', 'Banana']}
        status={{type: 'error', message: 'Required'}}
        statusVariant="detached"
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'detached',
    );
  });

  it('keeps the on-field status icon for the attached variant', () => {
    const {container} = render(
      <Selector
        label="Fruit"
        options={['Apple', 'Banana']}
        status={{type: 'error', message: 'Required'}}
      />,
    );
    // Attached: the status glyph replaces the chevron indicator on the field.
    expect(
      container.querySelector('.astryx-selector-indicator-icon'),
    ).toBeNull();
  });

  it('suppresses the on-field status icon for the detached variant', () => {
    const {container} = render(
      <Selector
        label="Fruit"
        options={['Apple', 'Banana']}
        status={{type: 'error', message: 'Required'}}
        statusVariant="detached"
      />,
    );
    // Detached: the message box below carries its own leading icon, so the
    // field keeps its chevron indicator rather than duplicating the glyph.
    expect(
      container.querySelector('.astryx-selector-indicator-icon'),
    ).not.toBeNull();
  });

  it('detaches attached status by default for the ghost variant', () => {
    const {container} = render(
      <Selector
        label="Fruit"
        options={['Apple', 'Banana']}
        variant="ghost"
        status={{type: 'error', message: 'Required'}}
      />,
    );
    expect(container.querySelector('.astryx-selector')).toHaveAttribute(
      'data-variant',
      'ghost',
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'detached',
    );
  });

  it('detaches attached status by default for the secondary variant', () => {
    const {container} = render(
      <Selector
        label="Fruit"
        options={['Apple', 'Banana']}
        variant="secondary"
        status={{type: 'error', message: 'Required'}}
      />,
    );
    expect(container.querySelector('.astryx-selector')).toHaveAttribute(
      'data-variant',
      'secondary',
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'detached',
    );
  });

  it('paints the secondary trigger with its own trigger style', () => {
    const inputRender = render(
      <Selector label="Fruit" options={['Apple', 'Banana']} value="Banana" />,
    );
    const inputTriggerClass =
      inputRender.container.querySelector('.astryx-selector')!.className;
    inputRender.unmount();

    const secondaryRender = render(
      <Selector
        label="Fruit"
        options={['Apple', 'Banana']}
        value="Banana"
        variant="secondary"
      />,
    );
    // The neutral-filled secondary trigger must not reuse the bordered
    // input trigger's classes; it carries the secondary trigger style.
    expect(
      secondaryRender.container.querySelector('.astryx-selector')!.className,
    ).not.toBe(inputTriggerClass);
  });

  it('uses a status tooltip for ghost selectors when requested', () => {
    const {container} = render(
      <Selector
        label="Fruit"
        options={['Apple', 'Banana']}
        variant="ghost"
        status={{type: 'warning', message: 'Visible to all users'}}
        statusVariant="tooltip"
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toBeNull();
    const statusButton = screen.getByRole('button', {
      name: /warning details/i,
    });
    const tooltip = screen.getByRole('tooltip', h);
    expect(tooltip).toHaveTextContent('Visible to all users');
    expect(statusButton.getAttribute('aria-describedby')).toContain(tooltip.id);
    expect(
      screen.getByRole('combobox').getAttribute('aria-describedby'),
    ).toContain(tooltip.id);
  });
});

describe('Selector empty-state theme target', () => {
  const OPTIONS = ['Apple', 'Banana', 'Cherry'];

  it('renders the astryx-selector-empty-state target on the "No results found" element', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    await user.type(screen.getByRole('combobox', h), 'xyz');

    const empty = container.querySelector('.astryx-selector-empty-state');
    expect(empty).not.toBeNull();
    expect(empty).toHaveTextContent('No results found');
  });
});

describe('Selector clear icon theme target', () => {
  // Resolve the clear glyph span (the astryx-icon element inside the clear
  // button), independent of the theme target class.
  const getClearIcon = (): HTMLElement => {
    const button = screen.getByRole('button', {name: 'Clear Fruit'});
    const icon = button.querySelector('.astryx-icon');
    if (icon == null) {
      throw new Error('clear icon not found');
    }
    return icon as HTMLElement;
  };

  it('renders only the astryx-input-clear-icon target on the clear glyph', () => {
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
        hasClear
      />,
    );
    // The canonical target lands on the icon element itself (not the button),
    // so a theme can restyle just this glyph (color, size, hover) via
    // `defineTheme` — a button-level target could not reach the icon's own
    // color/size.
    const icon = getClearIcon();
    expect(icon).toHaveClass('astryx-input-clear-icon');
    expect(icon).not.toHaveClass('astryx-selector-clear-icon');
    expect(icon).toHaveClass('astryx-icon');
  });

  it('keeps the clear button functional alongside the target', () => {
    const onChange = vi.fn();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={onChange}
        hasClear
      />,
    );
    const clear = screen.getByRole('button', {name: 'Clear Fruit'});
    expect(clear.tagName).toBe('BUTTON');
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('routes the clear glyph through the shared clear button', () => {
    // The clear affordance composes the shared InputClearButton (a ghost Button
    // with a secondary/sm glyph), so the icon carries the canonical
    // `astryx-input-clear-icon` target. Aside from that target class it matches
    // the shared button's own `close`/`sm`/`secondary` glyph exactly, so the
    // default look is defined in one place.
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
        hasClear
      />,
    );
    const icon = getClearIcon();
    expect(icon).toHaveClass('astryx-input-clear-icon');
    expect(icon).not.toHaveClass('astryx-selector-clear-icon');

    const {container: refContainer} = render(
      <Icon icon="close" size="sm" color="secondary" />,
    );
    const refIcon = refContainer.querySelector('.astryx-icon') as HTMLElement;

    const styleClasses = (el: HTMLElement) =>
      el.className
        .split(' ')
        .filter(c => c !== 'astryx-input-clear-icon')
        .sort();

    expect(styleClasses(icon)).toEqual(styleClasses(refIcon));
  });

  it('uses input-clear-icon so a theme reaches the icon color, size, and hover', () => {
    // jsdom cannot resolve the @layer cascade, so the DOM-class assertion above
    // (target lands on the icon element) plus this generation assertion (the
    // theme emits same-element icon rules in @layer astryx-theme) together
    // prove the seam: a same-element theme rule wins over the icon's own
    // base-layer color/size.
    const theme = defineTheme({
      name: 'selector-shared-clear-icon-test',
      components: {
        'input-clear-icon': {
          base: {
            width: '12px',
            height: '12px',
            fontSize: '12px',
            color: 'var(--color-icon-secondary)',
            ':hover': {color: 'var(--color-icon-primary)'},
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-input-clear-icon {');
    expect(css).toContain('width: 12px');
    expect(css).toContain('height: 12px');
    expect(css).toContain('.astryx-input-clear-icon:hover');
    expect(css).toContain('color: var(--color-icon-primary)');
  });
});

describe('Selector indicator (chevron) icon theme target', () => {
  const getIndicatorIcon = (container: HTMLElement): HTMLElement => {
    // The chevron is the only glyph carrying the indicator target class.
    const icon = container.querySelector('.astryx-selector-indicator-icon');
    if (icon == null) {
      throw new Error('indicator icon not found');
    }
    return icon as HTMLElement;
  };

  it('renders the astryx-selector-indicator-icon target on the chevron glyph', () => {
    const {container} = render(
      <Selector label="Fruit" options={OPTIONS} onChange={() => {}} />,
    );
    // The stable theme target lands on the icon element itself (not the trigger
    // button), so a theme can restyle just this glyph (color, size, hover) —
    // and each open/closed state — via `defineTheme`. A button-level target
    // could not reach the icon's own color/size.
    const icon = getIndicatorIcon(container);
    expect(icon).toHaveClass('astryx-selector-indicator-icon');
    expect(icon).toHaveClass('astryx-icon');
    // Open/closed state is reflected so a theme can target each state alone.
    expect(icon).toHaveAttribute('data-state', 'collapsed');
  });

  it('reflects the expanded state on the chevron when the popover is open', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <Selector label="Fruit" options={OPTIONS} onChange={() => {}} />,
    );
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(getIndicatorIcon(container)).toHaveAttribute(
        'data-state',
        'expanded',
      );
    });
  });

  it('renders the default icon (secondary color, sm size) byte-identically', () => {
    // Pixel-identical default guard: the chevron glyph must carry the exact
    // same StyleX color/size classes as a standalone secondary/sm icon. The
    // glyph now sets --color-icon-secondary itself rather than inheriting it
    // from a wrapper span that set the same token, so the rendered color is
    // unchanged. The added
    // target class + data-state are purely additive — they change nothing until
    // a theme targets them.
    const {container} = render(
      <Selector label="Fruit" options={OPTIONS} onChange={() => {}} />,
    );
    const icon = getIndicatorIcon(container);

    const {container: refContainer} = render(
      <Icon icon="chevronDown" size="sm" color="secondary" />,
    );
    const refIcon = refContainer.querySelector('.astryx-icon') as HTMLElement;

    // Exclude the additive theme-target classes (the stable target + its
    // reflected state class) so only StyleX classes remain.
    const themeTargetClasses = new Set([
      'astryx-selector-indicator-icon',
      'collapsed',
      'expanded',
    ]);
    const styleClasses = (el: HTMLElement) =>
      el.className
        .split(' ')
        .filter(c => !themeTargetClasses.has(c))
        .sort();

    // A superset, not an exact match: the chevron additionally carries the
    // rotation styles, which live on the glyph precisely so a theme can reach
    // the transform through the same selector as the color. The guard that
    // matters is that every color/size class of a standalone icon is still
    // present — i.e. the default look has not drifted.
    expect(styleClasses(icon)).toEqual(
      expect.arrayContaining(styleClasses(refIcon)),
    );
  });

  it('exposes selector-indicator-icon so a theme reaches the icon size and per-state color', () => {
    // jsdom cannot resolve the @layer cascade, so the DOM-class assertions
    // above (target lands on the icon element) plus this generation assertion
    // (the theme emits same-element icon rules in @layer astryx-theme) together
    // prove the seam: a same-element theme rule wins over the icon's own
    // base-layer color/size.
    const theme = defineTheme({
      name: 'selector-indicator-icon-test',
      components: {
        'selector-indicator-icon': {
          base: {width: '14px', height: '14px', fontSize: '14px'},
          'state:expanded': {color: 'var(--color-icon-primary)'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-selector-indicator-icon {');
    expect(css).toContain('width: 14px');
    expect(css).toContain('height: 14px');
    expect(css).toContain(
      '.astryx-selector-indicator-icon[data-state="expanded"]',
    );
    expect(css).toContain('color: var(--color-icon-primary)');
  });
});

describe('Selector section headings', () => {
  it('renders a section title as a plain heading inside the group, not a divider', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={[
          {
            type: 'section',
            title: 'Citrus',
            options: [
              {value: 'orange', label: 'Orange'},
              {value: 'lemon', label: 'Lemon'},
            ],
          },
        ]}
        value={undefined}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox'));

    // A labeled Divider used to stand in for the heading; it rendered a
    // role="separator" as a direct child of the listbox and stacked a second
    // rule under the search row's own.
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(0);

    const group = screen.getByRole('group', {name: 'Citrus', hidden: true});
    const heading = group.querySelector('.astryx-selector-section-heading');
    expect(heading).toBeTruthy();
    expect(heading).toHaveTextContent('Citrus');
    // The group already carries the title as its accessible name, so the
    // visible heading must not announce it a second time.
    expect(heading).toHaveAttribute('aria-hidden', 'true');
  });

  it('hides a standalone divider from the accessibility tree (#4994)', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={['Apple', {type: 'divider'}, 'Banana']}
        value={undefined}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox'));

    // role="listbox" only permits option/group children. The divider still
    // renders role="separator" (unchanged visual/DOM), but must be excluded
    // from the accessibility tree so it never reaches the listbox's exposed
    // children (axe aria-required-children).
    const divider = document.querySelector('[role="separator"]');
    expect(divider).toBeTruthy();
    expect(divider).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Selector search focus ring', () => {
  // The ring is for keyboard focus only. `:focus-visible` cannot express that
  // on its own: per CSS Selectors 4 a pointer-focused text input matches it
  // too (verified in Chromium), which is why a modality gate sits alongside
  // it. jsdom does not implement `:focus-visible`, so these assert the gate;
  // the painted ring is verified in real Chromium.
  //
  // Focus moves into the search input on the frame after the panel opens, and
  // the gate is read at that moment: every case must wait for the focus to
  // land before asserting or typing, or a slow frame reads the modality of
  // whatever the test did next.
  beforeEach(() => {
    __resetInteractionModalityForTest();
  });

  const field = () =>
    screen.getByRole('combobox', {hidden: true}).parentElement;

  const waitForSearchFocus = async () =>
    waitFor(() =>
      expect(screen.getByRole('combobox', {hidden: true})).toHaveFocus(),
    );

  it('does not ring when the panel is opened by mouse', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value={undefined}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    await waitForSearchFocus();
    expect(field()).not.toHaveAttribute('data-keyboard-focus');
  });

  it('does not ring when the query is typed after a mouse open', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value={undefined}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    await waitForSearchFocus();
    await user.keyboard('an');
    // Typing does not retroactively make a pointer focus a keyboard one; the
    // caret already shows where the text is going.
    expect(field()).not.toHaveAttribute('data-keyboard-focus');
  });

  it('rings when the panel is opened from the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value={undefined}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.tab();
    await user.keyboard('{Enter}');
    await waitForSearchFocus();
    expect(field()).toHaveAttribute('data-keyboard-focus', 'true');
  });

  it('rings when Shift+Tab returns from clear to the search input', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value={undefined}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    await waitForSearchFocus();
    const search = screen.getByRole('combobox', {hidden: true});
    await user.type(search, 'a');

    await user.tab();
    expect(
      screen.getByRole('button', {
        name: 'Clear Search options',
        hidden: true,
      }),
    ).toHaveFocus();

    await user.tab({shift: true});
    expect(search).toHaveFocus();
    expect(field()).toHaveAttribute('data-keyboard-focus', 'true');
  });
});

describe('Selector search affordances', () => {
  it('renders the search row seamlessly — no nested input box, a divider under it', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Apple"
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));

    const search = screen.getByRole('combobox', {hidden: true});
    // The row is the outer gutter; the input sits inside the rounded field.
    const row = search.closest('.astryx-selector-search');
    const field = search.parentElement;
    if (!row || !field) {
      throw new Error('search row not found');
    }
    // The panel is already a bordered surface: the field inside it must not be
    // a second bordered box (this used to render a TextInput).
    expect(row).not.toHaveClass('astryx-text-input');
    expect(search.closest('.astryx-text-input')).toBeNull();
    // The field is a rounded box inset from the panel edge, shaped like the
    // option rows under it — not a full-bleed header strip.
    expect(field).not.toBe(row);
    expect(getComputedStyle(field).borderRadius).not.toBe('');
    // ...and a divider separates it from the options.
    const separator =
      container.ownerDocument.querySelector('[role="separator"]');
    if (!separator) {
      throw new Error('divider not found');
    }
    // Order: row, then divider, then the listbox.
    expect(
      row.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const listbox = screen.getByRole('listbox', {hidden: true});
    expect(
      separator.compareDocumentPosition(listbox) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders a decorative (aria-hidden) magnifier icon whenever hasSearch is on', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Apple"
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole('combobox', {hidden: true});
    // The magnifier leads the search row, as a sibling of the <input>.
    const container = search.parentElement;
    const magnifier = container?.querySelector('.astryx-icon');
    expect(magnifier).toBeTruthy();
    // Decorative: the icon is hidden from assistive tech and carries no name.
    expect(magnifier?.getAttribute('aria-hidden')).toBe('true');
    expect(magnifier?.getAttribute('aria-label')).toBeNull();
  });

  it('renders the clear button once a query is typed and clears + refocuses on click', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Apple"
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole('combobox', {hidden: true});
    await user.type(search, 'ap');
    expect(search).toHaveValue('ap');

    // The clear button is TextInput's built-in hasClear affordance; its name is
    // derived from the field label ("Search options").
    const clear = screen.getByRole('button', {
      name: 'Clear Search options',
      hidden: true,
    });

    await user.click(clear);
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
  });

  // iOS raises the software keyboard only for a focus made while the browser
  // still dispatches the tap, and a UIKit search field's clear button makes
  // the field first responder even when it was not editing.
  it('puts focus back in the search input inside the tap on clear, after the input lost focus', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Apple"
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole<HTMLInputElement>('combobox', {
      hidden: true,
    });
    await user.type(search, 'ap');
    const clear = screen.getByRole('button', {
      name: 'Clear Search options',
      hidden: true,
    });
    // The person dismissed the keyboard: the input no longer has focus.
    act(() => search.blur());
    expect(search).not.toHaveFocus();

    const focusedDuring: (string | undefined)[] = [];
    const focus = HTMLElement.prototype.focus;
    Object.defineProperty(search, 'focus', {
      configurable: true,
      value(options?: FocusOptions) {
        focusedDuring.push(window.event?.type);
        focus.call(search, options);
      },
    });
    fireEvent.click(clear, {detail: 1});

    // No frame has run: the focus is in place when the tap's dispatch returns.
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(focusedDuring).toEqual(['click']);
  });

  it('does not render the clear button when the query is empty', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Apple"
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    expect(
      screen.queryByRole('button', {
        name: 'Clear Search options',
        hidden: true,
      }),
    ).not.toBeInTheDocument();
  });

  it('keeps the combobox contract on the input, not the affordances', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Apple"
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    // Exactly one combobox — the input. The magnifier and clear button are not
    // part of the combobox contract.
    const comboboxes = screen.getAllByRole('combobox', {hidden: true});
    expect(comboboxes).toHaveLength(1);
    expect(comboboxes[0].tagName).toBe('INPUT');
    expect(comboboxes[0]).toHaveAttribute('aria-autocomplete', 'list');
  });

  it('tabs from the search input to the clear button (keeping the popup open) when a query is showing it', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Apple"
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const trigger = screen.getByRole('button', {name: 'Fruit'});
    const search = screen.getByRole('combobox', {hidden: true});
    await user.type(search, 'ap');
    expect(search).toHaveFocus();

    // Forward-tab lands on the clear (✕) button and the popup stays open, so
    // the affordance is keyboard-reachable rather than being skipped when the
    // input's Tab dismisses the popup.
    await user.tab();
    const clear = screen.getByRole('button', {
      name: 'Clear Search options',
      hidden: true,
    });
    expect(clear).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Selector selected-marker theme target (selector-check)', () => {
  const openOptions = (): HTMLElement[] => screen.getAllByRole('option', h);

  it('renders the astryx-selector-check target on the selected row only', () => {
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
        isDefaultOpen
      />,
    );
    const options = openOptions();
    const selected = options.find(
      o => o.getAttribute('aria-selected') === 'true',
    )!;
    const check = selected.querySelector('.astryx-selector-check');
    expect(check).toBeInTheDocument();
    // The target lands on the checkmark glyph itself, so a theme can restyle or
    // hide it (e.g. to compose its own selected indicator via renderOption).
    expect(check).toHaveClass('astryx-icon');

    const unselected = options.filter(
      o => o.getAttribute('aria-selected') !== 'true',
    );
    for (const row of unselected) {
      expect(
        row.querySelector('.astryx-selector-check'),
      ).not.toBeInTheDocument();
    }
  });

  it('renders the default checkmark byte-identically aside from the target class', () => {
    // The added target class is purely additive — it changes nothing about the
    // glyph's own color/size until a theme targets it.
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
        isDefaultOpen
      />,
    );
    const selected = screen
      .getAllByRole('option', h)
      .find(o => o.getAttribute('aria-selected') === 'true')!;
    const check = selected.querySelector(
      '.astryx-selector-check',
    ) as HTMLElement;

    const {container: refContainer} = render(
      <Icon icon="check" size="sm" color="accent" />,
    );
    const refIcon = refContainer.querySelector('.astryx-icon') as HTMLElement;
    const styleClasses = (el: HTMLElement) =>
      el.className
        .split(' ')
        .filter(c => c !== 'astryx-selector-check')
        .sort();
    expect(styleClasses(check)).toEqual(styleClasses(refIcon));
  });

  it('exposes selector-check so a theme can hide or restyle the marker', () => {
    const theme = defineTheme({
      name: 'selector-check-test',
      components: {
        'selector-check': {
          base: {display: 'none'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-selector-check {');
    expect(css).toContain('display: none');
  });
});

describe('Selector disabled state theme target', () => {
  const getSelectorRoot = (container: HTMLElement): HTMLElement => {
    const root = container.querySelector('.astryx-selector');
    if (root == null) {
      throw new Error('selector root not found');
    }
    return root as HTMLElement;
  };

  it('reflects data-disabled="disabled" on the root when disabled', () => {
    const {container} = render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        onChange={() => {}}
        isDisabled
      />,
    );
    expect(getSelectorRoot(container)).toHaveAttribute(
      'data-disabled',
      'disabled',
    );
  });

  it('omits the disabled class/attribute when enabled', () => {
    const {container} = render(
      <Selector label="Fruit" options={OPTIONS} onChange={() => {}} />,
    );
    const root = getSelectorRoot(container);
    expect(root).not.toHaveAttribute('data-disabled');
    expect(root).not.toHaveAttribute('data-disabled');
  });

  it('exposes the disabled state so a theme can key on it', () => {
    const theme = defineTheme({
      name: 'selector-disabled-state-test',
      components: {
        selector: {
          'disabled:disabled': {opacity: '0.4'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-selector[data-disabled="disabled"]');
    expect(css).toContain('opacity: 0.4');
  });
});

describe('Selector indicatorPosition', () => {
  const openRows = (): HTMLElement[] => screen.getAllByRole('option', h);
  const rowFor = (label: string): HTMLElement =>
    openRows().find(row => row.textContent?.includes(label))!;

  it('draws the mark after the option content by default', () => {
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
        isDefaultOpen
      />,
    );
    const row = rowFor('Banana');
    const mark = row.querySelector('.astryx-selector-check')!;
    const content = row.querySelector('.astryx-selector-option')!;
    expect(
      content.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('draws the mark before the option content when set to start', () => {
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
        indicatorPosition="start"
        isDefaultOpen
      />,
    );
    const row = rowFor('Banana');
    const mark = row.querySelector('.astryx-selector-check')!;
    const content = row.querySelector('.astryx-selector-option')!;
    expect(
      content.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it.each(['start', 'end'] as const)(
    'collapses an empty default mark at the logical %s edge',
    indicatorPosition => {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
          indicatorPosition={indicatorPosition}
          isDefaultOpen
        />,
      );

      for (const row of openRows()) {
        const isSelected = row.getAttribute('aria-selected') === 'true';
        const markColumn =
          indicatorPosition === 'start'
            ? row.firstElementChild
            : row.lastElementChild;
        expect(markColumn).not.toBeNull();
        expect(markColumn).toHaveStyle({
          display: isSelected ? 'inline-flex' : 'none',
        });
      }
    },
  );

  it.each(['start', 'end'] as const)(
    'keeps a themed indicator in layout at the logical %s edge',
    indicatorPosition => {
      const theme = defineTheme({
        name: `selector-${indicatorPosition}-radio-mark-test`,
        indicators: {check: RadioIndicator},
      });
      render(
        <Theme theme={theme}>
          <Selector
            label="Fruit"
            options={OPTIONS}
            value="Banana"
            onChange={() => {}}
            indicatorPosition={indicatorPosition}
            isDefaultOpen
          />
        </Theme>,
      );

      for (const row of openRows()) {
        const markColumn =
          indicatorPosition === 'start'
            ? row.firstElementChild
            : row.lastElementChild;
        const radio = row.querySelector('.astryx-radio-indicator');
        const content = row.querySelector('.astryx-selector-option');
        expect(markColumn).toHaveStyle({display: 'inline-flex'});
        expect(radio).not.toBeNull();
        expect(content).not.toBeNull();
        expect(
          content!.compareDocumentPosition(radio!) &
            (indicatorPosition === 'start'
              ? Node.DOCUMENT_POSITION_PRECEDING
              : Node.DOCUMENT_POSITION_FOLLOWING),
        ).toBeTruthy();
      }
    },
  );
});

describe('Selector popup theme target', () => {
  // The surface is the same element whether or not the popup has a search
  // field — which is the reason the target lives there. Rendered on the
  // component's own content, it would land on the listbox in one branch and
  // on a wrapper in the other, so one theme rule would style two different
  // boxes.
  it.each([
    ['without search', false],
    ['with search', true],
  ])(
    'puts astryx-selector-popup on the painting surface, %s',
    async (_label, hasSearch) => {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={['Apple', 'Banana']}
          value="Apple"
          onChange={() => {}}
          hasSearch={hasSearch}
        />,
      );
      // The trigger is a combobox in the plain variant and a listbox-popup
      // button in the search variant; the surface is the same either way.
      await user.click(
        screen.queryByRole('combobox') ??
          screen.getByRole('button', {name: /Fruit/}),
      );

      const popup = document.querySelector('.astryx-selector-popup');
      expect(popup).not.toBeNull();
      expect(popup).toHaveClass('astryx-popover');
      expect(popup?.querySelector('[role="listbox"]')).not.toBeNull();
    },
  );

  it('stays closed when the trigger click follows its own light dismiss (#5004)', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
        placement="below"
      />,
    );
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // The browser dismissed the popup on pointerup and queued the toggle. When
    // that event lands before the click — WebKit, or any engine under load —
    // the click used to read a closed popup and reopen it.
    fireEvent.pointerDown(trigger);
    const popover = document.querySelector('[popover]') as HTMLElement;
    act(() => {
      popover.dispatchEvent(
        Object.assign(new Event('toggle'), {
          oldState: 'open',
          newState: 'closed',
        }),
      );
    });
    // Synchronously: the click falls inside the one gesture the guard covers,
    // as it does in a browser a few milliseconds behind the dismissal.
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger.parentElement).toHaveClass(
      stylex.props(selectorPresentationStyles.pointerRestoredFocus).className!,
    );
  });
});

describe('Selector option-row theme target', () => {
  const ROW_OPTIONS = ['Apple', 'Banana', 'Orange'];

  it('renders astryx-selector-option-row, with its size, on every dropdown row', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={ROW_OPTIONS}
        value=""
        onChange={() => {}}
        size="lg"
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option', h);
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option).toHaveClass('astryx-selector-option-row');
      expect(option).toHaveAttribute('data-size', 'lg');
      expect(option).toHaveAttribute('data-size', 'lg');
    }
  });

  it('reflects the selected state on the row target', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={ROW_OPTIONS}
        value="Banana"
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const selected = screen.getByRole('option', {name: 'Banana', ...h});
    expect(selected).toHaveClass('astryx-selector-option-row');
    expect(selected).toHaveAttribute('data-selected', 'selected');
  });

  it('leaves the state attributes off an unselected, enabled row', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={ROW_OPTIONS}
        value="Banana"
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const plain = screen.getByRole('option', {name: 'Apple', ...h});
    expect(plain).toHaveClass('astryx-selector-option-row');
    // themeProps emits the data-* only when the state is truthy, so a theme's
    // `.selected` / `.disabled` rules never touch a plain row.
    expect(plain).not.toHaveAttribute('data-selected');
    expect(plain).not.toHaveAttribute('data-disabled');
  });

  it('reflects the disabled state on the row target', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={[{value: 'Apple', disabled: true}, 'Banana']}
        value=""
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const disabled = screen.getByRole('option', {name: 'Apple', ...h});
    expect(disabled).toHaveClass('astryx-selector-option-row');
    expect(disabled).toHaveAttribute('data-disabled', 'disabled');
  });

  it('keeps the row target when renderOption replaces the content', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={ROW_OPTIONS}
        value=""
        onChange={() => {}}
        renderOption={option => (
          <span data-testid="custom-row">{option.label ?? option.value}</span>
        )}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const option = screen.getAllByRole('option', h)[0];
    // The row owns the padding/density, so custom content is inset the same as
    // the default row — one row override reaches both.
    expect(option).toHaveClass('astryx-selector-option-row');
    expect(within(option).getByTestId('custom-row')).toHaveTextContent('Apple');
  });

  it('exposes the row target, its states and its size to defineTheme', () => {
    // jsdom cannot resolve the @layer cascade, so the generated CSS is what
    // proves a theme can reach the row (padding, state, per-size density).
    const theme = defineTheme({
      name: 'selector-option-row-target-test',
      components: {
        'selector-option-row': {
          base: {padding: 'var(--spacing-2)', borderRadius: '8px'},
          selected: {backgroundColor: 'var(--color-background-muted)'},
          disabled: {opacity: '0.5'},
          'size:md': {padding: 'var(--spacing-2)'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-selector-option-row {');
    expect(css).toContain(
      '.astryx-selector-option-row[data-selected="selected"]',
    );
    expect(css).toContain(
      '.astryx-selector-option-row[data-disabled="disabled"]',
    );
    expect(css).toContain('.astryx-selector-option-row[data-size="md"]');
  });
});

describe('Selector option descriptions and trigger value', () => {
  const LOCK = <span data-testid="lock-glyph" />;
  const GLOBE = <span data-testid="globe-glyph" />;
  const VISIBILITY = [
    {
      value: 'private',
      label: 'Private',
      icon: LOCK,
      description: 'Only members can access this space.',
    },
    {
      value: 'public',
      label: 'Public',
      icon: GLOBE,
      description: 'Anyone at the company can join.',
    },
  ];

  it('renders an option description in the dropdown row', () => {
    render(
      <Selector
        label="Visibility"
        options={VISIBILITY}
        value="private"
        onChange={() => {}}
        isDefaultOpen
      />,
    );

    const [row] = screen.getAllByRole('option', {hidden: true});
    expect(row).toHaveTextContent('Private');
    expect(row).toHaveTextContent('Only members can access this space.');
  });

  it('keeps the description out of the closed trigger by default', () => {
    render(
      <Selector
        label="Visibility"
        options={VISIBILITY}
        value="private"
        onChange={() => {}}
      />,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Private');
    expect(trigger).not.toHaveTextContent(
      'Only members can access this space.',
    );
  });

  it("renders the selected option's icon in the closed trigger", () => {
    render(
      <Selector
        label="Visibility"
        options={VISIBILITY}
        value="private"
        onChange={() => {}}
      />,
    );

    const trigger = screen.getByRole('combobox');
    expect(within(trigger).getByTestId('lock-glyph')).toBeInTheDocument();
    expect(
      within(trigger).queryByTestId('globe-glyph'),
    ).not.toBeInTheDocument();
  });

  it('renders no option icon while showing the placeholder', () => {
    render(
      <Selector
        label="Visibility"
        options={VISIBILITY}
        value={undefined}
        onChange={() => {}}
        placeholder="Choose..."
      />,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Choose...');
    expect(within(trigger).queryByTestId('lock-glyph')).not.toBeInTheDocument();
  });

  it('lets startIcon win over the selected option icon', () => {
    render(
      <Selector
        label="Visibility"
        options={VISIBILITY}
        value="private"
        onChange={() => {}}
        startIcon={<span data-testid="pinned-icon" />}
      />,
    );

    // One leading glyph in the trigger, not two.
    expect(screen.getByTestId('pinned-icon')).toBeInTheDocument();
    expect(
      within(screen.getByRole('combobox')).queryByTestId('lock-glyph'),
    ).not.toBeInTheDocument();
  });

  it('renders the selected option through renderValue', () => {
    render(
      <Selector
        label="Visibility"
        options={VISIBILITY}
        value="private"
        onChange={() => {}}
        renderValue={option => (
          <SelectorOption
            icon={option.icon}
            label={option.label ?? option.value}
            description={option.description}
          />
        )}
      />,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Private');
    expect(trigger).toHaveTextContent('Only members can access this space.');
    expect(within(trigger).getByTestId('lock-glyph')).toBeInTheDocument();
  });

  it('sizes the trigger from what renderValue draws, not from it being passed', () => {
    // The regression this guards: keying the height off `renderValue != null`
    // handed a one-line custom value a taller control than the same value in
    // the default trigger, so `size` quietly stopped meaning its token. The
    // trigger carries one set of sizing classes for every case — a one-line
    // value measures the token, and only a second line of content adds a
    // second line of height.
    const triggerSizing = () =>
      new Set(
        (screen.getByRole('combobox').parentElement?.className ?? '')
          .split(' ')
          .filter(Boolean),
      );

    const plain = render(
      <Selector
        label="Visibility"
        options={VISIBILITY}
        value="private"
        onChange={() => {}}
      />,
    );
    const defaultSizing = triggerSizing();
    plain.unmount();

    const oneLine = render(
      <Selector
        label="Visibility"
        options={VISIBILITY}
        value="private"
        onChange={() => {}}
        renderValue={option => <span>{option.label}</span>}
      />,
    );
    expect(triggerSizing()).toEqual(defaultSizing);
    oneLine.unmount();

    render(
      <Selector
        label="Visibility"
        options={VISIBILITY}
        value="private"
        onChange={() => {}}
        renderValue={option => (
          <SelectorOption
            icon={option.icon}
            label={option.label ?? option.value}
            description={option.description}
          />
        )}
      />,
    );
    expect(triggerSizing()).toEqual(defaultSizing);
  });

  it("follows the caller's SelectorOption layout, but folds inline in a group", () => {
    // The trigger has no layout prop: the SelectorOption the caller renders
    // decides, and the trigger's padding sizes it to whatever that draws. The
    // one exception is an InputGroup, which pins the row height — the value
    // box is clamped to it, so a stacked row would lose its second line at the
    // cut. Folding inline keeps the description visible instead.
    const renderValue = (option: SelectorOptionData) => (
      <SelectorOption
        icon={option.icon}
        label={option.label ?? option.value}
        description={option.description}
      />
    );
    const classesOf = (label: HTMLElement) =>
      new Set((label.parentElement?.className ?? '').split(' '));
    const triggerClasses = () =>
      classesOf(within(screen.getByRole('combobox')).getByText('Private'));

    const stackedRef = render(<Item label="Private" description="Why" />);
    const stackedClasses = classesOf(screen.getByText('Private'));
    stackedRef.unmount();

    const inlineRef = render(
      <Item label="Private" description="Why" layout="inline" />,
    );
    const inlineOnly = [...classesOf(screen.getByText('Private'))].filter(
      c => c !== '' && !stackedClasses.has(c),
    );
    inlineRef.unmount();
    expect(inlineOnly.length).toBeGreaterThan(0);

    const standalone = render(
      <Selector
        label="Visibility"
        options={VISIBILITY}
        value="private"
        onChange={() => {}}
        renderValue={renderValue}
      />,
    );
    expect(inlineOnly.some(c => triggerClasses().has(c))).toBe(false);
    standalone.unmount();

    render(
      <InputGroup label="Space settings">
        <Selector
          label="Visibility"
          options={VISIBILITY}
          value="private"
          onChange={() => {}}
          renderValue={renderValue}
        />
      </InputGroup>,
    );
    expect(inlineOnly.every(c => triggerClasses().has(c))).toBe(true);
  });

  it('clamps the trigger value box in a group, whatever renderValue draws', () => {
    // The hole this guards: the one-line fold a group imposes used to reach
    // only SelectorOption, which reads the row-layout context. Any other node
    // ignored it and bled through the trigger's border, over the rows above
    // and below the group. The clamp is on the trigger's own value box, so it
    // cannot depend on what the value is.
    const valueBox = () => {
      const box = screen.getByRole('combobox').firstElementChild;
      return new Set((box?.className ?? '').split(' ').filter(Boolean));
    };
    const grouped = (
      renderValue: (option: SelectorOptionData) => ReactNode,
    ) => (
      <InputGroup label="Space settings">
        <Selector
          label="Visibility"
          options={VISIBILITY}
          value="private"
          onChange={() => {}}
          renderValue={renderValue}
        />
      </InputGroup>
    );

    const standalone = render(
      <Selector
        label="Visibility"
        options={VISIBILITY}
        value="private"
        onChange={() => {}}
        renderValue={option => <span>{option.label}</span>}
      />,
    );
    const unclamped = valueBox();
    standalone.unmount();

    const withOption = render(
      grouped(option => (
        <SelectorOption
          icon={option.icon}
          label={option.label ?? option.value}
          description={option.description}
        />
      )),
    );
    const clamped = valueBox();
    expect(clamped).not.toEqual(unclamped);
    withOption.unmount();

    // A row the Selector knows nothing about, and a bare element: same box.
    const withItem = render(
      grouped(option => (
        <Item
          label={option.label ?? option.value}
          description={option.description}
        />
      )),
    );
    expect(valueBox()).toEqual(clamped);
    withItem.unmount();

    render(
      grouped(option => (
        <div>
          <div>{option.label}</div>
          <div>{option.description}</div>
        </div>
      )),
    );
    expect(valueBox()).toEqual(clamped);
  });

  it('does not let a control sized above its group grow the row', () => {
    // The group's height is the row, so inside one the trigger drops the floor
    // its own `size` would otherwise assert: <InputGroup size="md"> with a
    // <Selector size="lg"> stays the group's 32px. The size still reaches the
    // theme (the trigger keeps its `size` marker class); what it no longer
    // does is set a height. Standalone, the two sizes still differ.
    const triggerSizing = () =>
      new Set(
        (screen.getByRole('combobox').parentElement?.className ?? '')
          .split(' ')
          .filter(Boolean),
      );
    // What changes between the two sizes. StyleX keeps a debug class per style
    // object even where every declaration in it lost, and the theme keeps its
    // own `size` marker; the atomic classes are what carry the geometry.
    const geometryDiff = (a: Set<string>, b: Set<string>) => {
      const atomic = (classes: Set<string>) =>
        [...classes].filter(c => !c.includes('__') && c !== 'md' && c !== 'lg');
      return [...atomic(a), ...atomic(b)].filter(c => !(a.has(c) && b.has(c)));
    };
    const selector = (size: 'md' | 'lg') => (
      <Selector
        label="Visibility"
        size={size}
        options={VISIBILITY}
        value="private"
        onChange={() => {}}
      />
    );

    const standaloneMd = render(selector('md'));
    const standaloneMdSizing = triggerSizing();
    standaloneMd.unmount();

    const standaloneLg = render(selector('lg'));
    expect(geometryDiff(standaloneMdSizing, triggerSizing())).not.toEqual([]);
    standaloneLg.unmount();

    const groupedMd = render(
      <InputGroup label="Space settings" size="md">
        {selector('md')}
      </InputGroup>,
    );
    const groupedMdSizing = triggerSizing();
    groupedMd.unmount();

    render(
      <InputGroup label="Space settings" size="md">
        {selector('lg')}
      </InputGroup>,
    );
    expect(geometryDiff(groupedMdSizing, triggerSizing())).toEqual([]);
  });

  it('does not call renderValue for the placeholder', () => {
    const renderValue = vi.fn(() => <span>custom</span>);
    render(
      <Selector
        label="Visibility"
        options={VISIBILITY}
        value={undefined}
        onChange={() => {}}
        placeholder="Choose..."
        renderValue={renderValue}
      />,
    );

    expect(renderValue).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose...');
  });

  it('matches type-ahead on the label, not the description', () => {
    // "Anyone" starts the public description; typing "a" must not select it.
    function Harness() {
      const [value, setValue] = useState<string | undefined>(undefined);
      return (
        <Selector
          label="Visibility"
          options={VISIBILITY}
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<Harness />);

    const trigger = screen.getByRole('combobox');
    trigger.focus();
    type('pu', trigger);
    expect(trigger).toHaveTextContent('Public');
    expect(trigger).not.toHaveTextContent('Anyone at the company can join.');
  });
});

describe('Selector press model', () => {
  const touch = {pointerType: 'touch', pointerId: 1};
  const h = {hidden: true};

  it('a finger release over an option selects it, not the option the press began on', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Selector label="Fruit" options={OPTIONS} onChange={onChange} />);
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const apple = screen.getByRole('option', {name: /Apple/, ...h});
    const cherry = screen.getByRole('option', {name: /Cherry/, ...h});
    fireEvent.pointerDown(apple, touch);
    fireEvent.pointerMove(cherry, touch);
    // The highlight moves through aria-activedescendant; focus stays put.
    expect(trigger).toHaveAttribute('aria-activedescendant', cherry.id);
    expect(cherry).not.toHaveFocus();
    fireEvent.pointerUp(cherry, touch);
    // The WebKit tail: a click aimed at the option the touch began on.
    fireEvent.click(apple, {detail: 1});

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Cherry');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('a finger released outside acts on nothing and leaves the list open; a mouse closes it', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Selector label="Fruit" options={OPTIONS} onChange={onChange} />);
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    const apple = screen.getByRole('option', {name: /Apple/, ...h});

    fireEvent.pointerDown(apple, touch);
    fireEvent.pointerUp(document.body, touch);
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.pointerDown(apple, {
      pointerType: 'mouse',
      pointerId: 2,
      button: 0,
    });
    fireEvent.pointerUp(document.body, {pointerType: 'mouse', pointerId: 2});
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('a pointer-driven highlight never scrolls the option into view (the rows would move under the finger)', async () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const user = userEvent.setup();
      render(<Selector label="Fruit" options={OPTIONS} onChange={() => {}} />);
      await user.click(screen.getByRole('combobox'));
      scrollIntoView.mockClear();
      const apple = screen.getByRole('option', {name: /Apple/, ...h});
      const cherry = screen.getByRole('option', {name: /Cherry/, ...h});
      fireEvent.pointerDown(apple, touch);
      fireEvent.pointerMove(cherry, touch);
      expect(screen.getByRole('combobox')).toHaveAttribute(
        'aria-activedescendant',
        cherry.id,
      );
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('the listbox owns touch scrolling: touch-action pinch-zoom while the options fit', async () => {
    const user = userEvent.setup();
    render(<Selector label="Fruit" options={OPTIONS} onChange={() => {}} />);
    await user.click(screen.getByRole('combobox'));
    const listbox = screen.getByRole('listbox', h);
    // jsdom does not compute `touch-action`; StyleX class names hash the
    // declaration, so the same declaration yields the same class (the dev
    // build prefixes a debug name; the hash is the last token).
    const touchStyles = stylex.create({
      none: {touchAction: 'none'},
      pinchZoom: {touchAction: 'pinch-zoom'},
      panYPinchZoom: {touchAction: 'pan-y pinch-zoom'},
    });
    const hash = (style: stylex.StyleXStyles) =>
      stylex.props(style).className!.split(' ').pop()!;
    expect(listbox).toHaveClass(hash(touchStyles.pinchZoom));
    expect(listbox).not.toHaveClass(hash(touchStyles.none));
    expect(listbox).not.toHaveClass(hash(touchStyles.panYPinchZoom));
  });

  it('marks the listbox as carrying the press model', async () => {
    const user = userEvent.setup();
    render(<Selector label="Fruit" options={OPTIONS} onChange={() => {}} />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox', h)).toHaveAttribute(
      'data-astryx-menu-press',
    );
  });
});

describe('Selector in a narrow row', () => {
  it('lets a row shrink a standalone selector instead of overflowing', () => {
    const {container} = render(
      <Selector
        label="Status"
        options={['Awaiting fulfillment', 'Shipped']}
        value="Awaiting fulfillment"
        onChange={() => {}}
      />,
    );
    const root = container.querySelector('.astryx-field')!;
    expect(getComputedStyle(root).minWidth).toBe('0');
  });

  it('keeps an explicit width alongside the reset', () => {
    const {container} = render(
      <Selector
        label="Qty"
        options={['1', '2']}
        value="1"
        onChange={() => {}}
        width={80}
      />,
    );
    const root = container.querySelector('.astryx-field')!;
    expect(root.getAttribute('style')).toContain('80');
    expect(getComputedStyle(root).minWidth).toBe('0');
  });

  it('lets a narrow list shrink an option so its label can ellipsize', () => {
    render(
      <Selector
        label="Project"
        options={['An option with a deliberately long readable label']}
        value={undefined}
        onChange={() => {}}
        isDefaultOpen
      />,
    );
    const option = screen
      .getByRole('option', {hidden: true})
      .querySelector('.astryx-selector-option')!;
    expect(getComputedStyle(option).minWidth).toBe('0');
  });
});

describe('Selector and option actions (not adopted)', () => {
  it('renders the option without the control and warns in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(
        <Selector
          label="Fruit"
          options={[
            {
              value: 'apple',
              label: 'Apple',
              action: <button type="button">Edit Apple</button>,
            },
          ]}
          value={undefined}
          onChange={() => {}}
        />,
      );
      await user.click(screen.getByRole('combobox', {name: 'Fruit'}));
      expect(
        screen.queryByRole('button', {name: 'Edit Apple', hidden: true}),
      ).toBeNull();
      expect(
        screen.getByRole('option', {name: 'Apple', hidden: true}),
      ).toBeInTheDocument();
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/Selector[\s\S]*action/),
      );
    } finally {
      warn.mockRestore();
    }
  });
});
