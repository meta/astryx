// Copyright (c) Meta Platforms, Inc. and affiliates.

// @ts-check

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'Comments',
  displayName: 'Comments',
  group: 'Comments',
  category: 'Chat',
  keywords: [
    'discussion',
    'comments',
    'comment thread',
    'threads',
    'replies',
    'reactions',
    'activity',
    'timeline',
    'inline comments',
    'annotations',
    'review',
    'conversation',
  ],
  description:
    'The comments on one item: comment threads with one level of replies, reactions, edit history, controlled typing and seen metadata, inline-comment quotes, and activity events in time order, with a composer for new comments. Controlled: your app owns the data and every mutation; the panel owns presentation, selection, and focus.',
  usage: {
    description:
      'The Comments panel shows the conversation about a document, task, or record: its comment threads and activity, with a composer for new comments. Use it as a side panel or section that fills a sized container, or embedded at its content height inside a card or popover. Render a single thread with CommentThread and a standalone composer with CommentComposer.',
    anatomy: [
      {
        name: 'Thread',
        required: true,
        description:
          'An outlined Card on a section parent, or an edge-to-edge Section with 1px dividers on a card parent. Selecting it opens the thread: the body unclamps, replies show, and the reply composer opens, taking focus on a pointer press.',
      },
      {
        name: 'Avatar',
        required: true,
        description:
          'A 28×28 picture or initials: a circle for people, a rounded square for agents. In an open thread a 2px rail joins the avatars in segments.',
      },
      {
        name: 'Header',
        required: true,
        description:
          'One avatar tall: name, relative time, Edited (opens the edit history), and Resolved. Mark as resolved or Reopen, Add reaction, Reply, Copy link, and the more menu (Edit, Delete) appear while the pointer or focus is on the thread, collapsing into the more menu when room runs out.',
      },
      {
        name: 'Quoted passage',
        required: false,
        description:
          'An inline comment quotes its passage as an italic blockquote whose rule takes the highlight color. A passage edited away keeps a neutral rule and an Outdated badge.',
      },
      {
        name: 'Body',
        required: true,
        description:
          'Markdown, clamped to three lines until the thread opens. Images open in a Lightbox. A comment still being written shows its progress instead.',
      },
      {
        name: 'Reactions',
        required: false,
        description:
          'A toggle for each reaction, pressed where the viewer reacted; its tooltip names who reacted.',
      },
      {
        name: 'Replies',
        required: false,
        description:
          'One level, behind View replies. A host-marked unread reply reveals without selecting the thread, moving focus, or opening the reply composer. Replying to a reply posts to the thread.',
      },
      {
        name: 'Live state',
        required: false,
        description:
          'Controlled typing state appears at the end of an open thread, with its pulsing dots in the avatar column and its label on the comment-text line. Controlled `seenBy` metadata is available to comment render callbacks but has no default presentation.',
      },
      {
        name: 'Activity event',
        required: false,
        description:
          'A timeline row for a status change or other event, interleaved with threads by time.',
      },
      {
        name: 'Composer',
        required: false,
        description:
          'A two-row CommentComposer docked at the bottom (or top): the input above attach and emoji buttons and Post.',
      },
    ],
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep the data controlled: update `comments` after each callback. Return a Promise so the panel shows the pending state and, when it rejects, an error with Retry.',
      },
      {
        guidance: true,
        description:
          'Match the surface: give a pane a definite height, use `layout="embedded"` inside a card or popover, and set `container="card"` on a card parent so cards never nest.',
      },
      {
        guidance: true,
        description:
          'For inline comments, keep anchoring in your app: pass each thread its `anchor`, mark it `orphaned` when it no longer resolves, and sync `selectedThreadId` with the passage you highlight.',
      },
      {
        guidance: true,
        description:
          'Keep live state controlled and transport-neutral: map your collaboration layer to `typingUsers` and `seenBy`, and use `onComposerDraftChange` to publish local activity. `seenBy` stays hidden unless a comment render callback presents it. Debounce and expire transient activity in your app.',
      },
      {
        guidance: false,
        description:
          'Put data fetching, authorization, or telemetry in render slots. Keep them in your app and pass the results as data.',
      },
      {
        guidance: false,
        description:
          'Assume `selectedThreadId` moves focus or opens a composer. It reveals and scrolls the controlled thread without interrupting the viewer; only their Reply action opens the reply composer.',
      },
    ],
    accessibility: [
      {
        name: 'Comment list',
        category: 'Semantics',
        description:
          'The threads sit in a log named after the region, such as "Threads in Launch plan", so screen readers hear new comments politely. Each comment is an article named by its author, and the region reports busy while comments load.',
      },
      {
        name: 'Live updates',
        category: 'Content',
        criterion: '4.1.3 Status Messages',
        description:
          'Typing is a polite status message with reduced-motion-safe dots. `seenBy` metadata has no default presentation and introduces no additional live region.',
      },
      {
        name: 'Thread toggle',
        category: 'Keyboard',
        criterion: '2.1.1 Keyboard',
        description:
          'Each thread has one toggle button (the WAI-ARIA Button pattern, with aria-pressed) named "Thread by" and its author. Enter or Space opens or closes it and keeps focus on it; a pointer press on the thread opens it with focus in the reply composer. The whole surface takes the system focus ring while the toggle has focus.',
      },
      {
        name: 'Replies and actions',
        category: 'Keyboard',
        description:
          'View replies is a disclosure button with aria-expanded and aria-controls (the WAI-ARIA Disclosure pattern). The more menu follows the Menu Button pattern; when an edit is saved or cancelled, or the delete dialog closes, focus returns to it.',
      },
      {
        name: 'Focus after changes',
        category: 'Keyboard',
        criterion: '2.4.3 Focus Order',
        description:
          'Focus never drops to the page. After a delete it moves to the next thread, or to the thread when a reply was deleted. Load earlier comments keeps focus on itself, or on the Retry that replaces it when loading fails. A thread selected when the panel mounts opens without taking focus.',
      },
      {
        name: 'Busy actions',
        category: 'Keyboard',
        description:
          'Post and reactions stay focusable while a request is in flight and refuse a second press, so focus never drops to the page mid-request.',
      },
      {
        name: 'Errors',
        category: 'Content',
        criterion: '4.1.3 Status Messages',
        description:
          'Failures show in error Banners next to the thing that failed, each with Retry when the action can be repeated. A Banner carries no live role of its own: its failure is announced once, assertively, through the shared announcement channel, unless it sits inside the chat log, which delivers it. The progress label of a comment still being written follows the same rule, politely. The edit-history dialog announces its failure through an alert region inside the dialog. A failed delete is announced once, assertively, as the confirmation dialog changes its text.',
      },
    ],
  },
  theming: {
    targets: [
      {
        className: 'astryx-comments',
        visualProps: ['layout', 'density', 'container'],
      },
      {
        className: 'astryx-comment-thread',
        visualProps: ['container'],
      },
      {
        className: 'astryx-comment-composer',
      },
    ],
  },
  components: [
    {
      name: 'Comments',
      displayName: 'Comments',
      description:
        'Comment threads and activity events in time order, with a composer for new comments and the dialogs threads open.',
      props: [
        {
          name: 'comments',
          type: 'readonly CommentThreadData[]',
          required: true,
          description:
            'The threads: each thread’s first comment, carrying `replies` (one level), `reactions`, transient `typingUsers`, hidden per-comment `seenBy` metadata, `anchor` for inline comments, `isResolved`, `status`, `progress`, and per-comment permissions. `seenBy` remains available to comment render callbacks. Shown in time order with `events`.',
        },
        {
          name: 'events',
          type: 'readonly CommentActivityEvent[]',
          description:
            'Activity on the item, interleaved with the threads by `createdAt` as compact timeline rows.',
        },
        {
          name: 'currentUser',
          type: 'CommentUser',
          description:
            'The viewer: their own comments get Edit and Delete, and their avatar sits beside the reply composer. Authorization stays with your app.',
        },
        {
          name: 'mode',
          type: "'interactive' | 'non-editable' | 'read-only'",
          default: "'interactive'",
          description:
            '`interactive` enables every permitted action; `non-editable` keeps create, reply, and react but removes edit and delete; `read-only` removes every control that changes data.',
        },
        {
          name: 'label',
          type: 'string',
          description:
            'Accessible name of the Comments region. Defaults to the localized "Comments".',
        },
        {
          name: 'composerPosition',
          type: "'top' | 'bottom' | 'none'",
          default: "'bottom'",
          description: 'Where the composer for new comments renders.',
        },
        {
          name: 'density',
          type: "'compact' | 'balanced'",
          default: "'balanced'",
          description: 'Spacing between threads and around the list.',
        },
        {
          name: 'container',
          type: "'section' | 'card'",
          default: "'section'",
          description:
            'The parent surface. `section` renders each thread as an outlined Card; `card` renders divider-bounded Sections whose dividers overlap into single lines.',
        },
        {
          name: 'layout',
          type: "'pane' | 'embedded'",
          default: "'pane'",
          description:
            '`pane` fills its container and scrolls, with the composer docked. `embedded` takes its content’s height inside a host surface: no scroll area or dock, and on a card parent no outer rules.',
        },
        {
          name: 'composerPlaceholder',
          type: 'string',
          description:
            'Placeholder of the new-comment composer. Defaults to the localized "Write a comment…", with replies saying "Reply to <name>…"; a custom value replaces both.',
        },
        {
          name: 'selectedThreadId',
          type: 'string | null',
          description:
            'The open thread, controlled, for hosts that sync threads with a document. A host-selected thread opens its body and replies and scrolls into view without moving focus or opening the reply composer.',
        },
        {
          name: 'onSelectedThreadChange',
          type: '(threadId: string | null) => void',
          description:
            'Called when the viewer opens a thread or closes the open one.',
        },
        {
          name: 'composerAnchor',
          type: 'CommentAnchor',
          description:
            'The passage a new comment will attach to, quoted in the composer. An anchor that arrives while the panel is on screen moves focus to the composer.',
        },
        {
          name: 'onComposerAnchorDismiss',
          type: '() => void',
          description:
            'Adds Remove quoted text to the composer’s quote; clear `composerAnchor` when it is called.',
        },
        {
          name: 'composerControls',
          type: 'ReactNode',
          description:
            'Product-owned controls in the new-comment composer’s footer, after its attach and emoji buttons.',
        },
        {
          name: 'highlightColor',
          type: "'blue' | 'cyan' | 'gray' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow'",
          default: "'yellow'",
          description:
            'The palette color your app highlights passages in. Quotes draw their rule in its `--color-border-<color>` token.',
        },
        {
          name: 'isLoading',
          type: 'boolean',
          default: 'false',
          description:
            'Shows comment-shaped placeholders and reports the region busy.',
        },
        {
          name: 'loadError',
          type: 'string',
          description:
            'Shows an error Banner above the threads, for comments that failed to load.',
        },
        {
          name: 'onRetryLoad',
          type: '() => void | Promise<void>',
          description:
            'Adds Retry to the `loadError` Banner; a Promise keeps Retry busy until it settles.',
        },
        {
          name: 'hasOlderComments',
          type: 'boolean',
          default: 'false',
          description: 'Shows Load earlier comments above the threads.',
        },
        {
          name: 'isLoadingOlder',
          type: 'boolean',
          default: 'false',
          description:
            'Holds Load earlier comments busy while your app fetches the page. A Promise from `onLoadOlder` does the same on its own.',
        },
        {
          name: 'onLoadOlder',
          type: '() => void | Promise<void>',
          description:
            'Loads the previous page: prepend it to `comments`. A rejected Promise shows an error Banner whose Retry takes the button’s place.',
        },
        {
          name: 'isSubmitting',
          type: 'boolean',
          default: 'false',
          description:
            'Host-controlled pending state for the composers. Promise callbacks get a built-in pending state as well.',
        },
        {
          name: 'onComposerDraftChange',
          type: '(value: string, context: CommentComposerContext) => void',
          description:
            'Reports drafts owned inside Comments: new comments, replies, and edits. It includes programmatic seeds and reports an empty value after submit, cancel, or a target switch. Route each update by `context`; debounce and expire typing in your app.',
        },
        {
          name: 'composerError',
          type: 'string',
          description:
            'Host-controlled error above the new-comment composer. A rejected `onSubmit` shows its own error with Retry.',
        },
        {
          name: 'reactionOptions',
          type: 'readonly CommentReactionOption[]',
          default: 'DEFAULT_COMMENT_REACTIONS',
          description:
            'The reactions Add reaction offers: Like, Love, Haha, Wow, Sad, and Celebrate by default, named in the viewer’s language. Give your own options a `description` to name them.',
        },
        {
          name: 'onSubmit',
          type: '(content: string, parentCommentId?: string) => void | Promise<void>',
          description:
            'Posts a comment or a reply. Replies always receive the thread’s first comment as the parent. A rejected Promise restores the draft and shows an error with Retry.',
        },
        {
          name: 'onSaveEdit',
          type: '(commentId: string, content: string) => void | Promise<void>',
          description:
            'Adds Edit to the viewer’s own comments and saves the new Markdown. A rejected Promise shows an error Banner with Retry.',
        },
        {
          name: 'onDelete',
          type: '(commentId: string) => void | Promise<void>',
          description:
            'Adds Delete to the viewer’s own comments, confirmed in a dialog first. A rejected Promise keeps the dialog open with the error.',
        },
        {
          name: 'onRetryComment',
          type: '(commentId: string) => void | Promise<void>',
          description: 'Adds Retry to a comment whose `status` is `error`.',
        },
        {
          name: 'onReact',
          type: '(commentId: string, reactionKey: string, option?: CommentReactionOption) => void | Promise<void>',
          description: 'Toggles the viewer’s reaction by its stable key.',
        },
        {
          name: 'onResolveThread',
          type: '(commentId: string) => void | Promise<void>',
          description:
            'Adds Mark as resolved to open threads. Set `isResolved` when the call succeeds, and filter resolved threads where they should not show.',
        },
        {
          name: 'onReopenThread',
          type: '(commentId: string) => void | Promise<void>',
          description:
            'Adds Reopen to resolved threads. Clear `isResolved` when the call succeeds.',
        },
        {
          name: 'loadVersions',
          type: '(commentId: string) => Promise<readonly CommentVersion[]>',
          description:
            'Loads a comment’s edit history, newest first. `previousVersions` works when the data is already loaded.',
        },
        {
          name: 'onUploadImages',
          type: '(files: readonly File[], context: CommentComposerContext) => CommentUploadedImage[] | Promise<CommentUploadedImage[]>',
          description:
            'Uploads images attached, pasted, or dropped in a composer and appends them as Markdown images. Your endpoint authorizes the viewer and validates the files.',
        },
        {
          name: 'composerTriggers',
          type: 'readonly ChatComposerTrigger[]',
          description:
            'Typeahead triggers for every composer, such as an `@` people search whose tokens your Markdown plugins render.',
        },
        {
          name: 'agentCommands',
          type: 'readonly CommentAgentCommand[]',
          description:
            'Agents a comment can address: typing `/` lists them, and a posted comment shows the command as the agent’s chip. Your app runs the agent.',
        },
        {
          name: 'markdownPlugins',
          type: 'readonly MarkdownPluginEntry[]',
          description:
            'Block Markdown plugins for comment bodies, such as embeds for your own entities.',
        },
        {
          name: 'markdownInlinePlugins',
          type: 'readonly MarkdownInlinePlugin[]',
          description:
            'Inline Markdown plugins for comment bodies, such as the mentions your triggers insert.',
        },
        {
          name: 'getReplyMention',
          type: '(author: CommentUser) => string | undefined',
          description:
            'Seeds a reply to a reply with a mention of its author in your mention format.',
        },
        {
          name: 'hasEmojiPicker',
          type: 'boolean',
          default: 'true',
          description: 'Whether composers offer the emoji picker.',
        },
        {
          name: 'emptyState',
          type: 'ReactNode',
          description: 'Replaces the default no-comments state.',
        },
        {
          name: 'renderAnchor',
          type: '(comment: CommentThreadData, defaultAnchor: ReactNode) => ReactNode',
          description:
            'Replaces a thread’s quoted passage, for example to link it back to the document.',
        },
        {
          name: 'renderBody',
          type: '(comment: CommentData) => ReactNode',
          description: 'Replaces a comment’s Markdown body.',
        },
        {
          name: 'renderVersionBody',
          type: '(version: CommentVersion) => ReactNode',
          description: 'Replaces the body of a version in the edit history.',
        },
        {
          name: 'renderEvent',
          type: '(event: CommentActivityEvent) => ReactNode',
          description: 'Replaces an activity event’s timeline row.',
        },
        {
          name: 'renderAdditionalActions',
          type: '(comment: CommentData) => ReactNode',
          description:
            'Adds product actions to a comment’s header, after the built-in ones.',
        },
        {
          name: 'renderComposer',
          type: '(props: CommentComposerRenderProps) => ReactNode',
          description:
            'Replaces every composer’s input while the panel keeps its draft, pending, error, and context state. Your composer owns its own focus and keyboard handling.',
        },
      ],
    },
    {name: 'CommentThread'},
    {name: 'CommentComposer'},
  ],
  playground: {
    defaults: {
      comments: [
        {
          id: 'preview-root',
          author: {id: 'avery', name: 'Avery Kim'},
          body: 'The final states are ready for review.',
          createdAt: '2026-09-30T19:00:00Z',
          reactions: [
            {
              key: 'like',
              label: '👍',
              count: 2,
              reactedByViewer: true,
            },
          ],
          replies: [
            {
              id: 'preview-reply',
              author: {id: 'maya', name: 'Maya Chen'},
              body: 'Reviewed the empty and error states.',
              createdAt: '2026-09-30T19:10:00Z',
            },
          ],
        },
      ],
      events: [
        {
          id: 'preview-event',
          label: 'Status changed to Ready for review',
          createdAt: '2026-09-30T19:15:00Z',
        },
      ],
      currentUser: {id: 'avery', name: 'Avery Kim'},
      mode: 'read-only',
      density: 'compact',
      container: 'section',
    },
  },
  examples: [
    {
      label: 'Comments panel',
      code: `import {useState} from 'react';
import {VStack} from '@astryxdesign/core/Layout';
import {Comments} from '@astryxdesign/lab';

const viewer = {id: 'avery', name: 'Avery Kim'};

export default function Example() {
  const [comments, setComments] = useState([
    {
      id: 'root',
      author: {id: 'maya', name: 'Maya Chen'},
      body: 'Can you review the rollout plan before Friday?',
      createdAt: '2026-09-30T19:00:00Z',
    },
  ]);
  const post = (body, parentId) => {
    const comment = {
      id: 'comment-' + Date.now(),
      author: viewer,
      body,
      createdAt: new Date().toISOString(),
    };
    setComments(current =>
      parentId == null
        ? [...current, comment]
        : current.map(root =>
            root.id === parentId
              ? {...root, replies: [...(root.replies ?? []), comment]}
              : root,
          ),
    );
  };
  return (
    <VStack width={560} height={420}>
      <Comments
        comments={comments}
        currentUser={viewer}
        density="compact"
        onSubmit={post}
      />
    </VStack>
  );
}`,
    },
    {
      label: 'Inside a card',
      code: `import {Card} from '@astryxdesign/core/Card';
import {Comments} from '@astryxdesign/lab';

<Card padding={0} width={360} height={440}>
  <Comments
    comments={comments}
    currentUser={viewer}
    container="card"
    density="compact"
    onSubmit={post}
  />
</Card>`,
    },
    {
      label: 'Inline comments',
      code: `import {Comments} from '@astryxdesign/lab';

<Comments
  comments={[
    {
      id: 'inline',
      author: {id: 'maya', name: 'Maya Chen'},
      body: 'Should this say three days?',
      createdAt: '2026-09-30T19:00:00Z',
      anchor: {quote: 'The final cohort completes rollout in two days.'},
    },
  ]}
  currentUser={viewer}
  selectedThreadId={selectedThreadId}
  onSelectedThreadChange={setSelectedThreadId}
  composerAnchor={selection}
  onComposerAnchorDismiss={() => setSelection(undefined)}
  onSubmit={post}
/>`,
    },
    {
      label: 'Live collaboration state',
      code: `import {Comments} from '@astryxdesign/lab';

<Comments
  comments={comments.map(thread => ({
    ...thread,
    typingUsers: typingUsersByThread[thread.id] ?? [],
    seenBy: seenByComment[thread.id] ?? [],
    replies: thread.replies?.map(reply => ({
      ...reply,
      seenBy: seenByComment[reply.id] ?? [],
    })),
  }))}
  currentUser={viewer}
  onSubmit={post}
  onComposerDraftChange={(value, context) =>
    publishTyping({context, isTyping: value.trim() !== ''})
  }
/>`,
    },
    {
      label: 'Resolved threads',
      code: `import {Comments} from '@astryxdesign/lab';

<Comments
  comments={showResolved ? comments : comments.filter(c => !c.isResolved)}
  currentUser={viewer}
  onSubmit={post}
  onResolveThread={id => setResolved(id, true)}
  onReopenThread={id => setResolved(id, false)}
/>`,
    },
  ],
};
