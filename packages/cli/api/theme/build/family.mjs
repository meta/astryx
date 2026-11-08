// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Thin family packaging over existing compiler output.
 */
const THEME_SCOPE_TO = '[data-astryx-theme]';
/** @param {string} a @param {string} b */
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/**
 * @param {Array<{theme: any, sourceTheme: any, sourceParent: any, filePath: string}>} members
 * @returns {any[]}
 */
export function resolveThemeFamily(members) {
  if (members.length < 2)
    throw new Error(
      'A theme family requires at least two selected theme files.',
    );
  const byName = new Map();
  const sources = new Set();
  for (const member of members) {
    if (sources.has(member.filePath)) {
      throw new Error(
        `Duplicate family source: ${member.filePath}. Select each theme file once.`,
      );
    }
    if (byName.has(member.theme.name)) {
      throw new Error(
        `Duplicate theme identity "${member.theme.name}" in the selected family.`,
      );
    }
    sources.add(member.filePath);
    byName.set(member.theme.name, member);
  }
  const withParents = members.map(member => {
    const parent = member.sourceParent;
    if (
      parent !== undefined &&
      (!parent ||
        typeof parent !== 'object' ||
        typeof parent.name !== 'string' ||
        parent.name.length === 0)
    ) {
      throw new Error(
        `Theme "${member.theme.name}" has an invalid normalized parent.`,
      );
    }
    const parentName = parent?.name ?? null;
    if (parentName && !byName.has(parentName)) {
      throw new Error(
        `Theme "${member.theme.name}" is missing selected ancestor "${parentName}".`,
      );
    }
    if (parentName && parent !== byName.get(parentName).sourceTheme) {
      throw new Error(
        `Theme "${member.theme.name}" does not extend the selected "${parentName}" source.`,
      );
    }
    return {...member, parentName};
  });
  const resolved = new Map(
    withParents.map(member => [member.theme.name, member]),
  );
  const marks = new Map();
  /** @param {any} member */
  const visit = member => {
    const mark = marks.get(member.theme.name) ?? 0;
    if (mark === 1)
      throw new Error(
        `Cycle detected in selected theme family at "${member.theme.name}".`,
      );
    if (mark === 2) return;
    marks.set(member.theme.name, 1);
    if (member.parentName) visit(resolved.get(member.parentName));
    marks.set(member.theme.name, 2);
  };
  for (const member of withParents) visit(member);
  const roots = withParents.filter(member => member.parentName === null);
  if (roots.length !== 1) {
    throw new Error(
      `A theme family must have exactly one selected root; found ${roots.length}.`,
    );
  }
  const emitted = new Set();
  /** @type {any[]} */
  const ordered = [];
  while (ordered.length < withParents.length) {
    const eligible = withParents
      .filter(
        member =>
          !emitted.has(member.theme.name) &&
          (!member.parentName || emitted.has(member.parentName)),
      )
      .sort((a, b) =>
        compareText(
          `${a.theme.name}\0${a.filePath}`,
          `${b.theme.name}\0${b.filePath}`,
        ),
      );
    if (eligible.length === 0)
      throw new Error('Cycle detected in selected theme family.');
    emitted.add(eligible[0].theme.name);
    ordered.push(eligible[0]);
  }
  return ordered;
}
/** @param {string} name */
const themeSelector = name => `[data-astryx-theme=${JSON.stringify(name)}]`;
/** @param {string[]} names */
const familyScopeSelector = names =>
  `:where(${names.map(themeSelector).join(', ')})`;
