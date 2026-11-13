// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Comparison Table',
  displayName: 'Comparison Table',
  description:
    'Transposed matrix that puts candidates in the columns and criteria in grouped rows, with a pinned label column that survives horizontal scroll, columns you can swap or add, and best-in-row marks you can toggle. Compare, comparison, matrix, spec sheet, feature grid, pricing table, benchmark, frozen column, sticky column, or side-by-side.',
  isReady: true,
  category: 'Table - Comparison',
  icons: {
    AudioLines: 'audio',
    Box: 'package',
    CircleCheck: 'success',
    CircleX: 'error',
    Cpu: 'cpu',
    FileText: 'document',
    Image: 'image',
    Plus: 'add',
    Sparkles: 'sparkles',
    Type: 'text',
    Video: 'video',
    Zap: 'bolt',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Layout header with the Compare models title, the Highlight best switch, and the Add model button.',
    },
    {
      name: 'matrix',
      kind: 'table',
      description:
        'Card in the layout content holding the comparison table: model selector columns, grouped criteria rows, pinned label column.',
    },
  ],
};
