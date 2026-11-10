// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for `astryx experimental theme editor`: the source of truth
 * for its option and response shapes.
 *
 * @position api/theme-edit — typedefs for api/theme-edit/theme-edit.mjs
 */

/**
 * One setting a theme made by `experimental theme editor` holds.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditSetting
 * @property {string} thing - A dial (`corners`), a design token (`--color-accent`), or a CSS property (`background`).
 * @property {string} value - The value as stored (a dial step is stored as the rung it reached).
 * @property {'dial' | 'token' | 'property'} source - What kind of thing it is.
 * @property {string} [on] - The part, family, or typography role it applies to; absent for the whole theme.
 * @property {string} [when] - `<prop>:<value>`: only that variant.
 * @property {string} [state] - Only that state.
 * @property {'light' | 'dark'} [mode] - Only that color mode.
 * @property {boolean} [only] - One member of an always-alike family, not the whole family.
 * @property {string} [axis] - For the `headings` dial: `weight` or `tracking`.
 * @property {string} [note] - What the check found worth saying (what the token feeds, parts it misses).
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditNewOptions
 * @property {string} [cwd] - The app folder (default: process.cwd()).
 * @property {string} [like] - A built-in theme to build on: neutral, stone, matcha, y2k, gothic, chocolate, or butter.
 * @property {boolean} [png] - Also take PNG pictures of the preview with a Playwright or Chrome found on the machine.
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditChangeOptions
 * @property {string} [cwd] - The app folder (default: process.cwd()).
 * @property {string} [on] - A part (`button`), a family (`inputs`), or for `font` a role (`heading`).
 * @property {string} [when] - `<prop>:<value>`: only that variant, such as `variant:primary`.
 * @property {string} [state] - Only that state, such as `hover`.
 * @property {string} [mode] - `light` or `dark`: only that color mode (colors and shadows only).
 * @property {boolean} [only] - With a member of an always-alike family (inputs, checks), style just that part.
 * @property {boolean} [png] - Also take PNG pictures of the preview.
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewFields
 * @property {string} preview - The sample app page with the theme, one self-contained HTML file.
 * @property {string[]} pictures - PNG pictures taken (only with `png`).
 * @property {string | null} pictureProblem - Why no picture was taken, and how to get a browser for it.
 */

/**
 * `astryx --json experimental theme editor new <theme>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditNewResponse
 * @property {'themeEdit.new'} type
 * @property {{theme: string, like: string | null, files: {settings: string, source: string, css: string, module: string}, problems: string[]} & ThemeEditPreviewFields} data
 */

/**
 * `astryx --json experimental theme editor set <theme> <thing> <value>`, and
 * `undo <theme> <thing>`, which removes one setting.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditChangeResponse
 * @property {'themeEdit.set' | 'themeEdit.undo'} type
 * @property {ThemeEditChangeData} data
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditChangeData
 * @property {string} theme
 * @property {'set' | 'undo'} action
 * @property {ThemeEditSetting} setting - The setting written, or for `undo` the one removed.
 * @property {ThemeEditSetting | null} replaced - The setting this one replaced.
 * @property {string | null} was - For `base` and `mode`: the value before.
 * @property {string[]} parts - The parts it styles (a family's members when it spread).
 * @property {{name: string, members: string[], onlyHint: boolean} | null} family - The family it spread to; `onlyHint` when `--only` would style one member.
 * @property {string[]} changedTokens - Resolved token changes, `name (mode): before -> after`.
 * @property {string[]} styled - Part styles and typography the change wrote.
 * @property {string[]} kept - Part settings a whole-theme dial left in place (a part setting wins).
 * @property {string[]} lifted - Variant keys the setting was newly repeated on, so a more specific base rule cannot beat it.
 * @property {string[]} notes - What else to know: accent text per mode, font loading, what a token feeds.
 * @property {string[]} problems - Text this theme made unreadable (below 4.5:1, and not that low in the base theme).
 * @property {string[]} warnings - Warnings from the theme build.
 * @property {string} preview
 * @property {string[]} pictures
 * @property {string | null} pictureProblem
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditShowOptions
 * @property {string} [cwd] - The app folder (default: process.cwd()).
 * @property {string} [group] - Only one group on the sheet: actions, inputs, selection, navigation, feedback, data, containers, overlays, or pages.
 * @property {boolean} [png] - Also take PNG pictures of the previews.
 */

