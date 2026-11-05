// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: migrate v0.5.4 Astryx theme selectors to data attributes.
 *
 * This transform parses CSS and rewrites only class nodes inside selector
 * preludes. It never searches arbitrary source text, declarations, comments,
 * or JavaScript strings. A known old class becomes a specificity-preserving
 * `:is(.old-class, [data-*])` union: the class arm preserves consumer-supplied
 * className matches, while the attribute arm matches the v0.6 prop/state
 * reflection. Values shared by several old prop axes include every attribute
 * arm. Unknown/custom classes stay intact.
 */

import path from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import {parseCss, processSelector} from '../../parse.mjs';
import {
  V054_THEME_SELECTOR_DYNAMIC_AXES,
  V054_THEME_SELECTOR_TARGETS,
} from './migrate-astryx-theme-selectors-v0.5.4-data.mjs';

export const meta = {
  title: 'Migrate Astryx theme selectors to data attributes',
  description:
    'Rewrites known v0.5.4 `.astryx-<target>.<value>` selectors to behavior-preserving class/data-attribute unions.',
  fileExtensions: ['.css'],
};

/** @typedef {[string, string]} AttributeCandidate */
/** @typedef {AttributeCandidate | AttributeCandidate[]} CandidateEntry */

/** @typedef {Record<string, Array<{axis: string, token: 'class-value' | 'prefixed', prefix?: string}>>} DynamicAxes */
/** @typedef {{targets: Record<string, Record<string, CandidateEntry>>, dynamicAxes: DynamicAxes}} SelectorData */

// The selector tables in effect for the current synchronous migration. They
// default to the 0.5.4 snapshot this codemod shipped with; a later release can
// pass a newer frozen snapshot to migrateAstryxThemeSelectors().
/** @type {Record<string, Record<string, CandidateEntry>>} */
let TARGETS = V054_THEME_SELECTOR_TARGETS;
/** @type {DynamicAxes} */
let DYNAMIC_AXES = V054_THEME_SELECTOR_DYNAMIC_AXES;
const SAME_ELEMENT_FUNCTIONAL_PSEUDOS = new Set([':is', ':where', ':not']);

/** @param {string} axis */
function dataAttributeName(axis) {
  return axis.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** @param {string} value */
function escapeAttributeValue(value) {
  let escaped = '';
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (
      char === '"' ||
      char === '\\' ||
      codePoint < 0x20 ||
      codePoint === 0x7f
    ) {
      escaped += `\\${(codePoint === 0 ? 0xfffd : codePoint).toString(16)} `;
    } else {
      escaped += char;
    }
  }
  return escaped;
}

/** @param {AttributeCandidate} candidate */
function attributeNode([axis, value]) {
  const escaped = escapeAttributeValue(value);
  return selectorParser.attribute({
    attribute: `data-${dataAttributeName(axis)}`,
    operator: '=',
    value,
    quoteMark: '"',
    raws: {value: `"${escaped}"`},
  });
}

/**
 * @param {CandidateEntry | undefined} entry
 * @returns {AttributeCandidate[]}
 */
function normalizeCandidates(entry) {
  if (!Array.isArray(entry)) return [];
  return typeof entry[0] === 'string'
    ? [/** @type {AttributeCandidate} */ (entry)]
    : /** @type {AttributeCandidate[]} */ (entry);
}

/** @param {string} target @param {string} token */
function candidatesFor(target, token) {
  const candidates = normalizeCandidates(TARGETS[target]?.[token]);
  for (const rule of DYNAMIC_AXES[target] ?? []) {
    if (rule.token === 'class-value') {
      candidates.push([rule.axis, token]);
      const numericPrefix = `${rule.axis}-`;
      if (token.startsWith(numericPrefix)) {
        const unprefixed = token.slice(numericPrefix.length);
        if (/^\d/.test(unprefixed)) {
          candidates.push([rule.axis, unprefixed]);
        }
      }
    } else if (rule.prefix && token.startsWith(rule.prefix)) {
      const value = token.slice(rule.prefix.length);
      if (/^\d/.test(value)) candidates.push([rule.axis, value]);
    }
  }
  return candidates;
}

