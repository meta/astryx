// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'usePowerSearchConfig',
  displayName: 'usePowerSearchConfig',
  group: 'PowerSearch',
  keywords: [
    'power search',
    'filter',
    'table',
    'field definitions',
    'client-side filtering',
    'search configuration',
  ],
  params: [
    {
      name: 'definitions',
      type: 'ReadonlyArray<FieldDefinition>',
      description:
        'Typed field definitions used to build the PowerSearch configuration. Each definition specifies a key, field type, optional label, and enum values when needed.',
      required: true,
    },
    {
      name: 'configName',
      type: 'string',
      description: 'Optional name for the generated PowerSearch configuration.',
      required: false,
      default: 'PowerSearchConfig',
    },
  ],
  returns: [
    {
      name: 'config',
      type: 'PowerSearchConfig',
      description:
        'Configuration generated from the field definitions. Pass it to PowerSearch.',
    },
    {
      name: 'applyFilters',
      type: '<T extends InferData<D>>(filters: ReadonlyArray<PowerSearchFilter>, data: ReadonlyArray<T>) => T[]',
      description:
        'Filters records whose fields match every active PowerSearch filter. The inferred record shape follows the field definitions.',
    },
  ],
  usage: {
    description:
      'Build a PowerSearch configuration and a type-safe client-side filtering function from field definitions. Use the returned config with PowerSearch and applyFilters to derive the rows shown in a Table or another data view.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Define the field definitions outside the component or memoize them so the hook can reuse its memoized configuration.',
      },
      {
        guidance: true,
        description:
          'Keep each field key aligned with the corresponding property in the records passed to applyFilters.',
      },
      {
        guidance: true,
        description:
          'Provide enumValues for enum and enum_list fields so PowerSearch can render their choices.',
      },
      {
        guidance: false,
        description:
          'Build a separate PowerSearchConfig by hand when the fields and operators already come from a server or another shared source.',
      },
    ],
  },
  relatedComponents: ['PowerSearch', 'Table'],
  importPath: '@astryxdesign/core/PowerSearch',
  category: 'data-display',
};
