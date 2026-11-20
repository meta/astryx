// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Component doc formatting — render ComponentDoc objects to text
 */

import {
  discoverComponents,
  findComponentReadme,
  resolveImportPath,
} from '../../../foundation/discovery/component-discovery.mjs';
import {loadDocs} from '../../../foundation/discovery/component-loader.mjs';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
import {firstSentence} from '../../../foundation/text/string-utils.mjs';
import {
  buildSignature,
  formatHookParameters,
  formatHookReturns,
} from './hook-format.mjs';

/**
 * Derive the `defineTheme` component-override key from a theming target.
 *
 * Override keys are the component's stable class name with the `astryx-`
 * namespace prefix stripped — `generateThemeRules` re-adds the prefix when it
 * builds the `.astryx-*` selector. So `astryx-table-cell` → key `table-cell`
 * (→ `.astryx-table-cell`), and `astryx-button` → key `button`.
 *
 * Keep the `astryx-` literal in sync with packages/core/src/naming.ts
 * (NAMESPACE / classPrefix), the same way commands/theme.mjs mirrors it.
 * <!-- SYNC: packages/core/src/naming.ts (namespace prefix source of truth) -->
 * @param {import('@astryxdesign/cli/authoring').ComponentThemingTarget} target
 * @returns {string}
 */
function targetKey(target) {
  return target.className.replace(/^astryx-/, '');
}

/**
 * Render one doc example as an optional heading and a code block. A setup
 * example says so in its heading, because it does not run on its own.
 * @param {import('@astryxdesign/cli/authoring').ComponentExampleDoc} ex
 * @param {string} hashes - heading level, e.g. '###'
 * @returns {string[]}
 */
function formatExample(ex, hashes) {
  const lines = [];
  if (ex.kind === 'setup') {
    lines.push(`${hashes} ${ex.label ?? 'Setup'} (setup, code only)\n`);
  } else if (ex.label) {
    lines.push(`${hashes} ${ex.label}\n`);
  }
  lines.push('```tsx\n' + ex.code + '\n```\n');
  return lines;
}

/** @param {string} name @returns {string} */
function dataAttrForName(name) {
  return `data-${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

/** @param {import('@astryxdesign/cli/authoring').ComponentThemingTarget} target @returns {string[]} */
function getTargetDataAttributes(target) {
  return [
    ...(target.visualProps || []).map(dataAttrForName),
    ...(target.states || []).map(dataAttrForName),
  ];
}

/**
 * Escape a value for a markdown table cell.
 *
 * A prop type is a union, and a union is spelled with the same `|` that GFM
 * uses to separate cells — backticks do not protect it. A row with more cells
 * than the header has columns gets the excess *discarded*, so an unescaped
 * `gap: 0 | 0.5 | ...` silently eats its own Default and Description columns.
 * <!-- SYNC: packages/core/src/Markdown/parser.ts (splits on unescaped pipes) -->
 * @param {unknown} value
 * @returns {string}
 */
export function mdCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

/**
 * Render props as a list, one prop per line: name, type, default, the
 * required and experimental markers, then the description. A list item needs
 * no cell escaping, so a union type keeps its pipes as written. A component
 * read prints each description's first sentence; the `--props` view prints it
 * whole.
 * @param {import('@astryxdesign/cli/authoring').ComponentPropDoc[]} [props]
 * @param {{whole?: boolean}} [options]
 * @returns {string}
 */
function formatPropsList(props, {whole = false} = {}) {
  if (!props || props.length === 0) return '';
  return props
    .map(p => {
      const def = p.default ? ` = \`${p.default}\`` : '';
      const req = p.required ? ' **(required)**' : '';
      // The text projection of the prop doc's `stability` field: an
      // experimental prop is outside the stable compatibility promise.
      const stability =
        p.stability === 'experimental' ? ' **(experimental)**' : '';
      const full = p.description ?? '';
      const description = whole ? full : firstSentence(full);
      return `- \`${p.name}\`: \`${p.type ?? ''}\`${def}${req}${stability}${description ? ` - ${description}` : ''}`;
    })
    .join('\n');
}

/**
 * Whether a family doc's sub-component entry is the read's own component. A
 * read scoped to one member keeps that member's entry under `components`, and
 * its props already print under `## Props`.
 * @param {any} docs
 * @param {any} comp
 * @returns {boolean}
 */
