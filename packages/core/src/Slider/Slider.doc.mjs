// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Label',
    required: true,
    description:
      'Text identifying the numeric setting controlled by the slider.',
  },
  {
    name: 'Description',
    required: false,
    description: 'Helper text between the label and the slider control.',
  },
  {
    name: 'Slider',
    required: true,
    description:
      'Control row containing the track, thumb or thumbs, and optional text value.',
  },
  {
    name: 'Interactive control',
    required: true,
    description:
      'Pointer and keyboard interaction surface containing the rail, fill, marks, and thumbs.',
  },
  {
    name: 'Track',
    required: true,
    description: 'Background rail representing the available numeric range.',
  },
  {
    name: 'Filled range',
    required: true,
    description:
      'Accent segment from the minimum to a single value, or between two range values.',
  },
  {
    name: 'Tick mark',
    required: false,
    description: 'Position marker supplied through the marks collection.',
  },
  {
    name: 'Mark label',
    required: false,
    description: 'Optional text displayed beside a tick mark.',
  },
  {
    name: 'Thumb',
    required: true,
    description:
      'Draggable value indicator; range mode renders a minimum and maximum thumb.',
  },
  {
    name: 'Value display',
    required: false,
    description:
      'Formatted current value shown beside the slider when valueDisplay is text.',
  },
  {
    name: 'Value tooltip',
    required: false,
    description:
      'Formatted current value shown in a tooltip when valueDisplay is tooltip.',
  },
  {
    name: 'Status message',
    required: false,
    description: 'Error, warning, or success message below the slider.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Slider',
  displayName: 'Slider',
  category: 'Form Controls',
  keywords: [
    'slider',
    'range',
    'slidebar',
    'trackbar',
    'scrubber',
    'knob',
    'thumb',
    'rangeslider',
  ],
  playground: {
    defaults: {
      label: 'Volume',
      value: 50,
      // Give the properties-tab preview a defined width so the track has room
      // to render and stays draggable/interactive (the slider track grows to
      // fill its container, which can collapse without an explicit width).
      width: 300,
    },
  },
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Label text (always rendered for accessibility).',
      required: true,
    },
    {
      name: 'value',
      type: 'number | [number, number]',
      description:
        'Current value: a `number` for single thumb mode or `[number, number]` for range mode.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: number) => void | (value: [number, number]) => void',
      description: 'Callback fired on value change during drag.',
    },
    {
      name: 'onChangeEnd',
      type: '(value: number) => void | (value: [number, number]) => void',
      description: 'Callback fired when drag ends.',
    },
    {
      name: 'min',
      type: 'number',
      description: 'Minimum value.',
      default: '0',
    },
    {
      name: 'max',
      type: 'number',
      description: 'Maximum value.',
      default: '100',
    },
    {
      name: 'step',
      type: 'number',
      description: 'Step increment.',
      default: '1',
    },
    {
      name: 'orientation',
      type: "'horizontal' | 'vertical'",
      description: 'Orientation of the slider.',
      default: "'horizontal'",
    },
    {
      name: 'formatValue',
      type: '(value: number) => string',
      description:
        'Custom value formatting function used for display and `aria-valuetext`.',
    },
    {
      name: 'valueDisplay',
      type: "'tooltip' | 'text' | 'none'",
      description: 'How the current value is displayed.',
      default: "'tooltip'",
    },
    {
      name: 'marks',
      type: 'Array<{ value: number; label?: string }>',
      description:
        'Tick marks at specified positions with optional labels. Unfilled marks use the track color; marks inside the filled region (at or behind the thumb, or between the thumbs in range mode) use the fill color.',
    },
    {
      name: 'minStepsBetweenThumbs',
      type: 'number',
      description:
        'Minimum number of steps between thumbs in range mode; prevents thumbs from overlapping.',
      default: '0',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether the slider is disabled.',
      default: 'false',
    },
    {
      name: 'htmlName',
      type: 'string',
      description:
        'The HTML name attribute for form submissions. Renders hidden inputs carrying the current value (two entries in range mode).',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the slider is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the thumb focusable via aria-disabled (value changes stay blocked). Use this instead of wrapping a disabled Slider in Tooltip. Disabled controls swallow the hover events an external Tooltip needs.',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: 'Whether the field is optional.',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: 'Whether the field is required.',
      default: 'false',
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: 'Whether to visually hide the label.',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: 'Description text rendered below the label.',
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description:
        'Status indicator object (`{ type, message }`) for validation feedback.',
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description: 'Tooltip text for an info icon displayed next to the label.',
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        'Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned.',
    },
    {
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the field container (label, control, and status together). No effect inside InputGroup (style the InputGroup instead) or in a `horizontal-labels` FormLayout. Root `xstyle`, `className`, and `style` are not accepted.',
    },
    {
      name: 'containerClassName',
      type: 'string',
      description:
        'Class name for the field container. Same targeting as `containerXstyle`.',
    },
    {
      name: 'containerStyle',
      type: 'CSSProperties',
      description:
        'Inline styles for the field container. Same targeting as `containerXstyle`.',
    },
    {
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the visual control box: the element that paints the border and background and holds icons and end controls. Never the native input.',
    },
    {
      name: 'controlClassName',
      type: 'string',
      description: 'Class name for the visual control box.',
    },
    {
      name: 'controlStyle',
      type: 'CSSProperties',
      description: 'Inline styles for the visual control box.',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-slider',
        visualProps: ['orientation'],
        states: ['disabled'],
      },
      {
        className: 'astryx-slider-control',
        visualProps: ['orientation'],
        states: ['disabled'],
      },
      {className: 'astryx-slider-track', visualProps: ['orientation']},
      {
        className: 'astryx-slider-thumb',
        visualProps: ['orientation'],
        states: ['disabled'],
      },
    ],
  },
  usage: {
    accessibility: [
      {
        name: 'Thumb',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1',
        states: ['Rest', 'Hover', 'Pointer down'],
        description:
          'The thumb must have at least 3:1 contrast with the track and the surface behind it. Pointer down is the whole drag: measure the thumb with the pressed overlay applied.',
      },
    ],
    anatomy,
    description:
      'A draggable control for selecting a numeric value or range within defined bounds. Supports single value and range selection, tick marks, custom value formatting, and vertical orientation. Use it when users need to explore a continuous range, such as volume, price, or percentage. Under a finger, on any touch device, it tracks as UISlider does: only the thumb takes a drag, through a target larger than it, the value follows the finger’s travel rather than jumping to it, a release coasts on before `onChangeEnd`, a swipe from the track scrolls the page, and a tap on the track or a mark sets the value when the finger lifts (the thumb springs there). A mouse drag on a thumb tracks the same way, past the same 10 px in any direction, with no lift or coast; a mouse press on the track moves the thumb there, and only a primary click presses. A wheel or a trackpad scroll over the slider goes to whatever scrolls under it.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Always provide a label, even if visually hidden, so the slider is accessible to screen readers.',
      },
      {
        guidance: true,
        description:
          'Format values with meaningful units like "$50" or "75%" instead of raw numbers.',
      },
      {
        guidance: false,
        description:
          'Use for precise numeric entry; pair with a text input or use NumberInput instead.',
      },
      {
        guidance: false,
        description:
          'Set a step size so large that only a few positions are possible; use SegmentedControl or radio buttons instead.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled slider in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Slider',
  displayName: 'Slider',
  props: [
    {
      name: 'label',
      type: 'string',
      description: '标签文本（始终渲染以确保无障碍可访问性）。',
      required: true,
    },
    {
      name: 'value',
      type: 'number | [number, number]',
      description:
        '当前值——`number` 用于单滑块模式，`[number, number]` 用于范围模式。',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: number) => void | (value: [number, number]) => void',
      description: '拖拽过程中值变更时触发的回调。',
    },
    {
      name: 'onChangeEnd',
      type: '(value: number) => void | (value: [number, number]) => void',
      description: '拖拽结束时触发的回调。',
    },
    {
      name: 'min',
      type: 'number',
      description: '最小值。',
      default: '0',
    },
    {
      name: 'max',
      type: 'number',
      description: '最大值。',
      default: '100',
    },
    {
      name: 'step',
      type: 'number',
      description: '步进增量。',
      default: '1',
    },
    {
      name: 'orientation',
      type: "'horizontal' | 'vertical'",
      description: '滑块的方向。',
      default: "'horizontal'",
    },
    {
      name: 'formatValue',
      type: '(value: number) => string',
      description: '自定义值格式化函数，用于显示和 `aria-valuetext`。',
    },
    {
      name: 'valueDisplay',
      type: "'tooltip' | 'text' | 'none'",
      description: '当前值的显示方式。',
      default: "'tooltip'",
    },
    {
      name: 'marks',
      type: 'Array<{ value: number; label?: string }>',
      description:
        '在指定位置的刻度标记，带可选标签。未填充区域的标记使用轨道颜色；填充区域内的标记使用强调色。',
    },
    {
      name: 'minStepsBetweenThumbs',
      type: 'number',
      description: '范围模式下滑块之间的最小步数；防止滑块重叠。',
      default: '0',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '是否禁用滑块。',
      default: 'false',
    },
    {
      name: 'htmlName',
      type: 'string',
      description:
        '用于表单提交的 HTML name 属性。渲染携带当前值的隐藏输入（范围模式下为两个条目）。',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the slider is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the thumb focusable via aria-disabled (value changes stay blocked). Use this instead of wrapping a disabled Slider in Tooltip. Disabled controls swallow the hover events an external Tooltip needs.',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: '字段是否为可选。',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: '字段是否为必填。',
      default: 'false',
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: '是否在视觉上隐藏标签。',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: '标签下方渲染的描述文本。',
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description: '验证反馈的状态指示器对象（`{ type, message }`）。',
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description: '标签旁信息图标的提示文本。',
    },
    {
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        '字段容器（标签、控件和状态整体）的 StyleX 样式。在 InputGroup 内（请改为设置 InputGroup 的样式）或 `horizontal-labels` FormLayout 中无效。不接受根级 `xstyle`、`className` 和 `style`。',
    },
    {
      name: 'containerClassName',
      type: 'string',
      description: '字段容器的类名，作用目标同 `containerXstyle`。',
    },
    {
      name: 'containerStyle',
      type: 'CSSProperties',
      description: '字段容器的内联样式，作用目标同 `containerXstyle`。',
    },
    {
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        '可视控件框的 StyleX 样式：绘制边框和背景并包含图标与尾部控件的元素，而非原生输入元素。',
    },
    {
      name: 'controlClassName',
      type: 'string',
      description: '可视控件框的类名。',
    },
    {
      name: 'controlStyle',
      type: 'CSSProperties',
      description: '可视控件框的内联样式。',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-slider',
        visualProps: ['orientation'],
        states: ['disabled'],
      },
      {
        className: 'astryx-slider-control',
        visualProps: ['orientation'],
        states: ['disabled'],
      },
      {className: 'astryx-slider-track', visualProps: ['orientation']},
      {
        className: 'astryx-slider-thumb',
        visualProps: ['orientation'],
        states: ['disabled'],
      },
    ],
  },
  usage: {
    anatomy,
    description:
      'A draggable control for selecting a numeric value or range within defined bounds. Supports single value and range selection, tick marks, custom value formatting, and vertical orientation. Use it when users need to explore a continuous range, such as volume, price, or percentage. Under a finger, on any touch device, it tracks as UISlider does: only the thumb takes a drag, through a target larger than it, the value follows the finger’s travel rather than jumping to it, a release coasts on before `onChangeEnd`, a swipe from the track scrolls the page, and a tap on the track or a mark sets the value when the finger lifts (the thumb springs there). A mouse drag on a thumb tracks the same way, past the same 10 px in any direction, with no lift or coast; a mouse press on the track moves the thumb there, and only a primary click presses. A wheel or a trackpad scroll over the slider goes to whatever scrolls under it.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Always provide a label, even if visually hidden, so the slider is accessible to screen readers.',
      },
      {
        guidance: true,
        description:
          'Format values with meaningful units like "$50" or "75%" instead of raw numbers.',
      },
      {
        guidance: false,
        description:
          'Use for precise numeric entry; pair with a text input or use NumberInput instead.',
      },
      {
        guidance: false,
        description:
          'Set a step size so large that only a few positions are possible; use SegmentedControl or radio buttons instead.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled slider in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  usage: {
    anatomy,
    description:
      'A draggable control for selecting a numeric value or range within defined bounds. Supports single value and range selection, tick marks, custom value formatting, and vertical orientation. Use it when users need to explore a continuous range, such as volume, price, or percentage. Under a finger, on any touch device, it tracks as UISlider does: only the thumb takes a drag, through a target larger than it, the value follows the finger’s travel rather than jumping to it, a release coasts on before `onChangeEnd`, a swipe from the track scrolls the page, and a tap on the track or a mark sets the value when the finger lifts (the thumb springs there). A mouse drag on a thumb tracks the same way, past the same 10 px in any direction, with no lift or coast; a mouse press on the track moves the thumb there, and only a primary click presses. A wheel or a trackpad scroll over the slider goes to whatever scrolls under it.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Always provide a label, even if visually hidden, so the slider is accessible to screen readers.',
      },
      {
        guidance: true,
        description:
          'Format values with meaningful units like "$50" or "75%" instead of raw numbers.',
      },
      {
        guidance: false,
        description:
          'Use for precise numeric entry; pair with a text input or use NumberInput instead.',
      },
      {
        guidance: false,
        description:
          'Set a step size so large that only a few positions are possible; use SegmentedControl or radio buttons instead.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled slider in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
  propDescriptions: {
    containerXstyle:
      'StyleX styles for the field container; no effect in InputGroup or horizontal-labels FormLayout. No root xstyle/className/style.',
    containerClassName: 'Class name for the field container.',
    containerStyle: 'Inline styles for the field container.',
    controlXstyle:
      'StyleX styles for the visual control box (border, background, icons); not the native input.',
    controlClassName: 'Class name for the visual control box.',
    controlStyle: 'Inline styles for the visual control box.',
    label: 'Label text (always rendered for a11y).',
    value:
      'Current value; number for single thumb, [number, number] for range.',
    onChange: 'Fired on value change during drag.',
    onChangeEnd: 'Fired when drag ends.',
    min: 'Minimum value.',
    max: 'Maximum value.',
    step: 'Step increment.',
    orientation: 'Slider orientation.',
    formatValue: 'Custom value formatting fn for display + aria-valuetext.',
    valueDisplay: 'How current value is displayed.',
    marks:
      'Tick marks at specified positions w/ optional labels. Unfilled marks use the track color; filled marks use the accent color.',
    minStepsBetweenThumbs:
      'Min steps between thumbs in range mode; prevents overlap.',
    isDisabled: 'Whether slider is disabled.',
    htmlName:
      'HTML name attr; hidden inputs carry the value (two in range mode).',
    isOptional: 'Whether field is optional.',
    isRequired: 'Whether field is required.',
    isLabelHidden: 'Visually hide label.',
    description: 'Description text below label.',
    status: 'Status indicator ({type, message}) for validation feedback.',
    labelTooltip: 'Tooltip text for info icon next to label.',
  },
};
