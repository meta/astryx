// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A reference doc as plain text: blocks, sections, and whole docs, with
 * each bare `astryx` command spelled the way the project runs the CLI.
 *
 * @input  compiled reference doc parts and a command stem
 * @output the text `astryx docs` prints, and the body of an integration skill
 * @position foundation/doc-compiler — read by the docs command and by the
 *   skill places
 */

import {
  getCliInvocation,
  prefixCliCommands,
} from '../env/package-manager.mjs';

/**
 * A table cell with its pipes escaped. Columns are separated by ` | `, and a
 * union type such as `'light' | 'dark'` is spelled with the same character,
 * so an unescaped cell reads as extra columns. `astryx component` escapes its
 * prop tables the same way.
 * @param {string | undefined} cell
 * @returns {string}
 */
export function tableCell(cell) {
  return (cell || '').replaceAll('|', '\\|');
}

/**
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {string}
 */
export function formatTable(headers, rows) {
  const head = headers.map(tableCell);
  const cells = rows.map(r => r.map(tableCell));
  const widths = head.map((h, i) =>
    Math.max(h.length, ...cells.map(r => (r[i] || '').length)),
  );
  const sep = widths.map(w => '-'.repeat(w)).join(' | ');
  const top = head.map((h, i) => h.padEnd(widths[i])).join(' | ');
  const body = cells
    .map(r => r.map((c, i) => c.padEnd(widths[i])).join(' | '))
    .join('\n');
  return `${top}\n${sep}\n${body}`;
}

/**
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {string}
 */
function formatTableCompact(headers, rows) {
  // An empty cell, such as a Default with none, adds nothing to the line.
  return rows
    .map(r => r.filter(cell => String(cell ?? '').trim() !== '').join(' = '))
    .join('\n');
}

/**
 * One content block as text.
 * @param {import('@astryxdesign/cli/authoring').ReferenceContentBlock} block
 * @param {'full' | 'compact' | 'brief'} detail
 * @param {string} [stem] how commands are run: this run's invocation by default
 * @returns {string | null}
 */
export function formatBlock(block, detail, stem = getCliInvocation()) {
  // Docs write commands as bare `astryx ...`; show them the way this project
  // runs the CLI.
  /** @param {string} value */
  const shown = value => prefixCliCommands(value, stem);
  switch (block.type) {
    case 'prose':
      return shown(block.text);

    case 'heading':
      return `${'#'.repeat(block.level || 3)} ${shown(block.text)}`;

    case 'code':
      if (detail === 'compact' || detail === 'brief') return null;
      {
        // The label names the block, so it prints above the fence, not
        // inside it: `// label` is not a comment in bash, CSS, JSON, or
        // HTML, and a reader who copies the block would copy it too.
        const label = block.label
          ? `${block.label.replace(/:\s*$/, '')}:\n`
          : '';
        const body = prefixCliCommands(block.code, stem, block.lang);
        return `${label}\`\`\`${block.lang}\n${body}\n\`\`\``;
      }

    case 'table': {
      // A cell that is a whole command, such as `astryx theme add neutral`
      // written without backticks, is prefixed too.
      /** @param {string} cell */
      const shownCell = cell =>
        /^astryx(\s|$)/.test(cell ?? '')
          ? `${stem}${cell.slice('astryx'.length)}`
          : shown(cell ?? '');
      const rows = block.rows.map(row => row.map(shownCell));
      if (detail === 'brief') {
        return rows
          .map(r => r.slice(0, 2).map(tableCell).join('='))
          .join(' | ');
      }
      if (detail === 'compact') {
        return formatTableCompact(block.headers, rows);
      }
      return formatTable(block.headers, rows);
    }

    case 'list': {
      const prefix =
        block.style === 'ordered'
          ? (/** @type {number} */ i) => `${i + 1}. `
          : block.style === 'dont'
            ? () => 'x '
            : block.style === 'do'
              ? () => '+ '
              : () => '- ';
      return block.items
        .map((item, i) => `${prefix(i)}${shown(item)}`)
        .join('\n');
    }

    default:
      return null;
  }
}

/**
 * One section as text.
 * @param {{title: string, content: import('@astryxdesign/cli/authoring').ReferenceContentBlock[]}} section
 * @param {'full' | 'compact' | 'brief'} detail
 * @param {string} [stem]
 * @returns {string}
 */
export function formatSection(section, detail, stem = getCliInvocation()) {
  const blocks = section.content
    .map(b => formatBlock(b, detail, stem))
    .filter(Boolean);

  if (detail === 'brief') {
    const first = blocks[0] || '';
    return `${section.title}: ${first.split('\n')[0]}`;
  }

  const heading =
    detail === 'compact' ? `[${section.title}]` : `## ${section.title}`;
  return `${heading}\n\n${blocks.join('\n\n')}`;
}

/**
 * A whole reference doc as text: its title, description, and sections.
 * @param {{title: string, description: string, sections: Array<{title: string, content: import('@astryxdesign/cli/authoring').ReferenceContentBlock[]}>}} docs
 * @param {'full' | 'compact' | 'brief'} detail
 * @param {string} [stem]
 * @returns {string}
 */
export function formatReferenceFull(docs, detail, stem = getCliInvocation()) {
  if (detail === 'brief') {
    const header = `${docs.title}: ${docs.description}`;
    const sections = docs.sections.map(s => formatSection(s, detail, stem));
    return `${header}\n${sections.join('\n')}`;
  }

  const header =
    detail === 'compact'
      ? `# ${docs.title}\n${docs.description}`
      : `# ${docs.title}\n\n${docs.description}`;
  const sections = docs.sections.map(s => formatSection(s, detail, stem));
  const sep = detail === 'compact' ? '\n\n' : '\n\n';
  return `${header}\n\n${sections.join(sep)}`;
}

