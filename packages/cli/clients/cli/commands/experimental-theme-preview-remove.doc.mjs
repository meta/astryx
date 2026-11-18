// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme preview remove`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme preview remove',
  displayName: 'astryx experimental theme preview remove',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'Remove one page from the theme preview, or the whole preview',
  description:
    'Removes one page and its nav item, and rewrites the route. With no page, or for the last page, it removes the whole preview: only the files the preview wrote (theme-preview.json lists them) are deleted, and the folder only when nothing else is in it. A path in theme-preview.json that leads outside the route folder is dropped from the record and named in a note; nothing outside the folder is deleted. Only files the preview wrote are deleted: a page file it did not write, or one changed by hand since it wrote it (by the hash theme-preview.json records), is kept and named in `kept`, with a note; files already gone are named in `missing`, and the route and Colors page written again in `rewritten`. Every check runs before the first delete: the theme the route wears is loaded first, so a theme that does not load is refused with nothing deleted, and the refusal names the whole-preview remove, which needs no theme. A theme that is gone is replaced by the theme of the app itself, with a note. A page id matches in any case. A damaged theme-preview.json (not JSON, the wrong shape, a duplicate page, a folder or an absolute path in its files) is refused with `ERR_THEME_INVALID`, naming the file. With no folder given and no preview in the default place, a preview recorded for a theme is used. It takes one page; more arguments are refused. A whole remove stops, deleting nothing, when page.tsx was changed by hand: it imports the pages. A page whose file is gone leaves the nav, with a note. Refusals never suggest deleting files. Preview commands in one project run one after another. A remove deletes only the route file, the record and the page files of recorded pages (in _pages/, or pages/ for an older release), and only when a recorded hash shows they are as the preview wrote them: any other file the record names, and any file with no recorded hash, is kept and named, so a copied or edited record never deletes a project file. A route that stays keeps the pages it imports. Experimental: it may change or be removed in a patch release.',
  fn: 'themeEditPreviewRemove',
  args: [
    {
      name: 'page',
      param: 'page',
      required: false,
    },
  ],
  options: [
    {
      flag: '--path <dir>',
      param: 'options.path',
      description:
        'The folder of the preview route, when it is not in the default place',
    },
  ],
  examples: [
    {
      label: 'One page',
      cli: 'astryx experimental theme preview remove components',
    },
    {
      label: 'The whole preview',
      cli: 'astryx experimental theme preview remove',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme preview remove writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the page or the preview is removed',
    },
    {
      code: 1,
      when: 'there is no preview, it has no such page, theme-preview.json is damaged, the theme the route wears does not load (ERR_THEME_INVALID, ERR_UNKNOWN_THEME, ERR_THEME_LOAD), another preview command did not finish within 30 seconds (ERR_THEME_BUSY), the route file was changed by hand, a write failed, more than one page, or outside a project',
    },
  ],
  related: ['experimental theme preview'],
};
