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
 * @property {string} [on] - The part, group, or typography role it applies to; absent for the whole theme.
 * @property {string} [when] - `<prop>:<value>`: only that variant.
 * @property {string} [state] - Only that state.
 * @property {'light' | 'dark'} [mode] - Only that color mode.
 * @property {boolean} [only] - One member of an always-alike group, not the whole group.
 * @property {string} [axis] - For the `headings` dial: `weight` or `tracking`.
 * @property {string} [note] - What the check found worth saying (what the token feeds, parts it misses).
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditNewOptions
 * @property {string} [cwd] - The folder to start from (default: process.cwd()); commands act on the Astryx project at or above it.
 * @property {string} [like] - A built-in theme to build on: neutral, stone, matcha, y2k, gothic, chocolate, or butter.
 * @property {boolean} [png] - Also take PNG pictures of the preview with a Playwright or Chrome found on the machine.
 * @property {Record<string, string | string[] | undefined>} [settings] - Dial settings to start with, by dial name (`{accent: '#7c3aed', corners: 'round', vibrancy: '60'}`), each checked as `set` checks it; every dial but `base` (use `like`). `headings` takes a list for a weight and a tracking.
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditChangeOptions
 * @property {string} [cwd] - The folder to start from (default: process.cwd()); commands act on the Astryx project at or above it.
 * @property {string} [on] - A part (`button`), a group (`inputs`), or for `font` a role (`heading`).
 * @property {string} [when] - `<prop>:<value>`: only that variant, such as `variant:primary`.
 * @property {string} [state] - Only that state, such as `hover`.
 * @property {string} [mode] - `light` or `dark`: only that color mode (colors only; a shadow is one value for both modes).
 * @property {boolean} [only] - With a member of an always-alike group (inputs, checks), style just that part.
 * @property {boolean} [png] - Also take PNG pictures of the preview.
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewFields
 * @property {string | null} preview - The sample app page with the theme, one self-contained HTML file; null when the components could not be rendered.
 * @property {string[]} pictures - PNG pictures taken (only with `png`).
 * @property {string | null} pictureProblem - Why no picture was taken, and how to get a browser for it.
 * @property {{code: string, cause: string} | null} notChecked - Set when the change is saved but the components could not be rendered, so it was not checked and has no preview: the cause, such as two copies of React.
 * @property {string} [sheetStale] - Set when sheet.html (the sheet of every component, made by `show`) shows the theme as it was before this change: it says so at its top until `show` makes it again.
 * @property {string[]} [previewStale] - Files of the in-app theme preview that were not written again and still show the theme as it was: changed by hand, or a preview folder where a stopped preview change waits for the next preview command.
 * @property {{wrote: string[]}} [appCopy] - Only the first time the theme's app copy is written (src/themes/<theme>/, a standard local theme `astryx theme add <theme>` takes, written again after every build): the files written.
 */

