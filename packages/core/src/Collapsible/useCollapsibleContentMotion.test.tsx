// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useCollapsibleContentMotion.test.tsx
 * @input Uses vitest, @testing-library/react, useCollapsible, CollapsibleGroup,
 *   and stubbed animations, media queries, and boxes on the content element
 * @output Unit tests for useCollapsibleContentMotion
 * @position Testing; validates content presence, the motion phases, the
 *   Reduce Motion policy, and the height measurement and its one-pass batch
 */

import {afterEach, beforeEach, describe, it, expect, vi} from 'vitest';
import {useEffect} from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useCollapsible, type CollapsibleConfig} from './useCollapsible';
import {useCollapsibleContentMotion} from './useCollapsibleContentMotion';
import {CollapsibleGroup} from './CollapsibleGroup';

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

function Disclosure({
  isCollapsible = true,
  heightProperty,
  tag = 'div',
}: {
  isCollapsible?: boolean | CollapsibleConfig;
  heightProperty?: `--${string}`;
  tag?: 'div' | 'section';
}) {
  const row = useCollapsible({isCollapsible});
  const motion = useCollapsibleContentMotion(row, {heightProperty});
  const Content = tag;
  return (
    <>
      {/* eslint-disable-next-line @eslint-react/dom-no-missing-button-type -- triggerProps carries type="button" */}
      <button {...row.triggerProps}>Details</button>
      <Content
        {...motion.contentProps}
        data-testid="content"
        data-entering={String(motion.isEntering)}
        data-exiting={String(motion.isExiting)}>
        {motion.isPresent && <Body />}
      </Content>
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

const REDUCE = '(prefers-reduced-motion: reduce)';
const COARSE = '(pointer: coarse)';

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

// Testing Library unmounts the previous test's tree after this file's
// afterEach, so the count resets before each test.
beforeEach(() => {
  lifecycle.mounts = 0;
  lifecycle.unmounts = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCollapsibleContentMotion — presence and phases', () => {
  it('keeps the id the trigger names, and starts no phase on mount', () => {
    render(<Disclosure />);

    expect(trigger()).toHaveAttribute('aria-controls', content().id);
    expect(content()).toHaveAttribute('data-entering', 'false');
    expect(content()).toHaveAttribute('data-exiting', 'false');
  });

  it('keeps the children, inert, until the close animation ends', async () => {
    const user = userEvent.setup();
    render(<Disclosure />);
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
    render(<Disclosure />);
    const animation = runAnimationOn(content());

    await user.click(trigger());
    animation.stop();
    fireEvent(content(), new Event('animationcancel'));
    expect(content()).toHaveAttribute('hidden');
    expect(lifecycle.unmounts).toBe(1);
  });

  it('waits for every running animation of the content itself', async () => {
    const user = userEvent.setup();
    render(<Disclosure />);
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
    render(<Disclosure isCollapsible={{defaultIsOpen: false}} />);
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
    render(<Disclosure />);
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
    render(<Disclosure />);

    await user.click(trigger());
    expect(content()).toHaveAttribute('data-exiting', 'false');
    expect(content()).toHaveAttribute('hidden');
    expect(lifecycle.unmounts).toBe(1);
  });

  it('ignores endless animations and CSS transitions', async () => {
    const user = userEvent.setup();
    render(<Disclosure />);
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
    const {rerender} = render(<Disclosure tag="div" />);
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).not.toHaveAttribute('hidden');
    rerender(<Disclosure tag="section" />);
    expect(content().tagName).toBe('SECTION');
    expect(content()).toHaveAttribute('hidden');
  });
});

describe('useCollapsibleContentMotion — Reduce Motion', () => {
  it('drops the children at once with a fine pointer', async () => {
    const user = userEvent.setup();
    matchQueries(REDUCE);
    render(<Disclosure />);
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('hidden');
    expect(lifecycle.unmounts).toBe(1);
  });

  it('waits for the cross-fade with a coarse pointer', async () => {
    const user = userEvent.setup();
    matchQueries(REDUCE, COARSE);
    render(<Disclosure />);
    const fade = runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('data-exiting', 'true');
    expect(lifecycle.unmounts).toBe(0);

    fade.stop();
    fireEvent.animationEnd(content());
    expect(content()).toHaveAttribute('hidden');
    expect(lifecycle.unmounts).toBe(1);
  });

  it('drops the children at once inside a theme that reduces motion for everyone', async () => {
    const user = userEvent.setup();
    render(
      <div data-astryx-reduced-motion="">
        <Disclosure />
      </div>,
    );
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('hidden');
    expect(lifecycle.unmounts).toBe(1);
  });

  it('waits for the cross-fade inside such a theme with a coarse pointer', async () => {
    const user = userEvent.setup();
    matchQueries(COARSE);
    render(
      <div data-astryx-reduced-motion="">
        <Disclosure />
      </div>,
    );
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('data-exiting', 'true');
    expect(lifecycle.unmounts).toBe(0);
  });
});

describe('useCollapsibleContentMotion — content height', () => {
  it('writes the natural height at each open, read with the animation suppressed', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure
        isCollapsible={{defaultIsOpen: false}}
        heightProperty="--row-height"
      />,
    );
    stubNaturalHeight(content(), 120.5);

    await user.click(trigger());
    expect(content().style.getPropertyValue('--row-height')).toBe('120.5px');
    expect(content().style.getPropertyValue('animation-name')).toBe('');
  });

  it('writes nothing on mount', () => {
    render(<Disclosure heightProperty="--row-height" />);

    expect(content().style.getPropertyValue('--row-height')).toBe('');
  });

  it('writes the natural height at a close it animates', async () => {
    const user = userEvent.setup();
    render(<Disclosure heightProperty="--row-height" />);
    stubNaturalHeight(content(), 96);
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('data-exiting', 'true');
    expect(content().style.getPropertyValue('--row-height')).toBe('96px');
  });

  it('measures no close that no animation holds', async () => {
    const user = userEvent.setup();
    render(<Disclosure heightProperty="--row-height" />);
    stubNaturalHeight(content(), 96);

    await user.click(trigger());
    expect(content()).toHaveAttribute('hidden');
    expect(content().style.getPropertyValue('--row-height')).toBe('');
  });

  it('measures no close that Reduce Motion completes at once', async () => {
    const user = userEvent.setup();
    matchQueries(REDUCE);
    render(<Disclosure heightProperty="--row-height" />);
    stubNaturalHeight(content(), 96);
    runAnimationOn(content());

    await user.click(trigger());
    expect(content()).toHaveAttribute('hidden');
    expect(content().style.getPropertyValue('--row-height')).toBe('');
  });

  it('reads every row that changes in one commit before it writes any', async () => {
    const user = userEvent.setup();
    function Row({value}: {value: string}) {
      const row = useCollapsible({isCollapsible: true, value});
      const motion = useCollapsibleContentMotion(row, {
        heightProperty: '--row-height',
      });
      return (
        <>
          {/* eslint-disable-next-line @eslint-react/dom-no-missing-button-type -- triggerProps carries type="button" */}
          <button {...row.triggerProps}>{value}</button>
          <div {...motion.contentProps} data-testid={`content-${value}`}>
            {motion.isPresent && <p>{value}</p>}
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
        heightProperty="--row-height"
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
        heightProperty="--row-height"
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
        heightProperty="--row-height"
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
