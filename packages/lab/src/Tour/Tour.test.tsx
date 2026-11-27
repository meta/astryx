// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tour.test.tsx
 * @input Tour
 * @output Unit tests for the steps, controls, anchors, callout and focus rules
 * @position Colocated tests; the real-browser cases are in `__tests__/`.
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {StrictMode, createRef, useRef, useState, type RefObject} from 'react';
import {Tour, type TourProps, type TourStep} from './Tour';
import {Dialog} from '@astryxdesign/core/Dialog';
import {useFocusTrap} from '@astryxdesign/core/hooks';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';

/** Empties the announcer's live regions, which outlive a test. */
function emptyLiveRegions(): void {
  for (const region of document.querySelectorAll('[aria-live]')) {
    region.textContent = '';
  }
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', {hidden: true});
}

function button(name: string): HTMLElement {
  return screen.getByRole('button', {name, hidden: true});
}

function heading(): HTMLElement {
  return screen.getByRole('heading', {hidden: true});
}

/**
 * Makes `showPopover` read its `source` option, as a browser that orders a
 * popover after that element does. Returns each element a popover was shown
 * with.
 */
function readSources(): HTMLElement[] {
  const sources: HTMLElement[] = [];
  vi.spyOn(HTMLElement.prototype, 'showPopover').mockImplementation(
    (options?: ShowPopoverOptions) => {
      const source = options?.source;
      if (source != null) {
        sources.push(source);
      }
    },
  );
  return sources;
}

/** Makes an open dialog match `:modal`, which the test environment lacks. */
function matchModal(): void {
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':modal'
      ? this.tagName === 'DIALOG' && this.hasAttribute('open')
      : matches.call(this, selector);
  });
}

/** The empty tab stops a step puts in the page. */
function focusEntries(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('span[tabindex]:empty')];
}

type HarnessProps = Partial<TourProps> & {
  /** Builds the steps from the three anchors the harness renders. */
  makeSteps?: (anchors: {
    firstRef: RefObject<HTMLButtonElement | null>;
    secondRef: RefObject<HTMLButtonElement | null>;
    thirdRef: RefObject<HTMLButtonElement | null>;
  }) => TourStep[];
  initialId?: string | null;
  hasSecondAnchor?: boolean;
  /** Ids of default steps to leave out of the array. */
  omit?: ReadonlyArray<string>;
};

const NO_STEPS: ReadonlyArray<string> = [];
const onEnd = vi.fn();
const onActiveIdChange = vi.fn();

function Harness({
  makeSteps,
  initialId = 'one',
  hasSecondAnchor = true,
  omit = NO_STEPS,
  ...props
}: HarnessProps) {
  const firstRef = useRef<HTMLButtonElement>(null);
  const secondRef = useRef<HTMLButtonElement>(null);
  const thirdRef = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const steps =
    makeSteps?.({firstRef, secondRef, thirdRef}) ??
    [
      {
        id: 'one',
        anchorRef: firstRef,
        title: 'First title',
        body: 'First body',
      },
      {
        id: 'two',
        anchorRef: secondRef,
        title: 'Second title',
        body: 'Second body',
      },
      {id: 'three', anchorRef: thirdRef, title: 'Third title'},
    ].filter(step => !omit.includes(step.id));
  return (
    <main>
      <button type="button" ref={firstRef} onClick={() => setActiveId('one')}>
        First anchor
      </button>
      {hasSecondAnchor && (
        <button
          type="button"
          ref={secondRef}
          onClick={() => setActiveId('three')}>
          Second anchor
        </button>
      )}
      <button type="button" ref={thirdRef}>
        Third anchor
      </button>
      <button type="button" onClick={() => setActiveId('two')}>
        Go to two
      </button>
      <Tour
        steps={steps}
        activeId={activeId}
        onActiveIdChange={id => {
          onActiveIdChange(id);
          setActiveId(id);
        }}
        onEnd={reason => {
          onEnd(reason);
          setActiveId(null);
        }}
        {...props}
      />
    </main>
  );
}

beforeEach(async () => {
  onEnd.mockClear();
  onActiveIdChange.mockClear();
  // The announcer writes in an animation frame. Let a write that the last
  // test left waiting finish, then empty the regions.
  await act(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
  emptyLiveRegions();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Tour steps (AST-119 FR1–FR3)', () => {
  it('renders nothing while activeId is null', () => {
    render(<Harness initialId={null} />);
    expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();
  });

  it('shows the active step in a dialog named by its title and described by its body', async () => {
    render(<Harness hasStepCount />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(dialog()).toHaveAccessibleName('First title');
    expect(dialog()).toHaveAccessibleDescription('First body 1 of 3');
    expect(dialog()).not.toHaveAttribute('aria-modal');
  });

  it('counts only the steps in the array', async () => {
    render(
      <Harness
        hasStepCount
        makeSteps={({firstRef: first, thirdRef: third}) => [
          {id: 'one', anchorRef: first, title: 'First title'},
          {id: 'three', anchorRef: third, title: 'Third title'},
        ]}
      />,
    );
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    fireEvent.click(button('Next'));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Third title'));
    expect(onActiveIdChange).toHaveBeenLastCalledWith('three');
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
  });
});

describe('Tour controls (AST-119 FR4, FR5, FR12)', () => {
  it('moves with Next and Back and ends with Done', async () => {
    render(<Harness />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(
      screen.queryByRole('button', {name: 'Back', hidden: true}),
    ).toBeNull();
    fireEvent.click(button('Next'));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    fireEvent.click(button('Back'));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('First title'));
    expect(onActiveIdChange.mock.calls).toEqual([['two'], ['one']]);
    fireEvent.click(button('Next'));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    fireEvent.click(button('Next'));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Third title'));
    expect(
      screen.queryByRole('button', {name: 'Next', hidden: true}),
    ).toBeNull();
    fireEvent.click(button('Done'));
    expect(onEnd).toHaveBeenCalledWith('complete');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {hidden: true})).toBeNull(),
    );
  });

  it('reports close and skip', async () => {
    const {unmount} = render(<Harness hasSkipButton />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    fireEvent.click(button('Close tour'));
    expect(onEnd).toHaveBeenLastCalledWith('close');
    unmount();
    render(<Harness hasSkipButton />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    fireEvent.click(button('Skip'));
    expect(onEnd).toHaveBeenLastCalledWith('skip');
  });

  it('takes the words for Next, Done and Skip from the props', async () => {
    render(
      <Harness
        hasSkipButton
        nextLabel="Continue"
        doneLabel="Finish"
        skipLabel="Not now"
        initialId="three"
      />,
    );
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(button('Finish')).toBeInTheDocument();
    expect(button('Not now')).toBeInTheDocument();
    fireEvent.click(button('Back'));
    await waitFor(() => expect(button('Continue')).toBeInTheDocument());
  });

  it('shows the step the app sets from its own handler, an anchor’s click included', async () => {
    render(<Harness />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', {name: 'Go to two'}));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    fireEvent.click(screen.getByRole('button', {name: 'Second anchor'}));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Third title'));
    expect(onActiveIdChange).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('reports a move and an end, and keeps the step until the app takes them', async () => {
    const steps: TourStep[] = [
      {id: 'one', title: 'First title'},
      {id: 'two', title: 'Second title'},
    ];
    render(
      <Tour
        steps={steps}
        activeId="one"
        onActiveIdChange={onActiveIdChange}
        onEnd={onEnd}
      />,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('First title'));
    fireEvent.click(button('Next'));
    expect(onActiveIdChange).toHaveBeenCalledWith('two');
    fireEvent.click(button('Close tour'));
    expect(onEnd).toHaveBeenCalledWith('close');
    await act(async () => {});
    expect(dialog()).toHaveAccessibleName('First title');
  });
});

describe('Tour focus (AST-119 FR15)', () => {
  it('moves focus to the heading of the next step when focus is in the callout', async () => {
    render(<Harness />);
    await waitFor(() => expect(heading()).toHaveFocus());
    const next = button('Next');
    act(() => next.focus());
    fireEvent.click(next);
    await waitFor(() => {
      expect(dialog()).toHaveAccessibleName('Second title');
      expect(heading()).toHaveFocus();
    });
  });
});

describe('Tour step list changes (AST-119 FR3, FR4)', () => {
  it('moves to the step that follows an active step that leaves the array', async () => {
    const {rerender} = render(<Harness initialId="two" />);
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    rerender(<Harness initialId="two" omit={['two']} />);
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Third title'));
    expect(onActiveIdChange).toHaveBeenCalledTimes(1);
    expect(onActiveIdChange).toHaveBeenCalledWith('three');
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('ends as complete when the active last step leaves the array', async () => {
    const {rerender} = render(<Harness initialId="three" />);
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Third title'));
    rerender(<Harness initialId="three" omit={['three']} />);
    await waitFor(() => expect(onEnd).toHaveBeenCalledWith('complete'));
    expect(onEnd).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {hidden: true})).toBeNull(),
    );
  });

  it('renders nothing and warns for an activeId that matches no step', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Harness initialId="nowhere" />);
    expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();
    expect(warn.mock.calls.flat().join(' ')).toContain('matches no step');
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('ignores the later of two steps that share an id, and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Harness
        hasStepCount
        makeSteps={({firstRef: first, thirdRef: third}) => [
          {id: 'one', anchorRef: first, title: 'First title'},
          {id: 'one', anchorRef: third, title: 'Copy'},
        ]}
      />,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('First title'));
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    expect(warn.mock.calls.flat().join(' ')).toContain('share an id');
  });
});

