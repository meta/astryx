// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'SegmentedControlItem',
  subComponentOf: 'SegmentedControl',
  displayName: 'Segmented Control Item',
  isHiddenFromOverview: true,
  description:
    'Individual segment item rendering as a radio button within the segmented control.',
  // SegmentedControlItem requires SegmentedControl context; wrap it so the preview doesn't throw.
  playground: {
    defaults: {value: 'item-1', label: 'Item'},
    wrapper: {
      component: 'SegmentedControl',
      props: {value: 'item-1', label: 'Segmented control'},
    },
  },
  props: [
    {
      name: 'value',
      type: 'string',
      description:
        'Unique value for this segment, matched against the parent value.',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible label for this segment. Rendered as visible text unless isLabelHidden is true.',
      required: true,
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description:
        'Whether the label is visually hidden. When true, only the icon is displayed and label is used as aria-label.',
      default: 'false',
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description: 'Icon element displayed before the label.',
      slotElements: [
        {
          __element: 'Icon',
          props: {
            icon: 'check',
            size: 'sm',
          },
        },
      ],
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        "Whether this individual item is disabled. A disabled selected item keeps the control's Tab stop.",
      default: 'false',
    },
  ],
};

export const docsZh = {
  name: 'SegmentedControlItem',
  isHiddenFromOverview: true,
  displayName: 'Segmented Control Item',
  description: '单个分段项，在分段控件中渲染为单选按钮。',
  propDescriptions: {
    value: '该分段的唯一值，与父组件的 value 匹配。',
    label:
      '该分段的无障碍标签。除非 isLabelHidden 为 true，否则渲染为可见文本。',
    isLabelHidden:
      '是否在视觉上隐藏标签。为 true 时仅显示图标，label 用作 aria-label。',
    icon: '显示在标签前的图标元素。',
    isDisabled: '是否禁用该单个项。',
  },
};

export const docsDense = {
  name: 'SegmentedControlItem',
  isHiddenFromOverview: true,
  displayName: 'Segmented Control Item',
  description: 'individual segment; renders as radio button in control',
  propDescriptions: {
    value: 'unique segment value; matched against parent',
    label: 'segment label; visible unless isLabelHidden',
    isLabelHidden: 'hides label visually; label becomes aria-label',
    icon: 'icon before label',
    isDisabled: 'disables this item',
  },
};
