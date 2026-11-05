// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'VegaChart',
  displayName: 'Vega Chart',
  category: 'Data Visualization',
  keywords: ['vega', 'vega-lite', 'chart', 'data visualization'],
  props: [
    {
      name: 'spec',
      type: 'AnySpec',
      description:
        'A Vega or Vega-Lite specification with an official $schema URL.',
      required: true,
    },
    {
      name: 'data',
      type: 'ViewData',
      description:
        'Initial values for datasets named by the spec. Read when the view is created; later updates should use the live View.',
    },
    {
      name: 'compileOptions',
      type: 'CompileOptions',
      description:
        'Options passed to Vega-Lite compilation. Ignored for native Vega specs.',
    },
    {
      name: 'parseConfig',
      type: 'Config',
      description: 'Vega configuration passed to vega.parse().',
    },
    {
      name: 'parseOptions',
      type: 'ParseOptions',
      description: 'Options passed to vega.parse().',
    },
    {
      name: 'viewOptions',
      type: "Omit<ViewOptions, 'container'>",
      description:
        'Options passed to the Vega View. The component always supplies the container.',
    },
    {
      name: 'onReady',
      type: '(view: View) => void',
      description: 'Called with the live Vega View after the first render.',
    },
    {
      name: 'onError',
      type: '(error: Error) => void',
      description:
        'Called when schema validation, compilation, or rendering fails.',
    },
  ],
  usage: {
    description:
      'Renders Vega and Vega-Lite specifications through the Vega runtime. Experimental component in @astryxdesign/vega (canary).',
    bestPractices: [
      {
        guidance: true,
        description:
          'Only render specifications you authored or reviewed. For untrusted specs, configure the interpreter and a restricted loader as described in the package README.',
      },
      {
        guidance: true,
        description:
          'Keep spec and option objects stable to avoid recreating the Vega View unnecessarily.',
      },
    ],
  },
};
