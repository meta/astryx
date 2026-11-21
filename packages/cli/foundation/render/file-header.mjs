// Copyright (c) Meta Platforms, Inc. and affiliates.

import {shellArg} from '../text/shell-arg.mjs';

/**
 * @file The plain-text notes a rendered file carries for whoever opens it
 * next, a person or an agent with no other context: what made the file, what
 * it carries, and the exact commands that give the page back and render it
 * again. The note at the top sits in <head> after the charset and generator
 * metas, so browsers and older CLIs still find both in the first bytes. The
 * short note at the end follows the embedded source, for a reader that starts
 * at the end of the file.
 *
 * The notes never spell the opening tag of the embedded block: every CLI
 * finds the block by that tag, and the last match wins.
 *
 * @position foundation/render — used by render-page.mjs
 */

/**
 * The command that runs one version of the CLI anywhere npm runs.
 * @param {string | null} version
 */
export const cliCommand = version => `npx @astryxdesign/cli${version ? `@${version}` : ''}`;


/**
 * Text that cannot end or nest an HTML comment.
 * @param {string} text
 */
const commentSafe = text => text.replace(/--!?>/g, '- ->').replace(/<!--/g, '<!- -');

/** The most file names the note at the top lists. */
const MAX_LISTED = 24;

/**
 * @typedef {object} FileFacts
 * @property {string | null} cli - The CLI version that rendered the file.
 * @property {number} format - The render format of the embedded source.
 * @property {string} file - The rendered file's name.
 * @property {string} page - The page's path from its project's root; outside a project, its path among the files it carries.
 * @property {string} restored - Where an import writes the page by default, from the rendered file's folder.
 * @property {string[]} files - The embedded files, page first.
 * @property {string[]} [notCarried] - Files the page uses that the file does not carry.
 * @property {Record<string, string>} packages - The packages the page rendered with, by name: their versions.
 * @property {string[]} install - What a render outside a project must install first, as name@version.
 * @property {string} [title] - The title given with --title.
 */

/**
 * The note at the top of a rendered file.
 * @param {FileFacts} facts
 * @returns {string} an HTML comment on lines of its own
 */
export function headerNote(facts) {
  const run = cliCommand(facts.cli);
  const file = shellArg(facts.file);
  const shown = facts.files.slice(0, MAX_LISTED).join(', ');
  const more = facts.files.length > MAX_LISTED ? `, and ${facts.files.length - MAX_LISTED} more` : '';
  const versions = Object.entries(facts.packages).map(([name, version]) => `${name} ${version}`);
  const core = facts.packages['@astryxdesign/core'];
  // A title with < or > stays out of the note, which other tools read as
  // HTML; step 1 prints the command with it.
  const quotable = facts.title !== undefined && !/[<>]/.test(facts.title);
  const title = quotable ? ` --title ${shellArg(/** @type {string} */ (facts.title))}` : '';
  const lines = [
    `Rendered by Astryx: astryx experimental export, @astryxdesign/cli ${facts.cli ?? '(version unknown)'}, render format ${facts.format}.`,
    "This is one file. The page's own script, at the end of the file, draws the page when it",
    'opens, so its buttons and other controls work. The render adds no network request.',
    facts.notCarried?.length
      ? 'It also carries the source of the page, except the files named under "Not carried" below; experimental import gives back the rest.'
      : 'It also carries the source of the page, so the page can come back exactly.',
    '',
    `Page: ${facts.page}`,
    `Carried files (${facts.files.length}): ${shown}${more}`,
    ...(facts.notCarried?.length
      ? [
          `Not carried: ${facts.notCarried.slice(0, MAX_LISTED).join(', ')}${facts.notCarried.length > MAX_LISTED ? `, and ${facts.notCarried.length - MAX_LISTED} more` : ''} (experimental import cannot give them back)`,
        ]
      : []),
    ...(versions.length > 0 ? [`Rendered with: ${versions.join(', ')}`] : []),
    '',
    'To change the page, change its source and render it again. Do not edit this HTML:',
    "the carried source does not get the edits you make here, and the page's script draws over them.",
    'Run these commands in the folder that holds this file:',
    `  1. Get the source back. This writes ${facts.restored} and the files it imports`,
    `     (into ${facts.restored.split('/')[0]}-2/ and so on when that folder exists; the output names it):`,
    `       ${run} experimental import ${file}`,
    '  2. Edit the restored files.',
    '  3. Render again. A render replaces a file that a render wrote. Step 1 prints this',
    '     command with the folder it wrote:',
    `       ${run} experimental export ${shellArg(facts.restored)} --out ${file}${title}`,
    ...(facts.title !== undefined && !quotable ? ['     The page was rendered with --title; step 1 prints the command with it.'] : []),
    `If you have the project, edit ${facts.page} there instead, and render it in the same way.`,
    "Inside a project, the project's own CLI answers these commands. A project CLI older than",
    `${facts.cli ?? 'the one that rendered this file'} writes the page without this note; to keep the note, update that CLI first:`,
    `       npm install --save-dev @astryxdesign/cli@${facts.cli ?? 'latest'}`,
    ...(facts.install.length > 0
      ? [
          'Outside a project, the CLI supplies Astryx, React and StyleX. Install the other packages first:',
          `       npm install ${facts.install.join(' ')}`,
        ]
      : []),
    ...(core
      ? [
          `The source was written for @astryxdesign/core ${core}. In a project on a newer Core, update the`,
          "restored code from inside that project (the CLI hands this to the project's own CLI):",
          `       ${cliCommand(null)} upgrade --from ${core} --path ${shellArg(facts.restored.split('/')[0])} --apply`,
        ]
      : []),
    'Later CLI versions read this file too.',
    'If someone edits this HTML after the render, step 1 still gives back the page as rendered,',
    'and it lists the text that changed, so you can make the same change in the source.',
    "The source is in the JSON script block near the end of this file, before the page's script.",
    'Keep it: without it, step 1 can rebuild only the text and the layout from the markup.',
  ];
  return `<!--\n${lines.map(line => (line ? `  ${commentSafe(line)}` : '')).join('\n')}\n-->`.replace(/<(?=\/?script)/gi, '&lt;');
}

/**
 * The note after the embedded source.
 * @param {Pick<FileFacts, 'cli' | 'format' | 'file'>} facts
 * @returns {string} an HTML comment on one line
 */
export function endNote(facts) {
  return `<!-- Astryx render: the block above is the source of the page (render format ${facts.format}), as JSON; each file is base64 with its SHA-256. Get it back: ${commentSafe(cliCommand(facts.cli))} experimental import ${commentSafe(shellArg(facts.file))} -->`;
}
