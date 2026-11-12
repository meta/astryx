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
import {fireEvent, render, screen} from '@testing-library/react';
import {useClickableContainer} from './useClickableContainer';
import {pressBoxProps} from '../privateAttributes/pressBox.stylex';

const {cancelPress} = vi.hoisted(() => ({cancelPress: vi.fn()}));
vi.mock('../utils/pressFeedback', async importOriginal => ({
  ...(await importOriginal<typeof import('../utils/pressFeedback')>()),
  cancelPress,
}));

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

describe('onPointerDown', () => {
  function Harness({
    disabled = false,
    ownsBox = false,
  }: {
    disabled?: boolean;
    ownsBox?: boolean;
  }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const {onClick, onPointerDown} = useClickableContainer({
      containerRef,
      onClick: () => {},
      disabled,
    });
    return (
      <div
        data-testid="container"
        data-astryx-pressable=""
        ref={containerRef}
        onClick={onClick}
        onPointerDown={onPointerDown}>
        {ownsBox ? <span {...pressBoxProps} /> : null}
        <span>Surface</span>
        <button type="button">Nested</button>
      </div>
    );
  }

  afterEach(() => {
    cancelPress.mockClear();
  });

  it('cancels the press on the container for a finger press that starts on a nested control', () => {
    render(<Harness />);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Nested'}), {
      pointerType: 'touch',
    });
    expect(cancelPress).toHaveBeenCalledWith(screen.getByTestId('container'));
  });

  it('leaves a mouse or pen press to its own paint on a container that owns no control’s box', () => {
    render(<Harness />);
    const nested = screen.getByRole('button', {name: 'Nested'});
    fireEvent.pointerDown(nested, {pointerType: 'mouse'});
    fireEvent.pointerDown(nested, {pointerType: 'pen'});
    expect(cancelPress).not.toHaveBeenCalled();
  });

  it('cancels a mouse or pen press on a nested control of a container that owns a control’s box, and leaves one on the surface alone', () => {
    render(<Harness ownsBox />);
    const nested = screen.getByRole('button', {name: 'Nested'});
    fireEvent.pointerDown(nested, {pointerType: 'mouse'});
    fireEvent.pointerDown(nested, {pointerType: 'pen'});
    expect(cancelPress).toHaveBeenCalledTimes(2);
    expect(cancelPress).toHaveBeenCalledWith(screen.getByTestId('container'));
    cancelPress.mockClear();
    fireEvent.pointerDown(screen.getByText('Surface'), {pointerType: 'mouse'});
    expect(cancelPress).not.toHaveBeenCalled();
  });

  it('leaves a finger press on the surface, or in a disabled container, alone', () => {
    const {unmount} = render(<Harness />);
    fireEvent.pointerDown(screen.getByText('Surface'), {pointerType: 'touch'});
    unmount();
    render(<Harness disabled />);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Nested'}), {
      pointerType: 'touch',
    });
    expect(cancelPress).not.toHaveBeenCalled();
  });
});