/** @param {string} rule @returns {{open: number, close: number}} */
function ruleBounds(rule) {
  let open = -1;
  let depth = 0;
  let paren = 0;
  let urlDepth = 0;
  let quote = '';
  let escaped = false;
  let comment = false;
  for (let index = 0; index < rule.length; index++) {
    const char = rule[index];
    if (comment) {
      if (char === '*' && rule[index + 1] === '/') {
        comment = false;
        index++;
      }
    } else if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (urlDepth === 0 && char === '/' && rule[index + 1] === '*') {
      comment = true;
      index++;
    } else if (char === '(') {
      paren++;
      if (rule.slice(Math.max(0, index - 3), index).toLowerCase() === 'url') {
        urlDepth = paren;
      }
    } else if (char === ')' && paren > 0) {
      if (urlDepth === paren) urlDepth = 0;
      paren--;
    } else if (char === '{' && paren === 0) {
      if (open === -1) open = index;
      depth++;
    } else if (char === '}' && paren === 0 && open !== -1 && --depth === 0) {
      return {open, close: index};
    }
  }
  throw new Error('Theme compiler emitted a malformed rule.');
}
/** @param {string} rule */
function declarationEntries(rule) {
  const {open, close} = ruleBounds(rule);
  const selector = rule.slice(0, open).trim();
  const body = rule.slice(open + 1, close);
  /** @type {string[]} */
  const declarations = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  let comment = false;
  let paren = 0;
  let urlDepth = 0;
  let braces = 0;
  let brackets = 0;
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (comment) {
      if (char === '*' && body[index + 1] === '/') {
        comment = false;
        index++;
      }
    } else if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (urlDepth === 0 && char === '/' && body[index + 1] === '*') {
      comment = true;
      index++;
    } else if (char === '(') {
      paren++;
      if (body.slice(Math.max(0, index - 3), index).toLowerCase() === 'url') {
        urlDepth = paren;
      }
    } else if (char === ')' && paren > 0) {
      if (urlDepth === paren) urlDepth = 0;
      paren--;
    } else if (char === '[' && urlDepth === 0) {
      brackets++;
    } else if (char === ']' && urlDepth === 0 && brackets > 0) {
      brackets--;
    } else if (char === '{' && paren === 0) {
      braces++;
    } else if (char === '}' && paren === 0 && braces > 0) {
      braces--;
    } else if (char === ';' && paren === 0 && braces === 0 && brackets === 0) {
      const declaration = body.slice(start, index + 1).trim();
      if (declaration) declarations.push(declaration);
      start = index + 1;
    }
  }
  if (body.slice(start).trim())
    throw new Error('Theme compiler emitted an unterminated declaration.');
  const counts = new Map();
  return declarations
    .map(declaration => {
      const property = declaration.slice(0, declaration.indexOf(':')).trim();
      const occurrence = counts.get(property) ?? 0;
      counts.set(property, occurrence + 1);
      return {key: `${property}\0${occurrence}`, declaration};
    })
    .map(entry => ({...entry, selector}));
}
/** @param {string[]} rules */
function ruleEntries(rules) {
  const counts = new Map();
  return rules.map(rule => {
    const {open} = ruleBounds(rule);
    const selector = rule.slice(0, open).trim();
    const occurrence = counts.get(selector) ?? 0;
    counts.set(selector, occurrence + 1);
    return {key: `${selector}\0${occurrence}`, rule, selector};
  });
}
/** @param {Array<Array<{key: string}>>} sequences @param {string} _description @returns {string[] | null} */
function orderedKeys(sequences, _description) {
  const rank = new Map();
  const edges = new Map();
  const indegree = new Map();
  let nextRank = 0;
  for (const sequence of sequences) {
    for (const entry of sequence) {
      if (!rank.has(entry.key)) rank.set(entry.key, nextRank++);
      edges.set(entry.key, edges.get(entry.key) ?? new Set());
      indegree.set(entry.key, indegree.get(entry.key) ?? 0);
    }
    for (let index = 1; index < sequence.length; index++) {
      const before = sequence[index - 1].key;
      const after = sequence[index].key;
      if (!edges.get(before).has(after)) {
        edges.get(before).add(after);
        indegree.set(after, indegree.get(after) + 1);
      }
    }
  }
  const ready = [...rank.keys()].filter(key => indegree.get(key) === 0);
  /** @type {string[]} */
  const ordered = [];
  while (ready.length > 0) {
    ready.sort((a, b) => rank.get(a) - rank.get(b) || compareText(a, b));
    const key = ready.shift();
    ordered.push(key);
    for (const after of edges.get(key)) {
      indegree.set(after, indegree.get(after) - 1);
      if (indegree.get(after) === 0) ready.push(after);
    }
  }
  if (ordered.length !== rank.size) return null;
  return ordered;
}
/** @param {Array<{names: string[], selector: string, declaration: string}>} items */
function renderDeclarations(items) {
  /** @type {Array<{scope: string, names: string[], selector: string, declarations: string[]}>} */
  const blocks = [];
  /** @type {{scope: string, names: string[], selector: string, declarations: string[]} | undefined} */
  let current;
  for (const item of items) {
    const scope = `${item.names.join('\0')}\0${item.selector}`;
    if (!current || current.scope !== scope) {
      current = {
        scope,
        names: item.names,
        selector: item.selector,
        declarations: [],
      };
      blocks.push(current);
    }
    current.declarations.push(item.declaration);
  }
  return blocks.map(block => {
    const declarations = block.declarations
      .map(value => `    ${value}`)
      .join('\n');
    return `@scope (${familyScopeSelector(block.names)}) to (${THEME_SCOPE_TO}) {\n  ${block.selector} {\n${declarations}\n  }\n}`;
  });
}
/** @param {any[]} members @param {string} field */
function completeMemberRules(members, field) {
  return members
    .filter(member => member.css[field].length > 0)
    .map(
      member =>
        `@scope (${familyScopeSelector([member.theme.name])}) to (${THEME_SCOPE_TO}) {\n${member.css[field].join('\n\n')}\n}`,
    );
}
/** @param {any[]} members @param {string} field */
function factorRules(members, field) {
  const ruleSequences = members.map(member => ruleEntries(member.css[field]));
  const ruleMaps = ruleSequences.map(
    sequence => new Map(sequence.map(entry => [entry.key, entry])),
  );
  /** @type {Array<{names: string[], selector: string, declaration: string}>} */
  const items = [];
  const ruleOrder = orderedKeys(ruleSequences, 'rule');
  if (!ruleOrder) return completeMemberRules(members, field);
  for (const ruleKey of ruleOrder) {
    const declarations = ruleMaps.map(map => {
      const rule = map.get(ruleKey);
      return rule ? declarationEntries(rule.rule) : [];
    });
    const declarationMaps = declarations.map(
      sequence => new Map(sequence.map(entry => [entry.key, entry])),
    );
    const declarationOrder = orderedKeys(declarations, 'declaration');
    if (!declarationOrder) return completeMemberRules(members, field);
    for (const declarationKey of declarationOrder) {
      /** @type {Map<string, {selector: string, declaration: string, names: string[]}>} */
      const groups = new Map();
      for (let index = 0; index < members.length; index++) {
        const entry = declarationMaps[index].get(declarationKey);
        if (!entry) continue;
        const group = groups.get(entry.declaration) ?? {
          selector: entry.selector,
          declaration: entry.declaration,
          names: [],
        };
        group.names.push(members[index].theme.name);
        groups.set(entry.declaration, group);
      }
      items.push(...groups.values());
    }
  }
  return renderDeclarations(items);
}
/** Replace only a generated @scope prelude, never authored CSS payloads. @param {string} css @param {string} search @param {string} replacement */
// prettier-ignore
function replaceScopeSyntax(css, search, replacement) {
  let output = '', quote = '', escaped = false, comment = false, lastCode = '';
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    if (comment) {
      output += char;
      if (char === '*' && css[index + 1] === '/') { output += '/'; comment = false; index++; }
      continue;
    }
    if (quote) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && css[index + 1] === '*') { output += '/*'; comment = true; index++; continue; }
    if (char === '"' || char === "'") { output += char; quote = char; continue; }
    if ((lastCode === '' || lastCode === '{' || lastCode === '}') && css.startsWith(search, index)) {
      output += replacement; lastCode = ')'; index += search.length - 1; continue;
    }
    output += char;
    if (!/\s/.test(char)) lastCode = char;
  }
  return output;
}
/** @param {string} css @param {string} name */
const normalizeScope = (css, name) =>
  replaceScopeSyntax(
    css,
    `@scope (${themeSelector(name)})`,
    '@scope (__ASTRYX_FAMILY_SCOPE__)',
  );
