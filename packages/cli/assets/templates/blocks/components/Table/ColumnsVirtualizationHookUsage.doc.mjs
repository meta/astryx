// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTableColumnsVirtualization',
  name: 'useTableColumnsVirtualization - Wide Table',
  displayName: 'useTableColumnsVirtualization - Wide Table',
  description:
    'A Table with 121 columns: a pinned Sensor column and 120 monthly readings at fixed widths. Scroll horizontally to mount the columns near the scroll position; the pinned column always renders. initialViewportWidth sizes only the first window. The caller keeps all data and columns; this hook does not virtualize rows.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Table'],
};
