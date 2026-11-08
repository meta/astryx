// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file types.ts
 * @input Uses React types, ChatComposerTrigger, and Markdown plugin types
 * @output Exports the data, callback, and prop types shared by Comments,
 *   CommentThread, and CommentComposer, and DEFAULT_COMMENT_REACTIONS
 * @position Type contract for the lab Comments family
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/Comments/index.ts (exports)
 * - /packages/lab/src/Comments/Comments.doc.mjs
 * - /packages/lab/src/Comments/CommentThread.doc.mjs
 */

import type {ReactNode} from 'react';
import type {
  ChatComposerTrigger,
  ChatMessageStatus,
} from '@astryxdesign/core/Chat';
import type {MarkdownInlinePlugin} from '@astryxdesign/core/Markdown';
import type {MarkdownPluginEntry} from '@astryxdesign/core/Markdown/plugins';

/**
 * `interactive` enables every permitted action; `non-editable` keeps create,
 * reply and react but removes edit and delete; `read-only` removes every
 * control that changes data.
 */
export type CommentMode = 'interactive' | 'non-editable' | 'read-only';

/** Whether a comment the viewer posted has reached the host. */
/**
 * Where a comment is in being posted, in Chat's message-status vocabulary:
 * `sending` while the post is in flight, `sent` once it has posted, and
 * `error` when it couldn't be posted.
 */
export type CommentStatus = Extract<
  ChatMessageStatus,
  'sending' | 'sent' | 'error'
>;

/** A person or agent who writes comments, reacts, or acts on the item. */
export interface CommentUser {
  /** Stable host-owned id, used for equality ("is this my comment?"). */
  id: string;
  /** Full display name. Never a viewer-relative label such as "You". */
  name: string;
  /**
   * An agent shows its logo (`avatarUrl`), or square-cornered initials
   * without one, and an Agent badge beside its name.
   * @default 'person'
   */
  kind?: 'person' | 'agent';
  /** Where the author's name links, such as their profile. */
  href?: string;
  /** Profile picture, or an agent's square logo. Initials without one. */
  avatarUrl?: string;
}

/** A selectable reaction. */
export interface CommentReactionOption {
  /** Stable key the host stores, such as `like`. */
  key: string;
  /** Emoji or compact glyph shown in the picker and on the reaction. */
  label: string;
  /**
   * Human-readable name, such as "Like", for the reaction's accessible label
   * and tooltip. Optional for the keys in DEFAULT_COMMENT_REACTIONS, which
   * take their localized names.
   */
  description?: string;
}

/** A reaction summary on a comment. */
export interface CommentReaction extends CommentReactionOption {
  count: number;
  /** Whether the viewer is one of the people who reacted. */
  reactedByViewer?: boolean;
  /** Who reacted, named in the reaction's tooltip. */
  actors?: readonly Pick<CommentUser, 'id' | 'name'>[];
}

/**
 * The passage an inline comment discusses. The host owns anchoring (the text
 * selection, offsets, and re-resolving them after edits); the thread shows
 * the quote and its state.
 */
export interface CommentAnchor {
  /** The selected text, quoted above the comment. */
  quote: string;
  /**
   * `orphaned` when edits removed the passage: the thread stays, and its
   * quote shows with an Outdated badge.
   * @default 'anchored'
   */
  status?: 'anchored' | 'orphaned';
}

/**
 * A color of the Astryx palette, as a host highlights inline comments'
 * passages in it. Quotes draw their rule in its `--color-border-<color>`
 * token so a quote and its passage read as one.
 */
export type CommentHighlightColor =
  | 'blue'
  | 'cyan'
  | 'gray'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'teal'
  | 'yellow';

/** An image the host's upload flow stored. */
export interface CommentUploadedImage {
  /** URL of the stored image. */
  url: string;
  /** Description used as the image's alt text. */
  alt: string;
}

/** One version of a comment in its edit history. */
export interface CommentVersion {
  id: string;
  body: string;
  editedAt: string | number;
  author?: CommentUser;
  isCurrent?: boolean;
}

/**
 * What a comment's author, typically an agent, is doing while it still writes
 * the comment, and where to watch the work.
 */
export interface CommentProgress {
  /** What the author is doing, as a reader would say it: "Reading the file…". */
  label: string;
  /** Where to watch the work, such as the agent's session. */
  link?: {label: string; href: string};
}

