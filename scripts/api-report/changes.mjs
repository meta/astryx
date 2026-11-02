// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compare API reports and render the pull request's API changes.
 *
 * @input  the merge base's reports (built from the merge base, or as committed
 *         there when no build of it was kept), the reports generated from the
 *         head's build, and the head's committed reports, per package
 * @output added, changed, and removed rows per package, each with its
 *         signature and a usage example, plus how many rows the committed
 *         report is behind the head's build; and the advisory Markdown the
 *         pull request report embeds
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
      rows.set(uniqueKey(rows, `${entry}\0${section}\0${item}`), {
        entry,
        section,
        item,
        member: null,
        line,
      });
    } else if (item) {
      const member = memberName(line);
      rows.set(uniqueKey(rows, `${entry}\0${section}\0${item}\0${member}`), {
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
  const m = line.match(/^(\w+) ([^\s(:<=]+)(?: (\([^)]*\)))?/);
  if (!m) return line;
  // One custom property can come from two stylesheets, and one target class
  // from two components: their qualifier is part of the row's identity.
  return (m[1] === 'var' || m[1] === 'target') && m[3]
    ? `${m[1]} ${m[2]} ${m[3]}`
    : `${m[1]} ${m[2]}`;
}

/** A key no earlier row holds, so a repeated row is never dropped. */
function uniqueKey(rows, key) {
  let unique = key;
  for (let n = 2; rows.has(unique); n++) unique = `${key}\0#${n}`;
  return unique;
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
  // Package-level sections sit under their own `##` heading, held in `entry`.
  if (row.entry === 'Stylesheets') return `.my-scope { ${name}: …; }`;
  if (row.entry === 'Theme targets')
    return `defineTheme({components: {'${name}': {…}}})`;
  if (row.entry === 'Public attributes') return `[${name}] { … }`;
  if (row.entry === 'Reachable members tagged internal')
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

/** The rows one report differs from another by, as the changes list them. */
const rowCount = ({added, changed, removed}) =>
  added.length + changed.length + removed.length;

/**
 * @param {Array<{pkg: string, base: string|null, head: string,
 *   committed: string|null, baseSource?: 'build'|'head'|'committed'}>} packages
 */
export function computeChanges(packages) {
  return packages
    .map(({pkg, base, head, committed, baseSource = 'committed'}) => {
      // With no report at the merge base there is nothing to compare: the
      // package's report is new, and every row would read as added.
      const baseline = base == null;
      const d = baseline
        ? {added: [], changed: [], removed: []}
        : diffReports(base, head);
      const stale = committed != null && committed !== head;
      return {
        pkg,
        baseline,
        baseSource,
        stale,
        // A stale report is one line in the PR report, not its rows.
        staleRows: stale ? rowCount(diffReports(committed, head)) : 0,
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

/**
 * Literal text as a code span, for every string the report renders: no link
 * (GitHub autolinks a bare URL in plain text), no markup, no HTML. The pull
 * request's own build writes these strings and the comment is public. A pipe
 * is escaped so a table cell stays one cell; the fence is longer than any
 * backtick run inside.
 */
const code = value => {
  const text = String(value ?? '')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/\|/g, '\\|');
  if (text.trim() === '') return '';
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) || []).map(run => run.length),
  );
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
};
const count = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
const where = r =>
  code([r.entry, r.section, r.item].filter(Boolean).join(' · '));
const short = pkg => code(String(pkg ?? '').replace(/^@astryxdesign\//, ''));

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The advisory API changes for the pull request report: one visible summary
 * line, with every row inside a closed disclosure.
 *
 * Changes from version 2 (each package carries `staleRows`) list only the
 * rows the pull request changes; a stale committed report is one line naming
 * how far behind it is. Version 1 changes render as they always did.
 * @param {ReturnType<typeof computeChanges>} changes
 * @returns {string} empty when nothing changed and every report is current
 */
export function renderChanges(changes) {
  const list = (Array.isArray(changes) ? changes : []).map(c => ({
    ...c,
    rows: Array.isArray(c?.rows) ? c.rows : [],
  }));
  if (list.some(c => typeof c?.staleRows === 'number'))
    return renderBuiltChanges(list);
  const touched = list.filter(
    c =>
      c.rows.length ||
      c.stale === true ||
      c.missing === true ||
      c.baseline === true,
  );
  if (!touched.length) return '';
  const parts = touched.map(c => {
    if (c.baseline === true && c.missing !== true)
      return `${short(c.pkg)} new report${c.stale ? ' (stale: run `pnpm api:report`)' : ''}`;
    const counts = c.rows.length
      ? ` +${count(c.counts?.added)} · ~${count(c.counts?.changed)} · −${count(c.counts?.removed)}`
      : ' no changes';
    const note =
      c.missing === true
        ? ' (report not committed: run `pnpm api:report`)'
        : c.stale === true
          ? ' (report stale: run `pnpm api:report`)'
          : '';
    return `${short(c.pkg)}${counts}${note}`;
  });
  return (
    [`**API changes:** ${parts.join('; ')}`, ...rowTable(touched)].join('\n') +
    '\n'
  );
}

/** The disclosure holding every row, or nothing without rows. */
function rowTable(packages) {
  const rows = packages.flatMap(c =>
    c.rows.map(r => ({...r, pkg: short(c.pkg)})),
  );
  const L = [];
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
          r.change === 'changed' && r.before != null
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
  return L;
}

/**
 * Version 2: the summary names only the packages this pull request changes
 * (or whose report is new or missing); stale committed reports share one line.
 * @param {ReturnType<typeof computeChanges>} list
 */
function renderBuiltChanges(list) {
  const touched = list.filter(
    c => c.rows.length || c.missing === true || c.baseline === true,
  );
  const stale = list.filter(c => c.stale === true && c.missing !== true);
  if (!touched.length && !stale.length) return '';
  const parts = touched.map(c => {
    if (c.baseline === true && c.missing !== true)
      return `${short(c.pkg)} new report`;
    const counts = c.rows.length
      ? ` +${count(c.counts?.added)} · ~${count(c.counts?.changed)} · −${count(c.counts?.removed)}`
      : ' no changes';
    const missing =
      c.missing === true
        ? ' (report not committed: run `pnpm api:report`)'
        : '';
    // No build of the merge base was kept: rows a stale report at the merge
    // base carried may show here too.
    const committed =
      c.rows.length && c.baseSource === 'committed'
        ? " (against the merge base's committed report)"
        : '';
    return `${short(c.pkg)}${counts}${missing}${committed}`;
  });
  const L = [
    `**API changes:** ${parts.length ? parts.join('; ') : 'none in this pull request'}`,
  ];
  if (stale.length) {
    const behind = stale.map(c =>
      count(c.staleRows)
        ? `${short(c.pkg)} ${plural(count(c.staleRows), 'row')}`
        : short(c.pkg),
    );
    L.push(
      '',
      `Committed API report behind this build: ${behind.join(', ')}; run \`pnpm api:report\`.`,
    );
  }
  L.push(...rowTable(touched));
  return L.join('\n') + '\n';
}
