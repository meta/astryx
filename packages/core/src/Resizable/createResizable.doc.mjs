// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'createResizable',
  displayName: 'createResizable',
  group: 'Resizable',
  keywords: [
    'resize',
    'resizable',
    'splitter',
    'separator',
    'split',
    'panel',
    'sidebar',
    'divider',
    'vanilla',
    'factory',
  ],
  params: [
    {
      name: 'handle',
      type: 'HTMLElement | null',
      description:
        'The separator element between the region and its neighbor. It gets `role="separator"`, a tab stop and an accessible name when it has none of its own, its orientation and value, and the drag, keyboard and double-click input. It never sizes the panel. Pass null for a region with no handle yet: it still answers `collapse`, `expand`, `resize` and `subscribe`.',
      required: true,
    },
    {
      name: 'options',
      type: 'CreateResizableOptions',
      description:
        'Configuration object: the same options `useResizable(handleRef, options)` takes.',
      required: false,
    },
    {
      name: 'options.defaultSize',
      type: 'SizeValue | ResizableSize',
      description:
        'Initial size. Numbers, exact "Npx", and pixel(value) are pixels. Exact "N%" is a share of the basis; percent(value, {min: pixel(value)}) or percent(value, {max: pixel(value)}) adds one pixel floor or ceiling. A percentage resolves once into pixels, against `containerRef` when given, the viewport otherwise.',
      default: '250',
    },
    {
      name: 'options.minSize',
      type: 'ResizableSize',
      description:
        'Minimum size, in the same forms. A percentage minimum re-resolves when its basis changes and clamps the size.',
      default: '50',
    },
    {
      name: 'options.maxSize',
      type: 'ResizableSize',
      description:
        'Maximum size, in the same forms. A percentage maximum re-resolves when its basis changes and clamps the size. Unbounded when omitted.',
    },
    {
      name: 'options.snaps',
      type: 'number[]',
      description:
        'Pixel values the region rests on. A drag, a key and `resize` all land on one of them; an arrow key moves to the next one.',
    },
    {
      name: 'options.collapsible',
      type: 'boolean',
      description:
        'Whether the region can collapse to 0: a drag below `collapsedSize`, Enter, or a double-click collapses it, and the same again restores the size it had.',
      default: 'false',
    },
    {
      name: 'options.collapsedSize',
      type: 'number',
      description: 'Size in px under which a drag collapses the region.',
      default: '40',
    },
    {
      name: 'options.containerRef',
      type: '{current: HTMLElement | null}',
      description:
        'The element a percentage is a share of; a plain `{current: element}` object serves. Omitted, percentages use the viewport. Until the element is laid out, percentages use a temporary 1200px basis, and nothing is saved from it.',
    },
    {
      name: 'options.direction',
      type: "'horizontal' | 'vertical'",
      description:
        "The axis the region resizes along. A horizontal region follows the pointer under right-to-left. Selects the container's inline or block size as the percentage basis.",
      default: "'horizontal'",
    },
    {
      name: 'options.autoSaveId',
      type: 'string',
      description:
        'Key under which the size and collapse state are saved in localStorage and restored. The size is saved once when a drag or a key press ends, not on every move.',
    },
    {
      name: 'options.defaultIsCollapsed',
      type: 'boolean',
      description: 'Initial collapse state. A saved entry wins over it.',
      default: 'false',
    },
    {
      name: 'options.isCollapsed',
      type: 'boolean',
      description:
        'Controlled collapse state. A request to collapse or expand then reports through `onCollapseChange` and changes nothing until you pass the new value through `update`.',
    },
    {
      name: 'options.onSizeChange',
      type: '(size: number) => void',
      description:
        'Called when a drag, a key, `resize`, `collapse` or `expand` changes the size.',
    },
    {
      name: 'options.onCollapseChange',
      type: '(isCollapsed: boolean) => void',
      description: 'Called once per collapse or expand.',
    },
    {
      name: 'options.isReversed',
      type: 'boolean',
      description:
        'The handle sits after the region it resizes (the region is at the end), so a drag toward the start grows it. On a ResizeHandle, its own `isReversed` prop does the same: either one reverses the handle.',
      default: 'false',
    },
    {
      name: 'options.isDisabled',
      type: 'boolean',
      description:
        'Ignores the drag and the keys and sets `aria-disabled`. A plain element keeps its tab stop, so it stays discoverable. On a ResizeHandle, its own `isDisabled` prop does the same: either one disables the handle.',
      default: 'false',
    },
    {
      name: 'options.label',
      type: 'string',
      description:
        'A plain element’s accessible name, used when it has no `aria-label` or `aria-labelledby` of its own. Without it, `useResizable` names the handle with the message catalog’s translation, and the bare factory with the catalog’s English message. A ResizeHandle takes its own `label` prop.',
      default: "'Resize handle'",
    },
  ],
  returns: [
    {
      name: 'size',
      type: 'number',
      description: 'The region’s size in px, 0 while collapsed.',
    },
    {
      name: 'isCollapsed',
      type: 'boolean',
      description: 'Whether the region is collapsed.',
    },
    {
      name: 'collapse',
      type: '() => void',
      description: 'Collapses the region, when it is collapsible.',
    },
    {
      name: 'expand',
      type: '() => void',
      description: 'Expands the region to the size it had before it collapsed.',
    },
    {
      name: 'resize',
      type: '(size: number) => void',
      description: 'Resizes the region to a pixel value, within its bounds.',
    },
    {
      name: 'update',
      type: '(options: CreateResizableOptions) => void',
      description:
        'Takes new options. The handle and the size stay where they are.',
    },
    {
      name: 'subscribe',
      type: '(listener: () => void) => () => void',
      description:
        'Calls `listener` after every change to `size` or `isCollapsed`, including a correction when the container is first measured. Returns the function that stops it.',
    },
    {
      name: 'destroy',
      type: '() => void',
      description:
        'Removes every listener, observer and attribute the factory added. A drag in progress ends: its size is saved, and the pointer and the cursor are released.',
    },
  ],
  usage: {
    description:
      'Makes a plain element a window splitter that resizes a region, without React: the pointer drag, the arrow keys, Home, End, Enter and a double-click, with bounds, snap points, collapse and saved sizes. It reports the size; you size the panel. Use the `useResizable(handleRef, options)` hook and `ResizeHandle` in React.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Size the panel from `size` once, then in a `subscribe` listener, so a drag, a key, a call and a container that is measured late all reach it.',
      },
      {
        guidance: true,
        description:
          'Pass `label` when a page has more than one handle ("Resize sidebar", "Resize terminal"), and a translated one outside English. The collapsed state is announced with the message catalog’s text.',
      },
      {
        guidance: true,
        description:
          'Call `destroy` when the handle leaves the page, so no listener outlives it.',
      },
      {
        guidance: true,
        description:
          'In React, render the pane as a LayoutPanel beside its ResizeHandle at `size`: it slides closed and open from the edge facing the handle, focus inside it moves to the handle as it collapses, and it is inert while collapsed. A pane you size yourself does not slide.',
      },
      {
        guidance: false,
        description:
          'Size the panel in `onSizeChange` alone: it reports interactions, not a percentage resolved against a container measured late.',
      },
    ],
    accessibility: [
      {
        name: 'Window splitter',
        category: 'Keyboard',
        criterion: '2.1.1 Keyboard',
        description:
          'The handle is a focusable separator with its value, minimum and maximum. The arrow keys move it 10px (50px with Shift), or to the next snap point; Home and End go to the minimum and maximum; Enter collapses and restores a collapsible region.',
      },
      {
        name: 'Dragging alternative',
        category: 'Keyboard',
        criterion: '2.5.7 Dragging Movements',
        description:
          'Everything the drag does, the keys do too, so the region resizes without dragging.',
      },
    ],
  },
  relatedComponents: ['Resizable'],
  relatedHooks: ['useResizable'],
  importPath: '@astryxdesign/core/Resizable',
  // No category: a factory documented as a hook is listed with the Resizable
  // docs, beside useResizable, and is not a tile in the components gallery,
  // which lists the documents that have one.
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Window splitter on a plain element, without React: drag, arrows/Home/End/Enter, double-click collapse, bounds, snaps, collapse, saved sizes. Reports size; you size the panel. Returns {size, isCollapsed, collapse, expand, resize, update, subscribe, destroy}.',
  paramDescriptions: {
    handle:
      'separator element; gets role, tab stop, name, value and input. Never sizes the panel.',
    options: 'config object; the same useResizable(handleRef, options) takes.',
    'options.defaultSize':
      'initial px, exact N%, or percent(value, {min|max: pixel(value)}); resolves once.',
    'options.minSize': 'live minimum, same forms.',
    'options.maxSize': 'live maximum, same forms; unbounded when omitted.',
    'options.snaps': 'px values the region rests on.',
    'options.collapsible':
      'collapse to 0 below collapsedSize, on Enter or double-click.',
    'options.collapsedSize': 'drag threshold in px for collapse.',
    'options.containerRef':
      '{current} element a percentage is a share of; viewport when omitted.',
    'options.direction': "'horizontal' | 'vertical'.",
    'options.autoSaveId': 'localStorage key; saved once per drag or key press.',
    'options.defaultIsCollapsed': 'initial collapse state; saved entry wins.',
    'options.isCollapsed':
      'controlled collapse; requests report via onCollapseChange, pass the value back through update.',
    'options.onSizeChange': 'size change from an interaction or a call.',
    'options.onCollapseChange': 'once per collapse or expand.',
    'options.isReversed':
      'region at the end; a drag toward the start grows it.',
    'options.isDisabled':
      'ignores input, aria-disabled; a plain element keeps its tab stop.',
    'options.label':
      "plain element's accessible name when it has none; ResizeHandle takes its own label.",
  },
  returnDescriptions: {
    size: 'px, 0 while collapsed.',
    isCollapsed: 'whether collapsed.',
    collapse: 'collapse, when collapsible.',
    expand: 'expand to the size before collapse.',
    resize: 'resize to px within bounds.',
    update: 'take new options; size stays.',
    subscribe:
      'listener after every size or collapse change; returns unsubscribe.',
    destroy:
      'remove every listener, observer and attribute; a drag in progress ends and is saved.',
  },
  usage: {
    description:
      'Window splitter without React; reports size, you size the panel. In React, useResizable(handleRef, options) with ResizeHandle.',
    bestPractices: [
      {
        guidance: true,
        description: 'Size the panel from size, then in subscribe.',
      },
      {
        guidance: true,
        description: 'Pass label per handle, translated outside English.',
      },
      {
        guidance: true,
        description: 'Call destroy when the handle leaves the page.',
      },
      {
        guidance: true,
        description:
          'React: a LayoutPanel at size beside its ResizeHandle slides on collapse/open; focus moves to the handle; inert while collapsed.',
      },
      {
        guidance: false,
        description: 'Size the panel in onSizeChange alone.',
      },
    ],
  },
};