/**
 * `astryx --json experimental theme editor new <theme>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditNewResponse
 * @property {'themeEdit.new'} type
 * @property {{theme: string, like: string | null, files: {settings: string, source: string, css: string, module: string}, settings: string[], notes: string[], problems: string[], wiring: string[]} & ThemeEditPreviewFields} data - `settings`: the dial settings it started with; `notes`: font loading; `wiring`: the steps that put the theme into this app (`theme add <theme>` for its app copy in src/themes/<theme>/, else the root file, its imports and the Theme around the app; what builds it).
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
 * @property {string} [now] - On `undo`: what applies instead of the setting removed: a dial that still writes the token (such as the generated accent color), a whole-theme setting of the same thing, or the base theme's value.
 * @property {ThemeEditSetting} [removed] - On `undo`: the setting removed (the same as `setting`); the value now in effect is the base theme's, and `changedTokens` lists it.
 * @property {ThemeEditSetting | null} replaced - The setting this one replaced.
 * @property {string | null} was - For `base`, `mode` and a whole-theme dial: the value before.
 * @property {string[]} parts - The parts it styles (a group's members when it spread).
 * @property {{name: string, members: string[], onlyHint: boolean} | null} group - The group it spread to; `onlyHint` when `--only` would style one member.
 * @property {string[]} changedTokens - Resolved token changes, `name (mode): before -> after`.
 * @property {string[]} styled - Part styles and typography the change wrote.
 * @property {string[]} kept - Part settings a whole-theme dial left in place (a part setting wins).
 * @property {string[]} lifted - Variant keys the setting was newly repeated on, so a more specific base rule cannot beat it.
 * @property {string[]} notes - What else to know: the shade a color's main token uses and any shade contrast moved, then the generated color files; font loading; what a token feeds.
 * @property {string[]} problems - Text this theme made unreadable (below 4.5:1, and not that low in the base theme).
 * @property {string[]} warnings - Warnings from the theme build.
 * @property {string | null} preview
 * @property {string[]} pictures
 * @property {string | null} pictureProblem
 * @property {{code: string, cause: string} | null} notChecked - Saved but not checked: see ThemeEditPreviewFields.
 * @property {string[]} [previewStale] - In-app preview files changed by hand: see ThemeEditPreviewFields.
 * @property {string} [sheetStale] - Set when sheet.html shows the theme as it was before this change: see ThemeEditPreviewFields.
 * @property {{wrote: string[]}} [appCopy] - Only the first time the theme's app copy is written: see ThemeEditPreviewFields.
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditShowOptions
 * @property {string} [cwd] - The folder to start from (default: process.cwd()); commands act on the Astryx project at or above it.
 * @property {string} [section] - Only one section of the sheet: actions, inputs, selection, navigation, feedback, data, containers, overlays, or pages.
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
 * @property {Array<ThemeEditSetting & {parts: string[], masked?: string}>} data.settings - Each setting with the parts it styles; `masked` says what a later or stronger setting hides of it.
 * @property {Record<string, Record<string, string | null> | string | null>} data.resolved - Key tokens: colors and shadows per mode; sizes, numbers and fonts, which are the same in both modes, as one value.
 * @property {string[]} data.partValues - Each corners or spacing setting on a part or group, with what its parts get and the whole-theme value beside it.
 * @property {number | null} data.vibrancy - How saturated the generated colors are (0 to 100); null when the theme sets no color.
 * @property {ThemeEditColor[]} data.colors - Each color the theme sets, with the shade each token uses.
 * @property {string[]} data.colorNotes - What the color config keeps or replaced of a hand edit, tokens that use another shade than usual so they read, and any that still do not.
 * @property {string[]} data.problems
 * @property {string[]} data.notes
 * @property {string} data.preview
 * @property {string[]} [data.previewStale] - In-app preview files changed by hand, so they were not written again and still show the theme as it was.
 * @property {string} data.sheet - The theme-building page with every component.
 * @property {number} data.sheetComponents
 * @property {string[]} data.skipped - Template pages left out, with the install line each needs.
 * @property {string[]} data.pictures
 * @property {string | null} data.pictureProblem
 * @property {{config: string, module: string, receipt: string} | null} data.colorFiles - The generated color files: the input (in the shape `theme palette generate` reads), the module the theme imports, and the receipt; null when the theme sets no color.
 * @property {{wrote: string[]}} [data.appCopy] - Only the first time the theme's app copy is written: the files written in src/themes/<theme>/.
 * @property {string[]} data.wiring - The steps that put the theme into this app: the root file, its imports, the Theme around the app, and what builds it (`theme add <theme>`, for the app copy the editor writes in src/themes/<theme>/; the imports by hand when a folder of yours is there).
 */