/** @param {string} css @param {string[]} names */
const applyScope = (css, names) =>
  replaceScopeSyntax(
    css,
    '@scope (__ASTRYX_FAMILY_SCOPE__)',
    `@scope (${familyScopeSelector(names)})`,
  );
/** @param {any[]} members @param {string} field */
function factorSections(members, field) {
  /** @type {Map<string, {css: string, names: string[]}>} */
  const groups = new Map();
  for (const member of members) {
    const css = normalizeScope(member.css[field] ?? '', member.theme.name);
    if (!css) continue;
    const group = groups.get(css) ?? {css, names: []};
    group.names.push(member.theme.name);
    groups.set(css, group);
  }
  return [...groups.values()].map(group => applyScope(group.css, group.names));
}
/** Keep document rules top-level-active; initialize nested tuple members locally. @param {any[]} members */
// prettier-ignore
function colorSchemeSections(members) {
  const groups = new Map();
  for (const member of members) {
    const css = member.css.colorScheme;
    if (!css) continue;
    const names = groups.get(css) ?? []; names.push(member.theme.name); groups.set(css, names);
  }
  return [...groups].reduce((result, [css, names]) => {
    const identities = familyScopeSelector(names), top = `${identities}:not(:where([data-astryx-theme] [data-astryx-theme]))`;
    const active = (/** @type {string} */ selector) => `${selector}${identities},\n${selector}:where(:not([data-astryx-theme])):has(${top})`;
    result.base.push(`@scope (${identities}) to (${THEME_SCOPE_TO}) {\n  :where(:scope:not([data-theme]):not(html[data-theme] *)) { color-scheme: light dark; }\n  :where(:scope:not([data-theme]):is(html[data-theme="light"] *)) { color-scheme: light; }\n  :where(:scope:not([data-theme]):is(html[data-theme="dark"] *)) { color-scheme: dark; }\n}`);
    result.themed.push(css.replace(':root', active(':root')).replace('html[data-theme="light"]', active('html[data-theme="light"]')).replace('html[data-theme="dark"]', active('html[data-theme="dark"]')));
    return result;
  }, /** @type {{base: string[], themed: string[]}} */ ({base: [], themed: []}));
}
/** @param {any[]} members */
export function generateFamilyCSS(members) {
  const root = members[0];
  for (const member of members) {
    if (member.css.base !== root.css.base)
      throw new Error(
        'Theme-independent base CSS changed between family members.',
      );
  }
  const prose = [
    ...factorRules(members, 'prose'),
    ...factorSections(members, 'adaptationProse'),
  ];
  const schemes = colorSchemeSections(members);
  const themed = [
    ...schemes.themed,
    ...factorRules(members, 'component'),
    ...factorSections(members, 'adaptation'),
    ...factorSections(members, 'onMedia'),
  ].filter(Boolean);
  const parts = [];
  if (prose.length > 0) parts.push(`@layer reset {\n${prose.join('\n\n')}\n}`);
  const base = [root.css.base, ...schemes.base].filter(Boolean);
  if (base.length > 0)
    parts.push(`@layer astryx-base {\n${base.join('\n\n')}\n}`);
  if (themed.length > 0)
    parts.push(`@layer astryx-theme {\n${themed.join('\n\n')}\n}`);
  return `@layer reset, astryx-base, astryx-theme;\n\n${parts.join('\n\n')}\n`;
}