describe('Tour missing anchor (AST-119 FR8, FR9)', () => {
  const onMissingAnchor = vi.fn();
  beforeEach(() => {
    onMissingAnchor.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('shows the step centered by default, reports it once, and takes the anchor when a later render finds it', async () => {
    const {rerender} = render(
      <Harness hasSecondAnchor={false} onMissingAnchor={onMissingAnchor} />,
    );
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    fireEvent.click(button('Next'));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    expect(onMissingAnchor).toHaveBeenCalledTimes(1);
    expect(onMissingAnchor).toHaveBeenCalledWith('two');
    expect(vi.mocked(console.warn).mock.calls.flat().join(' ')).toContain(
      'Step "two" started without its anchor',
    );
    expect(document.querySelector('.astryx-tour-highlight')).toBeNull();

    rerender(<Harness onMissingAnchor={onMissingAnchor} />);
    await waitFor(() =>
      expect(document.querySelector('.astryx-tour-highlight')).not.toBeNull(),
    );
    expect(onMissingAnchor).toHaveBeenCalledTimes(1);
  });

  it('skips forward after Next and back after Back', async () => {
    render(
      <Harness
        hasSecondAnchor={false}
        missingAnchorBehavior="skipStep"
        onMissingAnchor={onMissingAnchor}
      />,
    );
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    fireEvent.click(button('Next'));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Third title'));
    expect(onActiveIdChange.mock.calls).toEqual([['two'], ['three']]);
    fireEvent.click(button('Back'));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('First title'));
    expect(onActiveIdChange.mock.calls.slice(2)).toEqual([['two'], ['one']]);
    expect(onMissingAnchor).toHaveBeenCalledTimes(2);
  });

  it('ends as complete when the skipped step is the last, and keeps the step that showed when Back skips the first', async () => {
    const {unmount} = render(
      <Harness
        initialId="two"
        missingAnchorBehavior="skipStep"
        makeSteps={({secondRef: second}) => [
          {id: 'two', anchorRef: second, title: 'Second title'},
          {id: 'gone', anchorRef: {current: null}, title: 'Gone'},
        ]}
      />,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    fireEvent.click(button('Next'));
    await waitFor(() => expect(onEnd).toHaveBeenCalledWith('complete'));
    unmount();
    onActiveIdChange.mockClear();

    render(
      <Harness
        initialId="two"
        missingAnchorBehavior="skipStep"
        makeSteps={({secondRef: second}) => [
          {id: 'gone', anchorRef: {current: null}, title: 'Gone'},
          {id: 'two', anchorRef: second, title: 'Second title'},
        ]}
      />,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    fireEvent.click(button('Back'));
    await waitFor(() =>
      expect(onActiveIdChange.mock.calls).toEqual([['gone'], ['two']]),
    );
    expect(dialog()).toHaveAccessibleName('Second title');
  });

  it('ends the tour as complete with endTour', async () => {
    render(
      <Harness
        hasSecondAnchor={false}
        missingAnchorBehavior="endTour"
        onMissingAnchor={onMissingAnchor}
      />,
    );
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    fireEvent.click(button('Next'));
    await waitFor(() => expect(onEnd).toHaveBeenCalledWith('complete'));
    expect(onMissingAnchor).toHaveBeenCalledWith('two');
  });

  it('waits for showAction before it shows the step, and treats a rejection as a missing anchor', async () => {
    let finish: () => void = () => {};
    const showAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    const {unmount} = render(
      <Harness
        makeSteps={({firstRef: first}) => [
          {id: 'one', anchorRef: first, title: 'First title', showAction},
        ]}
      />,
    );
    await act(async () => {});
    expect(showAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();
    await act(async () => finish());
    await waitFor(() => expect(dialog()).toHaveAccessibleName('First title'));
    unmount();

    render(
      <Harness
        onMissingAnchor={onMissingAnchor}
        makeSteps={() => [
          {
            id: 'one',
            anchorRef: {current: null},
            title: 'First title',
            showAction: async () => {
              throw new Error('no panel');
            },
          },
        ]}
      />,
    );
    await waitFor(() => expect(onMissingAnchor).toHaveBeenCalledWith('one'));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('First title'));
    expect(document.querySelector('.astryx-tour-highlight')).toBeNull();
  });
});

describe('Tour modality and Escape (AST-119 FR13, FR14, FR17)', () => {
  it('ends with escape only while focus is in the callout or on the anchor, without a backdrop', async () => {
    const {unmount} = render(<Harness />);
    await waitFor(() => expect(heading()).toHaveFocus());
    const elsewhere = screen.getByRole('button', {name: 'Go to two'});
    act(() => elsewhere.focus());
    fireEvent.keyDown(elsewhere, {key: 'Escape'});
    expect(onEnd).not.toHaveBeenCalled();
    const anchor = screen.getByRole('button', {name: 'First anchor'});
    act(() => anchor.focus());
    fireEvent.keyDown(anchor, {key: 'Escape'});
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith('escape');
    unmount();
    onEnd.mockClear();

    render(<Harness />);
    await waitFor(() => expect(heading()).toHaveFocus());
    const next = button('Next');
    act(() => next.focus());
    fireEvent.keyDown(next, {key: 'Escape'});
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith('escape');
  });

  it('ends with escape from a control outside the callout, with a backdrop', async () => {
    render(<Harness hasBackdrop />);
    await waitFor(() => expect(heading()).toHaveFocus());
    const elsewhere = screen.getByRole('button', {name: 'Go to two'});
    act(() => elsewhere.focus());
    expect(elsewhere).toHaveFocus();
    fireEvent.keyDown(elsewhere, {key: 'Escape'});
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith('escape');
  });

  it('is modal with a backdrop: aria-modal, Escape from anywhere, and a press on the backdrop ends it', async () => {
    const {unmount} = render(<Harness hasBackdrop />);
    await waitFor(() => expect(heading()).toHaveFocus());
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    const overlay = document.querySelector('.astryx-tour-overlay');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    fireEvent.keyDown(document.body, {key: 'Escape'});
    expect(onEnd).toHaveBeenLastCalledWith('escape');
    unmount();

    render(<Harness hasBackdrop />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    const backdrop = document.querySelector('.astryx-tour-overlay');
    if (backdrop == null) {
      throw new Error('No backdrop');
    }
    fireEvent.click(backdrop);
    expect(onEnd).toHaveBeenLastCalledWith('backdrop');
  });

  it('keeps a press on the backdrop from handlers around where Tour is written', async () => {
    const onOuterClick = vi.fn();
    const onOuterPointerDown = vi.fn();
    render(
      <div onClick={onOuterClick} onPointerDown={onOuterPointerDown}>
        <Harness hasBackdrop />
      </div>,
    );
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    const backdrop = document.querySelector('.astryx-tour-overlay');
    if (backdrop == null) {
      throw new Error('No backdrop');
    }
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onEnd).toHaveBeenLastCalledWith('backdrop');
    expect(onOuterPointerDown).not.toHaveBeenCalled();
    expect(onOuterClick).not.toHaveBeenCalled();
  });

  it('leaves a press on the overlay alone without a backdrop', async () => {
    render(<Harness />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    const overlay = document.querySelector('.astryx-tour-overlay');
    if (overlay == null) {
      throw new Error('No overlay');
    }
    fireEvent.click(overlay);
    expect(onEnd).not.toHaveBeenCalled();
  });
});

describe('Tour focus at a step change and at the end (AST-119 FR15, FR16)', () => {
  it('leaves focus that the person placed elsewhere and announces the step', async () => {
    render(<Harness />);
    await waitFor(() => expect(heading()).toHaveFocus());
    const elsewhere = screen.getByRole('button', {name: 'Go to two'});
    act(() => elsewhere.focus());
    fireEvent.click(elsewhere);
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    expect(elsewhere).toHaveFocus();
    await waitFor(() =>
      expect(
        [...document.querySelectorAll('[aria-live]')].some(region =>
          region.textContent?.includes('Second title'),
        ),
      ).toBe(true),
    );
  });

  it('moves focus to the heading from the previous anchor, and always with a backdrop', async () => {
    const {unmount} = render(<Harness />);
    await waitFor(() => expect(heading()).toHaveFocus());
    const anchor = screen.getByRole('button', {name: 'First anchor'});
    act(() => anchor.focus());
    fireEvent.click(screen.getByRole('button', {name: 'Next', hidden: true}));
    await waitFor(() => {
      expect(dialog()).toHaveAccessibleName('Second title');
      expect(heading()).toHaveFocus();
    });
    unmount();

    render(<Harness hasBackdrop />);
    await waitFor(() => expect(heading()).toHaveFocus());
    const elsewhere = screen.getByRole('button', {name: 'Go to two'});
    act(() => elsewhere.focus());
    fireEvent.click(elsewhere);
    await waitFor(() => {
      expect(dialog()).toHaveAccessibleName('Second title');
      expect(heading()).toHaveFocus();
    });
  });

  it('returns focus to the step\u2019s anchor when the tour ends from the callout, and leaves focus elsewhere alone', async () => {
    const {unmount} = render(<Harness />);
    await waitFor(() => expect(heading()).toHaveFocus());
    const close = button('Close tour');
    act(() => close.focus());
    fireEvent.click(close);
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'First anchor'})).toHaveFocus(),
    );
    unmount();

    render(<Harness />);
    await waitFor(() => expect(heading()).toHaveFocus());
    const elsewhere = screen.getByRole('button', {name: 'Go to two'});
    act(() => elsewhere.focus());
    fireEvent.click(button('Close tour'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {hidden: true})).toBeNull(),
    );
    expect(elsewhere).toHaveFocus();
  });
});