/** @param {AttributeCandidate[]} candidates */
function dedupeCandidates(candidates) {
  return [
    ...new Map(
      candidates.map(candidate => [
        `${candidate[0]}\0${candidate[1]}`,
        candidate,
      ]),
    ).values(),
  ];
}

/** @typedef {{target: string, candidate: AttributeCandidate}} GatedCandidate */

/** @param {string} target @param {AttributeCandidate} candidate */
function gatedAttributeSelector(target, candidate) {
  const targetGate = selectorParser.pseudo({
    value: ':where',
    nodes: [
      selectorParser.selector({
        value: '',
        nodes: [selectorParser.className({value: `astryx-${target}`})],
      }),
    ],
  });
  return selectorParser.selector({
    value: '',
    nodes: [targetGate, attributeNode(candidate)],
  });
}

/**
 * @param {any} oldClass
 * @param {AttributeCandidate[]} candidates
 * @param {GatedCandidate[]} [gatedCandidates]
 */
function behaviorPreservingUnionNode(
  oldClass,
  candidates,
  gatedCandidates = [],
) {
  return selectorParser.pseudo({
    value: ':is',
    nodes: [
      selectorParser.selector({value: '', nodes: [oldClass.clone()]}),
      ...candidates.map(candidate =>
        selectorParser.selector({value: '', nodes: [attributeNode(candidate)]}),
      ),
      ...gatedCandidates.map(({target, candidate}) =>
        gatedAttributeSelector(target, candidate),
      ),
    ],
  });
}

/** @param {AttributeCandidate} candidate */
function candidateKey([axis, value]) {
  return `${dataAttributeName(axis)}\0${value}`;
}

/**
 * Return the selector arms that already form complete generated old-class /
 * data-attribute pairs. A larger author-written :is() may contain both complete
 * pairs and unrelated arms; callers skip only the complete arms and keep
 * traversing the rest.
 *
 * @param {any} pseudo
 * @param {string[]} targetNames
 * @param {string[]} [conditionalTargets]
 * @returns {Set<any>}
 */
function completedBehaviorPreservingUnionArms(
  pseudo,
  targetNames,
  conditionalTargets = [],
) {
  const completed = new Set();
  if (
    (targetNames.length === 0 && conditionalTargets.length === 0) ||
    !Array.isArray(pseudo.nodes)
  ) {
    return completed;
  }
  const classArms = [];
  const attributeArms = new Map();
  const gatedAttributeArms = new Map();

  for (const selector of pseudo.nodes) {
    if (selector.type !== 'selector') continue;
    if (selector.nodes.length === 1) {
      const node = selector.nodes[0];
      if (node.type === 'class' && !node.value.startsWith('astryx-')) {
        classArms.push({selector, token: node.value});
      } else if (
        node.type === 'attribute' &&
        node.attribute.startsWith('data-')
      ) {
        attributeArms.set(
          `${node.attribute.slice('data-'.length)}\0${node.value ?? ''}`,
          selector,
        );
      }
      continue;
    }
    if (selector.nodes.length !== 2) continue;
    const [gate, attribute] = selector.nodes;
    if (
      gate.type !== 'pseudo' ||
      gate.value !== ':where' ||
      !Array.isArray(gate.nodes) ||
      gate.nodes.length !== 1 ||
      gate.nodes[0]?.type !== 'selector' ||
      gate.nodes[0].nodes.length !== 1 ||
      gate.nodes[0].nodes[0]?.type !== 'class' ||
      !gate.nodes[0].nodes[0].value.startsWith('astryx-') ||
      attribute.type !== 'attribute' ||
      !attribute.attribute.startsWith('data-')
    ) {
      continue;
    }
    const target = gate.nodes[0].nodes[0].value.slice('astryx-'.length);
    gatedAttributeArms.set(
      `${target}\0${attribute.attribute.slice('data-'.length)}\0${attribute.value ?? ''}`,
      selector,
    );
  }

  for (const {selector, token} of classArms) {
    const candidates = dedupeCandidates(
      targetNames.flatMap(target => candidatesFor(target, token)),
    );
    const gatedCandidates = conditionalTargets.flatMap(target =>
      candidatesFor(target, token).map(candidate => ({target, candidate})),
    );
    if (candidates.length === 0 && gatedCandidates.length === 0) continue;
    const directArms = candidates.map(candidate =>
      attributeArms.get(candidateKey(candidate)),
    );
    const gatedArms = gatedCandidates.map(({target, candidate}) =>
      gatedAttributeArms.get(`${target}\0${candidateKey(candidate)}`),
    );
    if ([...directArms, ...gatedArms].some(arm => arm == null)) continue;
    completed.add(selector);
    for (const arm of [...directArms, ...gatedArms]) completed.add(arm);
  }
  return completed;
}

