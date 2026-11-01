// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SearchField.test.tsx
 * @input vitest, @testing-library/react, SearchField
 * @output jsdom coverage of SearchField's semantics and state: a search
 *   landmark holding a named searchbox with a touch keyboard's Search key
 *   and no autocorrection; focus activates; the close button cancels
 *   (clears, ends editing, deactivates) and is out of the tab order while
 *   inactive; Escape cancels outside composition; Enter submits and keeps
 *   focus; the clear button appears with text, clears and keeps or restores
 *   focus inside the tap; a host's handle focuses the field right after an
 *   activation it committed (a tab bar's tap); controlled and uncontrolled;
 *   the bottom placement's geometry and its lift above the software
 *   keyboard (spec:AST-099 FR2; none where the page has the VirtualKeyboard
 *   API, or under a mouse), and the tab placement's content and cancel;
 *   the field's background is pseudo-elements, so the field holds only the
 *   magnifier, the input and the trailing end
 * @position Testing; the motion is proven in real engines by
 *   __tests__/SearchField.interaction.browser.spec.ts
 */

import {describe, expect, it, vi} from 'vitest';
import {createRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {renderToString} from 'react-dom/server';
import {
  SearchField,
  type SearchFieldHandle,
  type SearchFieldProps,
} from './SearchField';
import {search} from '../internal/searchMotion';

function Field(props: Partial<SearchFieldProps>) {
  return <SearchField label="Search" {...props} />;
}

const box = () => screen.getByRole('searchbox', {name: 'Search'});
// The close button stays mounted (hidden while inactive), so it is found by
// its data attribute rather than by role.
const close = () => {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-search-field-close]',
  );
  if (button == null) {
    throw new Error('no close button');
  }
  return button;
};

/**
 * A finger (or a mouse) and a visual viewport that reports a software
 * keyboard the way Mobile Safari does, for `run`: `keyboard(cover)` shrinks
 * it from the bottom and fires one `resize`.
 */
interface VirtualKeyboardStandIn extends EventTarget {
  overlaysContent: boolean;
  boundingRect: DOMRect;
  /** The keyboard now covers `cover` px of the bottom; Chrome reports it. */
  report(cover: number): void;
}

async function withKeyboard(
  {isTouch = true, virtualKeyboardApi = false} = {},
  run: (
    keyboard: (cover: number) => void,
    virtualKeyboard: VirtualKeyboardStandIn,
  ) => Promise<void> | void,
) {
  const viewport = Object.assign(new EventTarget(), {
    height: window.innerHeight,
    scale: 1,
  });
  vi.stubGlobal('visualViewport', viewport);
  // The browser's own keyboard report (Chrome on Android): its rect, and a
  // `geometrychange` when the keyboard moves.
  const virtualKeyboard = Object.assign(new EventTarget(), {
    overlaysContent: false,
    boundingRect: new DOMRect(0, 0, 0, 0),
    report(cover: number) {
      act(() => {
        virtualKeyboard.boundingRect = new DOMRect(
          0,
          window.innerHeight - cover,
          window.innerWidth,
          cover,
        );
        virtualKeyboard.dispatchEvent(new Event('geometrychange'));
      });
    },
  });
  if (virtualKeyboardApi) {
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: virtualKeyboard,
    });
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: isTouch && query.includes('pointer: coarse'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  try {
    await run(cover => {
      act(() => {
        viewport.height = window.innerHeight - cover;
        viewport.dispatchEvent(new Event('resize'));
      });
    }, virtualKeyboard);
  } finally {
    Reflect.deleteProperty(navigator, 'virtualKeyboard');
    vi.unstubAllGlobals();
  }
}

