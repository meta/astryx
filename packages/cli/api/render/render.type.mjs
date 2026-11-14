// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for `astryx experimental render`: the source of truth
 * for its response shapes.
 *
 * @position api/render — typedefs for api/render/render.mjs
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {object} RenderOptions
 * @property {string} [cwd] - Folder relative paths resolve from (default: process.cwd()).
 * @property {string} [out] - The file to write. Rendering: an .html file (default: the page's name with .html). Reversing: a page module (default: inside a new folder beside the HTML file, named after it, such as `report-restored/`).
 * @property {boolean} [reverse] - Turn a rendered HTML file back into a page module.
 * @property {string} [title] - The rendered page's title (default: its first heading, else the file name). Rendering only.
 * @property {boolean} [overwrite] - Replace the existing page module when reversing (never a protected file, and never a file other than the page, which always goes into a new folder). Rendering replaces an existing HTML file only when a render wrote it.
 */

/**
 * Something the render noticed that may make the page differ from what its
 * author meant.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} RenderWarning
 * @property {'dropped-children' | 'remote-asset' | 'missing-asset' | 'page-output' | 'page-script' | 'no-astryx-styles' | 'chart-size' | 'not-embedded' | 'node-crash'} code - What kind of problem.
 * @property {string} message - What happened and what to do, in one sentence.
 */

/**
 * A run of text in a rendered file that differs from the text the render
 * wrote: someone edited the HTML after the render.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} RenderEdit
 * @property {string | null} was - The text as rendered; null for text added after the render.
 * @property {string | null} now - The text the file holds now; null for text removed after the render.
 * @property {string} [file] - The restored module that holds the text as rendered, when it appears there exactly once.
 * @property {number} [line] - The line of `file` where that text starts.
 */

/**
 * `astryx --json experimental render <page>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} RenderPageResponse
 * @property {'render.page'} type
 * @property {object} data
 * @property {string} data.input - The page module, relative to cwd when inside it.
 * @property {string} data.output - The HTML file written.
 * @property {number} data.bytes - Size of the HTML file.
 * @property {string[]} data.files - Local files the page loaded (modules, stylesheets, images, JSON), relative to the folder that holds them all (the page's folder unless it imports from above it), page first; each is embedded so --reverse can give it back.
 * @property {string[]} data.stylesheets - Package stylesheets that were cut to the rules the page uses and inlined.
 * @property {number} data.classes - Distinct class names in the markup.
 * @property {number} data.cssBytes - Size of the inlined CSS.
 * @property {number} data.images - Local files inlined as data: URIs.
 * @property {RenderWarning[]} data.warnings - Empty when nothing looked wrong.
 */

/**
 * `astryx --json experimental render --reverse <file.html>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} RenderReverseResponse
 * @property {'render.reverse'} type
 * @property {object} data
 * @property {string} data.input - The HTML file read.
 * @property {'embedded' | 'rebuilt'} data.mode - `embedded`: the file carried its source, written back byte for byte. `rebuilt`: rebuilt from Astryx markup (text and layout only).
 * @property {string} data.output - The page module written: `out`, or by default inside a new folder beside the HTML file named after it (`report.html` gives `report-restored/`).
 * @property {string[]} data.files - Every file written, page first.
 * @property {boolean} data.exact - Whether the page and every file it imports came back exactly as rendered.
 * @property {string[]} [data.missing] - Embedded only: relative imports the file did not carry (files a render never embeds), so the restored page needs them before it renders.
 * @property {string[]} [data.components] - Rebuilt only: the components the page uses.
 * @property {number} [data.elements] - Rebuilt only: how many component elements were rebuilt.
 * @property {string[]} [data.unknown] - Rebuilt only: Astryx class names no installed component claims; their content is kept as plain elements.
 * @property {string[]} [data.omitted] - Rebuilt only: component kinds left out because the markup cannot give them back (such as icons).
 * @property {number} [data.format] - Embedded only: the render format of the file's embedded source.
 * @property {string} [data.renderedBy] - Embedded only: the version of the CLI that rendered the file, when the file names it.
 * @property {string[]} [data.packages] - Embedded only, when the file records them: the packages the page rendered with, as `name@version`.
 * @property {string} [data.title] - Embedded only: the title given with --title when the page was rendered, which a render again needs too.
 * @property {boolean} [data.edited] - Embedded only, when the file records the page as rendered: whether someone changed its markup, title or styles after the render. The restored files are always the page as rendered, without those changes.
 * @property {boolean} [data.stylesEdited] - With `edited`: whether the styles (the <style> element) changed after the render.
 * @property {RenderEdit[]} [data.edits] - When `edited`: each run of text that changed after the render (at most 50, the title first), so the change can be made in the source. Empty when only styles, attributes, elements or formatting changed.
 * @property {number} [data.moreEdits] - When `edits` stops at 50: how many more changes there are.
 */

export {};
