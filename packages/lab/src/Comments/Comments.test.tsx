// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState, type ReactNode} from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// jsdom has no layout, so the measuring OverflowList is replaced by one that
// collapses exactly the comment actions a test names.
const overflowControl = vi.hoisted(() => ({collapsed: new Set<string>()}));
const announce = vi.hoisted(() => vi.fn());
// Records each announcement and still speaks it through the real channel, which
// other tests here read back.
vi.mock('@astryxdesign/core/hooks', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@astryxdesign/core/hooks')>();
  return {
    ...actual,
    useAnnounce: () => {
      const speak = actual.useAnnounce();
      return (message: string, politeness?: 'polite' | 'assertive') => {
        announce(message, politeness);
        speak(message, politeness);
      };
    },
  };
});

vi.mock('@astryxdesign/core/OverflowList', async () => {
  const React = await import('react');
  type Item = {
    child: React.ReactElement<{'data-comment-action'?: string}>;
    index: number;
  };
  return {
    OverflowList: ({
      children,
      onOverflowChange,
      gap: _gap,
      collapseFrom: _collapseFrom,
      xstyle: _xstyle,
      ...rest
    }: {
      children: React.ReactNode;
      onOverflowChange?: (items: Item[]) => void;
      gap?: number;
      collapseFrom?: string;
      xstyle?: unknown;
    }) => {
      const items = React.Children.toArray(children).map((child, index) => ({
        child: child as Item['child'],
        index,
      }));
      const collapsed = items.filter(item =>
        overflowControl.collapsed.has(
          item.child.props['data-comment-action'] ?? '',
        ),
      );
      const collapsedKey = collapsed
        .map(item => item.child.props['data-comment-action'])
        .join(',');
      React.useLayoutEffect(() => {
        if (collapsed.length > 0) {
          onOverflowChange?.(collapsed);
        }
        // Re-run only when the collapsed set changes.
      }, [collapsedKey]);
      return (
        <div {...rest}>
          {items
            .filter(item => !collapsed.includes(item))
            .map(item => item.child)}
        </div>
      );
    },
  };
});

import {Comments} from './Comments';
import type {
  CommentComposerRenderProps,
  CommentData,
  CommentThreadData,
  CommentUser,
} from './types';

const VIEWER: CommentUser = {id: 'avery', name: 'Avery Kim'};
const OTHER: CommentUser = {id: 'maya', name: 'Maya Chen'};
const AGENT: CommentUser = {
  id: 'release-bot',
  name: 'Release Assistant',
  kind: 'agent',
  avatarUrl: '/agent-logo.png',
};

const COMMENTS: readonly CommentThreadData[] = [
  {
    id: 'root-1',
    author: VIEWER,
    body: 'The final states are **ready** for review.',
    createdAt: '2026-09-30T19:00:00Z',
    isEdited: true,
    previousVersions: [
      {
        id: 'root-1-v1',
        body: 'Earlier wording',
        editedAt: '2026-09-30T18:00:00Z',
        author: VIEWER,
      },
    ],
    reactions: [
      {
        key: 'like',
        label: '👍',
        description: 'Like',
        count: 2,
        reactedByViewer: true,
        actors: [VIEWER, OTHER],
      },
    ],
    replies: [
      {
        id: 'reply-1',
        author: OTHER,
        body: 'A one-level reply',
        createdAt: '2026-09-30T19:10:00Z',
      },
    ],
  },
];

/** An inline failure Banner by its data attribute; it carries no live role. */
function bannerByData(attribute: string): HTMLElement {
  const banner = document.querySelector<HTMLElement>(`[${attribute}]`);
  if (banner == null) {
    throw new Error(`No Banner with ${attribute}`);
  }
  return banner;
}

/** A plain composer standing in for the contenteditable one. */
function TestComposer(props: CommentComposerRenderProps) {
  return (
    <section
      aria-label={props.contextLabel ?? 'New comment'}
      data-placeholder={props.placeholder}>
      <output>{props.value}</output>
      <button
        type="button"
        onClick={() =>
          props.onChange(
            props.context.kind === 'reply'
              ? `${props.value}Reply body`
              : props.context.kind === 'edit'
                ? 'Edited comment body'
                : 'New comment body',
          )
        }>
        Set draft
      </button>
      <button type="button" onClick={() => props.onSubmit(props.value)}>
        Submit composer
      </button>
      {props.error != null && <p role="alert">{props.error}</p>}
      {props.onCancel != null && (
        <button type="button" onClick={props.onCancel}>
          Cancel composer
        </button>
      )}
    </section>
  );
}

const renderComposer = (props: CommentComposerRenderProps) => (
  <TestComposer {...props} />
);

function articleByAuthor(name: string): HTMLElement {
  const article = Array.from(document.querySelectorAll('article')).find(
    candidate =>
      candidate.querySelector(`[data-author-name="${name}"]`) != null,
  );
  if (article == null) {
    throw new Error(`Article not found: ${name}`);
  }
  return article;
}

function threadSurface(threadId: string): HTMLElement {
  const surface = document.querySelector(`[data-thread-id="${threadId}"]`);
  if (!(surface instanceof HTMLElement)) {
    throw new Error(`Thread not found: ${threadId}`);
  }
  return surface;
}

async function flush() {
  await act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
}

async function click(element: Element) {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
}