describe('Tour words and highlight (AST-119 FR11, FR13)', () => {
  it('takes its own control words from the catalog, and the props win', async () => {
    render(
      <InternationalizationProvider
        locale="en"
        overrides={{
          en: {
            '@astryx.tour.back': 'Zurück',
            '@astryx.tour.next': 'Weiter',
            '@astryx.tour.done': 'Fertig',
            '@astryx.tour.skip': 'Überspringen',
            '@astryx.tour.close': 'Tour schließen',
            '@astryx.tour.stepCount': '{current, number} von {total, number}',
          },
        }}>
        <Harness initialId="two" hasStepCount hasSkipButton skipLabel="Later" />
      </InternationalizationProvider>,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    expect(button('Zurück')).toBeInTheDocument();
    expect(button('Weiter')).toBeInTheDocument();
    expect(button('Tour schließen')).toBeInTheDocument();
    expect(button('Later')).toBeInTheDocument();
    expect(screen.getByText('2 von 3')).toBeInTheDocument();
    fireEvent.click(button('Weiter'));
    await waitFor(() => expect(button('Fertig')).toBeInTheDocument());
  });

  it('shows the app\u2019s title and body and no words of its own in them', async () => {
    render(
      <Harness
        makeSteps={({firstRef: first}) => [
          {id: 'one', anchorRef: first, title: 'Only a title'},
        ]}
      />,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Only a title'));
    expect(dialog()).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(/of 1/)).toBeNull();
    expect(
      screen.queryByRole('button', {name: 'Skip', hidden: true}),
    ).toBeNull();
  });

  it('marks the anchor with a ring that assistive technology does not see, and none for a step with no anchor', async () => {
    render(
      <Harness
        makeSteps={({firstRef: first}) => [
          {id: 'one', anchorRef: first, title: 'First title'},
          {id: 'free', title: 'No anchor'},
        ]}
      />,
    );
    await waitFor(() =>
      expect(document.querySelector('.astryx-tour-highlight')).not.toBeNull(),
    );
    expect(
      document
        .querySelector('.astryx-tour-highlight')
        ?.closest('[aria-hidden]'),
    ).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(button('Next'));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('No anchor'));
    expect(document.querySelector('.astryx-tour-highlight')).toBeNull();
  });
});

describe('Tour edge cases (AST-119 FR8, FR16)', () => {
  it('skips forward from a step the app sets itself when its anchor is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Harness hasSecondAnchor={false} missingAnchorBehavior="skipStep" />,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('First title'));
    fireEvent.click(screen.getByRole('button', {name: 'Go to two'}));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Third title'));
    expect(onActiveIdChange.mock.calls).toEqual([['three']]);
  });

  it('returns focus to the anchor when the tour ends with focus on the page body', async () => {
    render(<Harness />);
    await waitFor(() => expect(heading()).toHaveFocus());
    act(() => {
      heading().blur();
    });
    expect(document.body).toHaveFocus();
    fireEvent.click(button('Close tour'));
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'First anchor'})).toHaveFocus(),
    );
  });
});

