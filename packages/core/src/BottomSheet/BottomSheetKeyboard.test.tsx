// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetKeyboard.test.tsx
 * @input BottomSheetPanel, real shared scroll behavior, and explicit DOM geometry
 * @output Regression coverage for viewport access, entry-time eligibility, and focus continuity
 * @position BottomSheet integration tests; browser stories verify native key scrolling
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {useState, type ReactNode} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {BottomSheetPanel} from './BottomSheetPanel';

function Fixture({children}: {children: ReactNode}) {
  return (
    <BottomSheetPanel
      label="Reading details"
      state={{kind: 'open', entering: false}}
      height="capped"
      onDismiss={() => {}}
      onScrimOpacity={() => {}}>
      {children}
    </BottomSheetPanel>
  );
}

function body() {
  return screen.getByRole('group', {name: 'Reading details'});
}

async function measure(scrollHeight: number, scrollWidth = 300) {
  const viewport = body();
  // jsdom does not resolve the shared hook's dynamic StyleX CSS variable.
  viewport.style.overflowY = 'auto';
  viewport.style.overflowX = 'auto';
  for (const [key, value] of Object.entries({
    clientHeight: 100,
    clientWidth: 300,
    scrollHeight,
    scrollWidth,
  })) {
    Object.defineProperty(viewport, key, {configurable: true, value});
  }
  fireEvent(window, new Event('resize'));
  await waitFor(() => {
    expect(viewport.dataset.scrollableBlock === 'true').toBe(
      scrollHeight > 101,
    );
  });
}

beforeEach(() => {
  // jsdom has no layout. Visibility-specific cases still use real computed
  // style/hidden/inert checks; native layout is covered in Storybook.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    new DOMRect(0, 0, 20, 20),
  ] as unknown as DOMRectList);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BottomSheet keyboard scrolling', () => {
  it('adds a named body tab stop only while text-only content overflows', async () => {
    render(<Fixture>Reading details body</Fixture>);
    await measure(100);
    expect(body()).not.toHaveAttribute('tabindex');
    await measure(300);
    expect(body()).toHaveAttribute('tabindex', '0');
    expect(body()).toHaveStyle({overscrollBehaviorY: 'contain'});
  });

  it('preserves current body focus when overflow disappears', async () => {
    render(<Fixture>Reading details body</Fixture>);
    await measure(300);
    act(() => body().focus());
    await measure(100);
    expect(body()).toHaveFocus();
    expect(body()).toHaveAttribute('tabindex', '-1');
    expect(body()).toHaveStyle({overscrollBehaviorY: 'auto'});
  });

  it('retains keyboard access to content that overflows only horizontally', async () => {
    render(<Fixture>Wide reading content</Fixture>);
    await measure(100, 600);
    await waitFor(() =>
      expect(body()).toHaveAttribute('data-scrollable-inline', 'true'),
    );
    expect(body()).toHaveAttribute('tabindex', '0');
  });

  it('keeps the named viewport available alongside focusable content', async () => {
    render(
      <Fixture>
        <button type="button">Continue reading</button>
      </Fixture>,
    );
    await measure(300);
    expect(body()).toHaveAttribute('tabindex', '0');
    act(() => screen.getByRole('button').focus());
    expect(screen.getByRole('button')).toHaveFocus();
  });

  it.each([
    <button type="button" key="disabled" disabled>
      Unavailable
    </button>,
    <button type="button" key="hidden" hidden>
      Hidden
    </button>,
    <button type="button" key="negative" tabIndex={-2}>
      Programmatic only
    </button>,
    <button type="button" key="visibility" style={{visibility: 'hidden'}}>
      Hidden by CSS
    </button>,
    <div key="inert" inert>
      <button type="button">Inert</button>
    </div>,
    <fieldset key="fieldset" disabled>
      <button type="button">Disabled by fieldset</button>
    </fieldset>,
  ])(
    'ignores a descendant that cannot supply sequential keyboard access (%#)',
    async child => {
      render(<Fixture>{child}</Fixture>);
      await measure(300);
      expect(body()).toHaveAttribute('tabindex', '0');
    },
  );

  it('does not move focus when a nested child changes', async () => {
    let setHasControl: (value: boolean) => void = () => {};
    function AsyncContent() {
      const [hasControl, update] = useState(false);
      setHasControl = update;
      return hasControl ? (
        <button type="button">Loaded action</button>
      ) : (
        <p>Loading text</p>
      );
    }
    render(
      <Fixture>
        <AsyncContent />
      </Fixture>,
    );
    await measure(300);
    act(() => body().focus());
    act(() => setHasControl(true));
    expect(body()).toHaveAttribute('tabindex', '0');
    expect(body()).toHaveFocus();
    act(() => setHasControl(false));
    await waitFor(() => expect(body()).toHaveAttribute('tabindex', '0'));
  });

  it('retains the viewport when an existing descendant becomes disabled', async () => {
    render(
      <Fixture>
        <button type="button">Continue reading</button>
      </Fixture>,
    );
    await measure(300);
    screen.getByRole('button').setAttribute('disabled', '');
    await waitFor(() => expect(body()).toHaveAttribute('tabindex', '0'));
  });

  it.each(['content', 'ancestor'])(
    'retains the viewport when %s data attributes change child visibility',
    async target => {
      const {container} = render(
        <Fixture>
          <style>
            {'[data-actions="hidden"] button { visibility: hidden; }'}
          </style>
          <div data-testid="conditional-content">
            <button type="button">Conditional action</button>
          </div>
        </Fixture>,
      );
      await measure(300);
      expect(body()).toHaveAttribute('tabindex', '0');
      const owner =
        target === 'content'
          ? screen.getByTestId('conditional-content')
          : container;
      owner.setAttribute('data-actions', 'hidden');
      await waitFor(() => expect(body()).toHaveAttribute('tabindex', '0'));
      owner.removeAttribute('data-actions');
      expect(body()).toHaveAttribute('tabindex', '0');
    },
  );
});
