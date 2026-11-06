// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {createPortal} from 'react-dom';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
// The full emoji set renders slowly in jsdom; the composer only needs a few.
vi.mock('../EmojiPicker/emojiData', () => ({
  EMOJI_GROUPS: [
    {
      name: 'Activities',
      emojis: [
        ['🎉', 'Party popper', 'celebration tada'],
        ['🎈', 'Balloon', 'celebration'],
      ],
    },
  ],
}));

import {Popover} from '@astryxdesign/core/Popover';
import {CommentThread, type CommentThreadProps} from './CommentThread';
import {unsavedDraftOf} from './useCommentThreadDismissal';
import type {
  CommentComposerRenderProps,
  CommentThreadData,
  CommentUser,
} from './types';

const VIEWER: CommentUser = {id: 'avery', name: 'Avery Kim'};
const OTHER: CommentUser = {id: 'maya', name: 'Maya Chen'};

const THREAD: CommentThreadData = {
  id: 'margin',
  author: OTHER,
  body: 'Should this say three days?',
  createdAt: '2026-09-30T19:00:00Z',
  anchor: {quote: 'The final cohort completes rollout in two days.'},
  replies: [
    {
      id: 'margin-reply',
      author: VIEWER,
      body: 'Good catch, updating it.',
      createdAt: '2026-09-30T19:20:00Z',
    },
  ],
};

const originalMatches = HTMLElement.prototype.matches;
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  Object.defineProperty(HTMLElement.prototype, 'matches', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, selector: string): boolean {
      if (selector === ':popover-open') {
        return popoverOpenState.get(this) ?? false;
      }
      return originalMatches.call(this, selector);
    },
  });
});

afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'matches', {
    configurable: true,
    writable: true,
    value: originalMatches,
  });
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function settle() {
  await act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
}

