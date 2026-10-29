// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'FileInput',
  displayName: 'File Input',
  category: 'Form Controls',
  keywords: ["fileinput","file","upload","drag","drop","dropzone","attachment","browse"],
  props: [
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible label for the file input.',
      required: true,
    },
    {
      name: 'value',
      type: 'File | File[] | null',
      description: 'Currently selected file(s). Controlled component.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(files: File | File[] | null) => void',
      description: 'Callback fired when files are selected or removed.',
      required: true,
    },
    {
      name: 'changeAction',
      type: '(files: File | File[] | null) => Promise<void>',
      description:
        'Async change action (React 19 transitions pattern). Use for immediate upload on file selection.',
    },
    {
      name: 'accept',
      type: 'string',
      description:
        'Accepted file types. Uses the HTML accept attribute format (e.g. "image/*", ".pdf,.doc").',
    },
    {
      name: 'isMultiple',
      type: 'boolean',
      description: 'Whether multiple files can be selected. When true, value and onChange use File[] instead of File.',
      default: 'false',
    },
    {
      name: 'maxSize',
      type: 'number',
      description: 'Maximum file size in bytes. Files exceeding this are rejected with an error status.',
    },
    {
      name: 'maxFiles',
      type: 'number',
      description: 'Maximum number of files (only applies when isMultiple is true).',
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description:
        'Visually hides the label while keeping it accessible to screen readers.',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: 'Description text displayed between the label and input.',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description:
        'Displays an "Optional" indicator next to the label. Mutually exclusive with isRequired.',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description:
        'Displays a "Required" indicator next to the label and adds a screen-reader-only "Required" description to the trigger (assistive tech does not reliably announce aria-required on the trigger). Mutually exclusive with isOptional.',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Disables the input, preventing interaction and dimming the element.',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the trigger focusable via aria-disabled (opening the file picker stays blocked). Use this instead of wrapping a disabled FileInput in Tooltip; disabled controls swallow the hover events an external Tooltip needs.',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description:
        'Puts the input in a loading state, showing a spinner and setting aria-busy.',
      default: 'false',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: 'Placeholder text shown when no file is selected.',
      default: '"Choose file" or "Choose files"',
    },
    {
      name: 'mode',
      type: "'input' | 'dropzone'",
      description: "Visual mode. 'input' is a compact inline style; 'dropzone' is a larger area with drag-and-drop support.",
      default: "'input'",
    },
    {
      name: 'status',
      type: "{type: 'error' | 'warning' | 'success', message?: string}",
      description:
        'Validation status: applies a colored border. If message is provided, displays a floating message below the input. Error type also sets aria-invalid.',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description:
        'How the status message is placed relative to the input. attached overlaps directly below the input (bordered treatment); detached floats below as a separate element with spacing; tooltip hides the message box and surfaces it in a tooltip on the status icon.',
      default: "'attached'",
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description:
        'Tooltip text displayed in an info icon at the end of the label.',
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
      description: 'Class name for the field container. Same targeting as `containerXstyle`.',
    },
    {
      name: 'containerStyle',
      type: 'CSSProperties',
      description: 'Inline styles for the field container. Same targeting as `containerXstyle`.',
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
      {className: 'astryx-file-input', visualProps: ['mode', 'status']},
      {className: 'astryx-file-input-icon', visualProps: ['mode']},
    ],
  },
  usage: {
    description:
      'FileInput provides file upload with optional drag-and-drop support. Use it for single or multiple file selection with built-in validation for file type, size, and count. Pair with validation status for upload feedback.',
    bestPractices: [
      {guidance: true, description: 'Always specify an accept prop to guide users toward valid file types.'},
      {guidance: true, description: 'Use maxSize and maxFiles to prevent oversized uploads; the component handles validation and error display automatically.'},
      {guidance: true, description: 'Add a description to communicate constraints like file size limits or accepted formats.'},
      {guidance: true, description: 'Use changeAction for immediate upload workflows that benefit from optimistic UI.'},
      {guidance: false, description: "Don't use FileInput for directory or folder uploads; that is not supported in v1."},
      {guidance: false, description: "Don't avoid dropzone mode unless space is constrained; drag-and-drop is the expected interaction for file uploads."},
      {guidance: false, description: "Don't wrap a disabled FileInput in Tooltip to explain why it's disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead."},
    ],
    anatomy: [
      {name: 'Label', required: true, description: 'Text that identifies the field. Always rendered for accessibility even when visually hidden.'},
      {name: 'Description', required: false, description: 'Helper text between the label and the drop zone explaining accepted formats or size limits.'},
      {name: 'Drop zone', required: true, description: 'The clickable area for file selection. In dropzone mode, also accepts dragged files.'},
      {name: 'Upload icon', required: false, description: 'An upload-to-tray icon in the drop zone hinting at the upload action.'},
      {name: 'Placeholder', required: false, description: 'Hint text shown when no files are selected.'},
      {name: 'File name display', required: false, description: 'Shows the name(s) of selected files.'},
      {name: 'Clear button', required: false, description: 'A close button that removes selected files and returns focus to the file-selection trigger.'},
      {name: 'Spinner', required: false, description: 'Loading indicator that appears during async upload actions.'},
      {name: 'Status message', required: false, description: 'Validation feedback showing error, warning, or success with a message.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'FileInput',
  displayName: 'File Input',
  props: [
    {
      name: 'label',
      type: 'string',
      description: '文件输入框的无障碍标签。',
      required: true,
    },
    {
      name: 'value',
      type: 'File | File[] | null',
      description: '当前选中的文件。受控组件。',
      required: true,
    },
    {
      name: 'onChange',
      type: '(files: File | File[] | null) => void',
      description: '文件选择或移除时触发的回调。',
      required: true,
    },
    {
      name: 'accept',
      type: 'string',
      description: '接受的文件类型。使用 HTML accept 属性格式。',
    },
    {
      name: 'isMultiple',
      type: 'boolean',
      description: '是否可以选择多个文件。',
      default: 'false',
    },
    {
      name: 'maxSize',
      type: 'number',
      description: '最大文件大小（字节）。超过此限制的文件将被拒绝。',
    },
    {
      name: 'maxFiles',
      type: 'number',
      description: '最大文件数（仅在 isMultiple 为 true 时适用）。',
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: '视觉上隐藏标签，保持屏幕阅读器可访问。',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: '显示在标签和输入框之间的描述文本。',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '禁用输入框，阻止交互并使元素变暗。',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        '说明输入框被禁用的原因。与 isDisabled 一起使用时，在悬停/键盘聚焦时显示工具提示，并通过 aria-disabled 保持触发器可聚焦（打开文件选择器仍被阻止）。请使用此属性，而不是用 Tooltip 包裹已禁用的 FileInput。',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description: '加载状态，显示旋转器并设置 aria-busy。',
      default: 'false',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: '未选择文件时显示的占位符文本。',
    },
    {
      name: 'mode',
      type: "'input' | 'dropzone'",
      description: "视觉模式。'input' 为紧凑内联样式；'dropzone' 为支持拖放的较大区域。",
      default: "'input'",
    },
    {
      name: 'status',
      type: "{type: 'error' | 'warning' | 'success', message?: string}",
      description: '验证状态。',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description:
        '状态消息相对于输入框的放置方式。attached 直接叠加在输入框下方（带边框处理）；detached 作为独立元素浮于下方并留有间距；tooltip 隐藏消息框，并在状态图标上以提示气泡形式显示。',
      default: "'attached'",
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
      {className: 'astryx-file-input', visualProps: ['mode', 'status']},
      {className: 'astryx-file-input-icon', visualProps: ['mode']},
    ],
  },
  usage: {
    description:
      'FileInput provides file upload with optional drag-and-drop support. Use it for single or multiple file selection with built-in validation for file type, size, and count. Pair with validation status for upload feedback.',
    bestPractices: [
      {guidance: true, description: 'Always specify an accept prop to guide users toward valid file types.'},
      {guidance: true, description: 'Use maxSize and maxFiles to prevent oversized uploads.'},
      {guidance: true, description: 'Add a description to communicate constraints.'},
      {guidance: false, description: "Don't use FileInput for directory uploads."},
      {guidance: false, description: "Don't use mode='input' unless space is constrained; dropzone mode provides a better experience."},
      {guidance: false, description: "Don't wrap a disabled FileInput in Tooltip to explain the disabled state; use the disabledMessage prop instead."},
    ],
    anatomy: [
      {name: 'Label', required: true, description: 'Text identifying the field.'},
      {name: 'Drop zone', required: true, description: 'Clickable area for file selection.'},
      {name: 'Placeholder', required: false, description: 'Hint text when no files selected.'},
      {name: 'File name display', required: false, description: 'Shows selected file names.'},
      {name: 'Clear button', required: false, description: 'Removes selected files.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'File input w/ input/dropzone modes, validation, label, description, status.',
  usage: {
    description:
      'FileInput provides file upload with optional drag-and-drop support. Use it for single or multiple file selection with built-in validation for file type, size, and count.',
    bestPractices: [
      {guidance: true, description: 'Always specify an accept prop to guide users toward valid file types.'},
      {guidance: true, description: 'Use maxSize and maxFiles to prevent oversized uploads.'},
      {guidance: true, description: 'Add a description to communicate constraints.'},
      {guidance: true, description: 'Use changeAction for immediate upload workflows that benefit from optimistic UI.'},
      {guidance: false, description: "Don't use FileInput for directory uploads."},
      {guidance: false, description: "Don't use mode='input' unless space is constrained; dropzone mode provides a better experience."},
      {guidance: false, description: "Don't wrap a disabled FileInput in Tooltip to explain the disabled state; use the disabledMessage prop instead."},
    ],
    anatomy: [
      {name: 'Label', required: true, description: 'Text identifying the field.'},
      {name: 'Drop zone', required: true, description: 'Clickable area for file selection.'},
      {name: 'Placeholder', required: false, description: 'Hint text when no files selected.'},
      {name: 'File name display', required: false, description: 'Shows selected file names.'},
      {name: 'Clear button', required: false, description: 'Removes selected files.'},
    ],
  },
  propDescriptions: {
    containerXstyle: 'StyleX styles for the field container; no effect in InputGroup or horizontal-labels FormLayout. No root xstyle/className/style.',
    containerClassName: 'Class name for the field container.',
    containerStyle: 'Inline styles for the field container.',
    controlXstyle: 'StyleX styles for the visual control box (border, background, icons); not the native input.',
    controlClassName: 'Class name for the visual control box.',
    controlStyle: 'Inline styles for the visual control box.',
    label: 'Accessible label for the file input.',
    value: 'Currently selected file(s). Controlled.',
    onChange: 'Fired when files are selected or removed.',
    changeAction: 'Async action after onChange. For immediate upload.',
    accept: 'Accepted file types (HTML accept format).',
    isMultiple: 'Allow multiple file selection.',
    maxSize: 'Max file size in bytes. Rejects oversized files.',
    maxFiles: 'Max file count (isMultiple only).',
    isLabelHidden: 'Visually hides label; keeps screen reader access.',
    description: 'Description text between label+input.',
    isOptional: 'Shows "Optional" indicator.',
    isRequired: 'Shows "Required" indicator+SR-only trigger description.',
    isDisabled: 'Disables input, prevents interaction.',
    disabledMessage:
      'Explains why input is disabled. With isDisabled, shows tooltip on hover/focus + keeps trigger focusable via aria-disabled (opening picker stays blocked). Use instead of wrapping a disabled FileInput in Tooltip.',
    isLoading: 'Loading state w/ spinner+aria-busy.',
    placeholder: 'Placeholder when no files selected.',
    mode: "Visual mode: 'input' (compact) or 'dropzone' (drag-and-drop).",
    status: 'Validation status; colored border. Message floats below.',
    statusVariant: 'How status message is placed: attached overlaps below input; detached floats below w/ spacing; tooltip hides the box and shows it on the status icon.',
    labelTooltip: 'Tooltip in info icon at label end.',
  },
};
