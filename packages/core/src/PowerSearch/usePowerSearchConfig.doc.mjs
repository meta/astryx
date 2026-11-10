// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'usePowerSearchConfig',
  displayName: 'usePowerSearchConfig',
  group: 'PowerSearch',
  keywords: [
    'powersearch',
    'search',
    'filter',
    'filters',
    'query builder',
    'table filter',
    'usePowerSearchConfig',
    'createPowerSearchConfig',
  ],
  params: [
    {
      name: 'definitions',
      type: 'ReadonlyArray<FieldDefinition>',
      description:
        'Typed field definitions (key, type, label, enumValues) used to build PowerSearch fields and operators.',
      required: true,
    },
    {
      name: 'configName',
      type: 'string',
      description:
        'Optional name for the PowerSearchConfig object (defaults to "PowerSearchConfig").',
      required: false,
    },
  ],
  returns: [
    {
      name: 'config',
      type: 'PowerSearchConfig',
      description:
        'Memoized PowerSearch configuration object with fields and type-appropriate operators.',
    },
    {
      name: 'applyFilters',
      type: '<T extends InferData<D>>(filters: ReadonlyArray<PowerSearchFilter>, data: ReadonlyArray<T>) => T[]',
      description:
        'Client-side filtering helper that filters a dataset using the active PowerSearch filter rules.',
    },
  ],
  usage: {
    description:
      'Memoizes a PowerSearch configuration built from typed field definitions and returns it along with an applyFilters function for client-side filtering. Automatically maps field types (string, number, boolean, date, enum, etc.) to their canonical operators and provides an efficient predicate evaluator to filter datasets.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Declare field definitions as const outside the component or memoize them so usePowerSearchConfig only recalculates when needed.',
      },
      {
        guidance: true,
        description:
          'Pass the returned config to PowerSearch and use applyFilters to compute the filtered data rows for a Table or List.',
      },
      {
        guidance: false,
        description:
          'Recreate field definitions inline on every render without as const or memoization.',
      },
    ],
  },
  relatedComponents: ['PowerSearch', 'Table'],
  relatedHooks: ['useTableFilterState', 'useTableFiltering'],
  importPath: '@astryxdesign/core/PowerSearch',
  category: 'utilities',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Memoizes PowerSearch config from typed field definitions + returns applyFilters for client filtering. Automatically maps types (string, number, date, enum) to canonical operators.',
  paramDescriptions: {
    definitions: 'Typed field definitions (key, type, label, enumValues).',
    configName: 'Optional config name (defaults to "PowerSearchConfig").',
  },
  returnDescriptions: {
    config: 'Memoized PowerSearchConfig for PowerSearch.',
    applyFilters: 'Filters dataset against active PowerSearch filters.',
  },
  usage: {
    description:
      'Builds memoized PowerSearch config and client filtering function from field definitions.',
    bestPractices: [
      {
        guidance: true,
        description: 'Declare definitions with as const outside component.',
      },
      {
        guidance: true,
        description:
          'Pass config to PowerSearch and use applyFilters for Table/List data.',
      },
      {
        guidance: false,
        description: 'Recreate field definitions inline on every render.',
      },
    ],
  },
};