describe('CommentThread', () => {
  it('renders one thread with its quoted passage, collapsed replies, and no rules', () => {
    render(<CommentThread comment={THREAD} container="card" />);
    const surface = document.querySelector('[data-thread-id="margin"]');
    expect(surface?.getAttribute('data-thread-surface')).toBe('section');
    expect(screen.getByText(THREAD.anchor?.quote ?? '')).toBeTruthy();
    expect(screen.getByText('View 1 reply')).toBeTruthy();
    expect(screen.queryByText('Good catch, updating it.')).toBeNull();
  });

  it('opens on a press, showing its replies and reply composer', async () => {
    const onSelectedChange = vi.fn();
    render(
      <CommentThread
        comment={THREAD}
        currentUser={VIEWER}
        onSubmit={vi.fn()}
        onSelectedChange={onSelectedChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Thread by Maya Chen'}));
    await settle();
    expect(onSelectedChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('Good catch, updating it.')).toBeTruthy();
    expect(
      screen.getByRole('textbox', {name: 'Reply to Maya Chen…'}),
    ).toBeTruthy();
  });

  it('opens when the host selects it', async () => {
    const {rerender} = render(
      <CommentThread
        comment={THREAD}
        currentUser={VIEWER}
        onSubmit={vi.fn()}
        isSelected={false}
      />,
    );
    expect(screen.queryByText('Good catch, updating it.')).toBeNull();
    rerender(
      <CommentThread
        comment={THREAD}
        currentUser={VIEWER}
        onSubmit={vi.fn()}
        isSelected
      />,
    );
    await settle();
    expect(screen.getByText('Good catch, updating it.')).toBeTruthy();
  });

  it('opens a thread selected at mount without opening its composer or taking focus', async () => {
    render(
      <CommentThread
        comment={THREAD}
        currentUser={VIEWER}
        onSubmit={vi.fn()}
        isSelected
      />,
    );
    await settle();
    // Restored host state opens the body and replies. Only a viewer Reply action
    // opens the composer, so controlled selection never steals focus.
    expect(screen.getByText('Good catch, updating it.')).toBeTruthy();
    expect(
      screen.queryByRole('textbox', {name: 'Reply to Maya Chen…'}),
    ).toBeNull();
    expect(document.body).toHaveFocus();
  });

  it('opens from the keyboard and keeps focus on the thread', async () => {
    const user = userEvent.setup();
    const onSelectedChange = vi.fn();
    render(
      <CommentThread
        comment={THREAD}
        currentUser={VIEWER}
        onSubmit={vi.fn()}
        onSelectedChange={onSelectedChange}
      />,
    );
    const toggle = screen.getByRole('button', {name: 'Thread by Maya Chen'});
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard('{Enter}');
    await settle();
    expect(onSelectedChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByText('Good catch, updating it.')).toBeTruthy();
    // A key press leaves focus on the thread rather than moving it.
    expect(toggle).toHaveFocus();
    await user.keyboard(' ');
    await settle();
    expect(onSelectedChange).toHaveBeenLastCalledWith(false);
    expect(toggle).toHaveFocus();
  });

  it('forwards the reply draft lifecycle through a standalone thread', async () => {
    const onComposerDraftChange = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const renderComposer = (props: CommentComposerRenderProps) => (
      <section aria-label="Live reply">
        <button type="button" onClick={() => props.onChange('Live reply body')}>
          Set live draft
        </button>
        <button type="button" onClick={() => props.onSubmit(props.value)}>
          Submit live draft
        </button>
      </section>
    );
    render(
      <CommentThread
        comment={THREAD}
        currentUser={VIEWER}
        isSelected
        onSubmit={onSubmit}
        onComposerDraftChange={onComposerDraftChange}
        renderComposer={renderComposer}
      />,
    );
    await settle();

    const context = {
      kind: 'reply' as const,
      parentCommentId: 'margin',
      repliedToCommentId: 'margin',
    };
    fireEvent.click(
      within(screen.getByRole('article', {name: 'Maya Chen'})).getByRole(
        'button',
        {name: 'Reply'},
      ),
    );
    await settle();
    fireEvent.click(screen.getByText('Set live draft'));
    expect(onComposerDraftChange).toHaveBeenLastCalledWith(
      'Live reply body',
      context,
    );
    fireEvent.click(screen.getByText('Submit live draft'));
    await settle();
    expect(onSubmit).toHaveBeenCalledWith('Live reply body', 'margin');
    expect(onComposerDraftChange).toHaveBeenLastCalledWith('', context);
  });

  it('forwards root props', () => {
    render(<CommentThread comment={THREAD} data-testid="margin-thread" />);
    expect(screen.getByTestId('margin-thread').className).toContain(
      'astryx-comment-thread',
    );
  });
});

describe('CommentThread dismissal', () => {
  type FakeAnimation = {
    cancel: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
  };
  let animate: ReturnType<typeof vi.fn>;
  let animations: FakeAnimation[];

  beforeEach(() => {
    animations = [];
    animate = vi.fn(() => {
      const animation: FakeAnimation = {
        cancel: vi.fn(),
        addEventListener: vi.fn(),
      };
      animations.push(animation);
      return animation;
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: animate,
    });
  });

  afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    vi.restoreAllMocks();
  });

  const PRESS = {button: 0, isPrimary: true, pointerId: 1};

  /** A full primary press: whether its mousedown and click went unclaimed. */
  function press(target: Element) {
    fireEvent.pointerDown(target, PRESS);
    const mouseDown = fireEvent.mouseDown(target);
    fireEvent.pointerUp(target, PRESS);
    fireEvent.mouseUp(target);
    const click = fireEvent.click(target);
    return {mouseDown, click};
  }

  function renderThread(props: Partial<CommentThreadProps> = {}) {
    const onDismiss = vi.fn();
    const result = render(
      <>
        <button type="button">Elsewhere</button>
        <CommentThread
          comment={THREAD}
          currentUser={VIEWER}
          isSelected
          onSubmit={vi.fn()}
          onDismiss={onDismiss}
          {...props}
        />
      </>,
    );
    return {onDismiss, ...result};
  }

  // A closed-by-default host's top layer reads as hidden to jsdom's
  // accessibility tree, so queries inside a Popover include hidden elements.
  async function openReply({hidden = false} = {}) {
    fireEvent.click(
      within(
        screen.getByRole('article', {name: 'Maya Chen', hidden}),
      ).getByRole('button', {name: 'Reply', hidden}),
    );
    await settle();
    return screen.getByRole('textbox', {name: 'Reply to Maya Chen…', hidden});
  }

  function typeDraft(textbox: HTMLElement, text: string) {
    textbox.textContent = text;
    fireEvent.input(textbox);
  }

  async function politeAnnouncement() {
    await act(
      () =>
        new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
    );
    return (
      document.querySelector('[data-astryx-live-region="polite"]')
        ?.textContent ?? ''
    );
  }

  const UNSAVED = 'Unsaved draft. Dismiss again to discard it.';

  it('dismisses on an outside press when nothing is unsaved', async () => {
    const {onDismiss} = renderThread();
    await settle();
    const {click} = press(screen.getByRole('button', {name: 'Elsewhere'}));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(animate).not.toHaveBeenCalled();
    // Only a guarded press is spent; this click reaches its target.
    expect(click).toBe(true);
  });

  it('dismisses with an open reply that holds only whitespace', async () => {
    const {onDismiss} = renderThread();
    await settle();
    typeDraft(await openReply(), '   ');
    press(screen.getByRole('button', {name: 'Elsewhere'}));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shakes, refocuses, and announces on the first outside press over a draft, then dismisses on the second', async () => {
    const {onDismiss, container} = renderThread();
    await settle();
    const textbox = await openReply();
    typeDraft(textbox, 'Half a thought');
    const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
    elsewhere.focus();

    const first = press(elsewhere);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.contexts[0]).toBe(
      container.querySelector('.astryx-comment-thread'),
    );
    const [keyframes, options] = animate.mock.calls[0] as [
      Keyframe[],
      KeyframeAnimationOptions,
    ];
    expect(keyframes[0].transform).toBe(keyframes.at(-1)?.transform);
    expect(options.duration).toBeGreaterThanOrEqual(300);
    expect(options.duration).toBeLessThanOrEqual(450);
    expect(textbox).toHaveFocus();
    expect(await politeAnnouncement()).toBe(UNSAVED);
    // The guarded press keeps focus where it is and activates nothing.
    expect(first.mouseDown).toBe(false);
    expect(first.click).toBe(false);

    press(elsewhere);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('re-arms after the draft changes or the viewer presses inside', async () => {
    const {onDismiss} = renderThread();
    await settle();
    const textbox = await openReply();
    typeDraft(textbox, 'First');
    const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});

    press(elsewhere);
    typeDraft(textbox, 'First, then more');
    press(elsewhere);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledTimes(2);
    // The second shake replaced the first rather than stacking on it.
    expect(animations[0].cancel).toHaveBeenCalled();

    press(textbox);
    press(elsewhere);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledTimes(3);

    press(elsewhere);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores secondary buttons and touches that turn into a scroll', async () => {
    const {onDismiss} = renderThread();
    await settle();
    const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
    fireEvent.pointerDown(elsewhere, {...PRESS, button: 2});
    fireEvent.pointerUp(elsewhere, {...PRESS, button: 2});
    fireEvent.pointerDown(elsewhere, PRESS);
    fireEvent.pointerCancel(elsewhere, PRESS);
    fireEvent.pointerUp(elsewhere, PRESS);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('counts a press in a layer the thread portals elsewhere as inside', async () => {
    const {onDismiss, container} = renderThread({
      renderAdditionalActions: () =>
        createPortal(
          <button type="button">Portaled action</button>,
          document.body,
        ),
    });
    await settle();
    const portaled = screen.getAllByRole('button', {
      name: 'Portaled action',
    })[0];
    // The DOM puts it outside the thread; React's tree puts it inside.
    expect(
      container.querySelector('.astryx-comment-thread')?.contains(portaled),
    ).toBe(false);
    press(portaled);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('leaves an outside press to an open emoji picker above the thread', async () => {
    const {onDismiss} = renderThread();
    await settle();
    typeDraft(await openReply(), 'Draft');
    fireEvent.click(screen.getByRole('button', {name: 'Add emoji'}));
    await settle();
    press(screen.getByRole('button', {name: 'Elsewhere'}));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
  });

  it('requests dismissal on an Escape no nested layer handled', async () => {
    const {onDismiss} = renderThread();
    await settle();
    fireEvent.keyDown(document.body, {key: 'Escape'});
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('guards a draft on Escape and dismisses on the next one', async () => {
    const {onDismiss} = renderThread();
    await settle();
    const textbox = await openReply();
    typeDraft(textbox, 'Draft');
    expect(fireEvent.keyDown(textbox, {key: 'Escape'})).toBe(false);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(textbox).toHaveFocus();
    expect(await politeAnnouncement()).toBe(UNSAVED);
    fireEvent.keyDown(textbox, {key: 'Escape'});
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('closes an open emoji picker on Escape before the thread', async () => {
    const {onDismiss} = renderThread();
    await settle();
    await openReply();
    const emoji = screen.getByRole('button', {name: 'Add emoji'});
    fireEvent.click(emoji);
    await settle();
    expect(emoji).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
    await settle();
    expect(emoji).toHaveAttribute('aria-expanded', 'false');
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not move under reduced motion but still refocuses and announces', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      query =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    const {onDismiss} = renderThread();
    await settle();
    const textbox = await openReply();
    typeDraft(textbox, 'Draft');
    press(screen.getByRole('button', {name: 'Elsewhere'}));
    expect(animate).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(textbox).toHaveFocus();
    expect(await politeAnnouncement()).toBe(UNSAVED);
  });

  it('adds no listeners and dismisses nothing without onDismiss', async () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    renderThread({onDismiss: undefined});
    await settle();
    const textbox = await openReply();
    typeDraft(textbox, 'Draft');
    const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
    const {mouseDown, click} = press(elsewhere);
    fireEvent.keyDown(textbox, {key: 'Escape'});
    expect(animate).not.toHaveBeenCalled();
    expect(mouseDown).toBe(true);
    expect(click).toBe(true);
    expect(
      addListener.mock.calls.some(([type]) => type === 'pointercancel'),
    ).toBe(false);
  });

  it('keeps a Popover host open on its trigger over a draft and closes without reopening otherwise', async () => {
    function Host() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <Popover
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          hasLightDismiss={false}
          hasEscapeDismiss={false}
          hasAutoFocus={false}
          label="Comment"
          padding={0}
          content={
            <CommentThread
              comment={THREAD}
              currentUser={VIEWER}
              isSelected
              container="card"
              onSubmit={vi.fn()}
              onDismiss={() => setIsOpen(false)}
            />
          }>
          <button type="button">Open comment</button>
        </Popover>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole('button', {name: 'Open comment'});
    fireEvent.click(trigger);
    await settle();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const textbox = await openReply({hidden: true});
    typeDraft(textbox, 'Draft');
    press(trigger);
    await settle();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(animate).toHaveBeenCalledTimes(1);

    press(trigger);
    await settle();
    // Closed, and the same press's click did not toggle it back open.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('derives an unsaved draft from typed replies and changed edits only', () => {
    const reply = {parentId: 'margin', comment: THREAD};
    expect(
      unsavedDraftOf({replyTarget: null, replyDraft: '', editTarget: null}),
    ).toBeNull();
    expect(
      unsavedDraftOf({
        replyTarget: {...reply, seed: '@Maya '},
        replyDraft: '@Maya ',
        editTarget: null,
      }),
    ).toBeNull();
    expect(
      unsavedDraftOf({
        replyTarget: {...reply, seed: '@Maya '},
        replyDraft: '@Maya agreed',
        editTarget: null,
      })?.kind,
    ).toBe('reply');
    expect(
      unsavedDraftOf({
        replyTarget: null,
        replyDraft: '',
        editTarget: {comment: THREAD, value: `${THREAD.body} `},
      }),
    ).toBeNull();
    expect(
      unsavedDraftOf({
        replyTarget: null,
        replyDraft: '',
        editTarget: {comment: THREAD, value: 'Should this say four days?'},
      })?.kind,
    ).toBe('edit');
  });
});
