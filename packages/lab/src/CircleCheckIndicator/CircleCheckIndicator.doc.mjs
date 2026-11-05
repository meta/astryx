// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'CircleCheckIndicator',
  displayName: 'Circle Check Indicator',
  category: 'Form Controls',
  keywords: [
    'indicator',
    'checkbox',
    'circle',
    'check',
    'multiselect',
    'selection',
    'edit mode',
    'ios',
    'mark',
  ],
  description:
    'The iOS multiple-selection mark: an empty circle, a filled circle with a checkmark, or a filled circle with a bar for the partial state. A checkbox-family indicator: map it to `checkbox` with defineTheme({indicators}) and every CheckboxInput and CheckboxList draws it. Decorative (aria-hidden); the owning control keeps the input, role, accessible name, focus, and keyboard behavior. Its colors fade over the theme duration on every pointer and change at once under Reduce Motion.',
  props: [
    {
      name: 'state',
      type: "'unchecked' | 'checked' | 'indeterminate'",
      description:
        'Which state to draw. The unchecked circle is an empty ring, not nothing.',
      required: true,
    },
    {
      name: 'size',
      type: "'sm' | 'md'",
      description:
        'Control size. The circle draws at UIKit’s diameters, 18px (sm) or 21.8px (md), centred in the host’s 20px or 24px slot.',
      default: "'md'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Draws the disabled look. Purely visual; the owning control keeps the disabled semantics.',
      default: 'false',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'Content drawn inside the circle instead of the mark, e.g. the loading Spinner CheckboxInput passes while a change is pending.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-circle-check-indicator',
        visualProps: ['size', 'checked', 'disabled'],
      },
      {className: 'astryx-circle-check-indicator-check', visualProps: ['size']},
      {className: 'astryx-circle-check-indicator-dash', visualProps: ['size']},
    ],
  },
  usage: {
    description:
      'Use it where iOS shows a selection circle: the rows of a list in edit mode, and multiple-choice sets whose product follows iOS. Map it to `checkbox` in a theme to change every checkbox at once, or render it in a row you lay out yourself.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Map it with defineTheme({indicators: {checkbox: CircleCheckIndicator}}) so CheckboxInput and CheckboxList keep their semantics and focus ring.',
      },
      {
        guidance: true,
        description:
          'Map it only in a theme meant for iOS. It draws the circle on every platform, and Android marks multiple choice with a square box.',
      },
      {
        guidance: true,
        description:
          'Keep a visible label beside it; the circle is decorative and announces nothing.',
      },
      {
        guidance: false,
        description:
          'Use it for a single choice; a radio, or a checkmark on the chosen row, says "one of these".',
      },
      {
        guidance: false,
        description:
          'Give it a role, a label or a tab stop; the owning control has those.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'CircleCheckIndicator',
  displayName: 'Circle Check Indicator',
  description:
    'iOS 的多选标记：空心圆、带对勾的实心圆，或表示部分选中的带横线实心圆。属于复选框家族的指示器：通过 defineTheme({indicators}) 映射到 `checkbox` 后，所有 CheckboxInput 和 CheckboxList 都会绘制它。仅作装饰（aria-hidden）；输入、角色、无障碍名称、焦点和键盘行为由所属控件负责。颜色在任何指针下都按主题时长渐变，开启减弱动态效果时立即切换。',
  props: [
    {
      name: 'state',
      type: "'unchecked' | 'checked' | 'indeterminate'",
      description: '要绘制的状态。未选中时是一个空心圆环，而不是什么都不画。',
      required: true,
    },
    {
      name: 'size',
      type: "'sm' | 'md'",
      description:
        '控件尺寸。圆圈按 UIKit 的直径绘制：sm 为 18px，md 为 21.8px，居中于宿主 20px 或 24px 的位置。',
      default: "'md'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '绘制禁用外观。仅影响视觉；禁用语义由所属控件负责。',
      default: 'false',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        '绘制在圆内、替代标记的内容，例如 CheckboxInput 在变更进行中传入的加载 Spinner。',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于布局自定义的 StyleX 样式（外边距、定位、尺寸）。必须是 stylex.create() 的值，而非内联样式对象如 style={{}}。',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-circle-check-indicator',
        visualProps: ['size', 'checked', 'disabled'],
      },
      {className: 'astryx-circle-check-indicator-check', visualProps: ['size']},
      {className: 'astryx-circle-check-indicator-dash', visualProps: ['size']},
    ],
  },
  usage: {
    description:
      '用在 iOS 显示选择圆圈的地方：编辑模式下的列表行，以及遵循 iOS 的多选集合。在主题中将其映射到 `checkbox` 可一次替换所有复选框，也可以在自行布局的行中直接渲染。',
    bestPractices: [
      {
        guidance: true,
        description:
          '使用 defineTheme({indicators: {checkbox: CircleCheckIndicator}}) 映射，使 CheckboxInput 和 CheckboxList 保留其语义和焦点环。',
      },
      {
        guidance: true,
        description:
          '只在面向 iOS 的主题中映射它。它在所有平台上都绘制圆圈，而 Android 用方形复选框表示多选。',
      },
      {
        guidance: true,
        description: '在旁边保留可见标签；圆圈仅作装饰，不会被朗读。',
      },
      {
        guidance: false,
        description: '用于单选；单选按钮或所选行上的对勾表示“其中之一”。',
      },
      {
        guidance: false,
        description: '为其添加角色、标签或 Tab 停靠点；这些属于所属控件。',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'iOS multiselect circle: empty ring / filled circle + check / filled circle + bar. Checkbox-family indicator; map to `checkbox` via defineTheme({indicators}).',
  usage: {
    description:
      'For iOS-style selection circles: edit-mode list rows and multiple-choice sets. Map it to `checkbox` in a theme, or render it in your own row.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Map via defineTheme({indicators: {checkbox: CircleCheckIndicator}}); hosts keep semantics + focus ring.',
      },
      {
        guidance: true,
        description: 'Keep a visible label; the circle is decorative.',
      },
      {
        guidance: false,
        description:
          'Use for a single choice (radio or row checkmark instead).',
      },
      {
        guidance: false,
        description:
          'Add role, label or tabIndex; the owning control has them.',
      },
    ],
  },
  propDescriptions: {
    state:
      "'unchecked' (empty ring) | 'checked' (check) | 'indeterminate' (bar).",
    size: "'sm' an 18px circle | 'md' a 21.8px circle (in a 20px or 24px slot).",
    isDisabled: 'Disabled look only; owner keeps semantics.',
    children: 'Drawn inside the circle instead of the mark (e.g. Spinner).',
    xstyle: 'StyleX layout styles; must be stylex.create() value.',
  },
};
