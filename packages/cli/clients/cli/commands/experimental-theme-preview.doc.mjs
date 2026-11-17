// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for the `astryx experimental theme preview` group: the
 * theme preview page in the app.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme preview',
  displayName: 'astryx experimental theme preview',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'A page in your app that shows the theme on real pages, or a starter app (preview app) when there is none',
  description:
    "One route in the app, a normal page that keeps the app's layout, global CSS and providers: an app shell with a side nav item per preview page and a top bar with the theme name and, when it wears a theme made by `editor`, a light, dark and system switch. `add` adds pages (the default pages, the best template pages for a description, or one template) and writes the route the first time; `list` lists them; `remove` removes one, or the whole preview. With no app, `app <dir>` makes a starter app with the preview in it. Pictures of a theme are on `experimental theme editor show`. Experimental: it may change or be removed in a patch release.",
  subcommands: ['add', 'app', 'list', 'remove'],
  examples: [
    {
      label: 'The default pages',
      cli: 'astryx experimental theme preview add',
    },
    {
      label: 'Every page',
      cli: 'astryx experimental theme preview list',
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'help is shown or a subcommand succeeds',
    },
    {
      code: 1,
      when: 'an unknown subcommand or a subcommand failure',
    },
  ],
  related: ['experimental theme', 'experimental theme editor show'],
};
