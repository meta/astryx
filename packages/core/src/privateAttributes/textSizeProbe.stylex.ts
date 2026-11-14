// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/textSizeProbe.stylex.ts
 * @input The hidden element that measures the reader's text size
 * @output markTextSizeProbe, which marks that element, and isTextSizeProbe,
 *   which reads the mark
 * @position Owner module of the private text-size-probe attribute: the only
 *   file that writes its name. theme/dynamicType.ts marks the one probe the
 *   root Theme runtime keeps on `<body>`. No package entry exports it.
 */

const TEXT_SIZE_PROBE = 'data-astryx-text-size-probe';

/** Marks the hidden element that measures the reader's text size. */
export function markTextSizeProbe(element: Element): void {
  element.setAttribute(TEXT_SIZE_PROBE, '');
}

/** Whether `target` is that hidden element. */
export function isTextSizeProbe(target: EventTarget | null): boolean {
  return target instanceof Element && target.hasAttribute(TEXT_SIZE_PROBE);
}
