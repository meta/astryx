// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/configuration/debug-and-gap-reports`: receive a record
 * of each CLI run with `debug`, and handle `astryx gap-report` with
 * `gapReport`, both named exports of the integration manifest.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'debug-and-gap-reports',
  placement: {parent: 'namespace:configuration', slot: 'guides', order: 20},
  title: 'Debug and gap reports',
  category: 'guide',
  keywords: ['gap report', 'debug handler'],
  description:
    'Receive a record of each CLI run in apps that use your package, and handle the gap reports they send about it.',
  sections: [
    {
      id: 'record-runs-with-debug',
      title: 'Record runs with debug',
      content: [
        {
          type: 'prose',
          text: 'Export a `debug` function from `astryx.integration.mjs`; the CLI calls it once per command run in an app loading your package.',
        },
        {
          type: 'code',
          lang: 'js',
          code: `// astryx.integration.mjs
import {appendFileSync} from 'node:fs';

/** @param {import('@astryxdesign/cli/authoring').DebugEvent} event */
export function debug(event) {
  if (event.outcome !== 'ok') {
    appendFileSync('acme-failed-runs.ndjson', JSON.stringify(event) + '\\n');
  }
}

export default {
  components: './components',
};`,
        },
        {
          type: 'prose',
          text: 'The event is a `DebugEvent` with `command`, `outcome`, `exitCode`, `durationMs`, `error`, and more, its values scrubbed (`redacted: true`). Every field is in {@link schema:debug-event}.',
        },
        {
          type: 'prose',
          text: "Keep the function synchronous: the CLI calls it as the process exits and never waits for a promise. The app's own `debug` handler runs first, then yours. A handler that throws is skipped, and the command's output and exit code stay the same.",
        },
        {
          type: 'prose',
          text: "An app records every command only when its `astryx.config` names `integrations` or `debug`, as listing your package does. Otherwise your handler runs only for commands loading the app's project, such as `component` and `docs`, never for `--version` or a mistyped command. In an app whose config names neither word, those commands also print a stderr warning.",
        },
        {
          type: 'prose',
          text: '`debug` is a named export, not a manifest field, so an older CLI ignores it and loads the rest of your manifest.',
        },
      ],
    },
    {
      id: 'turn-off-debug-in-an-app',
      title: 'Turn off debug in an app',
      content: [
        {
          type: 'prose',
          text: "An app can refuse every integration's `debug` handler and keep its own. It sets `inheritDebug` in its package.json:",
        },
        {
          type: 'code',
          lang: 'json',
          code: '{"astryx": {"inheritDebug": false}}',
        },
        {
          type: 'prose',
          text: 'Your handler then no longer runs in that app.',
        },
      ],
    },
    {
      id: 'handle-gap-reports',
      title: 'Handle gap reports',
      content: [
        {
          type: 'prose',
          text: 'Export a `gapReport` handler, and `{@command gap-report}` in an app sends it each gap report, such as a missing component or variant. The handler files the report and returns a receipt.',
        },
        {
          type: 'code',
          lang: 'js',
          code: `/** @type {import('@astryxdesign/cli/authoring').GapReportHandler} */
export const gapReport = {
  audience: 'public',
  async handle(report, {signal}) {
    if (report.target.package !== '@acme/astryx-widgets') return {status: 'skipped'};
    const body = JSON.stringify(report);
    const response = await fetch('https://tracker.example.com/issues', {method: 'POST', body, signal});
    const {url} = await response.json();
    return {status: 'filed', url};
  },
};`,
        },
        {
          type: 'prose',
          text: 'Every handler in the app gets every report, so check `report.target.package` and skip reports about other packages.',
        },
        {
          type: 'prose',
          text: 'Every field is in {@link schema:gap-report-handler}.',
        },
        {
          type: 'prose',
          text: 'The CLI waits 30 seconds, then aborts `signal`. A throw, a timeout, or an invalid receipt fails your delivery, and the command exits 1; the other handlers still run. Like `debug`, `gapReport` is a named export that older CLIs ignore.',
        },
      ],
    },
    {
      id: 'ask-before-filing-in-public',
      title: 'Ask before filing in public',
      content: [
        {
          type: 'prose',
          text: "Set `audience: 'public'` when your handler writes somewhere the public can read. The CLI runs it only when the caller passes `--confirm-public`; an `'internal'` handler always runs.",
        },
        {
          type: 'code',
          lang: 'bash',
          code: "{@command gap-report AcmeCarousel --category missing_variant --reason 'Need a vertical layout'}",
        },
        {
          type: 'code',
          lang: 'text',
          code: `handlerType: integration
handler:     @acme/astryx-widgets
audience:    public
status:      consent_required
message:     Rerun with --confirm-public to file this report.`,
        },
        {
          type: 'prose',
          text: 'With `--confirm-public`, the same delivery reads `status: filed` and shows your `url`. The report goes to the package named by `--package`, else the package that owns the component, else Core.',
        },
      ],
    },
    {
      id: 'fall-back-to-issues-url',
      title: 'Fall back to issuesUrl',
      content: [
        {
          type: 'prose',
          text: "With no `gapReport` handler in the app, the CLI routes the report to the target package's manifest `issuesUrl`.",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'A GitHub issues URL, such as `https://github.com/acme/widgets/issues`, gets an issue filed with the GitHub CLI, `gh`, once the caller passes `--confirm-public`.',
            'Any other URL comes back as a `routed_only` receipt for the caller to open.',
            'With no `issuesUrl`, the command fails: `Package "@acme/astryx-widgets" provides neither a report handler nor an issues URL.`',
          ],
        },
        {
          type: 'prose',
          text: 'One handler anywhere in the app, from the app or from any package, turns the fallback off for every report. So does a listed package that fails to load: the CLI cannot tell whether it has a handler, so the report fails for that package instead of going to another tracker. See {@link command:gap-report}.',
        },
      ],
    },
    {
      id: 'choose-a-destination',
      title: 'Let the person choose where a report goes',
      content: [
        {
          type: 'prose',
          text: 'When an app loads packages naming their own `issuesUrl`, a report can go to the default (the handlers, or the fallback above) or to one of those packages. `{@command gap-report --list-categories}` and the receipt of a report filed without `--to` list every destination, with a line telling the agent to ask the person.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'An agent asks the person where to file. It never picks a package destination on its own.',
            "`--to <package>` carries the person's choice: the report goes only to that package's `issuesUrl`, under the same `--confirm-public` rule, and no handler runs.",
            'Without a choice, leave out `--to`; the report goes to the default.',
            'A `--to` that names no destination fails before anything is sent and lists the destinations.',
          ],
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: 'In global mode: when users install your package for their computer, beside the global CLI, its `debug` function receives runs in folders outside any project too; inside a project, only if the project installs it. See {@link namespace:global} and {@link generic:global-integrations}.',
        },
      ],
    },
  ],
};
