// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The padding the theme decorator puts around a story.
 *
 * Every story gets a 16 px gutter (the global layout is `fullscreen`, so
 * Storybook adds none of its own), except stories that set the `pageFrame`
 * parameter: they render a page frame that sizes itself to the viewport,
 * such as AppShell's `100dvh` shell, which a gutter would push past the
 * viewport, making the document scroll.
 */
export function storyPadding(parameters?: {pageFrame?: boolean}): number {
  return parameters?.pageFrame === true ? 0 : 16;
}
