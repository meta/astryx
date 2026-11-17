// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useCollapsible.test.tsx
 * @input Uses vitest, @testing-library/react, CollapsibleGroupContext, and
 *   stubbed animations and boxes on the content element
 * @output Unit tests for useCollapsible hook
 * @position Testing; validates config parsing, the three-mode state machine
 *   (group-controlled / controlled / uncontrolled), the trigger and content
 *   props, content presence, motion phases, and the height measurement
 */

import {afterEach, beforeEach, describe, it, expect, vi} from 'vitest';
import {useEffect, type ReactNode} from 'react';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useCollapsible, type UseCollapsibleOptions} from './useCollapsible';
import {CollapsibleGroup} from './CollapsibleGroup';
import {
  CollapsibleGroupContext,
  type CollapsibleGroupContextValue,
} from './CollapsibleGroupContext';

// =============================================================================
// Helpers
// =============================================================================

function withGroup(group: CollapsibleGroupContextValue) {
  return function GroupWrapper({children}: {children: ReactNode}) {
    return (
      <CollapsibleGroupContext value={group}>
        {children}
      </CollapsibleGroupContext>
    );
  };
}

// =============================================================================
// Config parsing
// =============================================================================

describe('useCollapsible — config parsing', () => {
  it('treats isCollapsible=true as an enabled config that starts open', () => {
    const {result} = renderHook(() => useCollapsible({isCollapsible: true}));

    expect(result.current.isEnabled).toBe(true);
    expect(result.current.isOpen).toBe(true);
  });

  it('is disabled when isCollapsible is undefined', () => {
    const {result} = renderHook(() => useCollapsible({}));

    expect(result.current.isEnabled).toBe(false);
  });

  it('is disabled when isCollapsible is false', () => {
    const {result} = renderHook(() => useCollapsible({isCollapsible: false}));

    expect(result.current.isEnabled).toBe(false);
  });

  it('treats an object config as enabled', () => {
    const {result} = renderHook(() => useCollapsible({isCollapsible: {}}));

    expect(result.current.isEnabled).toBe(true);
    expect(result.current.isOpen).toBe(true);
  });

  it('starts closed when defaultIsOpen is false', () => {
    const {result} = renderHook(() =>
      useCollapsible({isCollapsible: {defaultIsOpen: false}}),
    );

    expect(result.current.isEnabled).toBe(true);
    expect(result.current.isOpen).toBe(false);
  });
});

// =============================================================================
// Uncontrolled mode
// =============================================================================

describe('useCollapsible — uncontrolled mode', () => {
  it('toggle flips the state open → closed → open', () => {
    const {result} = renderHook(() => useCollapsible({isCollapsible: true}));

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);
  });

  it('toggle updates internal state AND notifies onOpenChange', () => {
    // onOpenChange without isOpen is a notification callback, not a signal
    // that the component is controlled.
    const onOpenChange = vi.fn();
    const {result} = renderHook(() =>
      useCollapsible({isCollapsible: {onOpenChange}}),
    );

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
    expect(onOpenChange).toHaveBeenNthCalledWith(1, false);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);
    expect(onOpenChange).toHaveBeenNthCalledWith(2, true);
  });
});

// =============================================================================
// Controlled mode
// =============================================================================

describe('useCollapsible — controlled mode', () => {
  it('renders the isOpen prop and only notifies on toggle, never self-toggles', () => {
    const onOpenChange = vi.fn();
    const {result} = renderHook(() =>
      useCollapsible({isCollapsible: {isOpen: true, onOpenChange}}),
    );

    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggle();
    });

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // The parent owns the state — nothing changed internally.
    expect(result.current.isOpen).toBe(true);
  });

  it('reports the inverse of a closed controlled state', () => {
    const onOpenChange = vi.fn();
    const {result} = renderHook(() =>
      useCollapsible({isCollapsible: {isOpen: false, onOpenChange}}),
    );

    expect(result.current.isOpen).toBe(false);

    act(() => {
      result.current.toggle();
    });

    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(result.current.isOpen).toBe(false);
  });

  it('tolerates a controlled config without onOpenChange', () => {
    const {result} = renderHook(() =>
      useCollapsible({isCollapsible: {isOpen: true}}),
    );

    act(() => {
      result.current.toggle(); // must not throw
    });

    expect(result.current.isOpen).toBe(true);
  });
});

// =============================================================================
// Group mode
// =============================================================================