function menuItem(name: string): HTMLElement {
  // Menus sit in a [popover] that jsdom never shows, so query with `hidden`.
  const item = screen
    .getAllByRole('menuitem', {hidden: true})
    .find(candidate => candidate.textContent?.includes(name));
  if (item == null) {
    throw new Error(`Menu item not found: ${name}`);
  }
  return item;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const writeText = vi.fn();

// jsdom lacks the Popover API: track each popover's open state and dispatch
// the toggle events Astryx listens for.
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

beforeEach(() => {
  announce.mockClear();
  overflowControl.collapsed = new Set();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {writeText},
  });
  Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Sized({children}: {children: ReactNode}) {
  return <div style={{height: 600}}>{children}</div>;
}

describe('Comments rendering', () => {
  it('renders threads, Markdown bodies, reactions, and a collapsed reply', () => {
    render(
      <Sized>
        <Comments comments={COMMENTS} currentUser={VIEWER} />
      </Sized>,
    );

    expect(screen.getByRole('region', {name: 'Comments'})).toBeTruthy();
    const article = articleByAuthor('Avery Kim');
    expect(within(article).getByText('ready').tagName).toBe('STRONG');
    expect(
      within(article).getByRole('button', {name: 'Like: 2'}),
    ).toHaveAttribute('aria-pressed', 'true');
    // Replies start hidden behind the disclosure link.
    expect(screen.getByText('View 1 reply')).toBeTruthy();
    expect(screen.queryByText('A one-level reply')).toBeNull();
  });

  it('renders the empty state when there is nothing to show', () => {
    render(
      <Sized>
        <Comments comments={[]} currentUser={VIEWER} onSubmit={vi.fn()} />
      </Sized>,
    );
    expect(screen.getByText('No comments yet')).toBeTruthy();
    expect(
      screen.getByText('Start the discussion with a comment.'),
    ).toBeTruthy();
  });

  it('interleaves activity events with threads by time', () => {
    render(
      <Sized>
        <Comments
          comments={[
            {
              id: 'early',
              author: OTHER,
              body: 'First',
              createdAt: '2026-09-30T19:00:00Z',
            },
            {
              id: 'late',
              author: VIEWER,
              body: 'Third',
              createdAt: '2026-09-30T19:20:00Z',
            },
          ]}
          events={[
            {
              id: 'status',
              label: 'Status changed to Ready for review',
              createdAt: '2026-09-30T19:10:00Z',
            },
          ]}
        />
      </Sized>,
    );
    const order = Array.from(
      document.querySelectorAll('[data-thread-id], [data-comments-event-id]'),
    ).map(
      element =>
        element.getAttribute('data-thread-id') ??
        element.getAttribute('data-comments-event-id'),
    );
    expect(order).toEqual(['early', 'status', 'late']);
  });

  it('marks agents with a badge and shows a comment still being written as its progress', () => {
    render(
      <Sized>
        <Comments
          comments={[
            {
              id: 'agent-root',
              author: AGENT,
              body: '',
              createdAt: '2026-09-30T19:00:00Z',
              progress: {
                label: 'Checking the rollout…',
                link: {label: 'Open session', href: '#session'},
              },
            },
          ]}
          currentUser={VIEWER}
          onSubmit={vi.fn()}
          onReact={vi.fn()}
        />
      </Sized>,
    );
    const article = articleByAuthor('Release Assistant');
    expect(within(article).getByText('Agent')).toBeTruthy();
    // The label carries no live role; the chat log around it delivers it.
    const progressLabel = within(article).getByText('Checking the rollout…');
    expect(progressLabel).not.toHaveAttribute('role');
    expect(within(article).queryByRole('status')).toBeNull();
    expect(
      within(article).getByRole('link', {name: 'Open session'}),
    ).toBeTruthy();
    // A comment still being written takes no replies or reactions.
    expect(within(article).queryByRole('button', {name: 'Reply'})).toBeNull();
    expect(
      within(article).queryByRole('button', {name: 'Add reaction'}),
    ).toBeNull();
  });

  it('removes the fading New badge from layout when its animation ends', () => {
    render(
      <Sized>
        <Comments comments={[{...COMMENTS[0], isUnread: true, replies: []}]} />
      </Sized>,
    );
    const badge = document.querySelector('[data-comment-unread-badge="true"]');
    expect(badge?.textContent).toBe('New');
    fireEvent.animationEnd(badge as Element);
    expect(
      document.querySelector('[data-comment-unread-badge="true"]'),
    ).toBeNull();
  });

  it('reveals unread replies without selecting, focusing, or opening a composer', () => {
    const onSelectedThreadChange = vi.fn();
    render(
      <Sized>
        <Comments
          comments={[
            {
              ...COMMENTS[0],
              replies: [
                {
                  id: 'unread-reply',
                  author: OTHER,
                  body: 'A new unseen reply.',
                  createdAt: '2026-09-30T19:10:00Z',
                  isUnread: true,
                },
              ],
            },
          ]}
          currentUser={VIEWER}
          composerPosition="none"
          onSubmit={vi.fn()}
          onSelectedThreadChange={onSelectedThreadChange}
        />
      </Sized>,
    );

    expect(threadSurface('root-1').getAttribute('data-selected')).toBe('false');
    const reveal = document.querySelector(
      '[data-unread-replies-revealed="true"]',
    );
    expect(reveal).not.toBeNull();
    expect(
      within(reveal as HTMLElement).getByText('A new unseen reply.'),
    ).toBeTruthy();
    expect(within(reveal as HTMLElement).getByText('New')).toBeTruthy();
    expect(screen.queryByRole('button', {name: 'Hide replies'})).toBeNull();
    expect(document.querySelector('[data-reply-composer]')).toBeNull();
    expect(onSelectedThreadChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it('shows read-only reactions but no control that changes data', () => {
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          mode="read-only"
          onSubmit={vi.fn()}
          onReact={vi.fn()}
          onSaveEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </Sized>,
    );
    const article = articleByAuthor('Avery Kim');
    expect(
      within(article).getByRole('button', {name: 'Like: 2'}),
    ).toBeDisabled();
    expect(within(article).queryByRole('button', {name: 'Reply'})).toBeNull();
    expect(
      within(article).queryByRole('button', {
        name: "Actions for Avery Kim's comment",
      }),
    ).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps reply and react in non-editable mode, without edit or delete', () => {
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          mode="non-editable"
          onSubmit={vi.fn()}
          onReact={vi.fn()}
          onSaveEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </Sized>,
    );
    const article = articleByAuthor('Avery Kim');
    expect(within(article).getByRole('button', {name: 'Reply'})).toBeTruthy();
    expect(
      within(article).getByRole('button', {name: 'Add reaction'}),
    ).toBeTruthy();
    expect(
      within(article).queryByRole('button', {
        name: "Actions for Avery Kim's comment",
      }),
    ).toBeNull();
  });

  it('uses divider-bounded Sections inside a card parent', () => {
    render(
      <Sized>
        <Comments comments={COMMENTS} container="card" />
      </Sized>,
    );
    expect(threadSurface('root-1').getAttribute('data-thread-surface')).toBe(
      'section',
    );
  });

  it('renders embedded at content height, without the chat layout', () => {
    render(
      <Comments
        comments={COMMENTS}
        container="card"
        layout="embedded"
        composerPosition="none"
      />,
    );
    const region = screen.getByRole('region', {name: 'Comments'});
    expect(region.getAttribute('data-layout')).toBe('embedded');
    expect(region.querySelector('[role="log"]')).toBeNull();
  });

  it('shows the loading shape while loading', () => {
    render(
      <Sized>
        <Comments
          comments={[]}
          isLoading
          currentUser={VIEWER}
          onSubmit={vi.fn()}
        />
      </Sized>,
    );
    expect(screen.getByText('Loading comments')).toBeTruthy();
    expect(
      document.querySelector('[data-comments-loading="composer"]'),
    ).not.toBeNull();
  });
});

describe('Comments live collaboration seams', () => {
  it('shows typing only after the thread opens and keeps seen-by metadata hidden by default', async () => {
    const seenBy = [OTHER, AGENT] as const;
    const renderBody = vi.fn((comment: CommentData) => (
      <span>{comment.body}</span>
    ));
    render(
      <Sized>
        <Comments
          comments={[
            {
              ...COMMENTS[0],
              replies: [],
              typingUsers: [VIEWER, OTHER, OTHER, AGENT],
              seenBy,
            },
          ]}
          currentUser={VIEWER}
          renderBody={renderBody}
        />
      </Sized>,
    );

    expect(
      screen.queryByText('Maya Chen and Release Assistant are typing…'),
    ).toBeNull();
    expect(screen.queryByText('Seen by')).toBeNull();
    expect(document.querySelector('[data-comment-seen-by]')).toBeNull();
    expect(renderBody).toHaveBeenCalledWith(expect.objectContaining({seenBy}));

    await click(screen.getByRole('button', {name: 'Thread by Avery Kim'}));
    const typingStatus = screen
      .getByText('Maya Chen and Release Assistant are typing…')
      .closest('.astryx-chat-typing-indicator');
    expect(typingStatus).not.toBeNull();
    expect(typingStatus).not.toHaveAttribute('role');
    expect(
      (typingStatus as HTMLElement).style.getPropertyValue(
        '--astryx-chat-typing-indicator-dots-column-width',
      ),
    ).not.toBe('');
  });

  it('reports a new-comment draft with its anchor and clears it after posting', async () => {
    const onComposerDraftChange = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const anchor = {quote: 'The rollout completes on Friday.'};
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          composerAnchor={anchor}
          onSubmit={onSubmit}
          onComposerDraftChange={onComposerDraftChange}
          renderComposer={renderComposer}
        />
      </Sized>,
    );

    const composer = screen.getByRole('region', {name: 'New comment'});
    await click(within(composer).getByText('Set draft'));
    expect(onComposerDraftChange).toHaveBeenLastCalledWith('New comment body', {
      kind: 'comment',
      anchor,
    });
    await click(within(composer).getByText('Submit composer'));
    await flush();
    expect(onComposerDraftChange).toHaveBeenLastCalledWith('', {
      kind: 'comment',
      anchor,
    });
  });

  it('restores a failed draft without reporting a false clear', async () => {
    const onComposerDraftChange = vi.fn();
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          onSubmit={vi.fn().mockRejectedValue(new Error('offline'))}
          onComposerDraftChange={onComposerDraftChange}
          renderComposer={renderComposer}
        />
      </Sized>,
    );

    const composer = screen.getByRole('region', {name: 'New comment'});
    await click(within(composer).getByText('Set draft'));
    await click(within(composer).getByText('Submit composer'));
    await flush();
    expect(onComposerDraftChange).toHaveBeenLastCalledWith('New comment body', {
      kind: 'comment',
    });
    expect(onComposerDraftChange).not.toHaveBeenCalledWith('', {
      kind: 'comment',
    });
  });
});

