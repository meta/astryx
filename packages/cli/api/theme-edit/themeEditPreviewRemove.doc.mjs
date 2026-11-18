// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditPreviewRemove()` / `astryx experimental theme preview remove`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditPreviewRemove',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditPreviewRemove()',
  summary: 'Remove one page from the theme preview, or the whole preview.',
  description:
    'Removes one page and its nav item, and rewrites the route. With no page, or for the last page, it removes the whole preview: only the files the preview wrote (theme-preview.json lists them) are deleted, and the folder only when nothing else is in it. A path in theme-preview.json that leads outside the route folder is dropped from the record and named in a note; nothing outside the folder is deleted. Only files the preview wrote are deleted: a page file it did not write, or one changed by hand since it wrote it (by the hash theme-preview.json records), is kept and named in `kept`, with a note; files already gone are named in `missing`, and the route and Colors page written again in `rewritten`. Every check runs before the first delete: the theme the route wears is loaded first, so a theme that does not load is refused with nothing deleted, and the refusal names the whole-preview remove, which needs no theme. A theme that is gone is replaced by the theme of the app itself, with a note. A page id matches in any case. A damaged theme-preview.json (not JSON, the wrong shape, a duplicate page, a folder or an absolute path in its files) is refused with `ERR_THEME_INVALID`, naming the file. With no folder given and no preview in the default place, a preview recorded for a theme is used. A whole remove stops, deleting nothing, when page.tsx was changed by hand: it imports the pages. A page whose file is gone leaves the nav, with a note. Refusals never suggest deleting files. Preview commands in one project run one after another. A remove deletes only the route file, the record and the page files of recorded pages (in _pages/, or pages/ for an older release), and only when a recorded hash shows they are as the preview wrote them: any other file the record names, and any file with no recorded hash, is kept and named, so a copied or edited record never deletes a project file. A route that stays keeps the pages it imports. Experimental: it may change or be removed in a patch release.',
  importPath: '@astryxdesign/cli/api/experimental',
  signature:
    'themeEditPreviewRemove(page?: string, options?: object): Promise<object>',
  keywords: ['theme', 'experimental theme', 'preview', 'theme preview'],
  params: [
    {
      name: 'page',
      type: 'string',
      description: 'The page to remove; none removes the whole preview.',
    },
    {
      name: 'options.path',
      type: 'string',
      description:
        'The folder of the preview route, when it is not in the default place.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'The folder to start from (default: the current directory): commands act on the Astryx project at or above it, so a subfolder of an app works.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.previewRemove',
      description:
        'The files deleted, kept, missing and written again, notes, and the pages left.',
    },
  ],
  throws: [
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: '--path leads outside the project; nothing is deleted',
    },
    {
      code: 'ERR_NOT_FOUND',
      when: 'there is no preview, or it has no such page',
    },
    {
      code: 'ERR_THEME_INVALID',
      when: 'theme-preview.json is damaged, or the theme the route wears does not load; nothing is deleted',
    },
    {
      code: 'ERR_UNKNOWN_THEME',
      when: 'the theme the route wears is not a theme; nothing is deleted',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'the route file was changed by hand, so it is not written again (a page remove) or its pages are not deleted (a whole remove); nothing is deleted',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'a write or delete failed; the files are put back',
    },
    {
      code: 'ERR_THEME_BUSY',
      when: 'another preview command in the project did not finish within 30 seconds; nothing is changed',
    },
    {
      code: 'ERR_THEME_LOAD',
      when: 'the theme the route wears has no build and does not build; nothing is deleted',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'a second page or another extra argument on the command line',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: 'no package.json in the folder or above it',
    },
  ],
  examples: [
    {
      label: 'One page',
      code: 'await themeEditPreviewRemove(...)',
    },
  ],
  command: 'experimental theme preview remove',
  related: ['themeEditShow'],
};
