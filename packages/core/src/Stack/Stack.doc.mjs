// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Stack container',
    required: true,
    description: 'Layout container that arranges content along one flex axis.',
  },
  {
    name: 'Item',
    required: false,
    description: 'Optional StackItem wrapper that controls one item in the stack.',
  },
  {
    name: 'Content',
    required: false,
    description: 'Caller-supplied content rendered by a Stack or StackItem.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Stack',
  displayName: 'Stack',
  group: 'Layout',
  category: 'Layout',
  keywords: ["stack","hstack","vstack","flexbox","flex","spacing","gap","horizontal","vertical","row","column"],
  theming: {
    targets: [
      {className: 'astryx-stack', visualProps: ['direction', 'gap', 'wrap']},
      {className: 'astryx-stack-item', visualProps: ['size']},
    ],
  },
  components: [
    {
      name: 'Stack',
      displayName: 'Stack',
      description:
        'Unified stack layout component with a direction prop. Use direction="horizontal" to flow along the inline axis (left to right in LTR, right to left in RTL) or direction="vertical" (default) for top-to-bottom. For convenience, HStack and VStack are pre-configured wrappers.',
      playground: {
        defaults: {
          direction: 'horizontal',
          gap: 2,
          children: [
            {__element: 'Card', props: {padding: 3}, children: 'Item 1'},
            {__element: 'Card', props: {padding: 3}, children: 'Item 2'},
            {__element: 'Card', props: {padding: 3}, children: 'Item 3'},
          ],
        },
      },
      props: [
        {
          name: 'direction',
          type: "'horizontal' | 'vertical'",
          description:
            "Direction of the stack layout. 'horizontal' flows items along the inline axis, left to right in LTR and right to left in RTL (like HStack), 'vertical' flows top-to-bottom (like VStack). Note: the value is 'horizontal', NOT 'row'.",
          default: "'vertical'",
        },
        {
          name: 'gap',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Spacing step (number literal): 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10. Pass as a JSX number expression e.g. gap={4}, NOT a string like gap="4".',
        },
        {
          name: 'padding',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inner padding on all sides, using the spacing scale. Pass as a JSX number expression e.g. padding={3}.',
        },
        {
          name: 'paddingInline',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inline (horizontal) padding. Overrides padding on the inline axis when both are set.',
        },
        {
          name: 'paddingInlineStart',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inline-start padding, using the spacing scale (left in LTR, right in RTL). Overrides paddingInline and padding on that edge only.',
        },
        {
          name: 'paddingInlineEnd',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inline-end padding, using the spacing scale (right in LTR, left in RTL). Overrides paddingInline and padding on that edge only.',
        },
        {
          name: 'paddingBlock',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Block (vertical) padding. Overrides padding on the block axis when both are set.',
        },
        {
          name: 'paddingBlockStart',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Block-start (top) padding, using the spacing scale. Overrides paddingBlock and padding on that edge only.',
        },
        {
          name: 'paddingBlockEnd',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Block-end (bottom) padding, using the spacing scale. Overrides paddingBlock and padding on that edge only.',
        },
        {
          name: 'isScrollable',
          type: 'boolean',
          description:
            'Enables scrollable overflow (overflow: auto).',
          default: 'false',
        },
        {
          name: 'width',
          type: 'SizeValue',
          description: "Width of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%').",
        },
        {
          name: 'height',
          type: 'SizeValue',
          description: "Height of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%').",
        },
        {
          name: 'maxWidth',
          type: 'SizeValue',
          description: "Maximum width of the stack container.",
        },
        {
          name: 'minHeight',
          type: 'SizeValue',
          description: "Minimum height of the stack container.",
        },
        {
          name: 'hAlign',
          type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly' | 'stretch'",
          description: "Horizontal alignment. When direction='horizontal': main-axis (justify-content). When direction='vertical': cross-axis (align-items).",
        },
        {
          name: 'vAlign',
          type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly' | 'stretch'",
          description: "Vertical alignment. When direction='horizontal': cross-axis (align-items). When direction='vertical': main-axis (justify-content).",
        },
        {
          name: 'justify',
          type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'",
          description: "Main-axis alignment alias. Resolves to hAlign (horizontal) or vAlign (vertical). Note: use 'between', NOT 'space-between'.",
        },
        {
          name: 'align',
          type: "'start' | 'center' | 'end' | 'stretch'",
          description: 'Cross-axis alignment alias. Mirrors CSS align-items.',
        },
        {
          name: 'wrap',
          type: "'nowrap' | 'wrap' | 'wrap-reverse'",
          description: 'Flex wrap behavior.',
          default: "'nowrap'",
        },
        {
          name: 'as',
          type: 'ElementType',
          description: 'HTML element to render as the stack container.',
          default: "'div'",
        },
        {
          name: 'children',
          type: 'ReactNode',
          description: 'Stack content.',
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
        },
        {
          name: 'className',
          type: 'string',
          description: 'Class name added to the stack element, after the component styles.',
        },
        {
          name: 'style',
          type: 'CSSProperties',
          description: 'Inline styles for the stack element. width, height, maxWidth, and minHeight win over the same properties here.',
        },
        {
          name: 'ref',
          type: 'Ref<HTMLElement>',
          description: 'Ref to the rendered stack element.',
        },
      ],
    },

    {
      name: 'HStack',
      isHiddenFromOverview: true,
      displayName: 'H Stack',
      description:
        'Horizontal stack that arranges items along the inline axis: left to right in LTR, right to left in RTL. Supports polymorphic rendering.',
      playground: {
        defaults: {
          gap: 2,
          children: [
            {__element: 'Card', props: {padding: 3}, children: 'Item 1'},
            {__element: 'Card', props: {padding: 3}, children: 'Item 2'},
            {__element: 'Card', props: {padding: 3}, children: 'Item 3'},
          ],
        },
      },
      props: [
        {
          name: 'gap',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Spacing step (number literal): 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10. Pass as a JSX number expression e.g. gap={4}, NOT a string like gap="4".',
        },
        {
          name: 'padding',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inner padding on all sides, using the spacing scale (0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10). Matches the padding prop on Card, LayoutContent, and LayoutPanel. Pass as a JSX number expression e.g. padding={3}.',
        },
        {
          name: 'paddingInline',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inline (horizontal) padding, using the spacing scale. Overrides padding on the inline axis when both are set.',
        },
        {
          name: 'paddingInlineStart',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inline-start padding, using the spacing scale (left in LTR, right in RTL). Overrides paddingInline and padding on that edge only.',
        },
        {
          name: 'paddingInlineEnd',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inline-end padding, using the spacing scale (right in LTR, left in RTL). Overrides paddingInline and padding on that edge only.',
        },
        {
          name: 'paddingBlock',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Block (vertical) padding, using the spacing scale. Overrides padding on the block axis when both are set.',
        },
        {
          name: 'paddingBlockStart',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Block-start (top) padding, using the spacing scale. Overrides paddingBlock and padding on that edge only.',
        },
        {
          name: 'paddingBlockEnd',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Block-end (bottom) padding, using the spacing scale. Overrides paddingBlock and padding on that edge only.',
        },
        {
          name: 'isScrollable',
          type: 'boolean',
          description:
            'Enables scrollable overflow (overflow: auto). Matches isScrollable on LayoutContent and LayoutPanel.',
          default: 'false',
        },
        {
          name: 'width',
          type: 'SizeValue',
          description: "Width of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%').",
        },
        {
          name: 'height',
          type: 'SizeValue',
          description: "Height of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%').",
        },
        {
          name: 'maxWidth',
          type: 'SizeValue',
          description: "Maximum width of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%').",
        },
        {
          name: 'minHeight',
          type: 'SizeValue',
          description: "Minimum height of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%').",
        },
        {
          name: 'hAlign',
          type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'",
          description: 'Horizontal (main-axis) alignment of items.',
        },
        {
          name: 'vAlign',
          type: "'start' | 'center' | 'end' | 'stretch'",
          description: 'Vertical (cross-axis) alignment of items.',
          default: "'stretch'",
        },
        {
          name: 'justify',
          type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'",
          description: 'Main-axis alignment alias for hAlign. Mirrors CSS justify-content. When hAlign is also set, hAlign wins.',
        },
        {
          name: 'align',
          type: "'start' | 'center' | 'end' | 'stretch'",
          description: 'Cross-axis alignment alias for vAlign. Mirrors CSS align-items. When vAlign is also set, vAlign wins.',
        },
        {
          name: 'wrap',
          type: "'nowrap' | 'wrap' | 'wrap-reverse'",
          description: 'Flex wrap behavior.',
          default: "'nowrap'",
        },
        {
          name: 'as',
          type: 'ElementType',
          description: 'HTML element to render as the stack container.',
          default: "'div'",
        },
        {
          name: 'children',
          type: 'ReactNode',
          description: 'Stack content.',
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
        },
        {
          name: 'className',
          type: 'string',
          description: 'Class name added to the stack element, after the component styles.',
        },
        {
          name: 'style',
          type: 'CSSProperties',
          description: 'Inline styles for the stack element. width, height, maxWidth, and minHeight win over the same properties here.',
        },
        {
          name: 'ref',
          type: 'Ref<HTMLElement>',
          description: 'Ref to the rendered stack element.',
        },
      ],    },
    {
      name: 'VStack',
      isHiddenFromOverview: true,
      displayName: 'V Stack',
      description:
        'Vertical stack for arranging items top-to-bottom. Supports polymorphic rendering.',
      playground: {
        defaults: {
          gap: 2,
          children: [
            {__element: 'Card', props: {padding: 3}, children: 'Item 1'},
            {__element: 'Card', props: {padding: 3}, children: 'Item 2'},
            {__element: 'Card', props: {padding: 3}, children: 'Item 3'},
          ],
        },
      },
      props: [
        {
          name: 'gap',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Spacing step (number literal): 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10. Pass as a JSX number expression e.g. gap={4}, NOT a string like gap="4".',
        },
        {
          name: 'padding',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inner padding on all sides, using the spacing scale (0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10). Matches the padding prop on Card, LayoutContent, and LayoutPanel. Pass as a JSX number expression e.g. padding={3}.',
        },
        {
          name: 'paddingInline',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inline (horizontal) padding, using the spacing scale. Overrides padding on the inline axis when both are set.',
        },
        {
          name: 'paddingInlineStart',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inline-start padding, using the spacing scale (left in LTR, right in RTL). Overrides paddingInline and padding on that edge only.',
        },
        {
          name: 'paddingInlineEnd',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inline-end padding, using the spacing scale (right in LTR, left in RTL). Overrides paddingInline and padding on that edge only.',
        },
        {
          name: 'paddingBlock',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Block (vertical) padding, using the spacing scale. Overrides padding on the block axis when both are set.',
        },
        {
          name: 'paddingBlockStart',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Block-start (top) padding, using the spacing scale. Overrides paddingBlock and padding on that edge only.',
        },
        {
          name: 'paddingBlockEnd',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Block-end (bottom) padding, using the spacing scale. Overrides paddingBlock and padding on that edge only.',
        },
        {
          name: 'isScrollable',
          type: 'boolean',
          description:
            'Enables scrollable overflow (overflow: auto). Matches isScrollable on LayoutContent and LayoutPanel.',
          default: 'false',
        },
        {
          name: 'width',
          type: 'SizeValue',
          description: "Width of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%').",
        },
        {
          name: 'height',
          type: 'SizeValue',
          description: "Height of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%').",
        },
        {
          name: 'maxWidth',
          type: 'SizeValue',
          description: "Maximum width of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%').",
        },
        {
          name: 'minHeight',
          type: 'SizeValue',
          description: "Minimum height of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%').",
        },
        {
          name: 'hAlign',
          type: "'start' | 'center' | 'end' | 'stretch'",
          description: 'Horizontal (cross-axis) alignment of items.',
          default: "'stretch'",
        },
        {
          name: 'vAlign',
          type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'",
          description: 'Vertical (main-axis) alignment of items.',
        },
        {
          name: 'justify',
          type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'",
          description: 'Main-axis alignment alias for vAlign. Mirrors CSS justify-content.',
        },
        {
          name: 'align',
          type: "'start' | 'center' | 'end' | 'stretch'",
          description: 'Cross-axis alignment alias for hAlign. Mirrors CSS align-items.',
        },
        {
          name: 'wrap',
          type: "'nowrap' | 'wrap' | 'wrap-reverse'",
          description: 'Flex wrap behavior.',
          default: "'nowrap'",
        },
        {
          name: 'as',
          type: 'ElementType',
          description: 'HTML element to render as the stack container.',
          default: "'div'",
        },
        {
          name: 'children',
          type: 'ReactNode',
          description: 'Stack content.',
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
        },
        {
          name: 'className',
          type: 'string',
          description: 'Class name added to the stack element, after the component styles.',
        },
        {
          name: 'style',
          type: 'CSSProperties',
          description: 'Inline styles for the stack element. width, height, maxWidth, and minHeight win over the same properties here.',
        },
        {
          name: 'ref',
          type: 'Ref<HTMLElement>',
          description: 'Ref to the rendered stack element.',
        },
      ],
    },
    {
      name: 'StackItem',
      isHiddenFromOverview: true,
      displayName: 'Stack Item',
      description:
        'Stack item for controlling individual item behavior within a stack. Supports polymorphic rendering.',
      playground: {
        wrapper: {component: 'HStack', props: {gap: 2, width: 300}},
        defaults: {
          size: 'fill',
          children: {__element: 'Card', props: {padding: 3}, children: 'Fills the row'},
        },
      },
      props: [
        {
          name: 'size',
          type: "'static' | 'fill'",
          description:
            'Flex grow behavior: static keeps natural size, fill expands to consume remaining space.',
          default: "'static'",
        },
        {
          name: 'isScrollable',
          type: 'boolean',
          description:
            'Enables scrollable overflow (overflow: auto). StackItem already applies the flex min-height/min-width reset, so <StackItem size="fill" isScrollable> is a complete scroll region. Matches isScrollable on LayoutContent and LayoutPanel.',
          default: 'false',
        },
        {
          name: 'crossAlignSelf',
          type: "'start' | 'center' | 'end' | 'stretch'",
          description:
            'Override the cross-axis alignment for this individual item, ignoring the parent stack alignment.',
        },
        {
          name: 'as',
          type: 'ElementType',
          description: 'HTML element to render as the item wrapper.',
          default: "'div'",
        },
        {
          name: 'children',
          type: 'ReactNode',
          description: 'Item content.',
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
        },
        {
          name: 'className',
          type: 'string',
          description: 'Class name added to the item element, after the component styles.',
        },
        {
          name: 'style',
          type: 'CSSProperties',
          description: 'Inline styles for the item element.',
        },
        {
          name: 'ref',
          type: 'Ref<HTMLElement>',
          description: 'Ref to the rendered item element.',
        },
      ],
    },
  ],
  usage: {
    anatomy,
    description:
      'Stack arranges items in a row or column with consistent spacing. Use the gap prop to control the space between items.',
    bestPractices: [
      { guidance: true, description: 'Use the gap prop for spacing between items; don\'t add margins manually.' },
      { guidance: true, description: 'Use StackItem with size="fill" to make one item stretch and fill the leftover space.' },
      { guidance: false, description: 'Nest stacks inside stacks; try wrap="wrap" first to let items flow to the next line.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Stack',
  displayName: 'Stack',
  group: 'Layout',
  theming: {
    targets: [
      {className: 'astryx-stack', visualProps: ['direction', 'gap', 'wrap']},
      {className: 'astryx-stack-item', visualProps: ['size']},
    ],
  },
  components: [
    {
      name: 'HStack',
      isHiddenFromOverview: true,
      displayName: 'H Stack',
      description:
        '水平堆叠组件，沿行内方向排列元素：LTR 中从左到右，RTL 中从右到左。支持多态渲染。',
      props: [
        {
          name: 'gap',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            '间距步进（数字字面量）：0、0.5、1、1.5、2、3、4、5、6、8、10。在 JSX 中使用数字表达式 e.g. gap={4}，不要使用字符串 gap="4"。',
        },
        {
          name: 'width',
          type: 'SizeValue',
          description: '堆叠容器的宽度。数字按像素处理，字符串原样使用（如 \'100%\'）。',
        },
        {
          name: 'height',
          type: 'SizeValue',
          description: '堆叠容器的高度。数字按像素处理，字符串原样使用（如 \'100%\'）。',
        },
        {
          name: 'hAlign',
          type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'",
          description: '水平（主轴）对齐方式。',
        },
        {
          name: 'vAlign',
          type: "'start' | 'center' | 'end' | 'stretch'",
          description: '元素的垂直（交叉轴）对齐方式。',
          default: "'stretch'",
        },
        {
          name: 'justify',
          type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'",
          description: 'hAlign 的别名。对应 CSS justify-content。同时设置 hAlign 时，以 hAlign 为准。',
        },
        {
          name: 'align',
          type: "'start' | 'center' | 'end' | 'stretch'",
          description: 'vAlign 的别名。对应 CSS align-items。同时设置 vAlign 时，以 vAlign 为准。',
        },
        {
          name: 'wrap',
          type: "'nowrap' | 'wrap' | 'wrap-reverse'",
          description: 'Flex 换行行为。',
          default: "'nowrap'",
        },
        {
          name: 'as',
          type: 'ElementType',
          description: '作为堆叠容器渲染的 HTML 元素。',
          default: "'div'",
        },
        {
          name: 'children',
          type: 'ReactNode',
          description: '堆叠内容。',
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            '用于布局自定义的 StyleX 样式（外边距、定位、尺寸）。必须是 stylex.create() 的值，而非内联样式对象如 style={{}}。',
        },
      ],
    },
    {
      name: 'VStack',
      isHiddenFromOverview: true,
      displayName: 'V Stack',
      description:
        '垂直堆叠组件，将元素从上到下排列。支持多态渲染。',
      props: [
        {
          name: 'gap',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            '间距步进（数字字面量）：0、0.5、1、1.5、2、3、4、5、6、8、10。在 JSX 中使用数字表达式 e.g. gap={4}，不要使用字符串 gap="4"。',
        },
        {
          name: 'width',
          type: 'SizeValue',
          description: '堆叠容器的宽度。数字按像素处理，字符串原样使用（如 \'100%\'）。',
        },
        {
          name: 'height',
          type: 'SizeValue',
          description: '堆叠容器的高度。数字按像素处理，字符串原样使用（如 \'100%\'）。',
        },
        {
          name: 'hAlign',
          type: "'start' | 'center' | 'end' | 'stretch'",
          description: '元素的水平（交叉轴）对齐方式。',
          default: "'stretch'",
        },
        {
          name: 'vAlign',
          type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'",
          description: '垂直（主轴）对齐方式。',
        },
        {
          name: 'justify',
          type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'",
          description: 'vAlign 的别名。对应 CSS justify-content。',
        },
        {
          name: 'align',
          type: "'start' | 'center' | 'end' | 'stretch'",
          description: 'hAlign 的别名。对应 CSS align-items。',
        },
        {
          name: 'wrap',
          type: "'nowrap' | 'wrap' | 'wrap-reverse'",
          description: 'Flex 换行行为。',
          default: "'nowrap'",
        },
        {
          name: 'as',
          type: 'ElementType',
          description: '作为堆叠容器渲染的 HTML 元素。',
          default: "'div'",
        },
        {
          name: 'children',
          type: 'ReactNode',
          description: '堆叠内容。',
        },
      ],
    },
    {
      name: 'StackItem',
      isHiddenFromOverview: true,
      displayName: 'Stack Item',
      description:
        '堆叠子元素，用于控制堆叠中单个元素的行为。支持多态渲染。',
      props: [
        {
          name: 'size',
          type: "'static' | 'fill'",
          description:
            'Flex 增长行为：static 保持自然尺寸，fill 扩展以占据剩余空间。',
          default: "'static'",
        },
        {
          name: 'crossAlignSelf',
          type: "'start' | 'center' | 'end' | 'stretch'",
          description:
            '覆盖此元素的交叉轴对齐方式，忽略父堆叠的对齐设置。',
        },
        {
          name: 'as',
          type: 'ElementType',
          description: '作为子元素包装器渲染的 HTML 元素。',
          default: "'div'",
        },
        {
          name: 'children',
          type: 'ReactNode',
          description: '子元素内容。',
        },
      ],
    },
  ],
  usage: {
    anatomy,
    description:
      'Stack arranges items in a row or column with consistent spacing. Use the gap prop to control the space between items.',
    bestPractices: [
      { guidance: true, description: 'Use the gap prop for spacing between items; don\'t add margins manually.' },
      { guidance: true, description: 'Use StackItem with size="fill" to make one item stretch and fill the leftover space.' },
      { guidance: false, description: 'Nest stacks inside stacks; try wrap="wrap" first to let items flow to the next line.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'Stack layout primitives for horizontal/vertical sequences using flexbox w/ themed spacing tokens.',
  usage: {
    anatomy,
    description:
      'Stack arranges items in a row or column with consistent spacing. Use the gap prop to control the space between items.',
    bestPractices: [
      { guidance: true, description: 'Use the gap prop for spacing between items; don\'t add margins manually.' },
      { guidance: true, description: 'Use StackItem with size="fill" to make one item stretch and fill the leftover space.' },
      { guidance: false, description: 'Nest stacks inside stacks; try wrap="wrap" first to let items flow to the next line.' },
    ],
  },
  components: [
    {
      name: 'HStack',
      isHiddenFromOverview: true,
      displayName: 'H Stack',
      description: 'Horizontal stack; inline direction (left to right in LTR, right to left in RTL), polymorphic rendering.',
      propDescriptions: {
        gap: 'Number literal spacing step: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10. Use gap={4} not gap="4".',
        width: "Width of container. Numbers=pixels, strings=as-is (e.g. '100%').",
        height: "Height of container. Numbers=pixels, strings=as-is (e.g. '100%').",
        hAlign: 'Horizontal (main-axis) alignment.',
        vAlign: 'Vertical (cross-axis) alignment.',
        justify: 'Main-axis alignment alias for hAlign. Mirrors CSS justify-content. An explicit hAlign wins.',
        align: 'Cross-axis alignment alias for vAlign. Mirrors CSS align-items. An explicit vAlign wins.',
        wrap: 'Flex wrap behavior.',
        as: 'HTML element to render as container.',
        children: 'Stack content.',
        xstyle: 'StyleX layout styles; must be stylex.create() value.',
      },
    },
    {
      name: 'VStack',
      isHiddenFromOverview: true,
      displayName: 'V Stack',
      description: 'Vertical stack; top-to-bottom, polymorphic rendering.',
      propDescriptions: {
        gap: 'Number literal spacing step: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10. Use gap={4} not gap="4".',
        width: "Width of container. Numbers=pixels, strings=as-is (e.g. '100%').",
        height: "Height of container. Numbers=pixels, strings=as-is (e.g. '100%').",
        hAlign: 'Horizontal (cross-axis) alignment.',
        vAlign: 'Vertical (main-axis) alignment.',
        justify: 'Main-axis alignment alias for vAlign. Mirrors CSS justify-content.',
        align: 'Cross-axis alignment alias for hAlign. Mirrors CSS align-items.',
        wrap: 'Flex wrap behavior.',
        as: 'HTML element to render as container.',
        children: 'Stack content.',
      },
    },
    {
      name: 'StackItem',
      isHiddenFromOverview: true,
      displayName: 'Stack Item',
      description: 'Controls individual item behavior in stack; polymorphic rendering.',
      propDescriptions: {
        size: 'Flex grow: static=natural size, fill=expand to remaining space.',
        crossAlignSelf: 'Override cross-axis alignment for this item, ignoring parent.',
        as: 'HTML element to render as wrapper.',
        children: 'Item content.',
      },
    },
  ],
};