/**
 * One color of a theme, as `show` reports it.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditColor
 * @property {string} color - The setting that makes it: accent, neutral, success, warning, danger or info.
 * @property {string} seed - The color it is generated from, as hex.
 * @property {Record<string, string>} tokens - The shade each token uses: `light <shade> <hex>, dark <shade> <hex>`, and whether an exact token setting wins.
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditUndoOptions
 * @property {string} [cwd] - The folder to start from (default: process.cwd()); commands act on the Astryx project at or above it.
 * @property {string} [thing] - Remove this one setting (a dial, a token, or a CSS property) instead of stepping back one change; the result's `now` says what applies instead.
 * @property {string} [value] - With `thing` `headings`: which half to remove, `weight` or `tracking`.
 * @property {string} [on] - With `thing`: the part, group or role it was set on.
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
 * @property {{theme: string, action: 'step', undone: string[], settings: number, stepsLeft: number, changedTokens: string[], problems: string[]} & ThemeEditPreviewFields} data
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewAddOptions
 * @property {string} [cwd] - The folder to start from (default: process.cwd()); commands act on the Astryx project at or above it.
 * @property {string} [theme] - The theme the pages wear: a theme made by `experimental theme editor` (default: the only one under themes/; with none or several, the app's own theme).
 * @property {string} [template] - Add this page template instead of ranking one from a description.
 * @property {number | string} [top] - With a description: how many of the best-fitting page templates to add, 1 to 3 (default 1). A string is taken as typed: only "1", "2" or "3".
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
 * @property {string[]} data.refreshed - Pages that were there already and are written again.
 * @property {Array<{page: string, why: string}>} data.matched - Each template page added for a description or --template, and why it was picked.
 * @property {Array<{page: string, reason: string, installCommand: string | null}>} data.skipped - Template pages not added: why (packages the app lacks, or a StyleX compiler it does not have), with the command that installs what is missing.
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
 * @property {string} [cwd] - The folder to start from (default: process.cwd()); commands act on the Astryx project at or above it.
 * @property {string} [path] - The folder of the preview route, when it is not in the default place.
 */

/**
 * `astryx --json experimental theme preview list`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewListResponse
 * @property {'themeEdit.previewList'} type
 * @property {{folder: string | null, theme: string | null, themeMissing: boolean, pages: Array<{id: string, label: string, missing?: boolean}>, notes: string[]}} data - `themeMissing`: the theme the preview wears is gone, so its route does not build; a page's `missing`: its file is gone; `notes`: what else to know, such as the command that fixes it.
 */

/**
 * `astryx --json experimental theme preview remove [<page>]`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditPreviewRemoveResponse
 * @property {'themeEdit.previewRemove'} type
 * @property {object} data
 * @property {string} data.folder - The preview route folder.
 * @property {string[]} data.removed - Files deleted.
 * @property {string[]} data.kept - Files kept: changed by hand after the preview wrote them, or not written by it.
 * @property {string[]} data.missing - Files the preview had written that were gone already.
 * @property {string[]} data.rewritten - Files written again, so the route and the Colors page match the pages left.
 * @property {string[]} data.notes - What else to know.
 * @property {string[]} data.pages - The pages left, in order; empty when the whole preview was removed.
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditHowOptions
 * @property {string} [cwd] - The folder to start from (default: process.cwd()); commands act on the Astryx project at or above it.
 * @property {string} [list] - List what a change can name: dials, tokens, parts, groups, or properties (any case, singular or plural); the subject filters it. An empty string or `kinds` lists the kinds.
 * @property {string} [theme] - The theme the suggested commands are for, checked against its settings (default: the only theme the editor made in the app; with several, the one an editor command changed last; with none, `my-theme`, which the answer makes first). An empty name is refused.
 * @property {string[]} [at] - With a PNG picture: pixel points x,y, whole numbers inside the picture ("40,20;300,180", "40,20 300,180", several entries, or a flat "40,20,300,180").
 * @property {number} [count] - With a PNG picture: how many main colors (default 14).
 * @property {string[]} [words] - The words as typed after `how`: a picture first takes only a count after it (the count is read from the words); anything else is one question. Replaces `subject`.
 */

/**
 * `astryx --json experimental theme editor how <subject>`. `kind` says which answer it is.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} ThemeEditHowResponse
 * @property {'themeEdit.how'} type
 * @property {{kind: 'part' | 'group' | 'setting' | 'aspect' | 'question' | 'picture' | 'list', subject: string, [key: string]: any}} data
 */

export {};