function isOwnEntry(docs, comp) {
  return 'props' in docs && comp.name === docs.name;
}

/**
 * How a read prints prop descriptions: each one's first sentence, under one
 * line that names the command printing them whole, or every one whole. A read
 * prints them whole when it has no such command, or when the cut would save
 * fewer characters than that line costs.
 * @param {any} docs
 * @param {string | null | undefined} propsCommand - The `component … --props`
 *   command that prints this read's props whole, without the CLI prefix.
 * @returns {{whole: boolean, pointer: string[]}}
 */
function propsPlan(docs, propsCommand) {
  if (!propsCommand) return {whole: true, pointer: []};
  /** @type {import('@astryxdesign/cli/authoring').ComponentPropDoc[]} */
  const props = [
    ...(docs.props ?? []),
    ...(docs.components ?? [])
      .filter((/** @type {any} */ c) => !isOwnEntry(docs, c))
      .flatMap((/** @type {any} */ c) => c.props ?? []),
  ];
  let saved = 0;
  for (const p of props) {
    const flat = (p.description ?? '').replace(/\s+/g, ' ').trim();
    saved += flat.length - firstSentence(flat).length;
  }
  const pointer = `Each prop description's first sentence; \`${getCliInvocation()} ${propsCommand}\` prints them whole.\n`;
  return saved > pointer.length
    ? {whole: false, pointer: [pointer]}
    : {whole: true, pointer: []};
}

/**
 * Render best practices as runs of Do and Don't items. A label line starts
 * each run of items with the same guidance, so every item keeps its place in
 * the list and its guidance.
 * @param {{guidance?: boolean, description: string}[] | undefined} practices
 * @returns {string[]}
 */
export function formatBestPractices(practices) {
  if (!practices?.length) return [];
  const lines = ['## Best Practices\n'];
  let label = '';
  for (const bp of practices) {
    const next = bp.guidance ? 'Do:' : "Don't:";
    if (next !== label) {
      // In Markdown, a line right under a list item continues that item, so a
      // later label needs a blank line before it to start its own run.
      if (label) lines.push('');
      lines.push(next);
      label = next;
    }
    lines.push(`- ${bp.description}`);
  }
  lines.push('');
  return lines;
}

/**
 * Render component-specific accessibility requirements.
 * @param {{name: string, description: string}[] | undefined} accessibility
 * @param {'##' | '####'} [heading]
 * @returns {string[]}
 */
export function formatAccessibility(accessibility, heading = '##') {
  if (!Array.isArray(accessibility) || accessibility.length === 0) return [];
  return [
    `${heading} Accessibility\n`,
    ...accessibility.map(item => `- **${item.name}:** ${item.description}`),
    '',
  ];
}

/**
 * Render a sub-component block (the `### Name` sections under "## Components").
 *
 * Sub-components are sometimes declared as a bare reference, e.g.
 * `{name: 'RadioListItem'}`, with their description/props documented in
 * their own `.doc.mjs`. Without guarding, `comp.description` is `undefined`
 * and was being printed literally as the string "undefined". Emit the
 * description only when present, and when there are no inline props point the
 * reader at the sub-component's own docs instead of a blank/`undefined` block.
 * @param {any} comp
 * @param {boolean} [whole] - print prop descriptions whole
 * @param {boolean} [ownProps] - the entry is the read's own component, whose
 *   props print under `## Props`: print no props list
 * @returns {string[]}
 */
function formatSubComponent(comp, whole = true, ownProps = false) {
  const out = [`### ${comp.name}\n`];
  if (comp.description) {
    out.push(comp.description + '\n');
  }
  out.push(...formatAccessibility(comp.usage?.accessibility, '####'));
  if (ownProps) return out;
  const list = formatPropsList(comp.props, {whole});
  if (list) {
    out.push(list + '\n');
  } else {
    out.push(
      `See \`${getCliInvocation()} component ${comp.name}\` for props and usage.\n`,
    );
  }
  return out;
}

/**
 * Whether a sub-component entry is only a name: its description, props and
 * examples live in its own doc, which `component <Name>` prints.
 * @param {any} comp
 * @returns {boolean}
 */
function isBareReference(comp) {
  return (
    !comp.description &&
    !comp.props?.length &&
    !comp.usage?.accessibility?.length &&
    !comp.examples?.length
  );
}