describe('Tour step list changes with other steps moving (AST-119 FR3)', () => {
  it('moves to the next step that is still in the array when earlier steps leave with the active one', async () => {
    const {rerender} = render(<Harness initialId="two" />);
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    rerender(<Harness initialId="two" omit={['one', 'two']} />);
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Third title'));
    expect(onActiveIdChange.mock.calls).toEqual([['three']]);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('does not move back to a step that came before the removed one', async () => {
    const {rerender} = render(
      <Harness
        initialId="two"
        makeSteps={({firstRef: first, secondRef: second}) => [
          {id: 'one', anchorRef: first, title: 'First title'},
          {id: 'two', anchorRef: second, title: 'Second title'},
        ]}
      />,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    rerender(
      <Harness
        initialId="two"
        makeSteps={({firstRef: first}) => [
          {id: 'new', title: 'New first'},
          {id: 'one', anchorRef: first, title: 'First title'},
        ]}
      />,
    );
    await waitFor(() => expect(onEnd).toHaveBeenCalledWith('complete'));
    expect(onActiveIdChange).not.toHaveBeenCalled();
  });

  it('skips forward from a promoted step whose anchor is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {rerender} = render(
      <Harness hasSecondAnchor={false} missingAnchorBehavior="skipStep" />,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('First title'));
    rerender(
      <Harness
        hasSecondAnchor={false}
        missingAnchorBehavior="skipStep"
        omit={['one']}
      />,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Third title'));
    expect(onActiveIdChange.mock.calls).toEqual([['two'], ['three']]);
  });
});

describe('Tour scroll, preparation and focus details (AST-119 FR7, FR9, FR15, FR16)', () => {
  it('scrolls the anchor into view when a step shows, and not with hasScrollIntoView off', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const {unmount} = render(<Harness />);
      await waitFor(() => expect(dialog()).toBeInTheDocument());
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(
        screen.getByRole('button', {name: 'First anchor'}),
      );
      expect(scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({block: 'nearest', inline: 'nearest'}),
      );
      fireEvent.click(button('Next'));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
      unmount();
      scrollIntoView.mockClear();

      render(<Harness hasScrollIntoView={false} />);
      await waitFor(() => expect(dialog()).toBeInTheDocument());
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      // jsdom has no scrollIntoView of its own.
      delete (Element.prototype as {scrollIntoView?: unknown}).scrollIntoView;
    }
  });

  it('moves no focus while a preparation is pending, and follows where focus is when it ends', async () => {
    let finish: () => void = () => {};
    render(
      <Harness
        makeSteps={({firstRef: first, secondRef: second}) => [
          {id: 'one', anchorRef: first, title: 'First title'},
          {
            id: 'two',
            anchorRef: second,
            title: 'Second title',
            showAction: async () =>
              new Promise<void>(resolve => {
                finish = resolve;
              }),
          },
        ]}
      />,
    );
    await waitFor(() => expect(heading()).toHaveFocus());
    const next = button('Next');
    act(() => next.focus());
    fireEvent.click(next);
    await act(async () => {});
    // Pending: the next step does not show, the dialog reports busy, focus is
    // where it was, and a second press on Next moves no step.
    expect(next).toHaveFocus();
    expect(screen.queryByText('Second title')).toBeNull();
    expect(dialog()).toHaveAttribute('aria-busy', 'true');
    onActiveIdChange.mockClear();
    fireEvent.click(next);
    expect(onActiveIdChange).not.toHaveBeenCalled();
    // The person moves focus to the page while the step prepares.
    const elsewhere = screen.getByRole('button', {name: 'Go to two'});
    act(() => elsewhere.focus());
    await act(async () => finish());
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    expect(elsewhere).toHaveFocus();
    expect(dialog()).not.toHaveAttribute('aria-busy');
  });

  it('ignores Done while an earlier step prepares after Back', async () => {
    let finish: () => void = () => {};
    render(
      <Harness
        initialId="two"
        makeSteps={({firstRef: first, secondRef: second}) => [
          {
            id: 'one',
            anchorRef: first,
            title: 'First title',
            showAction: async () =>
              new Promise<void>(resolve => {
                finish = resolve;
              }),
          },
          {id: 'two', anchorRef: second, title: 'Second title'},
        ]}
      />,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Second title'));
    fireEvent.click(button('Back'));
    await act(async () => {});
    expect(dialog()).toHaveAttribute('aria-busy', 'true');
    // The last step still shows its Done control. It stays focusable, says
    // that it is disabled, and ends no tour now.
    expect(button('Done')).toHaveAttribute('aria-disabled', 'true');
    expect(button('Back')).toHaveAttribute('aria-disabled', 'true');
    expect(button('Done')).not.toBeDisabled();
    fireEvent.click(button('Done'));
    expect(onEnd).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(dialog()).toHaveAccessibleName('First title'));
    expect(button('Next')).not.toHaveAttribute('aria-disabled');
  });

  it('moves focus to the heading from the page body at a step change, with no announcement', async () => {
    render(<Harness />);
    await waitFor(() => expect(heading()).toHaveFocus());
    act(() => {
      heading().blur();
    });
    expect(document.body).toHaveFocus();
    fireEvent.click(screen.getByRole('button', {name: 'Go to two'}));
    await waitFor(() => {
      expect(dialog()).toHaveAccessibleName('Second title');
      expect(heading()).toHaveFocus();
    });
    // The announcer writes in an animation frame; give it time for two.
    await act(async () => {
      await new Promise(resolve => {
        setTimeout(resolve, 60);
      });
    });
    expect(
      [...document.querySelectorAll('[aria-live]')].some(region =>
        region.textContent?.includes('Second title'),
      ),
    ).toBe(false);
  });

  it('announces a step politely when focus stays where the person placed it', async () => {
    render(
      <Harness
        makeSteps={({firstRef: first, secondRef: second}) => [
          {id: 'one', anchorRef: first, title: 'First title'},
          {
            id: 'two',
            anchorRef: second,
            // The callout's name leaves the glyph out, and so does the
            // announcement.
            title: (
              <>
                <span aria-hidden="true">★</span> Second title
              </>
            ),
          },
        ]}
      />,
    );
    await waitFor(() => expect(heading()).toHaveFocus());
    const elsewhere = screen.getByRole('button', {name: 'Go to two'});
    act(() => elsewhere.focus());
    fireEvent.click(elsewhere);
    await waitFor(() => {
      const regions = [...document.querySelectorAll('[aria-live]')].filter(
        region => region.textContent?.includes('Second title'),
      );
      expect(regions).toHaveLength(1);
      expect(regions[0]).toHaveAttribute('aria-live', 'polite');
      expect(regions[0]).toHaveTextContent(/^Second title$/);
    });
  });

  it('announces a step again when the tour starts again at it', async () => {
    render(<Harness initialId={null} />);
    const elsewhere = screen.getByRole('button', {name: 'Go to two'});
    const isAnnounced = () =>
      [...document.querySelectorAll('[aria-live]')].some(region =>
        region.textContent?.includes('Second title'),
      );
    act(() => elsewhere.focus());
    fireEvent.click(elsewhere);
    await waitFor(() => expect(isAnnounced()).toBe(true));

    fireEvent.click(button('Close tour'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {hidden: true})).toBeNull(),
    );
    expect(elsewhere).toHaveFocus();
    emptyLiveRegions();
    expect(isAnnounced()).toBe(false);

    fireEvent.click(elsewhere);
    await waitFor(() => expect(isAnnounced()).toBe(true));
  });

  it('does not leave focus on the page body when the tour ends at an anchor that cannot take focus', async () => {
    function PlainAnchor() {
      const anchorRef = useRef<HTMLDivElement>(null);
      const [activeId, setActiveId] = useState<string | null>(null);
      return (
        <main>
          <button type="button" onClick={() => setActiveId('one')}>
            Start
          </button>
          <div ref={anchorRef}>A card</div>
          <Tour
            steps={[{id: 'one', anchorRef, title: 'Card title'}]}
            activeId={activeId}
            onActiveIdChange={setActiveId}
            onEnd={() => setActiveId(null)}
          />
        </main>
      );
    }
    render(<PlainAnchor />);
    const starter = screen.getByRole('button', {name: 'Start'});
    act(() => starter.focus());
    fireEvent.click(starter);
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Card title'));
    const close = button('Close tour');
    act(() => close.focus());
    fireEvent.click(close);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {hidden: true})).toBeNull(),
    );
    expect(document.body).not.toHaveFocus();
    expect(starter).toHaveFocus();
  });
});