/** @param {any} selector */
function selectorCompounds(selector) {
  /** @type {any[][]} */
  const compounds = [[]];
  for (const node of selector.nodes) {
    if (node.type === 'combinator') compounds.push([]);
    else {
      const current = compounds.at(-1);
      if (current) current.push(node);
    }
  }
  return compounds;
}

/** @param {any[]} nodes */
function directTargetNames(nodes) {
  return nodes
    .filter(node => node.type === 'class' && node.value.startsWith('astryx-'))
    .map(node => node.value.slice('astryx-'.length))
    .filter(target => TARGETS[target] != null || DYNAMIC_AXES[target] != null);
}

/** @param {any} pseudo @returns {any[]} */
function nthFilterSelectors(pseudo) {
  if (!Array.isArray(pseudo.nodes)) return [];
  const filters = [];
  let foundOf = false;
  for (const selector of pseudo.nodes) {
    if (selector.type !== 'selector') continue;
    if (!foundOf) {
      const ofIndex = selector.nodes.findIndex(
        (/** @type {any} */ node) => node.type === 'tag' && node.value === 'of',
      );
      if (ofIndex === -1) continue;
      foundOf = true;
      filters.push({nodes: selector.nodes.slice(ofIndex + 1)});
      continue;
    }
    filters.push(selector);
  }
  return filters;
}

/** @param {any} selector @returns {{guaranteed: string[], possible: string[]}} */
function selectorSubjectTargetContext(selector) {
  const compounds = selectorCompounds(selector);
  const subject = compounds.at(-1) ?? [];
  const nested = sameElementPseudoTargetContext(subject);
  const direct = directTargetNames(subject);
  return {
    guaranteed: [...new Set([...direct, ...nested.guaranteed])],
    possible: [...new Set([...direct, ...nested.possible])],
  };
}

/**
 * Targets exposed by selector-bearing pseudos on the same subject. A target is
 * guaranteed only when every positive branch has it; otherwise it is merely
 * possible and any added attribute arm must carry its own target gate. :not()
 * exports possible context only, because its argument identifies what the
 * subject is not. nth `of` lists behave like positive selector lists because
 * the matched child must satisfy one filter branch.
 *
 * @param {any[]} nodes
 * @returns {{guaranteed: string[], possible: string[]}}
 */
