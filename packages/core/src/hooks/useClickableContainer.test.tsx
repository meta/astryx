// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useClickableContainer.test.tsx
 * @input Uses vitest, @testing-library/react, useClickableContainer
 * @output Unit tests for the hook's navigation paths
 * @position Testing; pins the shared navigation-destination rule on every
 *   activation method the hook owns — plain click (location.href), new tab
 *   (target="_blank"), Cmd/Ctrl-click, middle-click, and the delegated click
 *   on the interactive ref. None of these pass through React DOM's own href
 *   vetting, so each one has a positive and a blocked case here.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useRef} from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {
  hasInteractiveAncestor,
  hasTextSelection,
  innermostInteractive,
  useClickableContainer,
} from './useClickableContainer';

// The scheme the rule exists to stop (kept in consts so the JSX below stays
// lint-clean — the tests are ABOUT these URLs never navigating).
const scriptUrl = 'javascript:alert(1)';
// The same scheme hidden behind a control character a browser ignores.
const hiddenScriptUrl = 'java\nscript:alert(1)';

function Card({href, target}: {href: string; target?: string}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {onClick, onMouseUp} = useClickableContainer({
    containerRef,
    href,
    target,
  });
  return (
    <div
      ref={containerRef}
      data-testid="card"
      onClick={onClick}
      onMouseUp={onMouseUp}>
      content
    </div>
  );
}

/**
 * Card that delegates plain clicks to an inner link (the ClickableCard /
 * Item shape). The inner anchor's own click is spied on so the test observes
 * whether the hook activated it.
 */
