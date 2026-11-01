// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Handle',
    required: true,
    description:
      'Focusable separator that owns pointer and keyboard resize interaction.',
  },
  {
    name: 'Grip pill',
    required: false,
    description:
      'Default visible grip indicator; custom handle content can replace it.',
  },
  {
    name: 'Grab zone',
    required: true,
    description:
      'Invisible enlarged pointer region aligned with the grip or divider.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'Resizable',
  displayName: 'Resizable',
  group: 'Resizable',
  category: 'Layout',
  keywords: [
    'resize',
    'resizable',
    'split',
    'splitter',
    'panel',
    'drag',
    'separator',
    'divider',
    'handle',
    'grip',
  ],
  usage: {
    anatomy,
    description:
      'Hook-based resizable panel system. useResizable(handleRef, options) ' +
      'manages a region and ResizeHandle, given the same ref, is its ' +
      'interactive pill-grip separator. Render the panel at the size the hook ' +
      'reports, such as LayoutPanel width={region.size}. createResizable is ' +
      'the same region without React.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use percent(value, {min: pixel(value)}) or percent(value, {max: pixel(value)}) when a percentage needs exactly one pixel floor or ceiling. Reuse Table’s pixel() helper; numbers, exact Npx, and pixel(value) remain pixels. State, persistence, callbacks, paint, and ARIA remain resolved pixels.',
      },
      {
        guidance: true,
        description:
          'Use useResizable(handleRef, options) with existing Astryx layout ' +
          'components: give the ref to ResizeHandle and the size to the panel ' +
          '(LayoutPanel width={region.size}). SideNav takes its own resizable prop.',
      },
      {
        guidance: true,
        description:
          'Provide an accessible label on each ResizeHandle when multiple ' +
          'handles exist (e.g. "Resize sidebar", "Resize terminal").',
      },
      {
        guidance: false,
        description:
          'Wrap panels in extra container components for resize. The hook-first ' +
          'architecture avoids extra DOM; use it directly on existing components.',
      },
    ],
  },
  theming: {
    targets: [
      {className: 'astryx-resize-handle', visualProps: ['direction']},
      {className: 'astryx-resize-handle-pill'},
    ],
  },
  components: [
    {
      name: 'useResizable',
      displayName: 'useResizable',
      description:
        'Hook that manages the resize state of a panel region through its ' +
        "handle's ref: useResizable(handleRef, options). Returns size, " +
        'isCollapsed and collapse/expand/resize methods.',
      examples: [
        {
          label: 'Structured fixed pixels',
          code: `const region = useResizable(handleRef, {
  defaultSize: pixel(333),
  containerRef,
});`,
        },
        {
          label: 'One-time structured default',
          code: `import {useRef} from 'react';
import {ResizeHandle, useResizable} from '@astryxdesign/core/Resizable';
import {percent, pixel} from '@astryxdesign/core/Resizable/utils';

const containerRef = useRef<HTMLDivElement>(null);
const handleRef = useRef<HTMLDivElement>(null);

const region = useResizable(handleRef, {
  defaultSize: percent(40, {min: pixel(333)}),
  containerRef,
});

<ResizeHandle ref={handleRef} direction="horizontal" />;`,
        },
        {
          label: 'Live percentage floor',
          code: `const region = useResizable(handleRef, {
  defaultSize: 0,
  minSize: percent(40, {min: pixel(333)}),
  containerRef,
});`,
        },
        {
          label: 'Live percentage ceiling',
          code: `const region = useResizable(handleRef, {
  defaultSize: 500,
  maxSize: percent(10, {max: pixel(400)}),
  containerRef,
});`,
        },
      ],
      props: [
        {
          name: 'defaultSize',
          type: 'SizeValue | ResizableSize',
          description:
            'Initial size. Numbers, exact Npx, and pixel(value) are pixels; exact N% has no additional pixel bound; percent(value, {min: pixel(value)}) or percent(value, {max: pixel(value)}) adds exactly one and resolves once.',
          default: '250',
        },
        {
          name: 'minSize',
          type: 'ResizableSize',
          description:
            'Live minimum. Numbers, exact Npx, and pixel(value) remain pixels; exact N% has no additional pixel bound; percent(value, {min: pixel(value)}) or percent(value, {max: pixel(value)}) adds exactly one.',
          default: '50',
        },
        {
          name: 'maxSize',
          type: 'ResizableSize',
          description:
            'Live maximum. Numbers, exact Npx, and pixel(value) remain pixels; exact N% has no additional pixel bound; percent(value, {min: pixel(value)}) or percent(value, {max: pixel(value)}) adds exactly one.',
          default: 'Infinity',
        },
        {
          name: 'collapsible',
          type: 'boolean',
          description: 'Whether the region can collapse to size 0.',
          default: 'false',
        },
        {
          name: 'collapsedSize',
          type: 'number',
          description: 'Pixel threshold that triggers collapse during drag.',
          default: '40',
        },
        {
          name: 'snaps',
          type: 'number[]',
          description: 'Pixel values to snap to during resize.',
        },
        {
          name: 'autoSaveId',
          type: 'string',
          description:
            'Key for persisting sizes and collapse state to localStorage.',
        },
      ],
    },
    {
      name: 'ResizeHandle',
      displayName: 'Resize Handle',
      description:
        'Draggable separator between panels. Pill-grip design: invisible at rest, ' +
        'visible on hover (0.6 opacity), fully opaque during drag (1.0). Keyboard-accessible.',
      props: [
        {
          name: 'direction',
          type: "'horizontal' | 'vertical'",
          description:
            'Layout direction: determines cursor and indicator orientation.',
          default: "'horizontal'",
        },
        {
          name: 'isReversed',
          type: 'boolean',
          description:
            'Reverse drag direction. Use when the handle controls a panel on the end/right/bottom side.',
          default: 'false',
        },
        {
          name: 'isDisabled',
          type: 'boolean',
          description: 'Whether the handle is interactive.',
          default: 'false',
        },
        {
          name: 'hasDivider',
          type: 'boolean',
          description:
            'Show a full-length 1px divider line through the handle. Use when adjacent panels share the same background.',
          default: 'false',
        },
        {
          name: 'isAlwaysVisible',
          type: 'boolean',
          description:
            'Show the pill grip at rest instead of only on hover. Use when discoverability is important.',
          default: 'true',
        },
        {
          name: 'pillPlacement',
          type: "'start' | 'end' | 'center' | 'auto'",
          description:
            'Which side of the divider the pill sits on. ' +
            'auto = content side (derived from isReversed), flips when collapsed. ' +
            'start = left/top, end = right/bottom, center = centered on divider.',
          default: "'auto'",
        },
        {
          name: 'label',
          type: 'string',
          description: 'Accessible label for the separator.',
          default: "'Resize handle'",
        },
        {
          name: 'resizable',
          type: 'ResizableProps',
          description:
            "Deprecated: resize props from useResizable's configuration-object form. They carry the region's axis ('horizontal' | 'vertical'), which must match this handle's direction. Give the handle's ref to useResizable(handleRef, options) instead (<ResizeHandle ref={handleRef} />); isReversed and isDisabled stay on the handle. Removed in the next minor.",
        },
        {
          name: 'children',
          type: 'ReactNode',
          description:
            'Custom handle content. Overrides the default pill + divider.',
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
        },
      ],
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Hook-based resizable panel system. useResizable(handleRef, options) manages a region; ResizeHandle w/ same ref = interactive pill-grip separator.',
  usage: {
    anatomy,
    description:
      'Hook-based resizable panel system. useResizable(handleRef, options) manages a region; ResizeHandle w/ same ref = interactive pill-grip separator. Render panel at reported size (LayoutPanel width={region.size}). createResizable = same w/o React.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use useResizable(handleRef, options) w/ existing Astryx layout components: ref to ResizeHandle, size to panel (LayoutPanel width). SideNav has own resizable prop.',
      },
      {
        guidance: true,
        description:
          'Provide accessible label on each ResizeHandle when multiple handles exist (e.g. "Resize sidebar", "Resize terminal").',
      },
      {
        guidance: false,
        description:
          'Wrap panels in extra container components for resize. Hook-first architecture avoids extra DOM; use it directly on existing components.',
      },
    ],
  },
  components: [
    {
      name: 'useResizable',
      description:
        "Hook managing a panel region's resize state through its handle's ref: useResizable(handleRef, options). Returns size, isCollapsed, collapse/expand/resize methods.",
      propDescriptions: {
        defaultSize:
          'initial pixels, exact N%, or percent(value, {min: pixel(value)}) / percent(value, {max: pixel(value)}); resolves once',
        minSize:
          'live minimum: pixels, exact N%, or percent(value, {min: pixel(value)}) / percent(value, {max: pixel(value)})',
        maxSize:
          'live maximum: pixels, exact N%, or percent(value, {min: pixel(value)}) / percent(value, {max: pixel(value)})',
        collapsible: 'region can collapse to size 0?',
        collapsedSize: 'px threshold triggering collapse during drag',
        snaps: 'px values to snap to during resize',
        autoSaveId: 'key for persisting sizes + collapse state to localStorage',
      },
    },
    {
      name: 'ResizeHandle',
      description:
        'Draggable separator between panels. Pill-grip: invisible at rest, visible on hover (0.6 opacity), fully opaque during drag (1.0). Keyboard-accessible.',
      propDescriptions: {
        direction:
          'layout direction: determines cursor + indicator orientation',
        isReversed:
          'reverse drag direction. Use when handle controls panel on end/right/bottom side',
        isDisabled: 'handle interactive?',
        hasDivider:
          'show full-length 1px divider line through handle. Use when adjacent panels share same background',
        isAlwaysVisible:
          'show pill grip at rest instead of only on hover. Use when discoverability important',
        pillPlacement:
          'which side of divider pill sits on. auto = content side (derived from isReversed), flips when collapsed; start = left/top, end = right/bottom, center = centered on divider',
        label: 'accessible label for separator',
        resizable:
          'deprecated: config-object useResizable props; give handle ref to useResizable(handleRef, options) instead. Removed next minor.',
      },
    },
  ],
};