function sameElementPseudoTargetContext(nodes) {
  const guaranteed = [];
  const possible = [];
  for (const node of nodes) {
    if (node.type !== 'pseudo' || !Array.isArray(node.nodes)) continue;

    const isPositiveList =
      node.value === ':is' ||
      node.value === ':where' ||
      node.value === ':nth-child' ||
      node.value === ':nth-last-child';
    const isNegativeList = node.value === ':not';
    if (!isPositiveList && !isNegativeList) continue;

    const selectors =
      node.value === ':nth-child' || node.value === ':nth-last-child'
        ? nthFilterSelectors(node)
        : node.nodes.filter(
            /** @param {any} selector */ selector =>
              selector.type === 'selector',
          );
    const branchContexts = selectors.map(selectorSubjectTargetContext);
    if (branchContexts.length === 0) continue;

    if (isPositiveList) {
      for (const target of branchContexts[0].guaranteed) {
        if (
          branchContexts.every(
            /** @param {{guaranteed: string[]}} branch */ branch =>
              branch.guaranteed.includes(target),
          )
        ) {
          guaranteed.push(target);
        }
      }
    }
    for (const branch of branchContexts) {
      possible.push(...branch.possible);
    }
  }
  return {
    guaranteed: [...new Set(guaranteed)],
    possible: [...new Set([...guaranteed, ...possible])],
  };
}

/** @param {any} pseudo @param {string[]} possibleTargets */
function migrateNthSelectorPseudo(pseudo, possibleTargets) {
  for (const selector of nthFilterSelectors(pseudo)) {
    migrateSelectorNode(selector, [], possibleTargets);
  }
}

/**
 * @param {any[]} nodes
 * @param {string[]} inheritedTargets
 * @param {string[]} inheritedConditionalTargets
 */
function migrateCompound(
  nodes,
  inheritedTargets = [],
  inheritedConditionalTargets = [],
) {
  const directTargets = [
    ...new Set([...inheritedTargets, ...directTargetNames(nodes)]),
  ];
  const pseudoContext = sameElementPseudoTargetContext(nodes);
  const guaranteedTargets = [
    ...new Set([...directTargets, ...pseudoContext.guaranteed]),
  ];
  const possibleTargets = [
    ...new Set([
      ...guaranteedTargets,
      ...inheritedConditionalTargets,
      ...pseudoContext.possible,
    ]),
  ];
  const conditionalTargets = possibleTargets.filter(
    target => !guaranteedTargets.includes(target),
  );

  // Recurse into every selector-bearing pseudo. :is(), :where(), and :not()
  // constrain the same subject as the surrounding compound, so their rightmost
  // compound inherits only the target context guaranteed outside the pseudo.
  // Relational pseudos such as :has() traverse their own targets independently.
  for (const node of [...nodes]) {
    if (node.type !== 'pseudo' || !Array.isArray(node.nodes)) continue;
    const completedArms = completedBehaviorPreservingUnionArms(
      node,
      guaranteedTargets,
      conditionalTargets,
    );
    const selectorArms = node.nodes.filter(
      (/** @type {any} */ selector) => selector.type === 'selector',
    );
    if (completedArms.size > 0 && completedArms.size === selectorArms.length) {
      continue;
    }
    if (node.value === ':nth-child' || node.value === ':nth-last-child') {
      migrateNthSelectorPseudo(node, possibleTargets);
      continue;
    }
    const isSameElementPseudo = SAME_ELEMENT_FUNCTIONAL_PSEUDOS.has(node.value);
    const nestedTargets = isSameElementPseudo ? guaranteedTargets : [];
    const nestedConditionalTargets = isSameElementPseudo
      ? conditionalTargets
      : [];
    for (const selector of selectorArms) {
      if (completedArms.has(selector)) continue;
      migrateSelectorNode(selector, nestedTargets, nestedConditionalTargets);
    }
  }

  if (guaranteedTargets.length === 0 && conditionalTargets.length === 0) return;
  for (const node of [...nodes]) {
    if (node.type !== 'class' || node.value.startsWith('astryx-')) continue;
    const candidates = dedupeCandidates(
      guaranteedTargets.flatMap(target => candidatesFor(target, node.value)),
    );
    /** @type {GatedCandidate[]} */
    const gatedCandidates = [];
    const seenGated = new Set();
    for (const target of conditionalTargets) {
      for (const candidate of candidatesFor(target, node.value)) {
        const key = `${target}\0${candidateKey(candidate)}`;
        if (seenGated.has(key)) continue;
        seenGated.add(key);
        gatedCandidates.push({target, candidate});
      }
    }
    if (candidates.length === 0 && gatedCandidates.length === 0) continue;
    node.replaceWith(
      behaviorPreservingUnionNode(node, candidates, gatedCandidates),
    );
  }
}