describe('Tour place in the focus order (AST-119 FR14)', () => {
  it('shows a step with an empty tab stop right before its anchor, and the callout follows it', async () => {
    const sources = readSources();
    render(<Harness initialId="two" />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    const entries = focusEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].tabIndex).toBe(0);
    expect(entries[0]).not.toHaveAttribute('aria-hidden');
    expect(entries[0].nextElementSibling).toBe(button('Second anchor'));
    expect(sources).toEqual([entries[0]]);
  });

  it('puts no tab stop in the page in a browser that does not read the source option', async () => {
    const show = vi
      .spyOn(HTMLElement.prototype, 'showPopover')
      .mockImplementation(() => {});
    render(<Harness initialId="two" />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(show).toHaveBeenCalled();
    expect(focusEntries()).toHaveLength(0);
  });

  it('puts no tab stop in the page for a step with a backdrop', async () => {
    const sources = readSources();
    render(<Harness initialId="two" hasBackdrop />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(focusEntries()).toHaveLength(0);
    // A modal callout is shown with its anchor, and holds Tab.
    expect(sources).toEqual([button('Second anchor')]);
  });

  it('gives each step its own tab stop, and removes it when the tour ends', async () => {
    const sources = readSources();
    render(<Harness initialId="two" />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    const [first] = focusEntries();
    fireEvent.click(button('Next'));
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Third title'));
    const entries = focusEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).not.toBe(first);
    expect(entries[0].nextElementSibling).toBe(button('Third anchor'));
    expect(sources).toEqual([first, entries[0]]);

    fireEvent.click(button('Close tour'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {hidden: true})).toBeNull(),
    );
    expect(focusEntries()).toHaveLength(0);
  });

  it('puts no tab stop in the page for a step that takes its anchor after it started', async () => {
    readSources();
    const {rerender} = render(
      <Harness initialId="two" hasSecondAnchor={false} />,
    );
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(focusEntries()).toHaveLength(0);
    rerender(<Harness initialId="two" />);
    await act(async () => {});
    expect(button('Second anchor')).toBeInTheDocument();
    expect(focusEntries()).toHaveLength(0);
  });

  it('puts no tab stop in a focus region that the callout is not inside', async () => {
    const sources = readSources();
    function InRegion() {
      const {containerRef} = useFocusTrap<HTMLDivElement>({isActive: true});
      const secondRef = useRef<HTMLButtonElement>(null);
      const [activeId, setActiveId] = useState<string | null>(null);
      return (
        <main>
          <button type="button" onClick={() => setActiveId('second')}>
            Start in the region
          </button>
          <div ref={containerRef}>
            <button type="button">First in the region</button>
            <button type="button" ref={secondRef}>
              Second in the region
            </button>
          </div>
          <Tour
            steps={[{id: 'second', anchorRef: secondRef, title: 'Region step'}]}
            activeId={activeId}
            onActiveIdChange={setActiveId}
            onEnd={() => setActiveId(null)}
          />
        </main>
      );
    }
    render(<InRegion />);
    await act(async () => {});
    fireEvent.click(button('Start in the region'));
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(focusEntries()).toHaveLength(0);
    expect(sources).toEqual([button('Second in the region')]);
  });

  it('removes the tab stop when the step takes a backdrop', async () => {
    readSources();
    const {rerender} = render(<Harness initialId="two" />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(focusEntries()).toHaveLength(1);
    rerender(<Harness initialId="two" hasBackdrop />);
    await waitFor(() => expect(focusEntries()).toHaveLength(0));
  });

  it('takes its key listeners off the document when the step ends', async () => {
    readSources();
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const addToWindow = vi.spyOn(window, 'addEventListener');
    const removeFromWindow = vi.spyOn(window, 'removeEventListener');
    const blurListeners = (calls: ReadonlyArray<ReadonlyArray<unknown>>) =>
      calls.filter(([type]) => type === 'blur').map(([, listener]) => listener);
    // The capture listeners for keys, one "type" and one listener each.
    const keyListeners = (calls: ReadonlyArray<ReadonlyArray<unknown>>) =>
      calls
        .filter(
          ([type, , options]) =>
            (type === 'keydown' || type === 'keyup') && options === true,
        )
        .map(([type, listener]) => ({type: String(type), listener}));
    render(<Harness initialId="two" />);
    await waitFor(() => expect(focusEntries()).toHaveLength(1));
    const added = keyListeners(add.mock.calls);
    expect(new Set(added.map(entry => entry.type))).toEqual(
      new Set(['keydown', 'keyup']),
    );
    expect(added).toHaveLength(2);
    const blurAdded = blurListeners(addToWindow.mock.calls);
    expect(blurAdded).toHaveLength(1);
    fireEvent.click(button('Close tour'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {hidden: true})).toBeNull(),
    );
    expect(keyListeners(remove.mock.calls)).toEqual(
      expect.arrayContaining(added),
    );
    expect(blurListeners(removeFromWindow.mock.calls)).toEqual(blurAdded);
  });

  it('removes the tab stop when Tour unmounts', async () => {
    readSources();
    const {unmount} = render(<Harness initialId="two" />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(focusEntries()).toHaveLength(1);
    unmount();
    expect(focusEntries()).toHaveLength(0);
  });

  it('puts one tab stop in the page under StrictMode', async () => {
    readSources();
    render(
      <StrictMode>
        <Harness initialId="two" />
      </StrictMode>,
    );
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(focusEntries()).toHaveLength(1);
  });

  it('takes the tab stop out of the page while the anchor is away', async () => {
    readSources();
    const {rerender} = render(<Harness initialId="two" />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(focusEntries()).toHaveLength(1);
    rerender(<Harness initialId="two" hasSecondAnchor={false} />);
    await waitFor(() => expect(focusEntries()).toHaveLength(0));
    rerender(<Harness initialId="two" />);
    await waitFor(() => expect(focusEntries()).toHaveLength(1));
    expect(focusEntries()[0].nextElementSibling).toBe(button('Second anchor'));
  });

  it('moves the tab stop up to the parent when its place is the first element of the parent', async () => {
    readSources();
    render(<Harness />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    const main = screen.getByRole('main', {hidden: true});
    const [entry] = focusEntries();
    expect(main.firstElementChild).toBe(button('First anchor'));
    expect(main.contains(entry)).toBe(false);
    expect(entry.nextElementSibling?.contains(main)).toBe(true);
  });

  it('hands focus that lands on the tab stop to the callout: the first control for Tab, the last for Shift+Tab', async () => {
    readSources();
    render(<Harness initialId="two" />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    const [entry] = focusEntries();
    const press = (from: HTMLElement, shiftKey: boolean) => {
      from.focus();
      fireEvent.keyDown(from, {key: 'Tab', shiftKey});
      entry.focus();
      fireEvent.keyUp(document.activeElement ?? from, {key: 'Tab', shiftKey});
    };
    press(button('First anchor'), false);
    expect(button('Close tour')).toHaveFocus();
    press(button('Third anchor'), true);
    expect(button('Next')).toHaveFocus();
    // A focus region that wraps forward moves focus here from a control
    // after the tab stop.
    press(button('Third anchor'), false);
    expect(button('Close tour')).toHaveFocus();
    // Focus that a script moves here, with no key, goes to the first control.
    button('Third anchor').focus();
    entry.focus();
    expect(button('Close tour')).toHaveFocus();
    // The key is over once it is up.
    fireEvent.keyDown(button('Close tour'), {key: 'Tab', shiftKey: true});
    fireEvent.keyUp(button('Close tour'), {key: 'Tab', shiftKey: true});
    button('Third anchor').focus();
    entry.focus();
    expect(button('Close tour')).toHaveFocus();
  });

  it('ends a Tab press whose key comes up outside the page: at a focus on the tab stop, and when the window loses focus', async () => {
    readSources();
    render(<Harness initialId="two" />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    const [entry] = focusEntries();
    // Shift+Tab at the start of the callout goes through the tab stop and
    // out of the page. Focus that comes back enters at the first control.
    button('Close tour').focus();
    fireEvent.keyDown(button('Close tour'), {key: 'Tab', shiftKey: true});
    expect(entry).toHaveFocus();
    button('Third anchor').focus();
    entry.focus();
    expect(button('Close tour')).toHaveFocus();

    button('Third anchor').focus();
    fireEvent.keyDown(button('Third anchor'), {key: 'Tab', shiftKey: true});
    fireEvent.blur(window);
    entry.focus();
    expect(button('Close tour')).toHaveFocus();
  });

  it('leaves Shift+Tab with Control or Meta at the start of the callout where it is, and moves focus to the tab stop with Alt', async () => {
    readSources();
    render(<Harness initialId="two" />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    for (const modifier of ['ctrlKey', 'metaKey'] as const) {
      button('Close tour').focus();
      fireEvent.keyDown(button('Close tour'), {
        key: 'Tab',
        shiftKey: true,
        [modifier]: true,
      });
      expect(button('Close tour')).toHaveFocus();
    }
    // Safari moves focus to every control on Option+Tab.
    button('Close tour').focus();
    fireEvent.keyDown(button('Close tour'), {
      key: 'Tab',
      shiftKey: true,
      altKey: true,
    });
    const [entry] = focusEntries();
    expect(entry).toHaveFocus();
    // A browser that makes no move for the key leaves focus on the tab stop.
    // Focus goes back into the callout when the key comes up.
    fireEvent.keyUp(entry, {key: 'Tab', shiftKey: true, altKey: true});
    expect(button('Close tour')).toHaveFocus();
  });

  it('moves focus to the tab stop for Shift+Tab at the start of the callout, and leaves the key to the browser', async () => {
    readSources();
    render(<Harness initialId="two" />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    const [entry] = focusEntries();
    button('Close tour').focus();
    expect(
      fireEvent.keyDown(button('Close tour'), {key: 'Tab', shiftKey: true}),
    ).toBe(true);
    expect(entry).toHaveFocus();

    // The heading is no tab stop, and comes before the first one.
    heading().focus();
    fireEvent.keyDown(heading(), {key: 'Tab', shiftKey: true});
    expect(entry).toHaveFocus();

    // Any other control, and Tab, keep focus where it is.
    button('Next').focus();
    fireEvent.keyDown(button('Next'), {key: 'Tab', shiftKey: true});
    expect(button('Next')).toHaveFocus();
    fireEvent.keyDown(button('Next'), {key: 'Tab'});
    expect(button('Next')).toHaveFocus();
    button('Close tour').focus();
    fireEvent.keyDown(button('Close tour'), {key: 'Tab'});
    expect(button('Close tour')).toHaveFocus();
    // Tab from the heading is the browser's own move to the first control.
    heading().focus();
    fireEvent.keyDown(heading(), {key: 'Tab'});
    expect(heading()).toHaveFocus();
  });

  function Widgets({stepId}: {stepId: string}) {
    const anchorsRef = useRef<Record<string, Element | null>>({});
    const attach = (name: string) => (element: Element | null) => {
      anchorsRef.current[name] = element;
    };
    const steps: TourStep[] = [
      'tool',
      'member',
      'stop',
      'nested',
      'tab',
      'cell',
      'firstCell',
      'item',
      'shape',
    ].map(id => ({
      id,
      title: id,
      anchorRef: {
        get current() {
          return anchorsRef.current[id] ?? null;
        },
      },
    }));
    return (
      <main>
        <button type="button">Before</button>
        <div role="toolbar" data-testid="toolbar">
          <button type="button">Bold</button>
          <button type="button" ref={attach('tool')}>
            Italic
          </button>
        </div>
        <div role="group" data-testid="group">
          <button type="button" tabIndex={-1} ref={attach('member')}>
            Cut
          </button>
          <button type="button" tabIndex={0} ref={attach('stop')}>
            Copy
          </button>
        </div>
        <nav data-testid="tabs">
          <div>
            <button type="button" tabIndex={0}>
              Home
            </button>
            <button type="button" tabIndex={-1} ref={attach('tab')}>
              Projects
            </button>
          </div>
        </nav>
        <div role="toolbar" data-testid="outer">
          <button type="button">Undo</button>
          <div role="group">
            <button type="button" tabIndex={0}>
              Left
            </button>
            <button type="button" tabIndex={-1} ref={attach('nested')}>
              Right
            </button>
          </div>
        </div>
        <table data-testid="table">
          <tbody>
            <tr>
              <td data-testid="first-cell" ref={attach('firstCell')}>
                Name
              </td>
              <td data-testid="cell" ref={attach('cell')}>
                Owner
              </td>
            </tr>
          </tbody>
        </table>
        <ul>
          <li>One</li>
          <li data-testid="item" ref={attach('item')}>
            Two
          </li>
        </ul>
        <svg data-testid="chart">
          <circle r="2" />
          <rect ref={attach('shape')} width="4" height="4" />
        </svg>
        <Tour
          steps={steps}
          activeId={stepId}
          onActiveIdChange={() => {}}
          onEnd={() => {}}
        />
      </main>
    );
  }

  it.each([
    ['tool', 'a member of a toolbar: before the toolbar', 'toolbar', 'before'],
    [
      'member',
      'a member of a group with one tab stop: before the group',
      'group',
      'before',
    ],
    [
      'stop',
      'the tab stop of a group with one tab stop: before the group',
      'group',
      'before',
    ],
    [
      'tab',
      'a member out of the Tab order, in a group with no role: before the group',
      'tabs',
      'before',
    ],
    [
      'nested',
      'a member of a group inside a toolbar: before the toolbar',
      'outer',
      'before',
    ],
    ['cell', 'a table cell: inside the cell', 'cell', 'inside'],
    [
      'firstCell',
      'the first cell of a table: before the table',
      'table',
      'before',
    ],
    ['item', 'a list item: inside the item', 'item', 'inside'],
    ['shape', 'a shape in an svg: before the svg', 'chart', 'before'],
  ] as const)(
    'places the tab stop for %s (%s)',
    async (stepId, _case, testId, where) => {
      readSources();
      render(<Widgets stepId={stepId} />);
      await waitFor(() => expect(dialog()).toBeInTheDocument());
      const [entry] = focusEntries();
      const target = screen.getByTestId(testId);
      expect(focusEntries()).toHaveLength(1);
      if (where === 'before') {
        expect(entry.nextElementSibling).toBe(target);
      } else {
        expect(target.firstElementChild).toBe(entry);
      }
      // The members' own tab stops are as the page wrote them.
      expect(button('Copy')).toHaveAttribute('tabindex', '0');
      expect(button('Cut')).toHaveAttribute('tabindex', '-1');
    },
  );
});

describe('Tour steps that take no tab stop (AST-119 FR14)', () => {
  function OneStep({
    getAnchor,
    children,
  }: {
    getAnchor: () => Element | null;
    children?: React.ReactNode;
  }) {
    const steps: TourStep[] = [
      {
        id: 'only',
        title: 'Only',
        anchorRef: {
          get current() {
            return getAnchor();
          },
        },
      },
    ];
    return (
      <main>
        <button type="button">Before</button>
        {children}
        <Tour
          steps={steps}
          activeId="only"
          onActiveIdChange={() => {}}
          onEnd={() => {}}
        />
      </main>
    );
  }

  it('puts none in the page for a table row after the first: no place there takes a span', async () => {
    const sources = readSources();
    render(
      <OneStep getAnchor={() => screen.queryByTestId('row')}>
        <table>
          <tbody>
            <tr>
              <td>Name</td>
            </tr>
            <tr data-testid="row">
              <td>Owner</td>
            </tr>
          </tbody>
        </table>
      </OneStep>,
    );
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(focusEntries()).toHaveLength(0);
    expect(sources).toEqual([]);
  });

  it('puts none in the page for an item of a menu that is a layer: the menu keeps the one tab stop', async () => {
    readSources();
    render(
      <OneStep getAnchor={() => screen.queryByTestId('menu-item')}>
        <div role="menu" popover="manual">
          <button type="button" role="menuitem" tabIndex={0}>
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            data-testid="menu-item">
            Delete
          </button>
        </div>
      </OneStep>,
    );
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(focusEntries()).toHaveLength(0);
  });

  it('puts none in the page for an anchor that is the body', async () => {
    readSources();
    render(<OneStep getAnchor={() => document.body} />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(focusEntries()).toHaveLength(0);
  });

  it('puts none in a shadow tree, which the styles of the page do not reach', async () => {
    readSources();
    const host = document.createElement('div');
    const inner = document.createElement('button');
    const tree = host.attachShadow({mode: 'open'});
    const row = document.createElement('div');
    row.append(document.createElement('p'), inner);
    tree.append(row);
    document.body.append(host);
    try {
      render(<OneStep getAnchor={() => inner} />);
      await waitFor(() => expect(dialog()).toBeInTheDocument());
      expect(focusEntries()).toHaveLength(0);
      expect(tree.querySelector('span')).toBeNull();
    } finally {
      host.remove();
    }
  });

  it('puts none in the page when the callout is in a shadow tree, which has its own styles', async () => {
    readSources();
    const lead = document.createElement('p');
    const anchor = document.createElement('button');
    const host = document.createElement('div');
    const tree = host.attachShadow({mode: 'open'});
    const mount = document.createElement('div');
    tree.append(mount);
    document.body.append(lead, anchor, host);
    try {
      render(<OneStep getAnchor={() => anchor} />, {container: mount});
      await waitFor(() =>
        expect(tree.querySelector('[role="dialog"]')).not.toBeNull(),
      );
      expect(focusEntries()).toHaveLength(0);
    } finally {
      lead.remove();
      anchor.remove();
      host.remove();
    }
  });

  it('puts the tab stop before an anchor in the default slot of a shadow tree', async () => {
    readSources();
    const host = document.createElement('div');
    host.attachShadow({mode: 'open'}).append(document.createElement('slot'));
    const lead = document.createElement('span');
    const anchor = document.createElement('button');
    host.append(lead, anchor);
    document.body.append(host);
    try {
      render(<OneStep getAnchor={() => anchor} />);
      await waitFor(() => expect(dialog()).toBeInTheDocument());
      expect(focusEntries()).toHaveLength(1);
      expect(focusEntries()[0].nextElementSibling).toBe(anchor);
      expect(focusEntries()[0].parentElement).toBe(host);
    } finally {
      host.remove();
    }
  });

  it.each(['open', 'closed'] as const)(
    'puts none beside an anchor with a named slot of a shadow tree (%s)',
    async mode => {
      readSources();
      const host = document.createElement('div');
      const slot = document.createElement('slot');
      slot.name = 'actions';
      host.attachShadow({mode}).append(slot);
      const lead = document.createElement('span');
      lead.slot = 'actions';
      const anchor = document.createElement('button');
      anchor.slot = 'actions';
      host.append(lead, anchor);
      document.body.append(host);
      try {
        render(<OneStep getAnchor={() => anchor} />);
        await waitFor(() => expect(dialog()).toBeInTheDocument());
        expect(focusEntries()).toHaveLength(0);
      } finally {
        host.remove();
      }
    },
  );

  it('puts none in another document than the one the callout is in', async () => {
    readSources();
    const other = document.implementation.createHTMLDocument('Other');
    const inner = other.createElement('button');
    other.body.append(other.createElement('p'), inner);
    render(<OneStep getAnchor={() => inner} />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(focusEntries()).toHaveLength(0);
    expect(other.querySelector('span')).toBeNull();
  });
});

describe('Tour host element and style props', () => {
  it('puts ref, className, style and data attributes on the dialog surface', async () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Harness
        ref={ref}
        className="custom-tour"
        style={{maxWidth: 400}}
        data-testid="tour-surface"
      />,
    );
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(ref.current).toBe(dialog());
    expect(dialog()).toHaveClass(
      'custom-tour',
      'astryx-tour',
      'astryx-popover',
    );
    expect(dialog()).toHaveStyle({maxWidth: '400px'});
    expect(dialog()).toHaveAttribute('data-testid', 'tour-surface');
  });

  it('reflects the backdrop on the overlay and the ring for themes', async () => {
    const {unmount} = render(<Harness hasBackdrop />);
    await waitFor(() =>
      expect(document.querySelector('.astryx-tour-highlight')).not.toBeNull(),
    );
    expect(document.querySelector('.astryx-tour-overlay')).toHaveAttribute(
      'data-backdrop',
      'backdrop',
    );
    expect(document.querySelector('.astryx-tour-highlight')).toHaveAttribute(
      'data-backdrop',
      'backdrop',
    );
    unmount();
    render(<Harness />);
    await waitFor(() =>
      expect(document.querySelector('.astryx-tour-highlight')).not.toBeNull(),
    );
    expect(document.querySelector('.astryx-tour-overlay')).not.toHaveAttribute(
      'data-backdrop',
    );
  });
});

describe('Tour under React StrictMode', () => {
  it('prepares a step once and reports a missing anchor once', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const showAction = vi.fn();
    const onMissingAnchor = vi.fn();
    render(
      <StrictMode>
        <Harness
          onMissingAnchor={onMissingAnchor}
          makeSteps={() => [
            {
              id: 'one',
              anchorRef: {current: null},
              title: 'First title',
              showAction,
            },
          ]}
        />
      </StrictMode>,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('First title'));
    expect(showAction).toHaveBeenCalledTimes(1);
    expect(onMissingAnchor).toHaveBeenCalledTimes(1);
  });

  it('skips one step, not two, for a missing anchor', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <StrictMode>
        <Harness
          initialId="two"
          hasSecondAnchor={false}
          missingAnchorBehavior="skipStep"
        />
      </StrictMode>,
    );
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Third title'));
    expect(onActiveIdChange.mock.calls).toEqual([['three']]);
    expect(onEnd).not.toHaveBeenCalled();
  });
});

describe('Tour and an open modal dialog', () => {
  const callout = (name: string) =>
    screen.getByRole('dialog', {name, hidden: true});

  beforeEach(() => {
    // jsdom has no modal dialog.
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute('open');
    });
  });

  function WithDialog({opensBeforeStep}: {opensBeforeStep: boolean}) {
    const pageRef = useRef<HTMLButtonElement>(null);
    const [activeId, setActiveId] = useState<string | null>('page');
    const [isOpen, setIsOpen] = useState(false);
    return (
      <main>
        <button type="button" ref={pageRef}>
          On the page
        </button>
        <button type="button" onClick={() => setIsOpen(true)}>
          Open the dialog
        </button>
        <Dialog isOpen={isOpen} onOpenChange={setIsOpen}>
          <button type="button" onClick={() => setIsOpen(false)}>
            Close the dialog
          </button>
        </Dialog>
        <Tour
          steps={[
            {id: 'page', anchorRef: pageRef, title: 'Page step'},
            {
              id: 'welcome',
              title: 'No anchor',
              showAction: opensBeforeStep
                ? async () => {
                    setIsOpen(true);
                    await Promise.resolve();
                    // A dialog takes focus as it opens.
                    screen
                      .getByRole('button', {
                        name: 'Close the dialog',
                        hidden: true,
                      })
                      .focus();
                  }
                : undefined,
            },
          ]}
          activeId={activeId}
          onActiveIdChange={setActiveId}
          onEnd={() => setActiveId(null)}
        />
      </main>
    );
  }

  it('starts a step with no anchor inside the open modal dialog, and leaves it when the dialog closes', async () => {
    render(<WithDialog opensBeforeStep />);
    await waitFor(() => expect(callout('Page step')).toBeInTheDocument());
    const host = document.querySelector('dialog');
    expect(host?.contains(callout('Page step'))).toBe(false);

    // Focus is in the callout when Next is pressed, and the dialog takes it
    // as it opens. It follows the tour to the new step's heading.
    button('Next').focus();
    fireEvent.click(button('Next'));
    await waitFor(() =>
      expect(host?.contains(callout('No anchor'))).toBe(true),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {name: 'No anchor', hidden: true}),
      ).toHaveFocus(),
    );
    expect(host?.contains(document.querySelector('.astryx-tour-overlay'))).toBe(
      true,
    );

    fireEvent.click(button('Close the dialog'));
    act(() => {
      host?.dispatchEvent(new Event('close'));
    });
    await waitFor(() =>
      expect(host?.contains(callout('No anchor'))).toBe(false),
    );
  });

  it('puts the tab stop of a step inside the open dialog before its anchor, inside the dialog', async () => {
    const sources = readSources();
    matchModal();
    function InDialog() {
      const applyRef = useRef<HTMLButtonElement>(null);
      const [activeId, setActiveId] = useState<string | null>(null);
      return (
        <main>
          <Dialog isOpen onOpenChange={() => {}}>
            <button type="button" onClick={() => setActiveId('apply')}>
              Start in the dialog
            </button>
            <button type="button" ref={applyRef}>
              Apply
            </button>
          </Dialog>
          <Tour
            steps={[{id: 'apply', anchorRef: applyRef, title: 'Apply step'}]}
            activeId={activeId}
            onActiveIdChange={setActiveId}
            onEnd={() => setActiveId(null)}
          />
        </main>
      );
    }
    render(<InDialog />);
    await act(async () => {});
    fireEvent.click(button('Start in the dialog'));
    await waitFor(() =>
      expect(
        document.querySelector('dialog')?.contains(callout('Apply step')),
      ).toBe(true),
    );
    await waitFor(() => expect(focusEntries()).toHaveLength(1));
    const [entry] = focusEntries();
    expect(entry.nextElementSibling).toBe(button('Apply'));
    expect(document.querySelector('dialog')?.contains(entry)).toBe(true);
    expect(sources.at(-1)).toBe(entry);
  });

  it('keeps the tab stop inside a focus region in the dialog whose first control is the anchor', async () => {
    readSources();
    matchModal();
    function Region({onStart}: {onStart: () => void}) {
      const {containerRef} = useFocusTrap<HTMLDivElement>({isActive: true});
      return (
        <div ref={containerRef} data-testid="region">
          <button type="button" onClick={onStart}>
            Start in the region
          </button>
          <button type="button">Other</button>
        </div>
      );
    }
    function InRegion() {
      const [activeId, setActiveId] = useState<string | null>(null);
      return (
        <main>
          <Dialog isOpen onOpenChange={() => {}}>
            <Region onStart={() => setActiveId('start')} />
          </Dialog>
          <Tour
            steps={[
              {
                id: 'start',
                anchorRef: {
                  get current() {
                    return screen.queryByRole('button', {
                      name: 'Start in the region',
                      hidden: true,
                    });
                  },
                },
                title: 'Region step',
              },
            ]}
            activeId={activeId}
            onActiveIdChange={setActiveId}
            onEnd={() => setActiveId(null)}
          />
        </main>
      );
    }
    render(<InRegion />);
    await act(async () => {});
    fireEvent.click(button('Start in the region'));
    await waitFor(() => expect(callout('Region step')).toBeInTheDocument());
    await waitFor(() => expect(focusEntries()).toHaveLength(1));
    expect(screen.getByTestId('region').firstElementChild).toBe(
      focusEntries()[0],
    );
  });

  it('wraps Tab from the last control of the callout to its first, in a focus region with no control of its own', async () => {
    readSources();
    matchModal();
    function Region() {
      const {containerRef} = useFocusTrap<HTMLDivElement>({isActive: true});
      return (
        <div ref={containerRef} data-testid="region">
          <p data-testid="text">Read this first.</p>
        </div>
      );
    }
    function InRegion({activeId}: {activeId: string | null}) {
      return (
        <main>
          <Dialog isOpen onOpenChange={() => {}}>
            <Region />
          </Dialog>
          <Tour
            steps={[
              {
                id: 'text',
                anchorRef: {
                  get current() {
                    return screen.queryByTestId('text');
                  },
                },
                title: 'Text step',
              },
            ]}
            activeId={activeId}
            onActiveIdChange={() => {}}
            onEnd={() => {}}
          />
        </main>
      );
    }
    const {rerender} = render(<InRegion activeId={null} />);
    await act(async () => {});
    rerender(<InRegion activeId="text" />);
    await waitFor(() => expect(callout('Text step')).toBeInTheDocument());
    await waitFor(() => expect(focusEntries()).toHaveLength(1));
    const region = screen.getByTestId('region');
    expect(region.contains(callout('Text step'))).toBe(true);
    expect(region.firstElementChild).toBe(focusEntries()[0]);

    button('Done').focus();
    // False: the region wrapped focus and cancelled the press.
    expect(fireEvent.keyDown(button('Done'), {key: 'Tab'})).toBe(false);
    expect(button('Close tour')).toHaveFocus();
  });

  it('leaves a step with an anchor on the page where it is when a modal dialog opens', async () => {
    render(<WithDialog opensBeforeStep={false} />);
    await waitFor(() => expect(callout('Page step')).toBeInTheDocument());
    const host = document.querySelector('dialog');
    fireEvent.click(screen.getByRole('button', {name: 'Open the dialog'}));
    await waitFor(() => expect(host).toHaveAttribute('open'));
    await act(async () => {});
    expect(host?.contains(callout('Page step'))).toBe(false);
  });
});
