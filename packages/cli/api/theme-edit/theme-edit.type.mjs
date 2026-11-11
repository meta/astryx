// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for `astryx experimental theme`: the source of truth
 * for its option and response shapes.
 *
 * @position api/theme-edit — typedefs for api/theme-edit/theme-edit.mjs
 */

/**
 * One setting a theme made by `experimental theme` holds.
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
 * `astryx --json experimental theme new <theme>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditNewResponse
 * @property {'themeEdit.new'} type
 * @property {{theme: string, like: string | null, files: {settings: string, source: string, css: string, module: string}, problems: string[]} & ThemeEditPreviewFields} data
 */

/**
 * `astryx --json experimental theme set|reset <theme> <thing> ...`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditChangeResponse
 * @property {'themeEdit.set' | 'themeEdit.reset'} type
 * @property {ThemeEditChangeData} data
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditChangeData
 * @property {string} theme
 * @property {'set' | 'reset'} action
 * @property {ThemeEditSetting} setting - The setting written, or for `reset` the one removed.
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
 * `astryx --json experimental theme show <theme>`.
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
 * `astryx --json experimental theme undo <theme>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditUndoResponse
 * @property {'themeEdit.undo'} type
 * @property {{theme: string, undone: string[], settings: number, stepsLeft: number} & ThemeEditPreviewFields} data
 */

/**
 * `astryx --json experimental theme preview <theme>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewResponse
 * @property {'themeEdit.preview'} type
 * @property {object} data
 * @property {string} data.theme
 * @property {string | null} data.group
 * @property {'html' | 'page'} data.mode - `html`: one rendered file; `page`: page modules written into the app.
 * @property {string[]} data.files
 * @property {string | null} data.html
 * @property {number} data.components
 * @property {string[]} data.skipped
 * @property {string[]} data.pictures
 * @property {string | null} data.pictureProblem
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditExplainOptions
 * @property {string} [cwd] - The app folder (default: process.cwd()).
 * @property {string} [list] - List what a change can name: dials, tokens, parts, families, or properties; the subject filters it.
 * @property {string[]} [at] - With a PNG picture: pixel points x,y ("40,20;300,180", "40,20 300,180", several entries, or a flat "40,20,300,180").
 * @property {number} [count] - With a PNG picture: how many main colors (default 14).
 */

/**
 * `astryx --json experimental theme explain ...`. `kind` says which answer it is.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditExplainResponse
 * @property {'themeEdit.explain'} type
 * @property {{kind: 'part' | 'family' | 'setting' | 'aspect' | 'question' | 'picture' | 'list', subject: string, [key: string]: any}} data
 */

export {};