/**
 * `astryx --json experimental theme editor show <theme>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditShowResponse
 * @property {'themeEdit.show'} type
 * @property {object} data
 * @property {string} data.theme
 * @property {string | null} data.like
 * @property {string} data.mode
 * @property {Array<ThemeEditSetting & {parts: string[]}>} data.settings
 * @property {Record<string, Record<string, string | null>>} data.resolved - Key tokens, per mode.
 * @property {string[]} data.problems
 * @property {string[]} data.notes
 * @property {string} data.preview
 * @property {string} data.sheet - The theme-building page with every component.
 * @property {number} data.sheetComponents
 * @property {string[]} data.skipped - Template pages left out, with the install line each needs.
 * @property {string[]} data.pictures
 * @property {string | null} data.pictureProblem
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditUndoOptions
 * @property {string} [cwd] - The app folder (default: process.cwd()).
 * @property {string} [thing] - Remove this one setting (a dial, a token, or a CSS property) instead of stepping back one change; it goes back to the base theme's value.
 * @property {string} [value] - With `thing` `headings`: which half to remove, `weight` or `tracking`.
 * @property {string} [on] - With `thing`: the part, family or role it was set on.
 * @property {string} [when] - With `thing`: the variant it was set for.
 * @property {string} [state] - With `thing`: the state it was set for.
 * @property {string} [mode] - With `thing`: the mode it was set for.
 * @property {boolean} [only] - With `thing`: whether it was set with `--only`.
 * @property {boolean} [png] - Also take PNG pictures of the preview.
 */

/**
 * `astryx --json experimental theme editor undo <theme>`: one step back.
 * With a thing, undo returns a {@link ThemeEditChangeResponse} instead.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditUndoResponse
 * @property {'themeEdit.undo'} type
 * @property {{theme: string, action: 'step', undone: string[], settings: number, stepsLeft: number} & ThemeEditPreviewFields} data
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewAddOptions
 * @property {string} [cwd] - The project folder (default: process.cwd()).
 * @property {string} [theme] - The theme the pages wear: a theme made by `experimental theme editor` (default: the only one under themes/; with none or several, the app's own theme).
 * @property {string} [template] - Add this page template instead of ranking one from a description.
 * @property {number} [top] - With a description: how many of the best-fitting page templates to add, 1 to 3 (default 1).
 * @property {string} [path] - The folder of the preview route, inside the project (default: theme-preview/ in the app's routes folder, app/ or src/app/).
 */

/**
 * `astryx --json experimental theme preview add [<description>]`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewAddResponse
 * @property {'themeEdit.previewAdd'} type
 * @property {object} data
 * @property {string} data.folder - The preview route folder.
 * @property {string | null} data.theme - The theme the pages wear; null for the app's own theme.
 * @property {string[]} data.added - Pages added by this call.
 * @property {Array<{page: string, missingPackages: string[], installCommand: string | null}>} data.skipped - Template pages not added because the app lacks packages they import, with the command that installs them.
 * @property {string[]} data.notes - What else to know.
 * @property {string[]} data.pages - Every page of the preview, in order.
 * @property {string[]} data.files - Every file the preview wrote.
 * @property {string} data.open - How to open the preview.
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewAppOptions
 * @property {string} [cwd] - The folder the app folder is inside (default: process.cwd()).
 * @property {string} [theme] - A theme made by `experimental theme editor` here: it is copied into the app, and the preview pages wear it (default: the app's own neutral theme).
 * @property {boolean} [overwrite] - Write into a folder that is not empty. A protected file there is never replaced, and the folder's own package.json and .gitignore are kept.
 */

/**
 * `astryx --json experimental theme preview app <dir>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewAppResponse
 * @property {'themeEdit.previewApp'} type
 * @property {object} data
 * @property {string} data.folder - The new app folder.
 * @property {string | null} data.theme - The theme copied into the app, which the pages wear; null for the app's own neutral theme.
 * @property {string[]} data.pages - The preview pages.
 * @property {string[]} data.files - Every file written.
 * @property {string[]} data.notes - What else to know.
 * @property {string} data.open - How to install, run and open the app.
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewListOptions
 * @property {string} [cwd] - The project folder (default: process.cwd()).
 * @property {string} [path] - The folder of the preview route, when it is not in the default place.
 */

/**
 * `astryx --json experimental theme preview list`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewListResponse
 * @property {'themeEdit.previewList'} type
 * @property {{folder: string | null, theme: string | null, pages: Array<{id: string, label: string}>}} data
 */

/**
 * `astryx --json experimental theme preview remove [<page>]`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewRemoveResponse
 * @property {'themeEdit.previewRemove'} type
 * @property {{folder: string, removed: string[], pages: string[]}} data
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditHowOptions
 * @property {string} [cwd] - The app folder (default: process.cwd()).
 * @property {string} [list] - List what a change can name: dials, tokens, parts, families, or properties; the subject filters it.
 * @property {string[]} [at] - With a PNG picture: pixel points x,y ("40,20;300,180", "40,20 300,180", several entries, or a flat "40,20,300,180").
 * @property {number} [count] - With a PNG picture: how many main colors (default 14).
 */

/**
 * `astryx --json experimental theme editor how <subject>`. `kind` says which answer it is.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditHowResponse
 * @property {'themeEdit.how'} type
 * @property {{kind: 'part' | 'family' | 'setting' | 'aspect' | 'question' | 'picture' | 'list', subject: string, [key: string]: any}} data
 */

export {};
