// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatToolCalls',
  displayName: 'Chat Tool Calls',
  group: 'Chat',
  category: 'Chat',

  keywords: ['tool', 'function', 'call', 'invocation', 'llm', 'agent', 'bash', 'edit', 'read', 'search', 'status', 'running', 'error', 'complete', 'diff', 'stats'],

  usage: {
    description:
      'ChatToolCalls displays tool or function call invocations from an LLM response. Pass an array of calls and the component handles the rest: a single call renders inline, while multiple calls collapse into a summary with the latest call visible at the surface. Use it anywhere an AI agent shows what actions it took.',
    bestPractices: [
      {guidance: true, description: 'Include a target string on every call so the user can see what the tool acted on: a file path, a shell command, or a search query.'},
      {guidance: true, description: 'Show a duration on completed calls so users can judge which tools are slow and understand why a response took time.'},
      {guidance: true, description: 'Provide a group label when the automatic count does not explain what the calls represent.'},
      {guidance: true, description: 'Provide resultDetail with a code block for calls that produce output (diffs for edits, terminal output for shell commands) so users can inspect results inline.'},
      {guidance: true, description: 'Set a unique key on each call item when streaming so React can animate additions without re-mounting completed rows.'},
      {guidance: false, description: "Don't omit the status field. Without it the call defaults to complete, which is misleading for calls that are still running or have failed."},
      {guidance: false, description: "Don't display tool calls outside a chat message context; they are designed to sit inside an assistant message, not as standalone UI."},
      {guidance: false, description: "Don't use custom wrappers around individual calls; the component handles single vs. grouped layout automatically based on the array length."},
    ],
    anatomy: [
      {name: 'Status icon', required: true, description: 'A themed semantic success/error icon, or a spinner while the call is pending or running.'},
      {name: 'Tool name', required: true, description: 'The function or tool name displayed in monospace: bash, edit, read, web_search, etc.'},
      {name: 'Node badge', required: false, description: 'A neutral pill badge showing which sandbox or environment ran the tool, like cli:remote-server or workspace.'},
      {name: 'Target label', required: false, description: 'The target of the action (a file path, command, or search query) shown after the tool name.'},
      {name: 'Diff stats', required: false, description: 'Green additions and red deletions counts for edit operations, displayed inline after the target.'},
      {name: 'Duration', required: false, description: 'Execution time shown on the trailing edge for completed calls.'},
      {name: 'Group header', required: false, description: 'A wrench icon with a call count, shown when multiple calls are present. Clicking toggles between the summary and the full list.'},
    ],
  },

  playground: {
    defaults: {
      calls: [
        {name: 'read_file', status: 'complete', target: 'Button.tsx', duration: '120ms'},
        {name: 'run_tests', status: 'complete', target: 'yarn test', duration: '1.2s', additions: 12, deletions: 3},
      ],
    },
  },

  props: [
    {
      name: 'calls',
      type: 'ChatToolCallItem[]',
      description:
        "Array of tool call data. Each item has name, status, target, duration, node, additions, deletions, stats, errorMessage, resultDetail, key, and data. status is one of 'pending', 'running', 'complete', or 'error' (defaults to 'complete').",
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Custom summary label shown for an expanded group. The translated call count is used when omitted.',
    },
    {
      name: 'isExpanded',
      type: 'boolean',
      description: 'Controlled expanded state for the group.',
    },
    {
      name: 'defaultIsExpanded',
      type: 'boolean',
      description:
        'Default expanded state when uncontrolled.',
      default: 'false',
    },
    {
      name: 'onExpandedChange',
      type: '(isExpanded: boolean) => void',
      description: 'Callback fired when the expanded state changes.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'ChatToolCalls displays tool or function call invocations from an LLM response. Pass an array of calls and the component handles the rest: a single call renders inline, while multiple calls collapse into a summary with the latest call visible at the surface. Use it anywhere an AI agent shows what actions it took.',
    bestPractices: [
      {guidance: true, description: 'Include a target string on every call so the user can see what the tool acted on: a file path, a shell command, or a search query.'},
      {guidance: true, description: 'Show a duration on completed calls so users can judge which tools are slow and understand why a response took time.'},
      {guidance: true, description: 'Provide a group label when the automatic count does not explain what the calls represent.'},
      {guidance: true, description: 'Provide resultDetail with a code block for calls that produce output (diffs for edits, terminal output for shell commands) so users can inspect results inline.'},
      {guidance: true, description: 'Set a unique key on each call item when streaming so React can animate additions without re-mounting completed rows.'},
      {guidance: false, description: "Don't omit the status field. Without it the call defaults to complete, which is misleading for calls that are still running or have failed."},
      {guidance: false, description: "Don't display tool calls outside a chat message context; they are designed to sit inside an assistant message, not as standalone UI."},
      {guidance: false, description: "Don't use custom wrappers around individual calls; the component handles single vs. grouped layout automatically based on the array length."},
    ],
  },
  propDescriptions: {
    calls: '工具调用数据数组。每项包含 name、status、target、duration、node、additions、deletions、stats、resultDetail。',
    label: '组的自定义摘要标签。省略时从数量自动生成。',
    isExpanded: '受控展开状态。',
    defaultIsExpanded: '默认展开状态（非受控）。',
    onExpandedChange: '展开状态变更时的回调。',
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'tool/function call display from LLM response; single=inline, multiple=collapsible summary w/ latest at surface',
  usage: {
    description:
      'Displays tool or function call invocations from an LLM response. Single call renders inline; multiple calls collapse into a summary. Use inside assistant messages.',
    bestPractices: [
      {guidance: true, description: 'Include target on every call: file path, command, or search query.'},
      {guidance: true, description: 'Show duration on completed calls so users understand timing.'},
      {guidance: true, description: 'Provide group label when count alone is ambiguous.'},
      {guidance: true, description: 'Provide resultDetail with code blocks for calls that produce output.'},
      {guidance: true, description: 'Set unique key on each call item when streaming for stable animations.'},
      {guidance: false, description: "Don't omit status; defaults to complete, misleading for running/failed calls."},
      {guidance: false, description: "Don't display outside chat message context; designed for assistant messages."},
      {guidance: false, description: "Don't wrap individual calls; component handles single vs. grouped layout automatically."},
    ],
  },
  propDescriptions: {
    calls: 'tool call data array; name+status+target+duration+node+additions+deletions+resultDetail',
    label: 'custom summary label; auto from count if omitted',
    isExpanded: 'controlled expanded state',
    defaultIsExpanded: 'default expanded state (uncontrolled)',
    onExpandedChange: 'expanded state change callback',
  },
};