describe('SearchField', () => {
  it('is a search landmark holding a searchbox named by its label', () => {
    render(<Field />);
    expect(screen.getByRole('search')).toContainElement(box());
    expect(box()).toHaveAttribute('placeholder', 'Search');
  });

  it('asks a touch keyboard for its Search key and no autocorrection', () => {
    render(<Field />);
    expect(box()).toHaveAttribute('enterkeyhint', 'search');
    expect(box()).toHaveAttribute('autocorrect', 'off');
  });

  it('activates when the field gains focus, once', () => {
    const onActiveChange = vi.fn();
    render(<Field onActiveChange={onActiveChange} />);
    act(() => box().focus());
    act(() => box().blur());
    act(() => box().focus());
    expect(onActiveChange.mock.calls).toEqual([[true]]);
    expect(screen.getByRole('search')).toHaveAttribute(
      'data-search-field-active',
      'true',
    );
  });

  it('keeps the close button hidden and out of the tab order while inactive', () => {
    render(<Field />);
    expect(close()).toHaveAttribute('aria-hidden', 'true');
    expect(close()).toHaveAttribute('tabindex', '-1');
    act(() => box().focus());
    expect(close()).not.toHaveAttribute('aria-hidden');
    expect(close()).not.toHaveAttribute('tabindex');
    expect(screen.getByRole('button', {name: 'Cancel'})).toBe(close());
  });

  it('cancels from the close button: clears, ends editing and deactivates', () => {
    const onChange = vi.fn();
    const onActiveChange = vi.fn();
    render(
      <Field
        defaultValue="ap"
        onChange={onChange}
        onActiveChange={onActiveChange}
      />,
    );
    act(() => box().focus());
    fireEvent.click(close());
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
    expect(box()).toHaveValue('');
    expect(box()).not.toHaveFocus();
  });

  it('server-renders an active field narrowed, and steps the CSS pose aside once the parts are placed', () => {
    // No effects run: the markup and CSS a server-rendered page paints first.
    const host = document.createElement('div');
    host.innerHTML = renderToString(
      <SearchField label="Search" defaultIsActive />,
    );
    document.body.appendChild(host);
    try {
      const end = host.querySelector('[data-search-field-end]') as HTMLElement;
      // The trailing end moved in by the close button and its gap. (The
      // middle, the field's ::after, moves short by the same 55 px; jsdom
      // computes no pseudo-element style, so the browser proof of the CSS
      // pose checks it.)
      const {closeGap, closeSize} = search.stacked;
      expect(closeGap + closeSize).toBe(55);
      expect(getComputedStyle(end).marginInlineEnd).toBe('55px');
    } finally {
      host.remove();
    }
    // A client render places the parts and marks the root, so the CSS pose
    // no longer applies.
    render(<SearchField label="Search" defaultIsActive />);
    const root = screen.getByRole('search');
    expect(root).toHaveAttribute('data-search-field-placed');
    const end = root.querySelector('[data-search-field-end]') as HTMLElement;
    expect(getComputedStyle(end).marginInlineEnd).not.toBe('55px');
  });

  it('draws its background as pseudo-elements: the field holds only the magnifier, the input and the trailing end (architecture:component-style-authoring INV7)', () => {
    render(<Field />);
    const field = box().parentElement as HTMLElement;
    const parts = [...field.children];
    // The rounded ends and the middle that scales are decoration with no
    // role and no theme target: the field's ::before and ::after, and the
    // trailing end's ::before, not elements of their own.
    expect(parts).toHaveLength(3);
    expect(parts[0].querySelector('svg')).not.toBeNull();
    expect(parts[1]).toBe(box());
    expect(parts[2]).toHaveAttribute('data-search-field-end');
    // The trailing end holds nothing while the query is empty, then only the
    // clear button.
    expect(parts[2].children).toHaveLength(0);
    fireEvent.change(box(), {target: {value: 'a'}});
    expect([...parts[2].children].map(child => child.tagName)).toEqual([
      'BUTTON',
    ]);
  });

  it('draws its magnifier as the icon itself, with no wrapper element', () => {
    render(<Field />);
    const input = box();
    // The first svg in the field is the magnifier: the Icon's own root sits
    // directly in the field, beside the input, with nothing around it.
    const field = input.parentElement as HTMLElement;
    const icon = (field.querySelector('svg') as SVGElement)
      .parentElement as HTMLElement;
    expect(icon.parentElement).toBe(field);
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('server-renders the resting close button transparent and out of place, before hydration', () => {
    // No effects run: this is the markup and CSS a server-rendered page
    // paints first.
    const host = document.createElement('div');
    host.innerHTML = renderToString(<SearchField label="Search" />);
    document.body.appendChild(host);
    try {
      const button = host.querySelector(
        '[data-search-field-close]',
      ) as HTMLElement;
      expect(getComputedStyle(button).opacity).toBe('0');
      expect(getComputedStyle(button).pointerEvents).toBe('none');
      // The CSS offset is the table's close travel.
      expect(search.stacked.closeTravel).toBe(44);
    } finally {
      host.remove();
    }
  });

  it('a cancel from the close button with focus leaves focus on the search landmark, not on the hidden button', () => {
    render(<Field />);
    act(() => box().focus());
    // Keyboard users Tab to the close button, then press Enter or Space.
    act(() => close().focus());
    fireEvent.click(close());
    const landmark = screen.getByRole('search');
    expect(close()).toHaveAttribute('aria-hidden', 'true');
    expect(landmark).toHaveFocus();
    // The landmark lets focus go: it is not left in the tab order.
    act(() => landmark.blur());
    expect(landmark).not.toHaveAttribute('tabindex');
  });

  it('Escape leaves focus on the search landmark', () => {
    render(<Field />);
    act(() => box().focus());
    fireEvent.keyDown(box(), {key: 'Escape'});
    expect(screen.getByRole('search')).toHaveFocus();
  });

  it('names its buttons through the translator by default', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {
            '@astryx.searchField.cancel': 'Annuler',
            '@astryx.searchField.clear': 'Effacer le texte',
          },
        }}>
        <SearchField label="Rechercher" defaultValue="ap" />
      </InternationalizationProvider>,
    );
    act(() => screen.getByRole('searchbox').focus());
    expect(screen.getByRole('button', {name: 'Annuler'})).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Effacer le texte'}),
    ).toBeInTheDocument();
  });

  it('cancels on Escape, but not on an Escape that ends a composition', () => {
    const onActiveChange = vi.fn();
    render(<Field onActiveChange={onActiveChange} />);
    act(() => box().focus());
    fireEvent.keyDown(box(), {key: 'Escape', isComposing: true});
    expect(onActiveChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(box(), {key: 'Escape'});
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });

  it('submits the query on Enter and keeps editing', () => {
    const onSubmit = vi.fn();
    render(<Field defaultValue="pear" onSubmit={onSubmit} />);
    act(() => box().focus());
    fireEvent.keyDown(box(), {key: 'Enter'});
    expect(onSubmit).toHaveBeenCalledWith('pear');
    expect(box()).toHaveFocus();
  });

  it('shows the clear button only with text; it clears without taking focus', () => {
    render(<Field />);
    expect(
      screen.queryByRole('button', {name: 'Clear text'}),
    ).not.toBeInTheDocument();
    act(() => box().focus());
    fireEvent.change(box(), {target: {value: 'ch'}});
    const clear = screen.getByRole('button', {name: 'Clear text'});
    // Its press never takes the input's focus.
    expect(fireEvent.mouseDown(clear)).toBe(false);
    fireEvent.click(clear);
    expect(box()).toHaveValue('');
    expect(box()).toHaveFocus();
    expect(
      screen.queryByRole('button', {name: 'Clear text'}),
    ).not.toBeInTheDocument();
  });

  // iOS raises the keyboard only for a focus made during the tap; UIKit's
  // clear button makes a field that is not editing first responder.
  it('focuses the input inside the tap when clear is tapped while not editing', () => {
    render(<Field defaultValue="kiwi" defaultIsActive />);
    const clear = screen.getByRole('button', {name: 'Clear text'});
    const focusedDuring: (string | undefined)[] = [];
    const input = box();
    const focus = HTMLElement.prototype.focus;
    Object.defineProperty(input, 'focus', {
      configurable: true,
      value(options?: FocusOptions) {
        focusedDuring.push(window.event?.type);
        focus.call(input, options);
      },
    });
    fireEvent.click(clear);
    expect(input).toHaveFocus();
    expect(focusedDuring).toEqual(['click']);
  });

  it('lets a host focus the field right after committing its activation', () => {
    const handle = createRef<SearchFieldHandle>();
    function Host() {
      const [active, setActive] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              // A tab bar's tap: commit the activation, then focus inside the
              // same tap so the touch keyboard rises.
              flushSync(() => setActive(true));
              handle.current?.focus();
            }}>
            Search tab
          </button>
          <SearchField
            label="Search"
            handleRef={handle}
            isActive={active}
            onActiveChange={setActive}
          />
        </>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', {name: 'Search tab'}));
    expect(box()).toHaveFocus();
    expect(screen.getByRole('search')).toHaveAttribute(
      'data-search-field-active',
      'true',
    );
    act(() => handle.current?.blur());
    expect(box()).not.toHaveFocus();
  });

  it('follows controlled value and active state', () => {
    const {rerender} = render(<Field value="fig" isActive={false} />);
    expect(box()).toHaveValue('fig');
    expect(close()).toHaveAttribute('aria-hidden', 'true');
    rerender(<Field value="figs" isActive />);
    expect(box()).toHaveValue('figs');
    expect(close()).not.toHaveAttribute('aria-hidden');
  });

  describe('bottom placement', () => {
    it('is a 38 px field 33 px from each side, with a 38 px close button 17 px from the end', () => {
      render(<SearchField label="Search" placement="bottom" />);
      const root = screen.getByRole('search');
      const field = screen
        .getByRole('searchbox')
        .closest('[data-search-field-content]')?.parentElement as HTMLElement;
      expect(root.getAttribute('style')).toContain('33px');
      expect(field.getAttribute('style')).toContain('38px');
      expect(close().getAttribute('style')).toContain('38px');
      expect(close().getAttribute('style')).toContain('17px');
    });

    it('draws its background as pseudo-elements: the field holds only the content the gel carries and the trailing end', () => {
      render(<SearchField label="Search" placement="bottom" />);
      const content = screen
        .getByRole('searchbox')
        .closest('[data-search-field-content]') as HTMLElement;
      const field = content.parentElement as HTMLElement;
      // The rounded ends and the middle are the field's ::before and ::after
      // and the trailing end's ::before (architecture:component-style-authoring
      // INV7); the content wrapper moves the magnifier and the text with the
      // leading edge.
      expect([...field.children]).toEqual([
        content,
        field.querySelector('[data-search-field-end]'),
      ]);
      expect(content.children).toHaveLength(2);
      expect(
        (field.querySelector('[data-search-field-end]') as HTMLElement)
          .children,
      ).toHaveLength(0);
    });

    it('activates on focus and cancels from the close button, as the stacked field does', () => {
      const onActiveChange = vi.fn();
      render(
        <SearchField
          label="Search"
          placement="bottom"
          onActiveChange={onActiveChange}
        />,
      );
      act(() => box().focus());
      expect(onActiveChange).toHaveBeenLastCalledWith(true);
      fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
      expect(onActiveChange).toHaveBeenLastCalledWith(false);
      expect(box()).not.toHaveFocus();
    });

    it('the clear button refocuses the field without the browser scrolling it into view', () => {
      render(
        <SearchField label="Search" placement="bottom" defaultValue="ap" />,
      );
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      fireEvent.click(screen.getByRole('button', {name: 'Clear text'}));
      expect(focus).toHaveBeenLastCalledWith({preventScroll: true});
      focus.mockRestore();
    });

    it('keeps above the software keyboard by layout: under a finger the keyboard’s height lifts the field', async () => {
      await withKeyboard({}, keyboard => {
        render(<SearchField label="Search" placement="bottom" />);
        const root = screen.getByRole('search');
        expect(root.getAttribute('style')).not.toContain('300px');
        keyboard(300);
        // Inactive, the bar keeps its resting gap above the keyboard.
        expect(root.getAttribute('style')).toContain('300px');
        keyboard(0);
        expect(root.getAttribute('style')).not.toContain('300px');
      });
    });

    /** The bottom field resting 52 px above the viewport's bottom edge. */
    function renderActiveBottom() {
      render(<SearchField label="Search" placement="bottom" />);
      const root = screen.getByRole('search');
      vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, window.innerHeight - 52 - 19, 402, 38),
      );
      act(() => box().focus());
      return root;
    }

    it('moves the bar only on the keyboard’s report, with no prediction: a blur alone moves nothing', async () => {
      await withKeyboard({}, keyboard => {
        const root = renderActiveBottom();
        keyboard(300);
        // Active: its centre 36 px above the keyboard, 52 px above the edge
        // at rest.
        expect(root.getAttribute('style')).toContain('284px');
        act(() => box().blur());
        expect(root.getAttribute('style')).toContain('284px');
        keyboard(0);
        expect(root.getAttribute('style')).not.toContain('284px');
      });
    });

    it('in Chrome on Android reads the browser’s keyboard report while it has focus, the keyboard overlaying the page meanwhile', async () => {
      await withKeyboard({virtualKeyboardApi: true}, (keyboard, chrome) => {
        const root = renderActiveBottom();
        // Focused: the keyboard overlays the page and reports itself.
        expect(chrome.overlaysContent).toBe(true);
        chrome.report(300);
        expect(root.getAttribute('style')).toContain('284px');
        // The visual viewport is not the measure there.
        keyboard(100);
        expect(root.getAttribute('style')).toContain('284px');
        // After the blur the bar keeps its place until Chrome reports the
        // keyboard down; then the app's own setting goes back.
        act(() => box().blur());
        expect(chrome.overlaysContent).toBe(true);
        expect(root.getAttribute('style')).toContain('284px');
        chrome.report(0);
        expect(chrome.overlaysContent).toBe(false);
        expect(root.getAttribute('style')).not.toContain('284px');
        // A report while the field does not hold the overlay moves nothing.
        chrome.report(300);
        expect(root.getAttribute('style')).not.toContain('284px');
      });
    });

    it('measures no keyboard under a mouse', async () => {
      await withKeyboard({isTouch: false}, keyboard => {
        // A fine primary pointer, asserted in this test's own context.
        expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
        render(<SearchField label="Search" placement="bottom" />);
        keyboard(300);
        expect(screen.getByRole('search').getAttribute('style')).not.toContain(
          '300px',
        );
      });
    });
  });

  describe('tab placement', () => {
    it('draws only its content: the tab bar draws the glass and the cancel button', () => {
      render(<SearchField label="Search" placement="tab" />);
      const root = screen.getByRole('search');
      expect(box()).toBeInTheDocument();
      // No background: the field paints no ::before or ::after (checked in a
      // browser by SearchFieldTab.interaction.browser.spec.ts), and holds
      // only the magnifier, the input and the trailing end.
      const field = box().parentElement as HTMLElement;
      expect(field.children).toHaveLength(3);
      expect(root.querySelector('[data-search-field-close]')).toBeNull();
    });

    it('focuses without Safari’s reveal and cancels from the handle, for the tab bar’s own cancel button', () => {
      const handle = createRef<SearchFieldHandle>();
      const onActiveChange = vi.fn();
      const onChange = vi.fn();
      render(
        <SearchField
          label="Search"
          placement="tab"
          handleRef={handle}
          defaultValue="ap"
          onChange={onChange}
          onActiveChange={onActiveChange}
        />,
      );
      const input = box();
      // An own property, not an assignment: some DOMs expose `focus` as a
      // getter-only accessor.
      const calls: unknown[] = [];
      const focus = HTMLElement.prototype.focus;
      Object.defineProperty(input, 'focus', {
        configurable: true,
        value(options?: FocusOptions) {
          calls.push(options);
          focus.call(input, options);
        },
      });
      act(() => handle.current?.focus());
      expect(input).toHaveFocus();
      expect(calls).toEqual([{preventScroll: true}]);
      expect(onActiveChange).toHaveBeenLastCalledWith(true);
      act(() => handle.current?.cancel());
      expect(onChange).toHaveBeenLastCalledWith('');
      expect(onActiveChange).toHaveBeenLastCalledWith(false);
      expect(input).not.toHaveFocus();
      expect(input).toHaveValue('');
    });
  });
});
