// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Drop HTML comments from Markdown before rendering: GitHub and npm hide
 *   them, and core's Markdown would print them as text.
 */

/** @param text Markdown source. */
export function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->[ \t]*\n?/g, '');
}
