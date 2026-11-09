// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for GapReportHandler, the handler `astryx gap-report` calls.
 * @input The GapReportHandler type beside it (`type.ts`), which `parse.mjs`
 *   validates.
 * @output The `gap-report-handler` section of `astryx docs authoring`.
 * @position packages/cli/authoring/gap-report — schema documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'gap-report-handler',
  displayName: 'GapReportHandler',
  namespace: 'authoring',
  description:
    "A handler for `{@command gap-report}`: a plain object with an `audience` and a `handle` function. Set it as `gapReport` in astryx.config, or export it as `gapReport` from an integration manifest. Handlers add up rather than replace each other: the project handler first, then each loaded integration's in load order (the `integrations` list, then autolinked ones), whichever package the report is about.",
  appliesTo:
    '`gapReport` in astryx.config.*, or the `gapReport` named export of astryx.integration.*',
  fields: [
    {
      name: 'audience',
      type: "'internal' | 'public'",
      description:
        'Whether the destination is internal to your organization or public. A public handler runs only when the caller agrees; an internal handler always runs.',
      required: true,
    },
    {
      name: 'handle',
      type: '(report: GapReport, context: GapReportHandlerContext) => GapReportHandlerReceipt | Promise<GapReportHandlerReceipt>',
      description:
        'Gets the report and returns a receipt. It can be async, and the CLI waits at most 30 seconds for it. A throw, a timeout, or an invalid receipt is a failed delivery, and the other handlers still run.',
      required: true,
      fields: [
        {
          name: 'report',
          type: 'GapReport',
          description: 'The report. Each handler gets its own copy.',
          required: true,
          fields: [
            {
              name: 'report.schemaVersion',
              type: '1',
              description: 'Version of the report shape.',
              required: true,
            },
            {
              name: 'report.component',
              type: 'string',
              description: 'The component the gap is about.',
              required: true,
            },
            {
              name: 'report.category',
              type: 'GapReportCategory',
              description:
                "The kind of gap: 'missing_component', 'missing_variant', 'layout_gap', 'styling_gap', 'a11y_gap', 'api_friction', 'docs_gap', or 'other'.",
              required: true,
            },
            {
              name: 'report.categoryLabel',
              type: 'string',
              description: 'A readable name for the category.',
              required: true,
            },
            {
              name: 'report.intention',
              type: 'string',
              description: 'What the caller was trying to do.',
              required: true,
            },
            {
              name: 'report.detail',
              type: 'string',
              description: 'More detail, when the caller gave some.',
            },
            {
              name: 'report.source',
              type: 'DebugInvocationSource',
              description:
                "Who sent the report: 'human', 'ai', 'automation', or 'unknown'.",
              required: true,
            },
            {
              name: 'report.timestamp',
              type: 'string',
              description: 'When the report was sent, as ISO 8601.',
              required: true,
            },
            {
              name: 'report.target',
              type: 'GapReportTarget',
              description: 'The package the report is about.',
              required: true,
              fields: [
                {
                  name: 'report.target.package',
                  type: 'string',
                  description: 'The package name.',
                  required: true,
                },
                {
                  name: 'report.target.version',
                  type: 'string',
                  description:
                    "The integration's version from its package.json. Null for Core, and when the package.json has none.",
                  required: true,
                },
                {
                  name: 'report.target.issuesUrl',
                  type: 'string',
                  description:
                    'Where the package takes issues. Null when it does not say.',
                  required: true,
                },
              ],
            },
          ],
        },
        {
          name: 'context',
          type: 'GapReportHandlerContext',
          description: 'The context of this call.',
          required: true,
          fields: [
            {
              name: 'context.signal',
              type: 'AbortSignal',
              description: 'Aborted when the handler runs past 30 seconds.',
              required: true,
            },
          ],
        },
      ],
    },
  ],
  examples: [
    {
      label: 'A project handler in astryx.config',
      code:
        'export default {\n' +
        '  gapReport: {\n' +
        "    audience: 'internal',\n" +
        '    async handle(report, {signal}) {\n' +
        '      const url = await fileIssue(report, {signal});\n' +
        "      return {status: 'filed', url};\n" +
        '    },\n' +
        '  },\n' +
        '};',
    },
  ],
  notes: [
    {
      type: 'table',
      headers: ['Receipt field', 'Type', 'Required', 'Description'],
      rows: [
        [
          'status',
          "'filed' | 'routed_only' | 'skipped'",
          'yes',
          "'filed': the handler created or queued the report. 'routed_only': it points to a place to file the report, and must return `url`. 'skipped': it chose not to act, for example on a duplicate.",
        ],
        [
          'url',
          'string',
          'no',
          'An http or https URL. Required when status is routed_only.',
        ],
        [
          'message',
          'string',
          'no',
          'A readable message of at most 2000 characters.',
        ],
      ],
    },
    {
      type: 'prose',
      text: 'The receipt is strict: an unknown field, a URL that is not http or https, or a filed or routed_only receipt with neither `url` nor `message` is invalid.',
    },
  ],
};
