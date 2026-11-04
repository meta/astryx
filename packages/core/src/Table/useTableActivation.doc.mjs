// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'useTableActivation',
  subComponentOf: 'Table',
  displayName: 'useTableActivation',
  description:
    "Returns a TablePlugin for one controlled current product row in a flat data table. Primary click, Enter and Space request activation. The caller controls activeKey and the adjacent detail or preview content. Supply an explicit stable unique Table idKey. Activation does not select rows, navigate or move focus; row rerenders preserve the existing keyboard focus and shortcuts. Native controls, editable content, portalled content and intersecting text selections do not activate the row. A compatible custom body-row or body-cell plugin must declare rowModel: 'flat'; an undeclared or non-flat model disables activation with a development diagnostic.",
  props: [
    {
      name: 'activeKey',
      type: 'string | number | null',
      required: true,
      description:
        'Canonical Table key driving adjacent content, or null for no current row. Compared strictly: property-name idKey values are projected to strings; function idKey values retain their string or finite-number type. An eligible matching row exposes its current-item state and active marker.',
    },
    {
      name: 'onActivate',
      type: '(item: T, key: string | number) => void',
      required: true,
      description:
        'Requests activation after composed handlers. Receives the exact canonical Table key and row item. Update activeKey yourself; preventDefault in an earlier handler cancels a request.',
    },
    {
      name: 'getIsItemActivatable',
      type: '(item: T) => boolean',
      description:
        'Allows activation and current-item presentation for an admitted product row. Missing, invalid or duplicate identity, children mode, non-flat models and competing whole-row actions remain inactive regardless of this predicate.',
      default: '() => true',
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Controlled current-row activation for flat data tables. Requires explicit stable unique Table idKey. Primary click, Enter and Space request activation, not selection, navigation or focus. Controls, editable/portalled content and intersecting selections are isolated.',
  propDescriptions: {
    activeKey:
      'Canonical Table key or null. Strict typed comparison; property keys use the Table string projection.',
    onActivate:
      'Requests activation with the row and canonical key after earlier handlers; preventDefault cancels. The caller updates activeKey.',
    getIsItemActivatable:
      'Eligibility for admitted product rows, default true. Invalid identity and unsupported table modes stay inactive.',
  },
};
