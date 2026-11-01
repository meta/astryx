// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compare API reports and render the pull request's API changes.
 *
 * @input  the merge base's committed reports, the reports generated from the
 *         head's build, and the head's committed reports, per package
 * @output added, changed, and removed rows per package, each with its
 *         signature and a usage example, plus whether the committed report is
 *         stale against the head's build; and the advisory Markdown the pull
 *         request report embeds
 * @position scripts/api-report — evidence only: nothing here fails a check or
 *           decides acceptance (architecture:public-component-api INV24, INV13)
 */

/**
 * @typedef {object} Row
 * @property {string} entry - entry point (`.`, `./theme`) or a package-level section heading
 * @property {string} section - `Components`, `Types`, `Stylesheets`, …
 * @property {string} item - `component Button`, `var --color-accent`, …
 * @property {string|null} member - `size`, `inherits`, … or null for the item row
 * @property {string} line - the row as the report writes it
 */

/**
 * Split a report into rows keyed by entry point, section, item, and member.
 * @param {string|null|undefined} text
 * @returns {Map<string, Row>}
 */
export function parseReport(text) {
  const rows = new Map();
  let entry = '';
  let section = '';
  let fenced = false;
  let item = null;
  for (const line of (text ?? '').split('\n')) {
    if (line.startsWith('```')) {
      fenced = !fenced;
      item = null;
      continue;
    }
    if (!fenced) {
      const h2 = line.match(/^## (.+)$/);
      const h3 = line.match(/^### (.+)$/);
      if (h2) [entry, section] = [h2[1].replace(/`/g, ''), ''];
      else if (h3) section = h3[1];
      else if (/^(bin|stylesheet|asset|missing) /.test(line)) {
        const key = line.split(':')[0].split(' (')[0];
        rows.set(`${entry}\0${key}`, {
          entry,
          section: 'Entry point',
          item: key,
          member: null,
          line,
        });
      }
      continue;
    }
    if (!line.trim()) continue;
    if (!line.startsWith(' ')) {
      item = itemName(line);
      rows.set(`${entry}\0${section}\0${item}`, {
        entry,
        section,
        item,
        member: null,
        line,
      });
    } else if (item) {
      const member = memberName(line);
      rows.set(`${entry}\0${section}\0${item}\0${member}`, {
        entry,
        section,
        item,
        member,
        line: line.trim(),
      });
    }
  }
  return rows;
}

function itemName(line) {
  if (/^[\w$]+ \(/.test(line)) return line.split(' ')[0]; // `Name (./entry)` in an also-exported list
  const m = line.match(/^(\w+) ([^\s(:<=]+)/);
  return m ? `${m[1]} ${m[2]}` : line;
}

function memberName(line) {
  const t = line.trim();
  if (t.startsWith('inherits ')) return 'inherits';
  if (t.startsWith('overload ')) return t;
  const m = t.match(/^(?:prop )?([^\s?:(]+)/);
  return m ? m[1] : t;
}

/**
 * @param {string|null|undefined} base
 * @param {string} head
 * @returns {{added: Row[], changed: Array<Row & {before: string}>, removed: Row[]}}
 */
export function diffReports(base, head) {
  const a = parseReport(base);
  const b = parseReport(head);
  const added = [];
  const changed = [];
  const removed = [];
  for (const [k, row] of b) {
    if (!a.has(k)) added.push(row);
    else if (a.get(k).line !== row.line)
      changed.push({...row, before: a.get(k).line});
  }
  for (const [k, row] of a) if (!b.has(k)) removed.push(row);
  // A wholly added or removed item reports once, not once per member.
  const fold = rows => {
    const items = new Set(
      rows
        .filter(r => !r.member)
        .map(r => `${r.entry}\0${r.section}\0${r.item}`),
    );
    return rows.filter(
      r => !r.member || !items.has(`${r.entry}\0${r.section}\0${r.item}`),
    );
  };
  return {added: fold(added), changed, removed: fold(removed)};
}

/**
 * A one-line usage example for a row.
 * @param {string} pkg
 * @param {Row} row
 * @returns {string}
 */
export function usageFor(pkg, row) {
  const spec = row.entry.startsWith('./') ? `${pkg}${row.entry.slice(1)}` : pkg;
  const [kind, name = row.item] = row.item.split(' ');
  if (row.section === 'Stylesheets') return `.my-scope { ${name}: …; }`;
  if (row.section === 'Theme targets')
    return `defineTheme({components: {'${name}': {…}}})`;
  if (row.section === 'Public attributes') return `[${name}] { … }`;
  if (row.section === 'Reachable members tagged internal')
    return `import {${name}} from '${pkg}'`;
  if (row.section === 'Entry point')
    return kind === 'bin'
      ? `npx ${name.replace(/`/g, '')}`
      : `import '${spec}'`;
  if (kind === 'component') {
    if (!row.member || row.member === 'inherits') return `<${name} />`;
    const literal = row.line.match(/'([^']+)'/);
    const value = literal
      ? `"${literal[1]}"`
      : /: boolean/.test(row.line)
        ? ''
        : '{…}';
    return `<${name} ${row.member}${value ? `=${value}` : ''} />`;
  }
  if (kind === 'hook' || kind === 'function')
    return `import {${name}} from '${spec}'; ${name}(…)`;
  if (kind === 'class')
    return `import {${name}} from '${spec}'; new ${name}(…)`;
  if (kind === 'interface' || kind === 'type' || kind === 'enum') {
    return row.member && row.member !== 'inherits'
      ? `import type {${name}} from '${spec}'; const x: ${name} = {${row.member}: …}`
      : `import type {${name}} from '${spec}'`;
  }
  return `import {${name}} from '${spec}'`;
}

/**
 * @param {Array<{pkg: string, base: string|null, head: string, committed: string|null}>} packages
 */
export function computeChanges(packages) {
  return packages
    .map(({pkg, base, head, committed}) => {
      const d = diffReports(base, head);
      return {
        pkg,
        stale: committed != null && committed !== head,
        missing: committed == null,
        counts: {
          added: d.added.length,
          changed: d.changed.length,
          removed: d.removed.length,
        },
        rows: [
          ...d.added.map(r => ({change: 'added', ...r})),
          ...d.changed.map(r => ({change: 'changed', ...r})),
          ...d.removed.map(r => ({change: 'removed', ...r})),
        ].map(r => ({...r, usage: usageFor(pkg, r)})),
      };
    })
    .sort((x, y) => (x.pkg < y.pkg ? -1 : x.pkg > y.pkg ? 1 : 0));
}

// The pull request comment has a size limit; a wide change lists its first rows.
const MAX_ROWS = 150;

const code = s => `\`${s.replace(/`/g, "'").replace(/\|/g, '\\|')}\``;
const where = r => [r.entry, r.section, r.item].filter(Boolean).join(' · ');
const short = pkg => pkg.replace(/^@astryxdesign\//, '');

/**
 * The advisory API changes for the pull request report: one visible summary
 * line, with every row inside a closed disclosure.
 * @param {ReturnType<typeof computeChanges>} changes
 * @returns {string} empty when nothing changed and every report is current
 */
export function renderChanges(changes) {
  const touched = changes.filter(c => c.rows.length || c.stale || c.missing);
  if (!touched.length) return '';
  const parts = touched.map(c => {
    const counts = c.rows.length
      ? ` +${c.counts.added} · ~${c.counts.changed} · −${c.counts.removed}`
      : ' no changes';
    const note = c.missing
      ? ' (report not committed: run `pnpm api:report`)'
      : c.stale
        ? ' (report stale: run `pnpm api:report`)'
        : '';
    return `${short(c.pkg)}${counts}${note}`;
  });
  const rows = touched.flatMap(c =>
    c.rows.map(r => ({pkg: short(c.pkg), ...r})),
  );
  const L = [`**API changes:** ${parts.join('; ')}`];
  if (rows.length) {
    L.push(
      '',
      `<details><summary>${rows.length} API change${rows.length === 1 ? '' : 's'} (advisory)</summary>`,
      '',
      '| | Package | Where | Signature | Usage |',
      '| --- | --- | --- | --- | --- |',
      ...rows.slice(0, MAX_ROWS).map(r => {
        const sign =
          r.change === 'added' ? '+' : r.change === 'removed' ? '−' : '~';
        const sig =
          r.change === 'changed'
            ? `${code(r.before)} → ${code(r.line)}`
            : code(r.line);
        return `| ${sign} | ${r.pkg} | ${where(r)} | ${sig} | ${code(r.usage)} |`;
      }),
      ...(rows.length > MAX_ROWS
        ? [
            '',
            `…and ${rows.length - MAX_ROWS} more; run \`pnpm api:report\` and read the report diff.`,
          ]
        : []),
      '',
      '</details>',
    );
  }
  return L.join('\n') + '\n';
}
