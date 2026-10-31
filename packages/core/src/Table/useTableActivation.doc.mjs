// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableActivation',
  subComponentOf: 'Table',
  displayName: 'useTableActivation',
  description:
    'Hook that returns a TablePlugin giving a data-driven Table one controlled current row for master-detail, preview, and inspector layouts. Eligible rows activate on primary click or Enter/Space and the controlled key reflects back as data-active plus component-owned active styling that reaches pinned cells. The consumer owns the activeKey state; the plugin never emits aria-selected or aria-current, so callers that need selection or navigation semantics own them through those surfaces. Requires an explicit idKey on the Table; without stable row identity activation stays inert. Do not combine with useTableGroupedRows: group headers cannot be told apart from product rows yet, so grouped composition stays unsupported until Table owns that distinction.',
  props: [
    {
      name: 'activeKey',
      type: 'string | number | null',
      description:
        'The currently active resolved row key, or null for no active row. Compared by strict equality, so the string "42" never matches the number 42. Fully controlled: update it in onActivate.',
      required: true,
    },
    {
      name: 'onActivate',
      type: '(item: T, key: string | number) => void',
      description:
        'Called once with the row item and its resolved key when an eligible row is activated. Earlier row handlers run first and cancel with preventDefault; nested or portalled controls, text selections, auxiliary clicks, and key repeats never activate.',
      required: true,
    },
    {
      name: 'getIsItemActivatable',
      type: '(item: T) => boolean',
      description:
        'Control which rows are activatable. Ineligible rows get no activation handler, no keyboard affordance, and no active presentation, even when their key equals activeKey. Defaults to all rows activatable.',
    },
  ],
  examples: [
    {
      label: 'Master-detail rows',
      code: `const [activeKey, setActiveKey] = useState(null);
const activation = useTableActivation({
  activeKey,
  onActivate: (item, key) => setActiveKey(key),
});

<Table data={orders} columns={columns} idKey="id" plugins={{activation}} />;`,
    },
    {
      label: 'Locking system rows out of activation',
      code: `const activation = useTableActivation({
  activeKey,
  onActivate: (item, key) => setActiveKey(key),
  getIsItemActivatable: item => !item.isSystemRow,
});`,
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Returns a TablePlugin with one controlled current row for master-detail layouts. Eligible rows activate on primary click or Enter/Space; the key reflects as data-active plus active styling through pinned cells. Caller owns activeKey; no aria-selected or aria-current is emitted. Needs an explicit Table idKey; incompatible with grouped rows.',
  propDescriptions: {
    activeKey:
      'Controlled active row key, or null. Strict equality: "42" never matches 42.',
    onActivate:
      'Called once with (item, key) on activation. Earlier handlers run first; preventDefault cancels; nested/portalled controls, selections, aux clicks, and repeats never activate.',
    getIsItemActivatable:
      'Control which rows are activatable. Ineligible rows get no handler, keyboard affordance, or active presentation. Defaults to all rows.',
  },
};