/**
 * Render the sub-components under "## Components", in order. Consecutive bare
 * references share one line that names the command reading each, so a family
 * of twenty parts costs one line instead of twenty headings.
 * @param {any[]} components
 * @param {string} [exampleHashes] - heading level for inline examples; none when omitted
 * @param {boolean} [whole] - print prop descriptions whole
 * @param {any} [docs] - the doc being read, so its own entry prints no props again
 * @returns {string[]}
 */
function formatSubComponents(components, exampleHashes, whole = true, docs) {
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  let names = [];
  const flush = () => {
    if (names.length === 1) {
      out.push(
        `See \`${getCliInvocation()} component ${names[0]}\` for its props and usage.\n`,
      );
    } else if (names.length > 1) {
      out.push(
        `Read each with \`${getCliInvocation()} component <Name>\`: ${names.join(', ')}.\n`,
      );
    }
    names = [];
  };
  for (const comp of components) {
    if (isBareReference(comp)) {
      names.push(comp.name);
      continue;
    }
    flush();
    out.push(
      ...formatSubComponent(
        comp,
        whole,
        docs != null && isOwnEntry(docs, comp),
      ),
    );
    if (exampleHashes && comp.examples?.length) {
      for (const ex of comp.examples) {
        out.push(...formatExample(ex, exampleHashes));
      }
    }
  }
  flush();
  return out;
}

/**
 * Get the variant values for a given theming target, extracting them from
 * the visualProps and the variant prop in the component's props list.
 * Returns an array of variant strings from the `variant` prop type,
 * or the variants from target visualProps.
 * @param {import('@astryxdesign/cli/authoring').ComponentThemingTarget} target
 * @param {any} docs
 * @returns {string[]}
 */
