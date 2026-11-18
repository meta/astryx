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
      'Default visible grip indicator; dragging it resizes, wherever it sits. Custom handle content can replace it.',
  },
  {
    name: 'Grab zone',
    required: true,
    description:
      'Invisible enlarged pointer region centred on the divider. An inline zone takes at most half of a pane shorter than it; an overlay handle takes at most half of its pane.',
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
      'Hook-based resizable panel system. useResizable() manages size state ' +
      'and ResizeHandle provides the interactive pill-grip separator. ' +
      "Pass the hook's output to existing layout components via their resizable prop.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Use percent(value, {min: pixel(value)}) or percent(value, {max: pixel(value)}) when a percentage needs exactly one pixel floor or ceiling. Reuse Table’s pixel() helper; numbers, exact Npx, and pixel(value) remain pixels. State, persistence, callbacks, paint, and ARIA remain resolved pixels.',
      },
      {
        guidance: true,
        description:
          'Use useResizable() with existing Astryx layout components. ' +
          'Pass its output to the resizable prop on LayoutPanel, ResizeHandle or SideNav; any other element can use its size.',
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
        'Hook that manages resize state for one or more panel regions. ' +
        'Returns size, isCollapsed, collapse/expand/resize methods, and props to pass to handles.',
      examples: [
        {
          label: 'Structured fixed pixels',
          code: `const resizable = useResizable({
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

const resizable = useResizable({
  defaultSize: percent(40, {min: pixel(333)}),
  containerRef,
});

<ResizeHandle direction="horizontal" resizable={resizable} />;`,
        },
        {
          label: 'Any element, sized by the hook',
          code: `'use client';

import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {ResizeHandle, useResizable} from '@astryxdesign/core/Resizable';
import {Stack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';

const styles = stylex.create({
  // The hook's size as a dynamic style; the card keeps it in the row.
  preview: (width: number) => ({width, flexShrink: 0}),
});

export default function InvoicePreviewSplit() {
  const resizable = useResizable({defaultSize: 320, minSize: 240, maxSize: 480});
  return (
    <Stack direction="horizontal">
      <Card xstyle={styles.preview(resizable.size)}>
        <Text>Invoice INV-2041, $1,280.00, due Nov 18</Text>
      </Card>
      <ResizeHandle resizable={resizable} label="Resize invoice preview" />
      <Text>Line items, payments and notes for the selected invoice.</Text>
    </Stack>
  );
}`,
        },
        {
          label: 'Live percentage floor',
          code: `const resizable = useResizable({
  defaultSize: 0,
  minSize: percent(40, {min: pixel(333)}),
  containerRef,
});`,
        },
        {
          label: 'Live percentage ceiling',
          code: `const resizable = useResizable({
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
          description:
            'Pixel threshold under which a lift or a key step collapses the region.',
          default: '40',
        },
        {
          name: 'snaps',
          type: 'number[]',
          description: 'Pixel values to snap to during resize.',
        },
        {
          name: 'shrinkOrder',
          type: 'number',
          description: 'Cascade priority: lower number shrinks first.',
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
            'start = left/top, end = right/bottom, center = centered on divider. ' +
            'It moves only the pill, which a drag can still take wherever it sits; the grab zone stays centred on the divider.',
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
          type: 'ResizableRegion | ResizableProps',
          description:
            "The output of useResizable, or its props: connects handle to panel. Carries the region's axis ('horizontal' | 'vertical'), which must match this handle's direction.",
          required: true,
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
    'Hook-based resizable panel system. useResizable() manages size state; ResizeHandle provides interactive pill-grip separator.',
  usage: {
    anatomy,
    description:
      'Hook-based resizable panel system. useResizable() manages size state; ResizeHandle provides interactive pill-grip separator. Pass the hook output to existing layout components via their resizable prop.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use useResizable() w/ existing Astryx layout components. Pass its output to resizable prop on LayoutPanel, ResizeHandle or SideNav.',
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
        'Hook managing resize state for one or more panel regions. Returns size, isCollapsed, collapse/expand/resize methods, + props to pass to handles.',
      propDescriptions: {
        defaultSize:
          'initial pixels, exact N%, or percent(value, {min: pixel(value)}) / percent(value, {max: pixel(value)}); resolves once',
        minSize:
          'live minimum: pixels, exact N%, or percent(value, {min: pixel(value)}) / percent(value, {max: pixel(value)})',
        maxSize:
          'live maximum: pixels, exact N%, or percent(value, {min: pixel(value)}) / percent(value, {max: pixel(value)})',
        collapsible: 'region can collapse to size 0?',
        collapsedSize: 'px threshold under which a lift or key step collapses',
        snaps: 'px values to snap to during resize',
        shrinkOrder: 'cascade priority: lower number shrinks first',
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
          'which side of divider pill sits on. auto = content side (derived from isReversed), flips when collapsed; start = left/top, end = right/bottom, center = centered on divider. Moves only the pill (still draggable); grab zone stays on the divider',
        label: 'accessible label for separator',
        resizable: 'useResizable output or its props: connects handle to panel',
      },
    },
  ],
};
