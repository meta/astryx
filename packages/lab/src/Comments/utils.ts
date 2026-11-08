// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file utils.ts
 * @input Comment data types
 * @output Exports the Comments family's pure helpers: element ids, Markdown
 *   serialization of images, draft appends, timeline ordering, and focus
 *   bookkeeping
 * @position Internal helpers shared by Comments, CommentThread, and
 *   CommentComposer; not exported from the package
 */

import type {
  CommentData,
  CommentThreadData,
  CommentUploadedImage,
} from './types';

/** A thread's first comment or one of its replies. */
export type AnyComment = CommentData | CommentThreadData;

/** The element id a comment's permalink points at. */
export function commentAnchorId(commentId: string): string {
  return `comment-${encodeURIComponent(commentId)}`;
}

/** The element id of a thread's reply composer. */
export function replyComposerId(parentId: string): string {
  return `${commentAnchorId(parentId)}-reply-composer`;
}

/** The element id of an activity event row. */
export function eventAnchorId(eventId: string): string {
  return `comments-event-${encodeURIComponent(eventId)}`;
}

/** Whether focus is inside `region`, or already lost to <body>. */
export function shouldRestoreFocusFrom(region: Element | null): boolean {
  const active = document.activeElement;
  return (
    active == null ||
    active === document.body ||
    (region != null && region.contains(active))
  );
}

/** Alt text that cannot break out of Markdown's image brackets; `fallback`
 *  (already localized) stands in for an image with none. */
export function safeImageAlt(alt: string, fallback: string): string {
  return alt.replace(/[[\]\r\n]+/g, ' ').trim() || fallback;
}

/** A URL that cannot break out of Markdown's image parentheses. */
export function safeMarkdownImageUrl(url: string): string {
  return url
    .trim()
    .replace(/[\s()]/g, character =>
      character === '('
        ? '%28'
        : character === ')'
          ? '%29'
          : encodeURIComponent(character),
    );
}

/** Uploaded images as Markdown, one paragraph each. `fallbackAlt` (already
 *  localized) names an image uploaded without alt text. */
export function imagesToMarkdown(
  images: readonly CommentUploadedImage[],
  fallbackAlt: string,
): string {
  return images
    .map(
      image =>
        `![${safeImageAlt(image.alt, fallbackAlt)}](${safeMarkdownImageUrl(image.url)})`,
    )
    .join('\n\n');
}

/** Appends a block (an image, say) to a draft as its own paragraph. */
export function appendDraftBlock(value: string, block: string): string {
  const draft = value.trimEnd();
  return draft === '' ? block : `${draft}\n\n${block}`;
}

/** Appends inline content (an emoji, say) to a draft, spaced from its text. */
export function appendDraftInline(value: string, content: string): string {
  if (value === '' || /\s$/.test(value) || /^\s/.test(content)) {
    return `${value}${content}`;
  }
  return `${value} ${content}`;
}

/** A createdAt value as epoch milliseconds; seconds are scaled up. */
export function timelineTime(value: string | number): number {
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1_000 : value;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * A pointer press opens a thread into its reply composer; a key press keeps
 * focus where it is, so the same key can close the thread again.
 */
export type ActivationSource = 'pointer' | 'keyboard';

/** Keyboard and assistive-technology clicks carry no click count. */
export function activationSourceOf(event?: {
  detail?: number;
}): ActivationSource {
  return (event?.detail ?? 1) > 0 ? 'pointer' : 'keyboard';
}