function getTargetVariants(target, docs) {
  if (!target.visualProps?.length) return [];

  // If variant is a visualProp, try to resolve the actual variant values from props
  if (target.visualProps.includes('variant')) {
    const allProps = docs.props || docs.components?.[0]?.props || [];
    const variantProp = allProps.find(
      (/** @type {any} */ p) => p.name === 'variant',
    );
    if (variantProp && variantProp.type.includes('|')) {
      return variantProp.type
        .replace(/['"]/g, '')
        .split('|')
        .map((/** @type {string} */ v) => v.trim())
        .filter(Boolean);
    }
  }

  // Return all visualProps as-is (size, orientation, etc.)
  return target.visualProps;
}

/**
 * Get the state classes for a theming target from the states field.
 * @param {import('@astryxdesign/cli/authoring').ComponentThemingTarget} target
 * @returns {string[]}
 */
function getTargetStates(target) {
  return target.states || [];
}

/**
 * Format a component's icon slots: the `componentIcons` keys a theme sets,
 * with each slot's state, fallback, and what `null` does.
 * @param {any[]} slots - `theming.componentIcons` entries.
 * @returns {string}
 */
function formatComponentIconSlots(slots) {
  const lines = [
    '**Component icon slots** - set in `defineTheme({componentIcons})` to a shared icon name, `null`, a partial `{icon, variant, size}` request, or a function of the slot state.\n',
    '| Slot | State | Fallback | Role | `null` |',
    '|---|---|---|---|---|',
  ];
  for (const slot of slots) {
    const state = slot.state?.length
      ? slot.state
          .map(
            (/** @type {any} */ field) =>
              `\`${mdCell(field.name)}: ${mdCell(field.type)}\` ${mdCell(field.description)}`,
          )
          .join('<br>')
      : 'none';
    lines.push(
      `| \`${mdCell(slot.slot)}\` | ${state} | ${mdCell(slot.fallback)} | ${mdCell(slot.description)} | ${mdCell(slot.whenNull)} |`,
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Format the theming targets table, merging in theme variants if available.
 *
 * @param {any} docs - Component doc object
 * @param {any} themeData - Resolved theme data with variants
 * @returns {string} Markdown table
 */
function formatTargetsTable(docs, themeData) {
  if (!docs.theming?.targets?.length) return '';

  /** @type {string[]} */
  const lines = [];
  lines.push(
    '| Component class | Preferred data attributes | Props | States |',
  );
  lines.push('|---|---|---|---|');

  for (const target of docs.theming.targets) {
    const coreVariants = getTargetVariants(target, docs);
    const states = getTargetStates(target);

    // Merge theme variants — keyed by component name derived from class
    // e.g. className 'xds-button' → component key 'button'
    const componentKey = targetKey(target);
    const themeVariants = themeData?.variants?.[componentKey] || [];

    // Build variant display: core variants plain, theme variants with * suffix
    const variantParts = [
      ...coreVariants,
      ...themeVariants.map((/** @type {string} */ v) => `${v}*`),
    ];

    const variantsStr = variantParts.length > 0 ? variantParts.join(', ') : '-';
    const statesStr = states.length > 0 ? states.join(', ') : '-';
    const dataAttrs = getTargetDataAttributes(target);
    const dataAttrsStr =
      dataAttrs.length > 0
        ? dataAttrs.map(attr => `\`${attr}\``).join(', ')
        : '-';

    const className = `\`${target.className}\``;
    lines.push(
      `| ${className} | ${dataAttrsStr} | ${variantsStr} | ${statesStr} |`,
    );
  }

  return lines.join('\n');
}

/**
 * Format full component docs (default mode, replaces cleanReadme).
 *
 * @param {any} docs - Component doc object
 * @param {object} [options] - Options
 * @param {any} [options.themeData] - Resolved theme data
 * @param {string|null} [options.importHint] - Import path hint (e.g. '@astryxdesign/core/Button')
 * @param {string|null} [options.propsCommand] - The `component … --props` command
 *   that prints this read's props whole; without it, descriptions print whole
 */
export function formatFull(docs, options = {}) {
  /** @type {string[]} */
  const sections = [];

  sections.push(`# ${docs.name}\n`);
  const desc = docs.usage?.description || docs.description || '';
  sections.push(desc + '\n');

  if (options.importHint) {
    // Use the primary export (docs.name) for the import hint, not the first
    // sub-component (docs.components[0].name). Showing a sub-component caused
    // agents to conflate the primary with a sub-component and hallucinate props
    // (origin/main #2860). Bare name per the un-prefix migration (P5a).
    const displayName = docs.name;
    sections.push(
      `**Import:** \`import {${displayName}} from '${options.importHint}';\`\n`,
    );
  }

  if (docs.usage?.anatomy?.length) {
    sections.push('## Anatomy\n');
    sections.push('| Element | Required | Description |');
    sections.push('|---|---|---|');
    for (const el of docs.usage.anatomy) {
      const req = el.required ? 'Yes' : 'No';
      sections.push(
        `| ${mdCell(el.name)} | ${req} | ${mdCell(el.description)} |`,
      );
    }
    sections.push('');
  }

  sections.push(...formatBestPractices(docs.usage?.bestPractices));

  sections.push(...formatAccessibility(docs.usage?.accessibility));

  const plan = propsPlan(docs, options.propsCommand);
  // The pointer prints once, above the first props list.
  let pointer = plan.pointer;

  // Single component props
  if ('props' in docs) {
    sections.push('## Props\n');
    sections.push(...pointer);
    pointer = [];
    sections.push(formatPropsList(docs.props, {whole: plan.whole}) + '\n');
  }

  // Multi-component
  if ('components' in docs) {
    sections.push('## Components\n');
    if (
      docs.components.some(
        (/** @type {any} */ c) => c.props?.length && !isOwnEntry(docs, c),
      )
    ) {
      sections.push(...pointer);
    }
    sections.push(
      ...formatSubComponents(docs.components, '####', plan.whole, docs),
    );
  }

  // A read that resolves to a hook prints what it takes and returns, as
  // `hook <name>` does.
  sections.push(...formatHookParameters(docs), ...formatHookReturns(docs));

  if (docs.examples?.length) {
    sections.push('## Examples\n');
    for (const ex of docs.examples) {
      sections.push(...formatExample(ex, '###'));
    }
  }

  if (docs.theming) {
    const {themeData = null} = options;
    sections.push('## Theming\n');
    // Targets table with theme variant merging
    if (docs.theming.targets?.length) {
      const targetsTable = formatTargetsTable(docs, themeData);
      sections.push(targetsTable + '\n');

      // Note about theme variants if any are present
      if (themeData?.variants) {
        const componentKeys = docs.theming.targets.map((/** @type {any} */ t) =>
          targetKey(t),
        );
        const hasThemeVariants = componentKeys.some(
          (/** @type {any} */ k) => themeData.variants[k]?.length > 0,
        );
        if (hasThemeVariants) {
          sections.push(
            `_\\* = custom variant from ${themeData.name || 'active'} theme_\n`,
          );
        }
      }

      // Generate defineTheme example with canonical component selectors only.
      const exampleTargets = docs.theming.targets;
      if (exampleTargets.length > 0) {
        /**
         * One override entry: the target's key with its base, and its first
         * variant and state key when it has them.
         * @param {any} target
         * @param {boolean} withVariant
         */
        const entry = (target, withVariant) => {
          const keys = ['base: {/* CSS properties */}'];
          if (withVariant && target.visualProps?.length) {
            keys.push(
              `'${target.visualProps[0]}:value': {/* variant-specific */}`,
            );
          }
          if (target.states?.length) {
            keys.push(`'${target.states[0]}': {/* state-specific */}`);
          }
          return `'${targetKey(target)}': {${keys.join(', ')}}`;
        };
        const entries = [entry(exampleTargets[0], true)];
        if (exampleTargets.length > 1) {
          entries.push(entry(exampleTargets[1], false));
        }
        sections.push(
          `Override in defineTheme: \`components: {${entries.join(', ')}}\`\n`,
        );
      }
    }

    if (docs.theming.componentIcons?.length) {
      sections.push(formatComponentIconSlots(docs.theming.componentIcons));
    }

    // Legacy componentKey (for backward compatibility)
    if (docs.theming.componentKey) {
      sections.push(`Component key: \`${docs.theming.componentKey}\`\n`);
    }

    // Component CSS vars — split into public (directly settable) and private (set via derived)
    if (docs.theming?.vars?.length) {
      const publicVars = docs.theming.vars.filter(
        (/** @type {any} */ v) => !v.private && !v.derived,
      );

      if (publicVars.length > 0) {
        sections.push(
          '**Themeable CSS variables** - additional properties that can be overridden in `defineTheme` component overrides.\n',
        );
        const varLines = [];
        varLines.push('| CSS Variable | Default | Description |');
        varLines.push('|---|---|---|');
        for (const v of publicVars) {
          varLines.push(
            `| \`${mdCell(v.name)}\` | \`${mdCell(v.default)}\` | ${mdCell(v.description)} |`,
          );
        }
        sections.push(varLines.join('\n') + '\n');
      }

      // Show derived property examples — the recommended way to theme
      if (docs.theming?.derived?.length) {
        const canonical = docs.theming.targets || [];
        const varsKey = canonical.length
          ? targetKey(canonical[0])
          : docs.theming.componentKey || '';
        const derivedExamples = docs.theming.derived
          .filter((/** @type {any} */ d) => d.vars?.length)
          .map((/** @type {any} */ d) => `${d.property}: '...'`);
        const expandExamples = docs.theming.derived
          .filter((/** @type {any} */ d) => d.expand === 'container')
          .map(
            (/** @type {any} */ d) =>
              `${d.property}: '...' /* expands to container layout tokens */`,
          );
        const allExamples = [...derivedExamples, ...expandExamples];
        if (allExamples.length) {
          sections.push(
            `Some properties are set via standard CSS in component overrides: \`components: {${varsKey}: {base: {${allExamples.join(', ')}}}}\`\n`,
          );
        }
      }
    }
  }

  return sections.join('\n');
}

/** Longest doc example the short answer prints; a longer one stays in `--detail full`. */
const SHORT_EXAMPLE_MAX_LINES = 20;

/**
 * The common-use code for the short answer: the doc's first example when it
 * runs on its own and is short, else one element built from the required
 * props, or nothing when it has none. `...` marks each value the caller
 * fills in.
 * @param {any} docs
 * @param {string} name - the component's export name
 * @returns {string | null}
 */
export function shortUsage(docs, name) {
  const example = (docs.examples ?? []).find(
    (/** @type {any} */ ex) =>
      ex.kind !== 'setup' && typeof ex.code === 'string',
  );
  if (example) {
    const code = example.code.trim();
    if (code.split('\n').length <= SHORT_EXAMPLE_MAX_LINES) return code;
  }
  if (!/^[A-Z]/.test(name) || !Array.isArray(docs.props)) return null;
  /** @type {string[]} */
  const attrs = [];
  let hasChildren = false;
  for (const p of docs.props) {
    if (!p.required) continue;
    if (p.name === 'children') {
      hasChildren = true;
      continue;
    }
    attrs.push(
      /^'|^string$/.test(String(p.type ?? '').trim())
        ? `${p.name}="..."`
        : `${p.name}={...}`,
    );
  }
  // A line with no required prop and no children shows nothing the import
  // does not, so the answer prints no usage.
  if (!attrs.length && !hasChildren) return null;
  const open = [name, ...attrs].join(' ');
  return hasChildren ? `<${open}>...</${name}>` : `<${open} />`;
}

/**
 * Format the short answer that a component read prints by default
 * (`--detail compact`): what the component is, its import, the common use,
 * every prop with its description's first sentence, and its pieces. It ends with the commands that
 * print the rest, so nothing the doc holds is out of reach.
 *
 * Every part comes from fields each component doc already has, so a new
 * component or an integration's component gets the same answer.
 * @param {any} docs
 * @param {string} componentName
 * @param {string} [importHint]
 * @param {{propsCommand?: string | null, fullCommand?: string | null}} [options]
 * @returns {string}
 */
export function formatCompact(docs, componentName, importHint, options = {}) {
  const run = getCliInvocation();
  const name = docs.name ?? componentName;
  /** @type {string[]} */
  const sections = [];

  sections.push(`# ${name}\n`);
  const desc = docs.usage?.description || docs.description || '';
  const firstParagraph = desc.split(/\n\s*\n/)[0].trim();
  if (firstParagraph) sections.push(firstParagraph + '\n');

  // A replacement prints the export its package has (componentName), not
  // the Core name it answers to.
  const displayName = componentName.startsWith('XDS')
    ? componentName.slice(3)
    : componentName;
  if (importHint) {
    sections.push(
      `**Import:** \`import { ${displayName} } from '${importHint}';\`\n`,
    );
  }

  const setup = (docs.examples ?? []).filter(
    (/** @type {any} */ ex) =>
      ex.kind === 'setup' &&
      typeof ex.code === 'string' &&
      ex.code.trim().split('\n').length <= SHORT_EXAMPLE_MAX_LINES,
  );
  const usage = shortUsage(docs, displayName);
  if (setup.length || usage) {
    sections.push('## Usage\n');
    for (const ex of setup) sections.push(...formatExample(ex, '###'));
    if (usage) sections.push('```tsx\n' + usage + '\n```\n');
  }

  sections.push(...formatAccessibility(docs.usage?.accessibility));

  // Each prop prints its description's first sentence (INV4); the More
  // list names the `--props` read that prints them whole.
  const plan = propsPlan(docs, options.propsCommand);
  if ('props' in docs && docs.props?.length) {
    sections.push('## Props\n');
    sections.push(formatPropsList(docs.props, {whole: plan.whole}) + '\n');
  }

  if ('components' in docs && docs.components?.length) {
    /** @type {string[]} */
    const pieces = [];
    /** @type {string[]} */
    const bare = [];
    for (const comp of docs.components) {
      // A family doc can list its own entry again; its props are above.
      if (isOwnEntry(docs, comp)) continue;
      if (comp.props?.length) {
        pieces.push(
          `### ${comp.name}\n`,
          formatPropsList(comp.props, {whole: plan.whole}) + '\n',
        );
      } else {
        bare.push(comp.name);
      }
    }
    if (pieces.length || bare.length) sections.push('## Components\n');
    sections.push(...pieces);
    if (bare.length) {
      sections.push(
        `${bare.join(', ')}: read ${bare.length === 1 ? 'it' : 'them in one call'} with \`${run} component ${bare.join(' ')}\`.\n`,
      );
    }
  }

  // A hook's parameters print as its props do: one line each, with the
  // description's first sentence; `--detail full` prints them whole.
  if (docs.params?.length) {
    sections.push('## Parameters\n');
    sections.push(formatPropsList(docs.params) + '\n');
  }
  sections.push(...formatHookReturns(docs));

  if (docs.theming?.componentIcons?.length) {
    sections.push('## Component Icon Slots\n');
    sections.push(formatComponentIconSlots(docs.theming.componentIcons));
  }

  if (options.propsCommand && !plan.whole) {
    sections.push(
      `Each prop's whole description: \`${run} ${options.propsCommand}\`\n`,
    );
  }
  // The last line says how to get the full output.
  if (options.fullCommand) {
    sections.push(
      `Full output, with anatomy, best practices, examples and theming (classes, data attributes, CSS variables): \`${run} ${options.fullCommand}\`\n`,
    );
  }

  return sections.join('\n');
}

/**
 * Format a brief, LLM-optimized summary (replaces extractBrief).
 *
 * Format: component signature + key props + one usage example.
 * Targets ~200-400 chars per component (vs ~2-3KB for --detail compact).
 *
 * For multi-component docs, extracts the entry matching componentName.
 */
/**
 * Longest union `--detail brief` will spell out inside the one-line signature.
 *
 * The signature is a glance, not a reference: a six-member enum like
 * `start|center|end|between|around|evenly` reads at a glance, an eleven-member
 * spacing scale does not — and Stack carries four of them (gap, padding,
 * paddingInline, paddingBlock), so it printed the same scale four times. Longer
 * unions fall through to the terse prop list, exactly as they did when the type
 * was still the bare name `SpacingStep`. The full values are always one
 * `astryx component <Name>` away.
 */
const SIGNATURE_UNION_MAX_MEMBERS = 8;

/**
 * @param {any} docs
 * @param {string} componentName
 * @param {string} [importHint]
 * @param {{themeData?: any}} [options]
 * @returns {string}
 */
export function formatBrief(docs, componentName, importHint, options = {}) {
  const displayName = componentName.startsWith('XDS')
    ? componentName.slice(3)
    : componentName;

  // Find the right props and examples for this component
  /** @type {any[]} */
  let props = [];
  let description = docs.usage?.description || docs.description || '';
  let examples = docs.examples || [];

  if ('props' in docs) {
    props = docs.props;
  } else if ('components' in docs) {
    const entry = docs.components.find(
      (/** @type {any} */ c) => c.name === displayName,
    );
    if (entry) {
      props = entry.props;
      description = entry.description;
      examples = entry.examples || docs.examples || [];
    }
  }

  // Build signature from union-type props
  /** @type {string[]} */
  const signatureProps = [];
  /** @type {string[]} */
  const otherProps = [];

  for (const prop of props) {
    const values =
      prop.type.includes('|') && !prop.type.includes('ReactNode')
        ? prop.type
            .replace(/['"]/g, '')
            .split('|')
            .map((/** @type {string} */ v) => v.trim())
        : null;
    if (values && values.length <= SIGNATURE_UNION_MAX_MEMBERS) {
      signatureProps.push(`${prop.name}: ${values.join('|')}`);
    } else if (prop.required) {
      otherProps.unshift(`${prop.name}: ${prop.type.split('|')[0].trim()}`);
    } else {
      otherProps.push(prop.name);
    }
  }

  // Build output
  /** @type {string[]} */
  const output = [];

  // Signature line
  // A hook's signature names what it returns, as `hook <name>` prints it.
  const sigStr = Array.isArray(docs.returns)
    ? buildSignature({...docs, name: displayName})
    : signatureProps.length > 0
      ? `${displayName}(${signatureProps.join(', ')})`
      : displayName;
  output.push(importHint ? `${sigStr}  <- from '${importHint}'` : sigStr);

  // Description (shortened)
  if (description) {
    const shortDesc =
      description.length > 80 ? description.slice(0, 77) + '...' : description;
    output.push(`  ${shortDesc}`);
  }

  // Component vars (if any — only show public vars)
  if (docs.theming?.vars?.length) {
    const varNames = docs.theming.vars
      .filter((/** @type {any} */ v) => !v.derived && !v.private)
      .map((/** @type {any} */ v) => `${v.name} (${v.default})`)
      .join(', ');
    if (varNames) {
      output.push(`  Vars: ${varNames}`);
    }
  }

  // Derived properties (if any)
  if (docs.theming?.derived?.length) {
    const derivedNames = docs.theming.derived
      .map((/** @type {any} */ d) =>
        d.expand === 'container'
          ? `${d.property} -> container tokens`
          : `${d.property} -> ${(d.vars || []).join(', ')}`,
      )
      .join('; ');
    output.push(`  Derived: ${derivedNames}`);
  }

  // Component icon slots, with the state each slot function receives
  if (docs.theming?.componentIcons?.length) {
    const slots = docs.theming.componentIcons
      .map((/** @type {any} */ slot) =>
        slot.state?.length
          ? `${slot.slot} {${slot.state.map((/** @type {any} */ field) => `${field.name}: ${field.type}`).join(', ')}}`
          : slot.slot,
      )
      .join('; ');
    output.push(`  Icon slots: ${slots}`);
  }

  // Theme targets (component class, preferred data attrs, props, states) with theme variant merging
  if (docs.theming?.targets?.length) {
    const {themeData = null} = options;
    const targetParts = docs.theming.targets.map((/** @type {any} */ t) => {
      const parts = [t.className];
      const dataAttrs = getTargetDataAttributes(t);
      if (dataAttrs.length)
        parts.push(`preferred attrs: ${dataAttrs.join(', ')}`);
      if (t.visualProps?.length)
        parts.push(`variants: ${t.visualProps.join(', ')}`);
      if (t.states?.length) parts.push(`states: ${t.states.join(', ')}`);
      // Merge theme variants
      const componentKey = targetKey(t);
      const themeVars = themeData?.variants?.[componentKey];
      if (themeVars?.length)
        parts.push(
          `theme: ${themeVars.map((/** @type {any} */ v) => v + '*').join(', ')}`,
        );
      return parts.join(' ');
    });
    output.push(`  Targets: ${targetParts.join(' | ')}`);
  }

  // Other props
  if (otherProps.length > 0) {
    output.push(`  ${otherProps.join(', ')}`);
  }

  // First code example; a setup example does not show the component in use.
  const usageExample =
    examples.find((/** @type {any} */ ex) => ex.kind !== 'setup') ??
    examples[0];
  if (usageExample) {
    const code = usageExample.code;
    const codeLine =
      code
        .split('\n')
        .find((/** @type {string} */ l) => l.trim().startsWith('<XDS')) ||
      code.split('\n')[0];
    output.push(`  ${codeLine.trim()}`);
  }

  return output.join('\n') + '\n';
}

/**
 * Format only the props tables (replaces extractProps).
 * @param {any} docs
 * @param {string} componentName
 * @returns {string}
 */
export function formatProps(docs, componentName) {
  if ('props' in docs) {
    return `## Props\n\n${formatPropsList(docs.props, {whole: true})}\n`;
  }

  if ('components' in docs) {
    /** @type {string[]} */
    const sections = [];
    for (const comp of docs.components) {
      sections.push(`### ${comp.name} Props\n`);
      sections.push(formatPropsList(comp.props, {whole: true}) + '\n');
    }
    return sections.join('\n');
  }

  return `No props documentation found for ${componentName}.\n`;
}

/**
 * Format brief summaries for ALL components in one output.
 * `replacements` maps a replaced Core name to the full list entry of the
 * integration component that takes its slot; that entry is printed in its
 * place, naming its package. `categories`, when given, limits the output to
 * those group keys (the keys of the list result it renders), so the text shows
 * the same groups as the JSON and `replacements` covers every slot it prints.
 * @param {string} coreDir
 * @param {{zh?: boolean, lang?: string, themeData?: any, replacements?: Map<string, any>, categories?: string[]}} [options]
 * @returns {Promise<string>}
 */
export async function formatBriefAll(
  coreDir,
  {
    zh = false,
    lang,
    themeData = null,
    replacements = new Map(),
    categories,
  } = {},
) {
  const components = discoverComponents(coreDir);
  const shown = categories ? new Set(categories) : null;
  /** @type {string[]} */
  const output = [];

  for (const [key, comps] of Object.entries(components)) {
    if (shown && !shown.has(key)) continue;
    const isUngrouped = comps.length === 1 && comps[0] === key;
    if (!isUngrouped) {
      output.push(`## ${key}\n`);
    }
    for (const comp of comps) {
      const replacement = replacements.get(comp);
      if (replacement) {
        const [first, ...rest] = formatBrief(
          replacement,
          replacement.name,
          replacement.import,
          {themeData},
        ).split('\n');
        output.push([`${first}  [${replacement.package}]`, ...rest].join('\n'));
        continue;
      }
      const readmePath = findComponentReadme(coreDir, comp);
      if (readmePath && readmePath.endsWith('.doc.mjs')) {
        const docs = await loadDocs(readmePath, {zh, lang});
        const importPath = resolveImportPath(coreDir, comp);
        output.push(formatBrief(docs, comp, importPath, {themeData}));
      } else {
        output.push(`${comp}\n  (no docs)\n`);
      }
    }
  }

  return output.join('\n');
}
