// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental icon use`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental icon use',
  displayName: 'astryx experimental icon use',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: "Choose the project's main icon set, backups, and look",
  description:
    "Writes `experimental.iconSet` in astryx.config, so copied templates and blocks use that set's icons. With `--backup`, it writes a list: the main set first, then each backup in the order given. A copied template takes each icon from the first set in the list that has its meaning. With `--variant`, it also writes `experimental.iconVariant`, the look every icon draws (`outline`, `filled`): one of the main set's variants. Each set in the list draws its variant of that name, or its default look when it declares none, and the receipt names the theme map that draws the built-in icons in that look. Without `--variant`, it removes `experimental.iconVariant`, so each set draws its default look: run it with every set and the look you want. Every set must be installed. Experimental: it may change or be removed in a patch release.",
  fn: 'iconUse',
  args: [{name: 'set', param: 'set', required: true}],
  options: [
    {flag: '--backup <set...>', param: 'options.backups'},
    {flag: '--variant <variant>', param: 'options.variant'},
  ],
  examples: [
    {label: 'Use a set', cli: 'astryx experimental icon use outline'},
    {
      label: 'Use a main set with a backup',
      cli: 'astryx experimental icon use outline --backup @acme/brand-icons/brand',
    },
    {
      label: 'Draw every icon in one look',
      cli: 'astryx experimental icon use brand --variant filled',
    },
    {
      label: 'Name its package',
      cli: 'astryx experimental icon use @acme/icons/outline',
    },
  ],
  outsideProject: 'refuse',
  exitCodes: [
    {
      code: 0,
      when: 'experimental.iconSet (and experimental.iconVariant) is written, or already names the sets and the look',
    },
    {
      code: 1,
      when: 'a set is not installed, two packages ship it, a set is named twice, the main set declares no variant `--variant` names, the config cannot be updated (not a static object literal, or it spreads another object, which you then edit by hand), or the config is protected (a symbolic link, or marked generated, vendored, or ignored: `ERR_CODEMOD_PROTECTED`, naming the declaration)',
    },
  ],
  related: ['experimental icon', 'template'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental icon use writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
};