describe('Comments threads', () => {
  it('opens a pressed thread into its reply composer and shows its replies', async () => {
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          onSubmit={vi.fn()}
          renderComposer={renderComposer}
        />
      </Sized>,
    );
    await click(screen.getByRole('button', {name: 'Thread by Avery Kim'}));
    expect(threadSurface('root-1').getAttribute('data-selected')).toBe('true');
    expect(screen.getByText('A one-level reply')).toBeTruthy();
    expect(
      screen.getByRole('region', {name: 'Replying to Avery Kim'}),
    ).toHaveAttribute('data-placeholder', 'Reply to Avery Kim…');
  });

  it('keeps one thread selected at a time', async () => {
    render(
      <Sized>
        <Comments
          comments={[
            {
              id: 'a',
              author: OTHER,
              body: 'First',
              createdAt: '2026-09-30T19:00:00Z',
            },
            {
              id: 'b',
              author: VIEWER,
              body: 'Second',
              createdAt: '2026-09-30T19:05:00Z',
            },
          ]}
        />
      </Sized>,
    );
    await click(screen.getByRole('button', {name: 'Thread by Maya Chen'}));
    expect(threadSurface('a').getAttribute('data-selected')).toBe('true');
    await click(screen.getByRole('button', {name: 'Thread by Avery Kim'}));
    expect(threadSurface('a').getAttribute('data-selected')).toBe('false');
    expect(threadSurface('b').getAttribute('data-selected')).toBe('true');
  });

  it('posts a reply to a reply under the thread, seeded by getReplyMention', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onComposerDraftChange = vi.fn();
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          onSubmit={onSubmit}
          onComposerDraftChange={onComposerDraftChange}
          getReplyMention={author => `@${author.id} `}
          renderComposer={renderComposer}
        />
      </Sized>,
    );
    await click(screen.getByText('View 1 reply'));
    await click(
      within(articleByAuthor('Maya Chen')).getByRole('button', {name: 'Reply'}),
    );
    const composer = screen.getByRole('region', {
      name: 'Replying to Maya Chen',
    });
    expect(composer.querySelector('output')?.textContent).toBe('@maya ');
    const replyContext = {
      kind: 'reply' as const,
      parentCommentId: 'root-1',
      repliedToCommentId: 'reply-1',
    };
    expect(onComposerDraftChange).toHaveBeenLastCalledWith(
      '@maya ',
      replyContext,
    );
    await click(within(composer).getByText('Set draft'));
    expect(onComposerDraftChange).toHaveBeenLastCalledWith(
      '@maya Reply body',
      replyContext,
    );
    await click(within(composer).getByText('Submit composer'));
    await flush();
    expect(onSubmit).toHaveBeenCalledWith('@maya Reply body', 'root-1');
    expect(onComposerDraftChange).toHaveBeenLastCalledWith('', replyContext);
    expect(
      screen.queryByRole('region', {name: 'Replying to Maya Chen'}),
    ).toBeNull();
  });

  it('posts a new comment and clears the draft', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          onSubmit={onSubmit}
          renderComposer={renderComposer}
        />
      </Sized>,
    );
    const composer = screen.getByRole('region', {name: 'New comment'});
    await click(within(composer).getByText('Set draft'));
    await click(within(composer).getByText('Submit composer'));
    await flush();
    expect(onSubmit).toHaveBeenCalledWith('New comment body', undefined);
    expect(composer.querySelector('output')?.textContent).toBe('');
  });

  it('restores a rejected draft and shows a generic error', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('backend detail'));
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          onSubmit={onSubmit}
          renderComposer={renderComposer}
        />
      </Sized>,
    );
    const composer = screen.getByRole('region', {name: 'New comment'});
    await click(within(composer).getByText('Set draft'));
    await click(within(composer).getByText('Submit composer'));
    await flush();
    expect(composer.querySelector('output')?.textContent).toBe(
      'New comment body',
    );
    expect(within(composer).getByRole('alert').textContent).toBe(
      "Your comment couldn't be posted.",
    );
    expect(document.body.textContent).not.toContain('backend detail');
  });

  it('edits the viewer’s own comment from the more menu', async () => {
    const onSaveEdit = vi.fn().mockResolvedValue(undefined);
    const onComposerDraftChange = vi.fn();
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          onSaveEdit={onSaveEdit}
          onComposerDraftChange={onComposerDraftChange}
          onDelete={vi.fn()}
          renderComposer={renderComposer}
        />
      </Sized>,
    );
    await click(
      within(articleByAuthor('Avery Kim')).getByRole('button', {
        name: "Actions for Avery Kim's comment",
      }),
    );
    await flush();
    await click(menuItem('Edit'));
    const editor = screen.getByRole('region', {name: 'Editing comment'});
    const editContext = {kind: 'edit' as const, commentId: 'root-1'};
    expect(onComposerDraftChange).toHaveBeenLastCalledWith(
      COMMENTS[0].body,
      editContext,
    );
    await click(within(editor).getByText('Set draft'));
    expect(onComposerDraftChange).toHaveBeenLastCalledWith(
      'Edited comment body',
      editContext,
    );
    await click(within(editor).getByText('Submit composer'));
    await flush();
    expect(onSaveEdit).toHaveBeenCalledWith('root-1', 'Edited comment body');
    expect(onComposerDraftChange).toHaveBeenLastCalledWith('', editContext);
    expect(screen.queryByRole('region', {name: 'Editing comment'})).toBeNull();
  });

  it('confirms a deletion before calling the host', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          onDelete={onDelete}
        />
      </Sized>,
    );
    await click(
      within(articleByAuthor('Avery Kim')).getByRole('button', {
        name: "Actions for Avery Kim's comment",
      }),
    );
    await flush();
    await click(menuItem('Delete'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      'This action cannot be undone.',
    );
    const dialog = document.querySelector('dialog[open]');
    if (!(dialog instanceof HTMLDialogElement)) {
      throw new Error('Delete confirmation not found');
    }
    await click(within(dialog).getByRole('button', {name: 'Delete'}));
    await flush();
    expect(onDelete).toHaveBeenCalledWith('root-1');
  });

  it('toggles a reaction and picks a new one from Add reaction', async () => {
    const onReact = vi.fn().mockResolvedValue(undefined);
    render(
      <Sized>
        <Comments comments={COMMENTS} currentUser={VIEWER} onReact={onReact} />
      </Sized>,
    );
    const article = articleByAuthor('Avery Kim');
    await click(within(article).getByRole('button', {name: 'Like: 2'}));
    expect(onReact).toHaveBeenCalledWith('root-1', 'like', undefined);
    await flush();
    await click(within(article).getByRole('button', {name: 'Add reaction'}));
    // Popover content sits in a closed [popover] for jsdom's accessibility
    // tree, so it is queried with `hidden`.
    await click(screen.getByRole('button', {name: 'Celebrate', hidden: true}));
    expect(onReact).toHaveBeenLastCalledWith(
      'root-1',
      'celebrate',
      expect.objectContaining({key: 'celebrate', label: '🎉'}),
    );
  });

  it('shows a failed reaction as an error Banner whose Retry reacts again', async () => {
    const onReact = vi
      .fn()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue(undefined);
    render(
      <Sized>
        <Comments comments={COMMENTS} currentUser={VIEWER} onReact={onReact} />
      </Sized>,
    );
    await click(
      within(articleByAuthor('Avery Kim')).getByRole('button', {
        name: 'Like: 2',
      }),
    );
    await flush();
    const banner = bannerByData('data-comment-action-error');
    expect(banner).not.toHaveAttribute('role');
    expect(banner.textContent).toContain("Your reaction couldn't be saved.");
    await click(within(banner).getByRole('button', {name: 'Retry'}));
    await flush();
    expect(onReact).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-comment-action-error]')).toBeNull();
  });

  it('copies a link to the comment', async () => {
    render(
      <Sized>
        <Comments
          comments={[{...COMMENTS[0], replies: []}]}
          currentUser={OTHER}
        />
      </Sized>,
    );
    await click(screen.getByRole('button', {name: 'Copy comment link'}));
    await flush();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/#comment-root-1$/),
    );
    expect(
      screen.getByRole('button', {name: 'Comment link copied'}),
    ).toBeTruthy();
  });

  it('collapses header actions into the more menu when space runs low', async () => {
    overflowControl.collapsed = new Set(['reply', 'link']);
    const onSubmit = vi.fn();
    render(
      <Sized>
        <Comments
          comments={[{...COMMENTS[0], replies: []}]}
          currentUser={OTHER}
          onSubmit={onSubmit}
          renderComposer={renderComposer}
        />
      </Sized>,
    );
    await flush();
    const article = articleByAuthor('Avery Kim');
    expect(within(article).queryByRole('button', {name: 'Reply'})).toBeNull();
    await click(
      within(article).getByRole('button', {
        name: "Actions for Avery Kim's comment",
      }),
    );
    await flush();
    expect(menuItem('Reply')).toBeTruthy();
    expect(menuItem('Copy comment link')).toBeTruthy();
  });

  it('loads and shows the edit history', async () => {
    const loadVersions = vi.fn().mockResolvedValue([
      {
        id: 'current',
        body: 'Current wording',
        editedAt: '2026-09-30T19:00:00Z',
        isCurrent: true,
      },
      {
        id: 'previous',
        body: 'Previous wording',
        editedAt: '2026-09-30T18:00:00Z',
      },
    ]);
    render(
      <Sized>
        <Comments comments={COMMENTS} loadVersions={loadVersions} />
      </Sized>,
    );
    await click(screen.getByRole('button', {name: 'View edit history'}));
    await flush();
    expect(loadVersions).toHaveBeenCalledWith('root-1');
    expect(document.body.textContent).toContain('Previous wording');
    expect(document.body.textContent).toContain('Current version');
  });

  it('retries a comment that failed to send', async () => {
    const onRetryComment = vi.fn().mockResolvedValue(undefined);
    render(
      <Sized>
        <Comments
          comments={[
            {
              id: 'failed',
              author: VIEWER,
              body: 'Kept text',
              createdAt: '2026-09-30T19:00:00Z',
              status: 'error',
              errorMessage: "Couldn't post this comment.",
            },
          ]}
          currentUser={VIEWER}
          onRetryComment={onRetryComment}
        />
      </Sized>,
    );
    const banner = bannerByData('data-comment-delivery-error');
    expect(banner).not.toHaveAttribute('role');
    expect(banner.textContent).toContain("Couldn't post this comment.");
    await click(within(banner).getByRole('button', {name: 'Retry'}));
    await flush();
    expect(onRetryComment).toHaveBeenCalledWith('failed');
  });

  it('loads earlier comments, and offers Retry when that fails', async () => {
    const onLoadOlder = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          hasOlderComments
          onLoadOlder={onLoadOlder}
        />
      </Sized>,
    );
    await click(screen.getByRole('button', {name: 'Load earlier comments'}));
    await flush();
    const banner = bannerByData('data-comments-older-error');
    expect(banner).not.toHaveAttribute('role');
    expect(banner.textContent).toContain("Earlier comments couldn't load");
    await click(within(banner).getByRole('button', {name: 'Retry'}));
    await flush();
    expect(onLoadOlder).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('button', {name: 'Load earlier comments'}),
    ).toBeTruthy();
  });
});