/** A comment: a thread's first comment or one of its replies. */
export interface CommentData {
  id: string;
  author: CommentUser;
  /** Markdown. */
  body: string;
  createdAt: string | number;
  updatedAt?: string | number;
  /** Shows Edited beside the time; opens the edit history when there is one. */
  isEdited?: boolean;
  /** Host-owned unread state. Shows a New badge that fades after five seconds. */
  isUnread?: boolean;
  /** Earlier versions, newest first, when the host already has them. */
  previousVersions?: readonly CommentVersion[];
  /**
   * Host-controlled metadata for people who have seen this comment. Comments
   * does not render it by default; render callbacks receive it with the comment.
   * To associate each person once, attach them only to their newest seen comment.
   */
  seenBy?: readonly CommentUser[];
  reactions?: readonly CommentReaction[];
  /** @default 'sent' */
  status?: CommentStatus;
  /** Shown when `status` is `error`. */
  errorMessage?: string;
  /**
   * Marks a comment its author is still writing. The label shows in place of
   * the body, shimmering while motion is allowed, and is announced as a
   * polite status. The comment takes no reactions, replies, edits or
   * deletions, and has no link to copy, until it is written.
   */
  progress?: CommentProgress;
  /** Per-comment permission; the host stays authoritative. @default true */
  canReply?: boolean;
  /** @default true */
  canReact?: boolean;
  /** @default the viewer wrote it */
  canEdit?: boolean;
  /** @default the viewer wrote it */
  canDelete?: boolean;
}

/** A thread: its first comment, which carries the thread's replies. */
export interface CommentThreadData extends CommentData {
  /**
   * Other people currently composing in this thread. Controlled, transient
   * state: update it from your collaboration layer and expire stale entries
   * there. While this thread is open, the current viewer is not shown.
   */
  typingUsers?: readonly CommentUser[];
  /** One level of replies, oldest first. */
  replies?: readonly CommentData[];
  /** Makes this an inline comment: the passage its thread discusses. */
  anchor?: CommentAnchor;
  /** A resolved thread: Resolved beside the time, muted text, and Reopen. */
  isResolved?: boolean;
  /** Who resolved the thread, named in the Resolved label's tooltip. */
  resolvedBy?: CommentUser;
  /**
   * Calls the thread out without selecting it, such as the comment a playing
   * video has reached: it takes the selected thread's muted fill, and nothing
   * expands, scrolls, or takes focus.
   */
  isHighlighted?: boolean;
  /**
   * Whether the viewer may resolve or reopen this thread when the host
   * handles it. Its Resolved label shows either way.
   * @default true
   */
  canResolve?: boolean;
}

/** A timeline row for a status change or other activity on the item. */
export interface CommentActivityEvent {
  id: string;
  /** What happened, as a sentence: "Status changed to Ready for review". */
  label: string;
  description?: string;
  createdAt: string | number;
  actor?: CommentUser;
  /** Where the event's time links. */
  href?: string;
}

/** Which composer a callback came from. */
export type CommentComposerContext =
  | {
      kind: 'comment';
      /** The passage a new inline comment will attach to, when there is one. */
      anchor?: CommentAnchor;
    }
  | {kind: 'edit'; commentId: string}
  | {kind: 'reply'; parentCommentId: string; repliedToCommentId: string};

/** What a `renderComposer` replacement receives. */
export interface CommentComposerRenderProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder: string;
  isSubmitting: boolean;
  error?: string;
  contextLabel?: string;
  context: CommentComposerContext;
  onCancel?: () => void;
}

/**
 * An agent a comment can address with a slash command: typing `/` in a
 * composer offers it, and a posted comment shows the command as its chip.
 */
export interface CommentAgentCommand {
  /** The command after the slash: `ask` for `/ask`. Letters, digits, `-` and `_`. */
  command: string;
  /** The agent's name, on its chip. */
  name: string;
  /** What asking it does, in the `/` menu. */
  description: string;
  /** Square agent logo; initials without one. */
  logoUrl?: string;
}

/** Uploads images for a composer and returns where they were stored. */
export type CommentImageUploader = (
  files: readonly File[],
  context: CommentComposerContext,
) => readonly CommentUploadedImage[] | Promise<readonly CommentUploadedImage[]>;

type MaybePromise = void | Promise<void>;

/**
 * Behavior and rendering shared by Comments and a standalone CommentThread.
 * Inside a Comments panel, its threads take these from the Comments.
 */
