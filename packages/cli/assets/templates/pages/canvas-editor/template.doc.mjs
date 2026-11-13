// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Canvas Editor',
  displayName: 'Canvas Editor',
  description:
    'Layered artboard workspace: document tabs over a layer rail, a fixed-size frame you zoom on a muted backdrop, and an inspector of position, type, and filter fields that retargets to the selected layer. Objects hold a coordinate rather than reflowing, so moving one never moves another.',
  keywords: [
    'design tool',
    'artboard',
    'poster',
    'graphic',
    'image',
    'slide editor',
  ],
  isReady: true,
  category: 'Tools - Canvas Editor',
  icons: {
    Aperture: 'photoEffect',
    ArrowDownToLine: 'alignBottom',
    ArrowUpToLine: 'alignTop',
    Baseline: 'textRegular',
    CaseLower: 'lowercase',
    CaseSensitive: 'textCase',
    CaseUpper: 'uppercase',
    Contrast: 'contrast',
    Download: 'download',
    File: 'file',
    FlipHorizontal2: 'flipHorizontal',
    FlipVertical2: 'flipVertical',
    FoldVertical: 'alignMiddle',
    Frame: 'frame',
    Grip: 'drag',
    Group: 'group',
    Image: 'image',
    Italic: 'italic',
    Lock: 'lock',
    LockOpen: 'unlock',
    Menu: 'menu',
    Minus: 'remove',
    PanelBottom: 'panelBottom',
    PanelLeft: 'panelLeft',
    PanelLeftRightDashed: 'paddingHorizontal',
    PanelRight: 'panelRight',
    PanelTopBottomDashed: 'paddingVertical',
    Plus: 'add',
    Redo2: 'redo',
    RotateCcw: 'rotateCounterclockwise',
    RotateCw: 'rotate',
    Scan: 'cornerRadius',
    SquareRoundCorner: 'radiusPerCorner',
    SquareSquare: 'paddingPerSide',
    Strikethrough: 'strikethrough',
    TextAlignCenter: 'alignCenter',
    TextAlignEnd: 'alignEnd',
    TextAlignJustify: 'alignJustify',
    TextAlignStart: 'alignStart',
    TriangleRight: 'angle',
    Type: 'text',
    Underline: 'underline',
    Undo2: 'undo',
    X: 'close',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top bar holding the main menu, document tabs, save note and Export button.',
    },
    {
      name: 'layers',
      kind: 'panel',
      description:
        'Left rail listing the document\'s layers and groups as a tree to select and reorder.',
    },
    {
      name: 'canvas',
      kind: 'content',
      description:
        'Center workspace showing the fixed-size artboard frame, zoomed, on a muted backdrop.',
    },
    {
      name: 'toolbar',
      kind: 'toolbar',
      description:
        'Canvas tool bar under the artboard with undo, redo, zoom and panel toggles.',
    },
    {
      name: 'inspector',
      kind: 'panel',
      description:
        'Right panel of position, style, text, image and filter fields for the selected layer.',
    },
  ],
};