function DelegatingCard({
  href,
  onAnchorClick,
}: {
  href: string;
  onAnchorClick: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactiveRef = useRef<HTMLAnchorElement>(null);
  const {onClick, onMouseUp} = useClickableContainer({
    containerRef,
    interactiveRef,
    href,
  });
  return (
    <div
      ref={containerRef}
      data-testid="card"
      onClick={onClick}
      onMouseUp={onMouseUp}>
      content
      <a
        ref={interactiveRef}
        // The anchor is the delegate, not the subject: the tests below use a
        // fixed inert href here so that only the hook's decision is observed.
        href="#inner"
        data-testid="inner-link"
        onClick={e => {
          e.preventDefault();
          onAnchorClick();
        }}>
        inner
      </a>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.getSelection()?.removeAllRanges();
});

describe('shared clickable-container guards', () => {
  it('detects a selected range intersecting a container with its anchor outside', () => {
    render(
      <>
        <p>Outside</p>
        <Card href="/docs" />
      </>,
    );
    const card = screen.getByTestId('card');
    const range = document.createRange();
    range.setStart(screen.getByText('Outside').firstChild!, 0);
    range.setEnd(card.firstChild!, 3);
    const selection = document.getSelection()!;
    selection.addRange(range);
    expect(card.contains(selection.anchorNode)).toBe(false);
    expect(hasTextSelection(card)).toBe(true);
  });

  it('does not navigate when a cross-boundary selection ends inside the card', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <>
        <p>Outside</p>
        <Card href="/docs" target="_blank" />
      </>,
    );
    const card = screen.getByTestId('card');
    const range = document.createRange();
    range.setStart(screen.getByText('Outside').firstChild!, 0);
    range.setEnd(card.firstChild!, 3);
    document.getSelection()!.addRange(range);
    fireEvent.click(card);
    expect(open).not.toHaveBeenCalled();
    document.getSelection()!.removeAllRanges();
    fireEvent.click(card);
    expect(open).toHaveBeenCalledExactlyOnceWith('/docs', '_blank', 'noopener');
  });

  it('ignores absent, collapsed and unrelated selections', () => {
    render(
      <>
        <p>Outside</p>
        <Card href="/docs" />
      </>,
    );
    const card = screen.getByTestId('card');
    const selection = document.getSelection()!;
    expect(hasTextSelection(card)).toBe(false);
    const range = document.createRange();
    range.selectNodeContents(card);
    range.collapse(true);
    selection.addRange(range);
    expect(hasTextSelection(card)).toBe(false);
    selection.removeAllRanges();
    range.selectNodeContents(screen.getByText('Outside'));
    selection.addRange(range);
    expect(hasTextSelection(card)).toBe(false);
    vi.spyOn(document, 'getSelection').mockReturnValue(null);
    expect(hasTextSelection(card)).toBe(false);
  });

  it('checks every selected range, not just the anchor or first range', () => {
    render(
      <>
        <p>Outside</p>
        <Card href="/docs" />
      </>,
    );
    const card = screen.getByTestId('card');
    const unrelated = document.createRange();
    unrelated.selectNodeContents(screen.getByText('Outside'));
    const intersecting = document.createRange();
    intersecting.setStart(screen.getByText('Outside').firstChild!, 0);
    intersecting.setEnd(card.firstChild!, 3);
    // jsdom supports only one native selection range.
    vi.spyOn(document, 'getSelection').mockReturnValue({
      isCollapsed: false,
      anchorNode: unrelated.startContainer,
      rangeCount: 2,
      getRangeAt: (index: number) => [unrelated, intersecting][index],
    } as Selection);
    expect(hasTextSelection(card)).toBe(true);
  });

  it('treats an inaccessible selected range as a blocked gesture', () => {
    render(<Card href="/docs" />);
    vi.spyOn(document, 'getSelection').mockReturnValue({
      isCollapsed: false,
      anchorNode: null,
      rangeCount: 1,
      getRangeAt() {
        throw new Error('Range changed');
      },
    } as unknown as Selection);
    expect(hasTextSelection(screen.getByTestId('card'))).toBe(true);
  });

  it('uses the node document selection instead of the global document', () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    try {
      const foreign = iframe.contentDocument!;
      const outside = foreign.createElement('p');
      outside.textContent = 'Outside';
      const card = foreign.createElement('div');
      card.textContent = 'Inside';
      foreign.body.append(outside, card);
      const range = foreign.createRange();
      range.setStart(outside.firstChild!, 0);
      range.setEnd(card.firstChild!, 3);
      foreign.getSelection()!.addRange(range);
      expect(document.getSelection()!.rangeCount).toBe(0);
      expect(hasTextSelection(card)).toBe(true);
    } finally {
      iframe.remove();
    }
  });

  it('stops the shared walk at the target document body', () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    try {
      const foreign = iframe.contentDocument!;
      const content = foreign.createElement('span');
      foreign.body.append(content);
      foreign.body.setAttribute('role', 'button');
      expect(innermostInteractive(content, null)).toBeNull();
    } finally {
      iframe.remove();
    }
  });

  it.each([
    'button',
    'a',
    'input',
    'select',
    'textarea',
    'checkbox',
    'radio',
    'switch',
    'tab',
    'menuitem',
    'option',
    'combobox',
    'listbox',
    'slider',
    'spinbutton',
    'link',
  ])('preserves the shared interactive boundary for %s', kind => {
    const root = document.createElement('div');
    const isNative = ['button', 'a', 'input', 'select', 'textarea'].includes(
      kind,
    );
    const control = document.createElement(isNative ? kind : 'span');
    if (!isNative) {
      control.setAttribute('role', kind);
    }
    const child = document.createElement('span');
    control.append(child);
    root.append(control);
    expect(hasInteractiveAncestor(child, root)).toBe(true);
    control.setAttribute('aria-readonly', 'true');
    expect(hasInteractiveAncestor(child, root)).toBe(false);
  });
});

describe('useClickableContainer navigation — new tab (target="_blank")', () => {
  it('opens ordinary hrefs in a new tab', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<Card href="https://example.com/docs" target="_blank" />);
    fireEvent.click(screen.getByTestId('card'));
    expect(open).toHaveBeenCalledWith(
      'https://example.com/docs',
      '_blank',
      'noopener',
    );
  });

  it('does not open a script-scheme href in a new tab', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    // eslint-disable-next-line @eslint-react/dom-no-script-url -- the test proves this URL never navigates
    render(<Card href={scriptUrl} target="_blank" />);
    fireEvent.click(screen.getByTestId('card'));
    expect(open).not.toHaveBeenCalled();
  });
});

