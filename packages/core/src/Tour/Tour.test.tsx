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
import {Dialog} from '../Dialog/Dialog';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import {__resetDevWarnings} from '../utils/devWarning';
import {clearRegion} from '../hooks/useAnnounce';

function dialog(): HTMLElement {
  return screen.getByRole('dialog', {hidden: true});
}

function button(name: string): HTMLElement {
  return screen.getByRole('button', {name, hidden: true});
}

function heading(): HTMLElement {
  return screen.getByRole('heading', {hidden: true});
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

beforeEach(() => {
  onEnd.mockClear();
  onActiveIdChange.mockClear();
  __resetDevWarnings();
  // The announcer's regions outlive a test. Empty them, with any write that
  // is still waiting for its frame.
  clearRegion('polite');
  clearRegion('assertive');
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
    render(<Harness />);
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
    });
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