/**
 * @param {any} selector
 * @param {string[]} [inheritedTargets]
 * @param {string[]} [inheritedConditionalTargets]
 */
function migrateSelectorNode(
  selector,
  inheritedTargets = [],
  inheritedConditionalTargets = [],
) {
  const compounds = selectorCompounds(selector);
  const subjectIndex = compounds.length - 1;
  compounds.forEach((compound, index) => {
    migrateCompound(
      compound,
      index === subjectIndex ? inheritedTargets : [],
      index === subjectIndex ? inheritedConditionalTargets : [],
    );
  });
}

/** @typedef {{guaranteed: string[], possible: string[]}} TargetContext */

/** @param {TargetContext[]} contexts @returns {TargetContext} */
function combineSelectorListContexts(contexts) {
  if (contexts.length === 0) return {guaranteed: [], possible: []};
  const guaranteed = contexts[0].guaranteed.filter(target =>
    contexts.every(context => context.guaranteed.includes(target)),
  );
  return {
    guaranteed,
    possible: [...new Set(contexts.flatMap(context => context.possible))],
  };
}

/** @param {any} selector @returns {{guaranteed: boolean, possible: boolean}} */
function selectorSubjectNestingContext(selector) {
  const compounds = selectorCompounds(selector);
  return sameElementPseudoNestingContext(compounds.at(-1) ?? []);
}

/** @param {any[]} nodes @returns {{guaranteed: boolean, possible: boolean}} */
function sameElementPseudoNestingContext(nodes) {
  let guaranteed = nodes.some(node => node.type === 'nesting');
  let possible = guaranteed;
  for (const node of nodes) {
    if (node.type !== 'pseudo' || !Array.isArray(node.nodes)) continue;
    const isPositiveList =
      node.value === ':is' ||
      node.value === ':where' ||
      node.value === ':nth-child' ||
      node.value === ':nth-last-child';
    const isNegativeList = node.value === ':not';
    if (!isPositiveList && !isNegativeList) continue;
    const selectors =
      node.value === ':nth-child' || node.value === ':nth-last-child'
        ? nthFilterSelectors(node)
        : node.nodes.filter(
            /** @param {any} selector */ selector =>
              selector.type === 'selector',
          );
    const branches = selectors.map(selectorSubjectNestingContext);
    if (branches.length === 0) continue;
    if (
      isPositiveList &&
      branches.every(
        /** @param {{guaranteed: boolean}} branch */ branch =>
          branch.guaranteed,
      )
    ) {
      guaranteed = true;
    }
    if (
      branches.some(
        /** @param {{possible: boolean}} branch */ branch => branch.possible,
      )
    ) {
      possible = true;
    }
  }
  return {guaranteed, possible};
}

/**
 * @param {string} selector
 * @param {TargetContext} [parentContext]
 * @returns {{text: string, context: TargetContext}}
 */
function migrateSelectorTextWithContext(
  selector,
  parentContext = {guaranteed: [], possible: []},
) {
  /** @type {TargetContext} */
  let context = {guaranteed: [], possible: []};
  const text = processSelector(selector, selectors => {
    /** @type {TargetContext[]} */
    const branchContexts = [];
    selectors.each(selectorNode => {
      const nesting = selectorSubjectNestingContext(selectorNode);
      const inheritedTargets = nesting.guaranteed
        ? parentContext.guaranteed
        : [];
      const inheritedConditionalTargets = nesting.guaranteed
        ? parentContext.possible.filter(
            target => !parentContext.guaranteed.includes(target),
          )
        : nesting.possible
          ? parentContext.possible
          : [];
      migrateSelectorNode(
        selectorNode,
        inheritedTargets,
        inheritedConditionalTargets,
      );

      const own = selectorSubjectTargetContext(selectorNode);
      branchContexts.push({
        guaranteed: [
          ...new Set([
            ...own.guaranteed,
            ...(nesting.guaranteed ? parentContext.guaranteed : []),
          ]),
        ],
        possible: [
          ...new Set([
            ...own.possible,
            ...(nesting.possible ? parentContext.possible : []),
          ]),
        ],
      });
    });
    context = combineSelectorListContexts(branchContexts);
  });
  return {text, context};
}