describe('useCollapsible — group mode', () => {
  it('reads isOpen from the group for its own value', () => {
    const group: CollapsibleGroupContextValue = {
      isOpen: vi.fn((value: string) => value === 'a'),
      toggle: vi.fn(),
    };

    const {result: itemA} = renderHook(
      () => useCollapsible({isCollapsible: true, value: 'a'}),
      {wrapper: withGroup(group)},
    );
    const {result: itemB} = renderHook(
      () => useCollapsible({isCollapsible: true, value: 'b'}),
      {wrapper: withGroup(group)},
    );

    expect(itemA.current.isOpen).toBe(true);
    expect(itemB.current.isOpen).toBe(false);
    expect(group.isOpen).toHaveBeenCalledWith('a');
    expect(group.isOpen).toHaveBeenCalledWith('b');
  });

  it('toggle defers to the group and skips local state and onOpenChange', () => {
    const onOpenChange = vi.fn();
    const group: CollapsibleGroupContextValue = {
      isOpen: vi.fn(() => true),
      toggle: vi.fn(),
    };
    const {result} = renderHook(
      () => useCollapsible({isCollapsible: {onOpenChange}, value: 'a'}),
      {wrapper: withGroup(group)},
    );

    act(() => {
      result.current.toggle();
    });

    expect(group.toggle).toHaveBeenCalledTimes(1);
    expect(group.toggle).toHaveBeenCalledWith('a');
    // Group owns the state: the config callback is not invoked and the open
    // state still comes from the group.
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(true);
  });

  it('falls back to standalone state inside a group when no value is given', () => {
    const group: CollapsibleGroupContextValue = {
      isOpen: vi.fn(() => false),
      toggle: vi.fn(),
    };
    const {result} = renderHook(() => useCollapsible({isCollapsible: true}), {
      wrapper: withGroup(group),
    });

    // Standalone default: open.
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.isOpen).toBe(false);
    expect(group.toggle).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Trigger and content props
// =============================================================================

const lifecycle = {mounts: 0, unmounts: 0};

function Body() {
  useEffect(() => {
    lifecycle.mounts += 1;
    return () => {
      lifecycle.unmounts += 1;
    };
  }, []);
  return <p>Body</p>;
}

function Disclosure(options: UseCollapsibleOptions) {
  const row = useCollapsible(options);
  return (
    <>
      {/* eslint-disable-next-line @eslint-react/dom-no-missing-button-type -- triggerProps carries type="button", which the first test asserts */}
      <button {...row.triggerProps}>Details</button>
      <div
        {...row.contentProps}
        data-testid="content"
        data-entering={String(row.isEntering)}
        data-exiting={String(row.isExiting)}>
        {row.isPresent && <Body />}
      </div>
    </>
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('button', {name: 'Details'});
}

function content(): HTMLElement {
  return screen.getByTestId('content');
}

/** A running CSS animation on the content element, until `stop` is called. */
function runAnimationOn(element: HTMLElement) {
  let isRunning = true;
  const animation = {
    animationName: 'panel',
    playState: 'running',
    effect: {getComputedTiming: () => ({endTime: 300})},
  } as unknown as Animation;
  Object.defineProperty(element, 'getAnimations', {
    configurable: true,
    value: () => (isRunning ? [animation] : []),
  });
  return {
    stop() {
      isRunning = false;
    },
  };
}

/** Makes each of `queries` match, and leaves every other query as it was. */
function matchQueries(...queries: string[]) {
  const matchMedia = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation(query =>
    queries.includes(query)
      ? {...matchMedia(query), matches: true}
      : matchMedia(query),
  );
}

function resetLifecycle() {
  lifecycle.mounts = 0;
  lifecycle.unmounts = 0;
}

// Testing Library unmounts the previous test's tree after this file's
// afterEach, so the count resets before each test.
beforeEach(resetLifecycle);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCollapsible — trigger and content props', () => {
  it('names the content from the trigger and reports the open state', async () => {
    const user = userEvent.setup();
    render(<Disclosure isCollapsible={{defaultIsOpen: false}} />);

    expect(trigger()).toHaveAttribute('type', 'button');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveAttribute('aria-controls', content().id);
    expect(content().id).not.toBe('');

    await user.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', content().id);
  });

  it('keeps the closed content element rendered, hidden and empty', () => {
    render(<Disclosure isCollapsible={{defaultIsOpen: false}} />);

    expect(content()).toHaveAttribute('hidden');
    expect(content()).toBeEmptyDOMElement();
    expect(lifecycle.mounts).toBe(0);
  });

  it('mounts the children when it opens and unmounts them when it closes', async () => {
    const user = userEvent.setup();
    render(<Disclosure isCollapsible={{defaultIsOpen: false}} />);

    await user.click(trigger());
    expect(content()).not.toHaveAttribute('hidden');
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(lifecycle).toEqual({mounts: 1, unmounts: 0});

    await user.click(trigger());
    expect(content()).toHaveAttribute('hidden');
    expect(content()).toBeEmptyDOMElement();
    expect(lifecycle).toEqual({mounts: 1, unmounts: 1});
  });

  it('follows a controlled open state', () => {
    const {rerender} = render(
      <Disclosure isCollapsible={{isOpen: false, onOpenChange: () => {}}} />,
    );
    expect(content()).toHaveAttribute('hidden');

    rerender(
      <Disclosure isCollapsible={{isOpen: true, onOpenChange: () => {}}} />,
    );
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('notifies onOpenChange from the trigger', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Disclosure isCollapsible={{isOpen: true, onOpenChange}} />);

    await user.click(trigger());
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// =============================================================================
// Content animation
// =============================================================================

describe('useCollapsible — content animation', () => {
  it('starts no motion phase on mount', () => {
    render(<Disclosure isCollapsible hasContentAnimation />);

    expect(content()).toHaveAttribute('data-entering', 'false');
    expect(content()).toHaveAttribute('data-exiting', 'false');
  });

  it('keeps the children, inert, until the close animation ends', async () => {
    const user = userEvent.setup();
    render(<Disclosure isCollapsible hasContentAnimation />);
    const animation = runAnimationOn(content());

    await user.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(content()).toHaveAttribute('data-exiting', 'true');
    expect(content()).not.toHaveAttribute('hidden');
    expect(content()).toHaveAttribute('inert');
    expect(lifecycle.unmounts).toBe(0);

    animation.stop();
    fireEvent.animationEnd(content());
    expect(content()).toHaveAttribute('data-exiting', 'false');
    expect(content()).toHaveAttribute('hidden');
    expect(content()).not.toHaveAttribute('inert');
    expect(content()).toBeEmptyDOMElement();
    expect(lifecycle.unmounts).toBe(1);
  });

  it('ends the close when the animation is cancelled', async () => {
    const user = userEvent.setup();
    render(<Disclosure isCollapsible hasContentAnimation />);
    const animation = runAnimationOn(content());

    await user.click(trigger());
    animation.stop();
    fireEvent(content(), new Event('animationcancel'));
    expect(content()).toHaveAttribute('hidden');
    expect(lifecycle.unmounts).toBe(1);
  });

  it('waits for every running animation of the content itself', async () => {
    const user = userEvent.setup();
    render(<Disclosure isCollapsible hasContentAnimation />);
    const animation = runAnimationOn(content());

    await user.click(trigger());
    // A descendant's animation, or one of two content animations, ends.
    fireEvent.animationEnd(screen.getByText('Body'));
    fireEvent.animationEnd(content());
    expect(content()).toHaveAttribute('data-exiting', 'true');
    expect(screen.getByText('Body')).toBeInTheDocument();

    animation.stop();
    fireEvent.animationEnd(content());
    expect(content()).toHaveAttribute('hidden');
  });

  it('marks the open animation and ends it at animationend', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure isCollapsible={{defaultIsOpen: false}} hasContentAnimation />,
    );
    const animation = runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('data-entering', 'true');
    expect(screen.getByText('Body')).toBeInTheDocument();

    animation.stop();
    fireEvent.animationEnd(content());
    expect(content()).toHaveAttribute('data-entering', 'false');
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('keeps the children mounted when it reopens during the close', async () => {
    const user = userEvent.setup();
    render(<Disclosure isCollapsible hasContentAnimation />);
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('data-exiting', 'true');
    await user.click(trigger());
    expect(content()).toHaveAttribute('data-entering', 'true');
    expect(content()).not.toHaveAttribute('inert');
    expect(lifecycle).toEqual({mounts: 1, unmounts: 0});
  });

  it('drops the children at once when no animation runs', async () => {
    const user = userEvent.setup();
    render(<Disclosure isCollapsible hasContentAnimation />);

    await user.click(trigger());
    expect(content()).toHaveAttribute('data-exiting', 'false');
    expect(content()).toHaveAttribute('hidden');
    expect(lifecycle.unmounts).toBe(1);
  });

  it('drops the children at once under Reduce Motion', async () => {
    const user = userEvent.setup();
    matchQueries('(prefers-reduced-motion: reduce)');
    render(<Disclosure isCollapsible hasContentAnimation />);
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('hidden');
    expect(lifecycle.unmounts).toBe(1);
  });

  it('drops the children at once inside a theme that reduces motion for everyone', async () => {
    const user = userEvent.setup();
    render(
      <div data-astryx-reduced-motion="">
        <Disclosure isCollapsible hasContentAnimation />
      </div>,
    );
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('hidden');
    expect(lifecycle.unmounts).toBe(1);
  });

  it('ignores endless animations and CSS transitions', async () => {
    const user = userEvent.setup();
    render(<Disclosure isCollapsible hasContentAnimation />);
    const pulse = {
      animationName: 'pulse',
      playState: 'running',
      effect: {getComputedTiming: () => ({endTime: Infinity})},
    };
    const fade = {
      playState: 'running',
      effect: {getComputedTiming: () => ({endTime: 200})},
    };
    Object.defineProperty(content(), 'getAnimations', {
      configurable: true,
      value: () => [pulse, fade],
    });

    await user.click(trigger());
    expect(content()).toHaveAttribute('hidden');
  });

  it('ends the close when a new content element without an animation replaces it', async () => {
    const user = userEvent.setup();
    function Swapping({tag}: {tag: 'div' | 'section'}) {
      const row = useCollapsible({
        isCollapsible: true,
        hasContentAnimation: true,
      });
      const Content = tag;
      return (
        <>
          {/* eslint-disable-next-line @eslint-react/dom-no-missing-button-type -- triggerProps carries type="button" */}
          <button {...row.triggerProps}>Details</button>
          <Content {...row.contentProps} data-testid="content">
            {row.isPresent && <Body />}
          </Content>
        </>
      );
    }
    const {rerender} = render(<Swapping tag="div" />);
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).not.toHaveAttribute('hidden');
    rerender(<Swapping tag="section" />);
    expect(content().tagName).toBe('SECTION');
    expect(content()).toHaveAttribute('hidden');
  });

  it('starts no phase without hasContentAnimation', async () => {
    const user = userEvent.setup();
    render(<Disclosure isCollapsible />);
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('data-exiting', 'false');
    expect(content()).toHaveAttribute('hidden');
    expect(content()).not.toHaveAttribute('inert');
  });
});

// =============================================================================
// Content height
// =============================================================================

/**
 * Gives the content a natural height of `height` px, which reads as 0 while
 * its open keyframes apply: only a read with the animation suppressed sees it.
 */
function stubNaturalHeight(element: HTMLElement, height: number) {
  const measured = () =>
    element.style.getPropertyValue('animation-name') === 'none' ? height : 0;
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, 320, measured()),
  );
  Object.defineProperty(element, 'offsetHeight', {
    configurable: true,
    get: () => Math.round(measured()),
  });
}

describe('useCollapsible — content height', () => {
  it('writes the natural height at each open, read with the animation suppressed', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure
        isCollapsible={{defaultIsOpen: false}}
        contentHeightProperty="--row-height"
      />,
    );
    stubNaturalHeight(content(), 120.5);

    await user.click(trigger());
    expect(content().style.getPropertyValue('--row-height')).toBe('120.5px');
    expect(content().style.getPropertyValue('animation-name')).toBe('');
  });

  it('writes nothing on mount', () => {
    render(<Disclosure isCollapsible contentHeightProperty="--row-height" />);

    expect(content().style.getPropertyValue('--row-height')).toBe('');
  });

  it('writes the natural height at a close it animates', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure
        isCollapsible
        hasContentAnimation
        contentHeightProperty="--row-height"
      />,
    );
    stubNaturalHeight(content(), 96);
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('data-exiting', 'true');
    expect(content().style.getPropertyValue('--row-height')).toBe('96px');
  });

  it('measures no close that drops the children at once', async () => {
    const user = userEvent.setup();
    render(<Disclosure isCollapsible contentHeightProperty="--row-height" />);
    stubNaturalHeight(content(), 96);

    await user.click(trigger());
    expect(content().style.getPropertyValue('--row-height')).toBe('');
  });

  it('measures no animated-option close that no animation holds', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure
        isCollapsible
        hasContentAnimation
        contentHeightProperty="--row-height"
      />,
    );
    stubNaturalHeight(content(), 96);

    await user.click(trigger());
    expect(content()).toHaveAttribute('hidden');
    expect(content().style.getPropertyValue('--row-height')).toBe('');
  });

  it('measures no close that Reduce Motion completes at once', async () => {
    const user = userEvent.setup();
    matchQueries('(prefers-reduced-motion: reduce)');
    render(
      <Disclosure
        isCollapsible
        hasContentAnimation
        contentHeightProperty="--row-height"
      />,
    );
    stubNaturalHeight(content(), 96);
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('hidden');
    expect(content().style.getPropertyValue('--row-height')).toBe('');
  });

  it('reads every row that changes in one commit before it writes any', async () => {
    const user = userEvent.setup();
    function Row({value}: {value: string}) {
      const row = useCollapsible({
        isCollapsible: true,
        value,
        hasContentAnimation: true,
        contentHeightProperty: '--row-height',
      });
      return (
        <>
          {/* eslint-disable-next-line @eslint-react/dom-no-missing-button-type -- triggerProps carries type="button" */}
          <button {...row.triggerProps}>{value}</button>
          <div {...row.contentProps} data-testid={`content-${value}`}>
            {row.isPresent && <p>{value}</p>}
          </div>
        </>
      );
    }
    render(
      <CollapsibleGroup type="single" defaultValue="a">
        <Row value="a" />
        <Row value="b" />
      </CollapsibleGroup>,
    );
    const rows = [
      screen.getByTestId('content-a'),
      screen.getByTestId('content-b'),
    ];
    const reads: string[] = [];
    for (const row of rows) {
      runAnimationOn(row);
      Object.defineProperty(row, 'offsetHeight', {
        configurable: true,
        get: () => 40,
      });
      vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => {
        reads.push(
          rows
            .map(
              each =>
                `${each.style.getPropertyValue('animation-name')}|${each.style.getPropertyValue('--row-height')}`,
            )
            .join(' '),
        );
        return new DOMRect(0, 0, 320, 40);
      });
    }

    // One click closes "a" and opens "b" in the same commit.
    await user.click(screen.getByRole('button', {name: 'b'}));
    // Every read sees both rows' animations suppressed and no height written.
    expect(reads).toEqual(['none| none|', 'none| none|']);
    for (const row of rows) {
      expect(row.style.getPropertyValue('--row-height')).toBe('40px');
      expect(row.style.getPropertyValue('animation-name')).toBe('');
    }
  });

  it("restores the content's own inline animation name", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure
        isCollapsible={{defaultIsOpen: false}}
        contentHeightProperty="--row-height"
      />,
    );
    stubNaturalHeight(content(), 80);
    content().style.setProperty('animation-name', 'grow');

    await user.click(trigger());
    expect(content().style.getPropertyValue('--row-height')).toBe('80px');
    expect(content().style.getPropertyValue('animation-name')).toBe('grow');
  });

  it('gives the content height of a content-box element', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure
        isCollapsible={{defaultIsOpen: false}}
        contentHeightProperty="--row-height"
      />,
    );
    stubNaturalHeight(content(), 120);
    content().style.boxSizing = 'content-box';
    content().style.paddingTop = '8px';
    content().style.paddingBottom = '12px';
    content().style.borderTop = '1px solid';
    content().style.borderBottom = '1px solid';

    await user.click(trigger());
    expect(content().style.getPropertyValue('--row-height')).toBe('98px');
  });

  it('uses the layout height under a scaled ancestor', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure
        isCollapsible={{defaultIsOpen: false}}
        contentHeightProperty="--row-height"
      />,
    );
    const element = content();
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 160, 60),
    );
    Object.defineProperty(element, 'offsetHeight', {
      configurable: true,
      get: () => 120,
    });

    await user.click(trigger());
    expect(element.style.getPropertyValue('--row-height')).toBe('120px');
  });
});

describe('useCollapsible — act-free state reads', () => {
  it('reports presence and phases from renderHook', () => {
    const {result} = renderHook(() =>
      useCollapsible({isCollapsible: {defaultIsOpen: false}}),
    );
    expect(result.current.isPresent).toBe(false);
    expect(result.current.isEntering).toBe(false);
    expect(result.current.isExiting).toBe(false);
    expect(result.current.contentProps.hidden).toBe(true);
    expect(result.current.contentProps.inert).toBe(false);

    act(() => {
      result.current.triggerProps.onClick();
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.isPresent).toBe(true);
    expect(result.current.contentProps.hidden).toBe(false);
    expect(result.current.triggerProps['aria-expanded']).toBe(true);
    expect(result.current.triggerProps['aria-controls']).toBe(
      result.current.contentProps.id,
    );
  });
});
