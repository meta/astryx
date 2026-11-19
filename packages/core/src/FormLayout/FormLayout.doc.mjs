// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'FormLayout',
  displayName: 'Form Layout',
  group: 'Layout',
  category: 'Layout',
  keywords: [
    'formlayout',
    'form',
    'fieldset',
    'formgroup',
    'formcontainer',
    'fields',
    'vertical',
    'horizontal',
  ],
  props: [
    {
      name: 'direction',
      type: "'vertical' | 'horizontal' | 'horizontal-labels'",
      description:
        'Controls field arrangement. Vertical stacks top-to-bottom, horizontal uses one fractional grid track per field in logical inline order, and horizontal-labels uses CSS Grid with labels beside inputs on the inline-start side (collapsing to vertical when the viewport is <=480px).',
      default: "'vertical'",
    },
    {
      name: 'defaultOptionality',
      type: "'optional' | 'required'",
      description:
        'The state the form treats as its default, so only the exception shows an optional/required indicator. With "optional", only fields marked isRequired show an indicator; with "required", only fields marked isOptional do. A field that restates the default shows nothing. Under "required" the unmarked fields also expose aria-required so screen readers match the visual default; aria-required only, never the native required attribute. CheckboxInput, Switch and CheckboxList are the exception: an unchecked box, an off switch or an empty group is an answer, so they take no required state from the default. A CheckboxInput or Switch is required only through its own isRequired. Leave unset for today\'s per-field behavior.',
    },
    {
      name: 'defaultEntryErrorBehavior',
      type: "'complete' | 'blur-or-enter'",
      description:
        "When DateInput, DateTimeInput, TimeInput, and NumberInput fields in the layout show their own entry errors: a date, time, or number the field rejects. It sets when the error shows, not when validation runs, so it is not React Aria's validationBehavior (native versus ARIA validation), and it never changes a caller status. 'complete' shows each error at the field's own moment. 'blur-or-enter' holds the message, aria-invalid, the invalid styling, the announcement, and the onEntryErrorChange report until Enter or blur; an edit that makes the entry valid or empty still clears the error at once. NumberInput shows its errors only at Enter or blur under both values. A field's own entryErrorBehavior wins. A nested FormLayout replaces the default for its fields, and unset there means 'complete'. Content in a layer, such as a Dialog opened from the form, starts without it. Leave unset for 'complete'.",
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'Form fields to arrange. Accepts Astryx inputs (TextInput, Selector, etc.) and Field-wrapped custom controls.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
  ],
  theming: {
    targets: [{className: 'astryx-form-layout', visualProps: ['direction']}],
  },
  usage: {
    description:
      'A layout container that arranges form fields with consistent spacing and direction. FormLayout handles where fields go, not state or submission. Wrap it in a native <form> for that; <form> has no Astryx replacement, so it stays a plain element. Supports vertical (default), horizontal, and horizontal-labels directions, and can be nested to mix them.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Stack fields vertically for most forms. It's the easiest to scan top to bottom.",
      },
      {
        guidance: true,
        description:
          'Nest a horizontal FormLayout inside a vertical one when fields naturally pair up, like First Name + Last Name or City + State + ZIP.',
      },
      {
        guidance: true,
        description:
          'Use horizontal-labels for settings pages where labels sit beside their inputs.',
      },
      {
        guidance: false,
        description:
          "Use FormLayout for form state or submission. It's just layout. Wrap it in a native <form> for that.",
      },
      {
        guidance: false,
        description:
          'Put unrelated fields side by side in a horizontal layout. Save it for fields that belong together.',
      },
      {
        guidance: false,
        description:
          'Nest horizontal-labels inside another FormLayout. It uses CSS Grid and needs to be the outermost container.',
      },
    ],
    anatomy: [
      {
        name: 'Layout container',
        required: true,
        description:
          'Owns field arrangement, spacing, direction, and form-level optionality.',
      },
      {
        name: 'Form title',
        required: false,
        description: 'Heading that describes the purpose of the form.',
      },
      {
        name: 'Fields',
        required: true,
        description: 'Input components with labels for collecting user data.',
      },
      {
        name: 'Footer',
        required: false,
        description: 'Contains confirmation buttons such as Submit or Cancel.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'FormLayout',
  displayName: 'Form Layout',
  props: [
    {
      name: 'direction',
      type: "'vertical' | 'horizontal' | 'horizontal-labels'",
      description:
        '控制字段排列方式。vertical 从上到下堆叠；horizontal 为每个字段使用一个 1fr 网格轨道，并按逻辑行内方向排列；horizontal-labels 使用 CSS Grid，将标签放在输入框的行内起始侧（当视口宽度 <=480px 时折叠为垂直布局）。',
      default: "'vertical'",
    },
    {
      name: 'defaultOptionality',
      type: "'optional' | 'required'",
      description:
        '表单视为默认的状态，因此仅例外字段显示可选/必填指示器。设为 "optional" 时，仅标记 isRequired 的字段显示指示器；设为 "required" 时，仅标记 isOptional 的字段显示。与默认一致的字段不显示任何内容。设为 "required" 时，未标记的字段仍会暴露 aria-required，使屏幕阅读器与视觉默认一致——仅作用于 aria-required，不改变原生 required 属性。CheckboxInput、Switch 和 CheckboxList 例外：未勾选的复选框、关闭的开关或空的复选框组本身就是一个回答，因此默认值不会赋予它们必填状态。CheckboxInput 或 Switch 只有通过自身的 isRequired 才会成为必填。不设置则保持当前逐字段行为。',
    },
    {
      name: 'defaultEntryErrorBehavior',
      type: "'complete' | 'blur-or-enter'",
      description:
        "布局中的 DateInput、DateTimeInput、TimeInput 和 NumberInput 字段何时显示自身的输入错误：即字段拒绝的日期、时间或数字。它设定错误何时显示，而不是何时校验，因此不同于 React Aria 的 validationBehavior（原生校验与 ARIA 校验之分），也不会改变调用方的 status。'complete' 在每个字段自身的时机显示错误。'blur-or-enter' 将消息、aria-invalid、无效样式、播报和 onEntryErrorChange 报告保留到按 Enter 或失焦；使输入有效或为空的编辑仍会立即清除错误。NumberInput 在两种取值下都只在按 Enter 或失焦时显示错误。字段自身的 entryErrorBehavior 优先。嵌套的 FormLayout 会为其字段替换该默认值，未设置时即为 'complete'。图层中的内容（例如从表单打开的 Dialog）不继承该默认值。不设置即为 'complete'。",
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        '要排列的表单字段。接受 Astryx 输入组件（TextInput、Selector 等）和 Field 包装的自定义控件。',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于布局自定义（外边距、定位、尺寸）的 StyleX 样式。必须是 stylex.create() 的值，而非内联样式对象如 style={{}}。',
    },
  ],
  theming: {
    targets: [{className: 'astryx-form-layout', visualProps: ['direction']}],
  },
  usage: {
    description:
      'A layout container that arranges form fields with consistent spacing and direction. FormLayout handles where fields go, not state or submission. Wrap it in a native <form> for that; <form> has no Astryx replacement, so it stays a plain element. Supports vertical (default), horizontal, and horizontal-labels directions, and can be nested to mix them.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Stack fields vertically for most forms. It's the easiest to scan top to bottom.",
      },
      {
        guidance: true,
        description:
          'Nest a horizontal FormLayout inside a vertical one when fields naturally pair up, like First Name + Last Name or City + State + ZIP.',
      },
      {
        guidance: true,
        description:
          'Use horizontal-labels for settings pages where labels sit beside their inputs.',
      },
      {
        guidance: false,
        description:
          "Use FormLayout for form state or submission. It's just layout. Wrap it in a native <form> for that.",
      },
      {
        guidance: false,
        description:
          'Put unrelated fields side by side in a horizontal layout. Save it for fields that belong together.',
      },
      {
        guidance: false,
        description:
          'Nest horizontal-labels inside another FormLayout. It uses CSS Grid and needs to be the outermost container.',
      },
    ],
    anatomy: [
      {
        name: 'Layout container',
        required: true,
        description:
          'Owns field arrangement, spacing, direction, and form-level optionality.',
      },
      {
        name: 'Form title',
        required: false,
        description: 'Heading that describes the purpose of the form.',
      },
      {
        name: 'Fields',
        required: true,
        description: 'Input components with labels for collecting user data.',
      },
      {
        name: 'Footer',
        required: false,
        description: 'Contains confirmation buttons such as Submit or Cancel.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Layout container for form fields w/ consistent spacing + direction.',
  usage: {
    description:
      'A layout container that arranges form fields with consistent spacing and direction. FormLayout handles where fields go, not state or submission. Wrap it in a native <form> for that; <form> has no Astryx replacement, so it stays a plain element. Supports vertical (default), horizontal, and horizontal-labels directions, and can be nested to mix them.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Stack fields vertically for most forms. It's the easiest to scan top to bottom.",
      },
      {
        guidance: true,
        description:
          'Nest a horizontal FormLayout inside a vertical one when fields naturally pair up, like First Name + Last Name or City + State + ZIP.',
      },
      {
        guidance: true,
        description:
          'Use horizontal-labels for settings pages where labels sit beside their inputs.',
      },
      {
        guidance: false,
        description:
          "Use FormLayout for form state or submission. It's just layout. Wrap it in a native <form> for that.",
      },
      {
        guidance: false,
        description:
          'Put unrelated fields side by side in a horizontal layout. Save it for fields that belong together.',
      },
      {
        guidance: false,
        description:
          'Nest horizontal-labels inside another FormLayout. It uses CSS Grid and needs to be the outermost container.',
      },
    ],
    anatomy: [
      {
        name: 'Layout container',
        required: true,
        description:
          'Owns field arrangement, spacing, direction, and form-level optionality.',
      },
      {
        name: 'Form title',
        required: false,
        description: 'Heading that describes the purpose of the form.',
      },
      {
        name: 'Fields',
        required: true,
        description: 'Input components with labels for collecting user data.',
      },
      {
        name: 'Footer',
        required: false,
        description: 'Contains confirmation buttons such as Submit or Cancel.',
      },
    ],
  },
  propDescriptions: {
    direction:
      'Field arrangement. Vertical stacks top-to-bottom; horizontal uses one fractional grid track per field in logical inline order; horizontal-labels places labels on the inline-start side and collapses when the viewport is <=480px.',
    defaultOptionality:
      'State the form treats as default, so only the exception is marked. "optional" → only isRequired fields show an indicator; "required" → only isOptional fields do. Under "required" unmarked fields also expose aria-required (aria only, not native required), except CheckboxInput, Switch and CheckboxList, which take no required state from it (CheckboxInput and Switch are required only through their own isRequired). Unset = per-field behavior.',
    defaultEntryErrorBehavior:
      "'complete'|'blur-or-enter': when DateInput/DateTimeInput/TimeInput/NumberInput fields show their own rejections (not when validation runs; not React Aria validationBehavior; never changes status). blur-or-enter: message, aria-invalid, styling, announcement, onEntryErrorChange report wait for Enter/blur; valid or empty entry clears at once. NumberInput waits under both. Field prop wins; nested FormLayout replaces it (unset = complete); layers start without it. Unset = complete.",
    children:
      'Form fields to arrange. Accepts Astryx inputs + Field-wrapped custom controls.',
    xstyle:
      'StyleX styles for layout customization. Must be stylex.create() value.',
  },
};