/** @param {string} selector */
function migrateSelectorText(selector) {
  return migrateSelectorTextWithContext(selector).text;
}

/**
 * Transform the outer parenthesized selector groups in an @scope prelude while
 * preserving nested functional-pseudo parentheses inside each selector.
 *
 * @param {string} params
 */
function migrateScopeParams(params) {
  let result = '';
  let last = 0;
  let depth = 0;
  let groupStart = -1;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < params.length; index++) {
    const char = params[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') {
      if (depth === 0) {
        result += params.slice(last, index + 1);
        groupStart = index + 1;
      }
      depth++;
      continue;
    }
    if (char === ')' && depth > 0) {
      depth--;
      if (depth === 0 && groupStart >= 0) {
        result += migrateSelectorText(params.slice(groupStart, index));
        result += ')';
        last = index + 1;
        groupStart = -1;
      }
    }
  }
  return result + params.slice(last);
}

/**
 * @param {string} source
 * @param {string} [from]
 * @param {SelectorData} [data] frozen selector tables; defaults to 0.5.4
 * @returns {string}
 */
export function migrateAstryxThemeSelectors(source, from = 'styles.css', data) {
  if (data == null) return migrateWithActiveTables(source, from);
  const previousTargets = TARGETS;
  const previousAxes = DYNAMIC_AXES;
  TARGETS = data.targets;
  DYNAMIC_AXES = data.dynamicAxes;
  try {
    return migrateWithActiveTables(source, from);
  } finally {
    TARGETS = previousTargets;
    DYNAMIC_AXES = previousAxes;
  }
}

/** @param {string} source @param {string} from @returns {string} */
function migrateWithActiveTables(source, from) {
  const root = parseCss(source, {from});
  const existingComments = new Set();
  root.walkComments(comment => {
    existingComments.add(comment.text.trim());
  });

  /** @param {any} node @param {string} original */
  const addParseTodo = (node, original) => {
    const text = `TODO(astryx upgrade): verify selector ${original}; the CSS selector parser could not migrate it safely.`;
    if (!existingComments.has(text)) {
      node.before(postcss.comment({text}));
      existingComments.add(text);
    }
  };

  /** @type {WeakMap<object, TargetContext>} */
  const ruleContexts = new WeakMap();
  root.walkRules(rule => {
    const originalSelector = rule.selector;
    /** @type {any} */
    let parent = rule.parent;
    while (parent && parent.type !== 'rule' && parent.type !== 'root') {
      parent = parent.parent;
    }
    const parentContext =
      parent?.type === 'rule'
        ? (ruleContexts.get(parent) ?? {guaranteed: [], possible: []})
        : {guaranteed: [], possible: []};
    try {
      const migrated = migrateSelectorTextWithContext(
        originalSelector,
        parentContext,
      );
      rule.selector = migrated.text;
      ruleContexts.set(rule, migrated.context);
    } catch {
      ruleContexts.set(rule, {guaranteed: [], possible: []});
      addParseTodo(rule, originalSelector);
    }
  });

  root.walkAtRules('scope', atRule => {
    const originalParams = atRule.params;
    try {
      atRule.params = migrateScopeParams(originalParams);
    } catch {
      addParseTodo(atRule, `@scope ${originalParams}`);
    }
  });

  return root.toString();
}

/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @returns {string | null | undefined}
 */
export default function transformer(file) {
  if (path.extname(file.path).toLowerCase() !== '.css') return undefined;
  const result = migrateAstryxThemeSelectors(file.source, file.path);
  return result === file.source ? undefined : result;
}