describe('Comments resolved and inline threads', () => {
  it('resolves an open thread and reopens a resolved one', async () => {
    const onResolveThread = vi.fn().mockResolvedValue(undefined);
    const onReopenThread = vi.fn().mockResolvedValue(undefined);
    render(
      <Sized>
        <Comments
          comments={[
            {
              id: 'open',
              author: OTHER,
              body: 'Open thread',
              createdAt: '2026-09-30T19:00:00Z',
            },
            {
              id: 'done',
              author: OTHER,
              body: 'Resolved thread',
              createdAt: '2026-09-30T19:05:00Z',
              isResolved: true,
              resolvedBy: VIEWER,
            },
          ]}
          currentUser={VIEWER}
          onResolveThread={onResolveThread}
          onReopenThread={onReopenThread}
        />
      </Sized>,
    );
    await click(
      within(threadSurface('open')).getByRole('button', {
        name: 'Mark as resolved',
      }),
    );
    expect(onResolveThread).toHaveBeenCalledWith('open');
    const resolved = threadSurface('done');
    expect(within(resolved).getByText('Resolved')).toBeTruthy();
    await click(within(resolved).getByRole('button', {name: 'Reopen'}));
    expect(onReopenThread).toHaveBeenCalledWith('done');
  });

  it('quotes anchored passages and marks orphaned ones Outdated', () => {
    render(
      <Sized>
        <Comments
          highlightColor="blue"
          comments={[
            {
              id: 'inline',
              author: OTHER,
              body: 'Should this say three days?',
              createdAt: '2026-09-30T19:00:00Z',
              anchor: {quote: 'The rollout completes in two days.'},
            },
            {
              id: 'orphaned',
              author: VIEWER,
              body: 'Typo.',
              createdAt: '2026-09-30T19:05:00Z',
              anchor: {quote: 'Teh query runs hourly.', status: 'orphaned'},
            },
          ]}
        />
      </Sized>,
    );
    const inline = threadSurface('inline');
    expect(
      inline
        .querySelector('[data-quote-rule="highlight"]')
        ?.getAttribute('data-highlight-color'),
    ).toBe('blue');
    const orphaned = threadSurface('orphaned');
    expect(within(orphaned).getByText('Outdated')).toBeTruthy();
    expect(
      orphaned.querySelector('[data-quote-rule="neutral"]'),
    ).not.toBeNull();
  });

  it('lets the host own selection for highlight sync', async () => {
    function Host() {
      const [selected, setSelected] = useState<string | null>(null);
      return (
        <Sized>
          <button type="button" onClick={() => setSelected('root-1')}>
            Select from document
          </button>
          <output data-testid="selected">{selected ?? 'none'}</output>
          <Comments
            comments={COMMENTS}
            currentUser={VIEWER}
            selectedThreadId={selected}
            onSelectedThreadChange={setSelected}
            onSubmit={vi.fn()}
            renderComposer={renderComposer}
          />
        </Sized>
      );
    }
    render(<Host />);
    await click(screen.getByText('Select from document'));
    await flush();
    expect(threadSurface('root-1').getAttribute('data-selected')).toBe('true');
    expect(screen.getByText('A one-level reply')).toBeTruthy();
    await click(screen.getByRole('button', {name: 'Thread by Avery Kim'}));
    expect(screen.getByTestId('selected').textContent).toBe('none');
  });

  it('quotes the composer anchor and lets the viewer remove it', async () => {
    const onDismiss = vi.fn();
    render(
      <Sized>
        <Comments
          comments={[]}
          currentUser={VIEWER}
          onSubmit={vi.fn()}
          composerAnchor={{quote: 'Guardrail alerts page within five minutes.'}}
          onComposerAnchorDismiss={onDismiss}
        />
      </Sized>,
    );
    const quote = document.querySelector('[data-composer-anchor="quote"]');
    expect(quote?.textContent).toContain(
      'Guardrail alerts page within five minutes.',
    );
    await click(screen.getByRole('button', {name: 'Remove quoted text'}));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

/** Lets a requested focus land: rows move it a frame after the commit. */
async function nextFrame() {
  await act(
    () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => setTimeout(resolve, 0)),
      ),
  );
}

describe('Comments keyboard and focus', () => {
  it('opens a thread selected at mount without taking focus', async () => {
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          onSubmit={vi.fn()}
          selectedThreadId="root-1"
          onSelectedThreadChange={vi.fn()}
          renderComposer={renderComposer}
        />
      </Sized>,
    );
    await nextFrame();
    expect(threadSurface('root-1').getAttribute('data-selected')).toBe('true');
    expect(screen.getByText('A one-level reply')).toBeTruthy();
    expect(document.body).toHaveFocus();
  });

  it('opens a thread from the keyboard, leaving focus on it', async () => {
    const user = userEvent.setup();
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          onSubmit={vi.fn()}
          renderComposer={renderComposer}
        />
      </Sized>,
    );
    const toggle = screen.getByRole('button', {name: 'Thread by Avery Kim'});
    toggle.focus();
    await user.keyboard('{Enter}');
    await nextFrame();
    expect(threadSurface('root-1').getAttribute('data-selected')).toBe('true');
    expect(screen.getByText('A one-level reply')).toBeTruthy();
    expect(toggle).toHaveFocus();
  });

  it('returns focus to the comment’s actions when an edit is cancelled', async () => {
    const user = userEvent.setup();
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          onSaveEdit={vi.fn()}
          onDelete={vi.fn()}
          renderComposer={renderComposer}
        />
      </Sized>,
    );
    const actions = within(articleByAuthor('Avery Kim')).getByRole('button', {
      name: "Actions for Avery Kim's comment",
    });
    await click(actions);
    await flush();
    await click(menuItem('Edit'));
    const editor = screen.getByRole('region', {name: 'Editing comment'});
    await user.click(within(editor).getByText('Cancel composer'));
    await nextFrame();
    expect(screen.queryByRole('region', {name: 'Editing comment'})).toBeNull();
    // The header remounts after the edit; its new actions button has focus.
    expect(
      within(articleByAuthor('Avery Kim')).getByRole('button', {
        name: "Actions for Avery Kim's comment",
      }),
    ).toHaveFocus();
  });

  it('announces a failed delete once when no chat log wraps the row', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <Sized>
        <Comments
          layout="embedded"
          comments={COMMENTS}
          currentUser={OTHER}
          onDelete={onDelete}
          selectedThreadId="root-1"
          onSelectedThreadChange={vi.fn()}
        />
      </Sized>,
    );
    await click(
      within(articleByAuthor('Maya Chen')).getByRole('button', {
        name: "Actions for Maya Chen's comment",
      }),
    );
    await flush();
    await click(menuItem('Delete'));
    const dialog = document.querySelector('dialog[open]');
    if (!(dialog instanceof HTMLDialogElement)) {
      throw new Error('Delete confirmation not found');
    }
    announce.mockClear();
    await click(within(dialog).getByRole('button', {name: 'Delete'}));
    await flush();
    await nextFrame();

    // The dialog owns the announcement; the row's stored failure is silent.
    const deleteAnnouncements = announce.mock.calls.filter(([message]) =>
      /couldn't be deleted/.test(message),
    );
    expect(deleteAnnouncements).toEqual([
      ["This comment couldn't be deleted. Try again.", 'assertive'],
    ]);
  });

  it('announces a failed delete once when onDelete throws synchronously', async () => {
    const onDelete = vi.fn(() => {
      throw new Error('offline');
    });
    render(
      <Sized>
        <Comments
          layout="embedded"
          comments={COMMENTS}
          currentUser={OTHER}
          onDelete={onDelete}
          selectedThreadId="root-1"
          onSelectedThreadChange={vi.fn()}
        />
      </Sized>,
    );
    await click(
      within(articleByAuthor('Maya Chen')).getByRole('button', {
        name: "Actions for Maya Chen's comment",
      }),
    );
    await flush();
    await click(menuItem('Delete'));
    const dialog = document.querySelector('dialog[open]');
    if (!(dialog instanceof HTMLDialogElement)) {
      throw new Error('Delete confirmation not found');
    }
    announce.mockClear();
    await click(within(dialog).getByRole('button', {name: 'Delete'}));
    await flush();
    await nextFrame();

    // The dialog owns the announcement; the row's stored failure is silent.
    const deleteAnnouncements = announce.mock.calls.filter(([message]) =>
      /couldn't be deleted/.test(message),
    );
    expect(deleteAnnouncements).toEqual([
      ["This comment couldn't be deleted. Try again.", 'assertive'],
    ]);
  });

  it('announces a failed delete of a failed post once', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <Sized>
        <Comments
          layout="embedded"
          comments={[
            {
              id: 'failed',
              author: VIEWER,
              body: 'Kept text',
              createdAt: '2026-09-30T19:00:00Z',
              status: 'error',
              errorMessage: "Couldn't post this comment.",
            },
          ]}
          currentUser={VIEWER}
          onDelete={onDelete}
        />
      </Sized>,
    );
    await click(
      within(articleByAuthor('Avery Kim')).getByRole('button', {
        name: "Actions for Avery Kim's comment",
      }),
    );
    await flush();
    await click(menuItem('Delete'));
    const dialog = document.querySelector('dialog[open]');
    if (!(dialog instanceof HTMLDialogElement)) {
      throw new Error('Delete confirmation not found');
    }
    announce.mockClear();
    await click(within(dialog).getByRole('button', {name: 'Delete'}));
    await flush();
    await nextFrame();

    // The dialog owns the announcement; the failed post's Banner shows the
    // failure as its description without saying it a second time.
    const deleteAnnouncements = announce.mock.calls.filter(([message]) =>
      /couldn't be deleted/.test(message),
    );
    expect(deleteAnnouncements).toEqual([
      ["This comment couldn't be deleted. Try again.", 'assertive'],
    ]);
  });

  it('moves focus to the thread after deleting a reply, and announces a failure once', async () => {
    const onDelete = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          currentUser={OTHER}
          onDelete={onDelete}
          selectedThreadId="root-1"
          onSelectedThreadChange={vi.fn()}
        />
      </Sized>,
    );
    const openDialog = async () => {
      await click(
        within(articleByAuthor('Maya Chen')).getByRole('button', {
          name: "Actions for Maya Chen's comment",
        }),
      );
      await flush();
      await click(menuItem('Delete'));
      const dialog = document.querySelector('dialog[open]');
      if (!(dialog instanceof HTMLDialogElement)) {
        throw new Error('Delete confirmation not found');
      }
      return dialog;
    };
    const dialog = await openDialog();
    await click(within(dialog).getByRole('button', {name: 'Delete'}));
    await flush();
    const failure = "This comment couldn't be deleted. Try again.";
    expect(dialog.textContent).toContain(failure);
    const assertive = document.querySelector(
      '[data-astryx-live-region="assertive"]',
    );
    await waitFor(() => expect(assertive?.textContent).toContain(failure));
    // The retry succeeds; focus lands on the thread's first comment.
    await click(within(dialog).getByRole('button', {name: 'Delete'}));
    await flush();
    await nextFrame();
    expect(onDelete).toHaveBeenCalledTimes(2);
    expect(articleByAuthor('Avery Kim')).toHaveFocus();
  });

  it('keeps focus on the earlier-comments control as it turns into Retry and back', async () => {
    const user = userEvent.setup();
    const onLoadOlder = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    render(
      <Sized>
        <Comments
          comments={COMMENTS}
          hasOlderComments
          onLoadOlder={onLoadOlder}
        />
      </Sized>,
    );
    screen.getByRole('button', {name: 'Load earlier comments'}).focus();
    await user.keyboard('{Enter}');
    await flush();
    const banner = screen
      .getByText("Earlier comments couldn't load")
      .closest<HTMLElement>('[data-comments-older-error]');
    if (banner == null) {
      throw new Error('Earlier-comments failure not found');
    }
    expect(within(banner).getByRole('button', {name: 'Retry'})).toHaveFocus();
    await user.keyboard('{Enter}');
    await flush();
    expect(onLoadOlder).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('button', {name: 'Load earlier comments'}),
    ).toHaveFocus();
  });
});