describe('useClickableContainer navigation — Cmd/Ctrl-click', () => {
  it('opens ordinary hrefs in a new tab on Cmd-click', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<Card href="/docs" />);
    fireEvent.click(screen.getByTestId('card'), {metaKey: true});
    expect(open).toHaveBeenCalledWith('/docs', '_blank', 'noopener');
  });

  it('opens ordinary hrefs in a new tab on Ctrl-click', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<Card href="/docs" />);
    fireEvent.click(screen.getByTestId('card'), {ctrlKey: true});
    expect(open).toHaveBeenCalledWith('/docs', '_blank', 'noopener');
  });

  it('does not open a script-scheme href on Cmd-click', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    // eslint-disable-next-line @eslint-react/dom-no-script-url -- the test proves this URL never navigates
    render(<Card href={scriptUrl} />);
    fireEvent.click(screen.getByTestId('card'), {metaKey: true});
    expect(open).not.toHaveBeenCalled();
  });

  it('does not open a script-scheme href on Ctrl-click', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    // eslint-disable-next-line @eslint-react/dom-no-script-url -- the test proves this URL never navigates
    render(<Card href={scriptUrl} />);
    fireEvent.click(screen.getByTestId('card'), {ctrlKey: true});
    expect(open).not.toHaveBeenCalled();
  });
});

describe('useClickableContainer navigation — middle-click', () => {
  it('opens ordinary hrefs on middle-click', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<Card href="/docs" />);
    fireEvent.mouseUp(screen.getByTestId('card'), {button: 1});
    expect(open).toHaveBeenCalledWith('/docs', '_blank', 'noopener');
  });

  it('does not open a script-scheme href on middle-click', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    // eslint-disable-next-line @eslint-react/dom-no-script-url -- the test proves this URL never navigates
    render(<Card href={scriptUrl} />);
    fireEvent.mouseUp(screen.getByTestId('card'), {button: 1});
    expect(open).not.toHaveBeenCalled();
  });
});

describe('useClickableContainer navigation — plain click (location.href)', () => {
  // jsdom does not navigate, so assigning `location.href` is a no-op there
  // and would let a missing guard pass unnoticed. Stand in a plain object so
  // the assignment is observable.
  let location: {href: string};

  beforeEach(() => {
    location = {href: 'https://app.example/start'};
    vi.stubGlobal('location', location);
  });

  it('assigns ordinary hrefs to location', () => {
    render(<Card href="/docs" />);
    fireEvent.click(screen.getByTestId('card'));
    expect(location.href).toBe('/docs');
  });

  it('does not assign a script-scheme href to location', () => {
    // eslint-disable-next-line @eslint-react/dom-no-script-url -- the test proves this URL never navigates
    render(<Card href={scriptUrl} />);
    fireEvent.click(screen.getByTestId('card'));
    expect(location.href).toBe('https://app.example/start');
  });

  it('does not assign a control-character-hidden script scheme to location', () => {
    // eslint-disable-next-line @eslint-react/dom-no-script-url -- the test proves this URL never navigates
    render(<Card href={hiddenScriptUrl} />);
    fireEvent.click(screen.getByTestId('card'));
    expect(location.href).toBe('https://app.example/start');
  });
});

describe('useClickableContainer navigation — delegated interactive ref', () => {
  it('delegates ordinary hrefs to the inner link', () => {
    const onAnchorClick = vi.fn();
    render(<DelegatingCard href="/docs" onAnchorClick={onAnchorClick} />);
    fireEvent.click(screen.getByTestId('card'));
    expect(onAnchorClick).toHaveBeenCalledTimes(1);
  });

  it('does not delegate a script-scheme href to the inner link', () => {
    const onAnchorClick = vi.fn();
    // eslint-disable-next-line @eslint-react/dom-no-script-url -- the test proves this URL never navigates
    render(<DelegatingCard href={scriptUrl} onAnchorClick={onAnchorClick} />);
    fireEvent.click(screen.getByTestId('card'));
    expect(onAnchorClick).not.toHaveBeenCalled();
  });

  it('a click on the inner link itself is left to the link', () => {
    const onAnchorClick = vi.fn();
    render(<DelegatingCard href="/docs" onAnchorClick={onAnchorClick} />);
    fireEvent.click(screen.getByTestId('inner-link'));
    // The anchor's own handler ran once; the hook did not proxy a second one.
    expect(onAnchorClick).toHaveBeenCalledTimes(1);
  });
});

describe('useClickableContainer navigation — blocked href keeps the rest', () => {
  it('still fires the onClick handler for a blocked href', () => {
    const onClick = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    function Surface() {
      const containerRef = useRef<HTMLDivElement>(null);
      const handlers = useClickableContainer({
        containerRef,
        href: scriptUrl,
        target: '_blank',
        onClick,
      });
      return <div ref={containerRef} data-testid="card" {...handlers} />;
    }
    render(<Surface />);
    fireEvent.click(screen.getByTestId('card'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });
});