export interface CommentThreadSharedProps {
  /**
   * The viewer: their own comments get Edit and Delete, and their avatar sits
   * beside the reply composer. Authorization stays with the host.
   */
  currentUser?: CommentUser;
  /** @default 'interactive' */
  mode?: CommentMode;
  /**
   * The parent surface. `section` renders each thread as an outlined Card;
   * `card` renders divider-bounded Sections so cards never nest.
   * @default 'section'
   */
  container?: 'section' | 'card';
  /**
   * Placeholder of the new-comment composer. Defaults to the localized
   * "Write a comment…", with replies saying "Reply to <name>…"; a custom value
   * replaces both.
   */
  composerPlaceholder?: string;
  /**
   * The palette color the host highlights passages in.
   * @default 'yellow'
   */
  highlightColor?: CommentHighlightColor;
  /** @default DEFAULT_COMMENT_REACTIONS */
  reactionOptions?: readonly CommentReactionOption[];
  /** Agents a comment can address with a slash command. */
  agentCommands?: readonly CommentAgentCommand[];
  /** Typeahead triggers for every composer, such as an `@` people search. */
  composerTriggers?: readonly ChatComposerTrigger[];
  /** Markdown plugins for comment bodies, such as links for your own entities. */
  markdownPlugins?: readonly MarkdownPluginEntry[];
  /** Text-match renderers for comment bodies, such as the mentions your triggers insert. */
  markdownInlinePlugins?: readonly MarkdownInlinePlugin[];
  /**
   * Seeds a reply to a reply with a mention of its author, in whatever form
   * your mentions take. Return nothing to start the reply empty.
   */
  getReplyMention?: (author: CommentUser) => string | undefined;
  /**
   * Whether composers offer the emoji picker.
   * @default true
   */
  hasEmojiPicker?: boolean;
  /** Host-controlled pending state for a post or reply. */
  isSubmitting?: boolean;
  /**
   * Reports every draft owned by Comments or CommentThread: new comments,
   * replies, and edits. Programmatic seeds report their initial value; submit,
   * cancel, and target changes report an empty value for the closing context.
   * Use the context to route the update. A standalone CommentComposer already
   * exposes its controlled `value` and `onChange`.
   */
  onComposerDraftChange?: (
    value: string,
    context: CommentComposerContext,
  ) => void;
  /**
   * Posts a comment or a reply. Replies always receive their thread's first
   * comment as the parent, even when the viewer replied to a reply. A
   * rejected Promise restores the draft and shows an error with Retry.
   */
  onSubmit?: (content: string, parentCommentId?: string) => MaybePromise;
  onSaveEdit?: (commentId: string, content: string) => MaybePromise;
  /** Runs after the viewer confirms the deletion. */
  onDelete?: (commentId: string) => MaybePromise;
  /** Toggles the viewer's reaction. */
  onReact?: (
    commentId: string,
    reactionKey: string,
    option?: CommentReactionOption,
  ) => MaybePromise;
  /** Retries a comment whose `status` is `error`. */
  onRetryComment?: (commentId: string) => MaybePromise;
  /** Adds Mark as resolved to open threads. Update `isResolved` when it succeeds. */
  onResolveThread?: (commentId: string) => MaybePromise;
  /** Adds Reopen to resolved threads. */
  onReopenThread?: (commentId: string) => MaybePromise;
  /** Loads a comment's full edit history, newest first, current version included. */
  loadVersions?: (commentId: string) => Promise<readonly CommentVersion[]>;
  /**
   * Uploads images attached, pasted, or dropped in a composer and appends
   * them to the draft as Markdown images. Your upload endpoint must
   * authorize the viewer and validate the files.
   */
  onUploadImages?: CommentImageUploader;
  /** Replaces a thread's quoted anchor; return `defaultAnchor` to keep it. */
  renderAnchor?: (
    comment: CommentThreadData,
    defaultAnchor: ReactNode,
  ) => ReactNode;
  /** Replaces the Markdown body for product-owned content. */
  renderBody?: (comment: CommentData) => ReactNode;
  /** Replaces the Markdown body of an edit-history version. */
  renderVersionBody?: (version: CommentVersion) => ReactNode;
  /** Adds product-owned controls to a comment's header actions. */
  renderAdditionalActions?: (comment: CommentData) => ReactNode;
  /** Replaces the default composer while keeping its state and context. */
  renderComposer?: (props: CommentComposerRenderProps) => ReactNode;
}

/**
 * The reactions a thread offers when the host passes none: Like, Love, Haha,
 * Wow, Sad, and Celebrate, named in the viewer's language.
 */
export const DEFAULT_COMMENT_REACTIONS: readonly CommentReactionOption[] =
  Object.freeze([
    {key: 'like', label: '👍'},
    {key: 'love', label: '❤️'},
    {key: 'laugh', label: '😂'},
    {key: 'wow', label: '😮'},
    {key: 'sad', label: '😢'},
    {key: 'celebrate', label: '🎉'},
  ]);