describe('Comments status announcements (spec:AST-086)', () => {
  const FAILED_COMMENT = {
    id: 'failed',
    author: VIEWER,
    body: 'Kept text',
    createdAt: '2026-09-30T19:00:00Z',
    status: 'error' as const,
    errorMessage: "Couldn't post this comment.",
  };

  it('announces a load failure once, assertively, and the Banner has no live role', async () => {
    const {rerender} = render(
      <Sized>
        <Comments comments={[]} loadError="Server unreachable" />
      </Sized>,
    );
    await flush();
    // Only the shared channel's own region is an alert; the Banner is not.
    expect(
      document.querySelectorAll(
        '[role="alert"]:not([data-astryx-live-region])',
      ),
    ).toHaveLength(0);
    expect(screen.getByText('Server unreachable')).toBeTruthy();
    expect(announce.mock.calls).toEqual([
      ["Comments couldn't load Server unreachable", 'assertive'],
    ]);

    rerender(
      <Sized>
        <Comments comments={[]} loadError="Server unreachable" />
      </Sized>,
    );
    await flush();
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('leaves an in-timeline failure to the chat log', async () => {
    render(
      <Sized>
        <Comments comments={[FAILED_COMMENT]} currentUser={VIEWER} />
      </Sized>,
    );
    const banner = bannerByData('data-comment-delivery-error');
    expect(banner.closest('[role="log"]')).not.toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces a failure itself when no chat log wraps it', async () => {
    render(
      <Sized>
        <Comments
          layout="embedded"
          comments={[FAILED_COMMENT]}
          currentUser={VIEWER}
        />
      </Sized>,
    );
    const banner = bannerByData('data-comment-delivery-error');
    expect(banner.closest('[role="log"]')).toBeNull();
    expect(announce.mock.calls).toEqual([
      [expect.stringContaining("Couldn't post this comment."), 'assertive'],
    ]);
  });

  it('does not repeat a failure when a retry starts, and announces each failed retry', async () => {
    const onRetryComment = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <Sized>
        <Comments
          layout="embedded"
          comments={[FAILED_COMMENT]}
          currentUser={VIEWER}
          onRetryComment={onRetryComment}
        />
      </Sized>,
    );
    await flush();
    const first = ["Couldn't post this comment.", 'assertive'];
    const failed = [
      "Couldn't post this comment. Retrying didn't work.",
      'assertive',
    ];
    expect(announce.mock.calls).toEqual([first]);

    const banner = () => bannerByData('data-comment-delivery-error');
    const retry = () => within(banner()).getByRole('button', {name: 'Retry'});
    await click(retry());
    await flush();
    expect(announce.mock.calls).toEqual([first, failed]);

    // Starting a retry says nothing; its failure, a new occasion, speaks.
    await click(retry());
    await flush();
    expect(announce.mock.calls).toEqual([first, failed, failed]);
  });

  it('does not repeat a failure when an unrelated post settles', async () => {
    let finishPost!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>(r => (finishPost = r)));
    render(
      <Sized>
        <Comments
          layout="embedded"
          comments={[FAILED_COMMENT]}
          currentUser={VIEWER}
          onSubmit={onSubmit}
          renderComposer={renderComposer}
        />
      </Sized>,
    );
    const composer = screen.getByRole('region', {name: 'New comment'});
    await click(within(composer).getByText('Set draft'));
    await click(within(composer).getByText('Submit composer'));
    await act(async () => finishPost());
    await flush();
    expect(announce.mock.calls).toEqual([
      ["Couldn't post this comment.", 'assertive'],
    ]);
  });

  it('announces a comment still being written, politely, outside a chat log', async () => {
    render(
      <Sized>
        <Comments
          layout="embedded"
          comments={[
            {
              id: 'agent',
              author: AGENT,
              body: '',
              createdAt: '2026-09-30T19:00:00Z',
              progress: {label: 'Checking the rollout…'},
            },
          ]}
          currentUser={VIEWER}
        />
      </Sized>,
    );
    await flush();
    expect(announce.mock.calls).toEqual([['Checking the rollout…', 'polite']]);
  });

  it('delivers a history failure through an alert slot that exists before the Banner', async () => {
    let rejectVersions!: (error: Error) => void;
    const loadVersions = vi.fn(
      () => new Promise<never>((_, reject) => (rejectVersions = reject)),
    );
    render(
      <Sized>
        <Comments comments={COMMENTS} loadVersions={loadVersions} />
      </Sized>,
    );
    await click(screen.getByRole('button', {name: 'View edit history'}));
    await flush();
    // While the history loads, the slot is already mounted, and empty.
    const slot = document.querySelector<HTMLElement>('dialog [role="alert"]');
    if (slot == null) {
      throw new Error('History alert slot not found while loading');
    }
    expect(slot.textContent).toBe('');

    await act(async () => {
      rejectVersions(new Error('nope'));
    });
    await flush();
    // The failure lands in that slot; the Banner has no live role of its own.
    expect(document.querySelector('dialog [role="alert"]')).toBe(slot);
    expect(slot.textContent).toContain("Edit history couldn't load");
    expect(slot.querySelector('[role]')).toBeNull();
  });
});
