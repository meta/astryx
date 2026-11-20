// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Tile',
    required: true,
    description: 'Root column that stacks the parts below; the `stat` target.',
  },
  {
    name: 'Label',
    required: true,
    description: 'Metric name above the value, from `label`.',
  },
  {
    name: 'Value',
    required: true,
    description:
      'The headline metric from `value`, large, with tabular numerals.',
  },
  {
    name: 'Delta',
    required: false,
    description:
      'Change from `delta`: a direction glyph, the change text in its tone, and hidden words a screen reader hears after it.',
  },
  {
    name: 'Description',
    required: false,
    description: 'Muted supporting line from `description`.',
  },
  {
    name: 'Media',
    required: false,
    description:
      'Caller content from `media`, such as a sparkline, below the text.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Stat',
  displayName: 'Stat',
  // Keeps the registry route Stat had as a canary-only Lab component.
  registry: {aliases: ['lab/stat']},
  category: 'Content',
  keywords: ["stat","kpi","metric","number","value","delta","trend","dashboard","statistic","measure"],
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Metric name shown above the value, e.g. "Total requests".',
      required: true,
    },
    {
      name: 'value',
      type: 'ReactNode',
      description:
        'Headline metric rendered large with tabular numerals. Pass a pre-formatted string like "1.2M".',
      required: true,
    },
    {
      name: 'delta',
      type: "{value: string, direction: 'up' | 'down' | 'flat', sentiment?: 'success' | 'error' | 'neutral'}",
      description:
        'Change indicator next to the value: an up/down/flat glyph plus colored text. sentiment overrides the direction color mapping (up=success, down=error, flat=neutral) for inverted metrics like error rate.',
    },
    {
      name: 'description',
      type: 'string',
      description:
        'Muted supporting line under the value, e.g. "vs. previous 30 days".',
    },
    {
      name: 'media',
      type: 'ReactNode',
      description:
        'Trend slot rendered below the text content, e.g. a sparkline or mini chart. Stat does not render a chart itself.',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: "Size variant controlling the value's font size.",
      default: "'md'",
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
      {className: 'astryx-stat', visualProps: ['size']},
    ],
  },
  usage: {
    anatomy,
    description:
      'A KPI/metric display for dashboards and summary rows: metric name, large tabular-nums value, an optional sentiment-aware delta, a supporting description, and a media slot for a sparkline or mini chart. Compose several in a Grid for a KPI row.',
    bestPractices: [
      { guidance: true, description: 'Pass pre-formatted strings for value and delta ("1.2M", "+12.4%"); Stat does not format numbers.' },
      { guidance: true, description: 'Set `sentiment` explicitly for inverted metrics where down is good, like error rate or latency.' },
      { guidance: true, description: 'Wrap Stat in a Card and lay out KPI rows with Grid columns={{minWidth: 240, max: 4}}.' },
      { guidance: false, description: 'Put a full-size chart in the media slot; it is meant for compact sparklines or trend glyphs.' },
      { guidance: false, description: 'Rely on delta color alone to convey meaning; the direction glyph and screen-reader text carry it too.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Stat',
  displayName: 'Stat',
  props: [
    {
      name: 'label',
      type: 'string',
      description: '显示在数值上方的指标名称，例如 "Total requests"。',
      required: true,
    },
    {
      name: 'value',
      type: 'ReactNode',
      description:
        '大号显示的核心指标，使用等宽数字。请传入预先格式化的字符串，如 "1.2M"。',
      required: true,
    },
    {
      name: 'delta',
      type: "{value: string, direction: 'up' | 'down' | 'flat', sentiment?: 'success' | 'error' | 'neutral'}",
      description:
        '数值旁的变化指示：上升/下降/持平图标加彩色文本。sentiment 可覆盖默认的方向颜色映射（up=success、down=error、flat=neutral），用于错误率等反向指标。',
    },
    {
      name: 'description',
      type: 'string',
      description: '数值下方的弱化辅助说明，例如 "vs. previous 30 days"。',
    },
    {
      name: 'media',
      type: 'ReactNode',
      description:
        '渲染在文本内容下方的趋势插槽，例如迷你折线图。Stat 本身不渲染图表。',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: '控制数值字号的尺寸变体。',
      default: "'md'",
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
      {className: 'astryx-stat', visualProps: ['size']},
    ],
  },
  usage: {
    anatomy,
    description:
      'A KPI/metric display for dashboards and summary rows: metric name, large tabular-nums value, an optional sentiment-aware delta, a supporting description, and a media slot for a sparkline or mini chart. Compose several in a Grid for a KPI row.',
    bestPractices: [
      { guidance: true, description: 'Pass pre-formatted strings for value and delta ("1.2M", "+12.4%"); Stat does not format numbers.' },
      { guidance: true, description: 'Set `sentiment` explicitly for inverted metrics where down is good, like error rate or latency.' },
      { guidance: true, description: 'Wrap Stat in a Card and lay out KPI rows with Grid columns={{minWidth: 240, max: 4}}.' },
      { guidance: false, description: 'Put a full-size chart in the media slot; it is meant for compact sparklines or trend glyphs.' },
      { guidance: false, description: 'Rely on delta color alone to convey meaning; the direction glyph and screen-reader text carry it too.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'KPI/metric display: label, large tabular-nums value, sentiment-aware delta, and trend media slot.',
  usage: {
    anatomy,
    description:
      'A KPI/metric display for dashboards and summary rows: metric name, large tabular-nums value, an optional sentiment-aware delta, a supporting description, and a media slot for a sparkline or mini chart. Compose several in a Grid for a KPI row.',
    bestPractices: [
      { guidance: true, description: 'Pass pre-formatted strings for value and delta ("1.2M", "+12.4%"); Stat does not format numbers.' },
      { guidance: true, description: 'Set `sentiment` explicitly for inverted metrics where down is good, like error rate or latency.' },
      { guidance: true, description: 'Wrap Stat in a Card and lay out KPI rows with Grid columns={{minWidth: 240, max: 4}}.' },
      { guidance: false, description: 'Put a full-size chart in the media slot; it is meant for compact sparklines or trend glyphs.' },
      { guidance: false, description: 'Rely on delta color alone to convey meaning; the direction glyph and screen-reader text carry it too.' },
    ],
  },
  propDescriptions: {
    label: 'Metric name above the value.',
    value: 'Pre-formatted headline metric; tabular numerals.',
    delta: 'Direction glyph + colored change text; sentiment overrides direction colors.',
    description: 'Muted supporting line under the value.',
    media: 'Trend slot below the text (sparkline/mini chart).',
    size: "Value font size: 'sm' | 'md' | 'lg'.",
    xstyle: 'StyleX layout styles; must be stylex.create() value.',
  },
};
