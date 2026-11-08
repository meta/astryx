// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Stepper',
  displayName: 'Stepper',
  category: 'Navigation',
  group: 'Stepper',
  keywords: [
    'stepper',
    'steps',
    'wizard',
    'workflow',
    'progress',
    'multi-step',
    'form wizard',
    'onboarding',
  ],
  usage: {
    description:
      'Steppers display progress through a sequence of logical and numbered steps. Use them for multi-step workflows like forms, onboarding flows, or checkout processes where users need to see their position and the steps ahead. Rendered as an ordered list (not a navigation landmark).',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep step labels short and descriptive: "Payment" not "Enter your payment information".',
      },
      {
        guidance: true,
        description:
          'Use the vertical orientation when steps carry longer descriptions. A horizontal stepper handles narrow containers itself: once the frame gives each step less than horizontalOptions.minimumStepWidth (112px by default) it drops the labels for a segmented track and uses the configured collapsedVariant beneath it.',
      },
      {
        guidance: true,
        description:
          "Set horizontalOptions.collapsedVariant to 'withLabel' when the page already supplies Back/Continue, or to 'hiddenLabel' when surrounding UI owns both the current-step heading and navigation and only a bare progress track is needed.",
      },
      {
        guidance: true,
        description:
          'Provide onStepClick for non-linear workflows where users may need to revisit earlier steps.',
      },
      {
        guidance: true,
        description:
          'Use status only to apply a semantic color (accent/success/warning/error); pass a custom icon for richer indicators.',
      },
      {
        guidance: false,
        description:
          'Use a stepper for fewer than 3 steps; a simple heading or progress bar works better.',
      },
      {
        guidance: false,
        description:
          'Use more than 7 steps; consider grouping related steps or using a different pattern.',
      },
    ],
    anatomy: [
      {
        name: 'Stepper',
        required: true,
        description:
          'The ordered list holding the steps. Owns the orientation and the indicator placement the whole flow is laid out on.',
      },
      {
        name: 'Frame',
        required: true,
        description:
          'The layout frame that groups the ordered steps with the optional compact summary shown at narrow widths.',
      },
      {
        name: 'Compact summary',
        required: false,
        description:
          'The optional row a horizontal Stepper adds directly beneath the track once it is too narrow to label every step. horizontalOptions.collapsedVariant chooses a label with Previous/Next controls, the label alone, or no row for a bare progress track. The on-track layout keeps its indicators on the rail instead of repeating the active indicator beside the label. Every step keeps its name in the accessible sequence at any width.',
      },
      {
        name: 'Step',
        required: true,
        description:
          'One step in the flow, and the element carrying its status. Wraps the indicator, label, description, and the track segments belonging to it.',
      },
      {
        name: 'Progress bar',
        required: true,
        description:
          'A 4px segmented bar per step. Filled for completed and active steps. Advancing one step grows the fill along the track it just covered, so the movement reads as progress rather than a bar changing color. Every other change applies at once: going back, jumping forward by more than one step, mounting mid-flow, and any change at all under prefers-reduced-motion. Where a span is drawn by more than one segment (the on-track layouts split it between two steps, three when a content slot sits between them), the segments run in track order at one constant speed, so the fill reads as a single line growing rather than pieces lighting in turn.',
      },
      {
        name: 'Connector',
        required: false,
        description:
          'The track drawn between indicators in the on-track layouts. Each connector paints an unfilled line and, over it, the accent fill covering the progress made. How many pieces a connector is drawn from is an implementation detail of the layout, not a themeable part; use --step-connector-gap to hold the track off the indicator.',
      },
      {
        name: 'Indicator',
        required: false,
        description:
          'A numbered badge, a check, or any custom icon. Controlled via the indicator prop.',
      },
      {
        name: 'Label',
        required: true,
        description: 'Text identifying the step.',
      },
      {
        name: 'Description',
        required: false,
        description: 'Supporting text below the label with additional context.',
      },
    ],
  },
  theming: {
    targets: [
      {
        className: 'astryx-stepper',
        visualProps: ['orientation', 'indicatorPosition'],
      },
      {className: 'astryx-stepper-frame'},
      {className: 'astryx-stepper-summary'},
      {className: 'astryx-step', visualProps: ['progress', 'status']},
      {className: 'astryx-step-indicator', visualProps: ['progress', 'status']},
      {
        className: 'astryx-step-label',
        visualProps: ['progress', 'status', 'disabled'],
      },
      {
        className: 'astryx-step-description',
        visualProps: ['progress', 'status'],
      },
      {className: 'astryx-step-bar'},
      {className: 'astryx-step-connector'},
    ],
    vars: [
      {
        name: '--step-connector-gap',
        description:
          'Gap a connector leaves where it meets the indicator, spent on the side facing it. Applies to the on-track layouts, whose connector is drawn as one segment either side of the node; 0 leaves the track running unbroken through it.',
        default: '0px',
      },
    ],
  },
  components: [
    {
      name: 'Stepper',
      displayName: 'Stepper',
      description:
        'Container component that manages step state and renders steps in horizontal or vertical orientation as an ordered list.',
      props: [
        {
          name: 'activeStep',
          type: 'number',
          description:
            'Zero-based index of the currently active step. Steps before this index are marked as completed.',
          required: true,
        },
        {
          name: 'children',
          type: 'ReactNode',
          description: 'Step elements to render in the stepper.',
          required: true,
        },
        {
          name: 'orientation',
          type: "'horizontal' | 'vertical'",
          description: 'Layout direction of the stepper.',
          default: "'horizontal'",
        },
        {
          name: 'onStepClick',
          type: '(index: number) => void',
          description:
            'Called when a step is clicked or a compact summary control is used. Enables non-linear navigation. Every step becomes a button until a horizontal Stepper collapses: enabled steps activate, and disabled steps stay focusable and are announced as unavailable but do not activate. When collapsed, navigation moves to summary controls that skip disabled steps.',
        },
        {
          name: 'label',
          type: 'string',
          description:
            'Accessible label describing the set of steps (applied to the ordered list). Defaults to a localized "Progress".',
          default: "'Progress' (localized)",
        },
        {
          name: 'density',
          type: "'compact' | 'balanced' | 'spacious'",
          description: 'Controls the padding of all steps.',
          default: "'balanced'",
        },
        {
          name: 'indicatorPosition',
          type: "'separated' | 'on-track'",
          description:
            'Position of step indicators relative to the connector track.',
          default: "'separated'",
        },
        {
          name: 'horizontalOptions',
          type: "{ minimumStepWidth: number; collapsedVariant: 'withLabelAndControls' | 'withLabel' | 'hiddenLabel' }",
          description:
            'Options for horizontal collapse. minimumStepWidth is the per-step threshold in pixels. collapsedVariant selects a label with controls, the label alone, or a bare progress track with no compact row. Controls appear only for withLabelAndControls when onStepClick is set, and every step keeps its accessible name.',
          default:
            "{ minimumStepWidth: 112, collapsedVariant: 'withLabelAndControls' }",
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for layout customization. Must be a stylex.create() value.',
        },
      ],
    },
    {
      // Name-only cross-reference. Step's full documentation (description,
      // props) lives in Step.doc.mjs as a `subComponentOf: 'Stepper'` doc, so
      // it is emitted once from there and skipped here to avoid double emission.
      name: 'Step',
    },
  ],
  // A Stepper draws nothing on its own — every bar, indicator, and label comes
  // from its Steps — so without seeded children the preview opens on an empty
  // stage and the orientation/density/indicator knobs have nothing to act on.
  // Three steps is the smallest set that shows all three progress states at
  // once: completed, current, and upcoming.
  playground: {
    defaults: {
      activeStep: 1,
      children: [
        {__element: 'Step', props: {step: 0, label: 'Cart'}},
        {__element: 'Step', props: {step: 1, label: 'Shipping'}},
        {__element: 'Step', props: {step: 2, label: 'Payment'}},
      ],
    },
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'numbered step sequence for multi-step workflows',
  usage: {
    description:
      'Steppers show progress through numbered steps. Use for forms, onboarding, checkout.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep step labels short. Horizontal collapses under horizontalOptions.minimumStepWidth per step (112px by default); vertical is for long descriptions.',
      },
      {
        guidance: true,
        description:
          'Choose horizontalOptions.collapsedVariant when the page owns its own Back/Continue, or both its step heading and navigation.',
      },
      {
        guidance: true,
        description: 'Provide onStepClick for non-linear workflows.',
      },
      {
        guidance: false,
        description: 'Use for fewer than 3 or more than 7 steps.',
      },
    ],
  },
  components: [
    {
      name: 'Stepper',
      displayName: 'Stepper',
      description:
        'container managing step state w/ horizontal/vertical layout',
      propDescriptions: {
        activeStep: 'zero-based active step index',
        children: 'Step elements',
        orientation: 'horizontal or vertical layout',
        onStepClick:
          'enables non-linear navigation; summary controls own compact navigation and skip disabled steps',
        label: 'ordered-list aria-label',
        density: 'padding of all steps',
        indicatorPosition: 'indicators separated from or on the track',
        horizontalOptions:
          'horizontal collapse threshold and label/control presentation',
        xstyle: 'StyleX layout customization',
      },
    },
    {
      name: 'Step',
      displayName: 'Step',
      description: 'individual step w/ progress bar, indicator, label',
      propDescriptions: {
        step: 'zero-based step index',
        label: 'step label text',
        description: 'supporting text below label',
        status: 'semantic color: accent/success/warning/error (color only)',
        indicator: "'auto' | 'number' | 'none' | custom node",
        isDisabled: 'disable interaction',
        isOptional: 'append Optional affordance',
        endContent: 'trailing content in label row',
        density: 'per-step padding override',
      },
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Stepper',
  displayName: 'Stepper',
  group: 'Stepper',
  usage: {
    description:
      '步骤器显示通过一系列逻辑编号步骤的进度。用于多步骤工作流程，如表单、入职流程或结账流程。',
    bestPractices: [
      {guidance: true, description: '保持步骤标签简短和描述性。'},
      {
        guidance: true,
        description:
          '当步骤有较长描述时使用垂直方向。水平步骤器会自行处理窄容器：当每个步骤的可用宽度不足 horizontalOptions.minimumStepWidth（默认为 112px）时，它会收起标签，并按 collapsedVariant 显示紧凑内容。',
      },
      {
        guidance: true,
        description:
          "当页面已有返回/继续控件时，将 horizontalOptions.collapsedVariant 设为 'withLabel'；当周围界面同时提供当前步骤标题和导航、只需要裸进度轨道时，将其设为 'hiddenLabel'。",
      },
      {guidance: true, description: '为非线性工作流程提供 onStepClick。'},
      {guidance: false, description: '少于3个步骤时使用步骤器。'},
      {guidance: false, description: '超过7个步骤时使用步骤器。'},
    ],
  },
  theming: {
    targets: [
      {
        className: 'astryx-stepper',
        visualProps: ['orientation', 'indicatorPosition'],
      },
      {className: 'astryx-stepper-frame'},
      {className: 'astryx-stepper-summary'},
      {className: 'astryx-step', visualProps: ['progress', 'status']},
      {className: 'astryx-step-indicator', visualProps: ['progress', 'status']},
      {
        className: 'astryx-step-label',
        visualProps: ['progress', 'status', 'disabled'],
      },
      {
        className: 'astryx-step-description',
        visualProps: ['progress', 'status'],
      },
      {className: 'astryx-step-bar'},
      {className: 'astryx-step-connector'},
    ],
    vars: [
      {
        name: '--step-connector-gap',
        description:
          '连接线与指示器相接处留出的间隙，落在朝向指示器的一侧。适用于 on-track 布局——其连接线由节点两侧各一段绘制；取 0 时轨道将不间断地穿过节点。',
        default: '0px',
      },
    ],
  },
  components: [
    {
      name: 'Stepper',
      displayName: 'Stepper',
      description: '容器组件，管理步骤状态并以水平或垂直方向渲染步骤。',
      props: [
        {
          name: 'activeStep',
          type: 'number',
          description: '当前活动步骤的从零开始的索引。',
          required: true,
        },
        {
          name: 'children',
          type: 'ReactNode',
          description: '要在步骤器中渲染的 Step 元素。',
          required: true,
        },
        {
          name: 'orientation',
          type: "'horizontal' | 'vertical'",
          description: '步骤器的布局方向。',
          default: "'horizontal'",
        },
        {
          name: 'onStepClick',
          type: '(index: number) => void',
          description:
            '点击步骤或紧凑摘要控件时调用。启用非线性导航；水平步骤器折叠后，导航转移到会跳过已禁用步骤的摘要控件。',
        },
        {
          name: 'label',
          type: 'string',
          description: '有序列表的无障碍标签。',
          default: "'Progress'（本地化）",
        },
        {
          name: 'density',
          type: "'compact' | 'balanced' | 'spacious'",
          description: '控制所有步骤的内边距。',
          default: "'balanced'",
        },
        {
          name: 'indicatorPosition',
          type: "'separated' | 'on-track'",
          description: '步骤指示器相对于连接轨道的位置。',
          default: "'separated'",
        },
        {
          name: 'horizontalOptions',
          type: "{ minimumStepWidth: number; collapsedVariant: 'withLabelAndControls' | 'withLabel' | 'hiddenLabel' }",
          description:
            '水平布局的收起选项。minimumStepWidth 是每个步骤的像素阈值。collapsedVariant 可选择显示标签和控件、仅显示标签，或只显示裸进度轨道而不显示紧凑行。仅当 collapsedVariant 为 withLabelAndControls 且设置 onStepClick 时显示控件，每个步骤始终保留无障碍名称。',
          default:
            "{ minimumStepWidth: 112, collapsedVariant: 'withLabelAndControls' }",
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description: '用于布局自定义的 StyleX 样式。',
        },
      ],
    },
    {
      name: 'Step',
      displayName: 'Step',
      description: '步骤器中的单个步骤。渲染进度条、指示器和带可选描述的标签。',
      props: [
        {
          name: 'step',
          type: 'number',
          description: '此步骤的从零开始的索引。',
          required: true,
        },
        {
          name: 'label',
          type: 'string',
          description: '步骤标签文本。',
          required: true,
        },
        {
          name: 'description',
          type: 'string',
          description: '标签下方的可选描述。',
        },
        {
          name: 'status',
          type: "'accent' | 'success' | 'warning' | 'error'",
          description: '步骤的语义颜色，仅控制颜色。',
        },
        {
          name: 'indicator',
          type: "'auto' | 'number' | 'none' | ReactNode",
          description: '指示器显示内容。',
          default: "'auto'",
        },
        {
          name: 'isDisabled',
          type: 'boolean',
          description: '禁用交互并使步骤指示器和标签变暗。',
          default: 'false',
        },
        {
          name: 'isOptional',
          type: 'boolean',
          description: '标记步骤为可选。',
          default: 'false',
        },
        {
          name: 'endContent',
          type: 'ReactNode',
          description: '标签行末尾的尾随内容。',
        },
        {
          name: 'density',
          type: "'compact' | 'balanced' | 'spacious'",
          description: '步骤的内边距覆盖。',
        },
      ],
    },
  ],
};
