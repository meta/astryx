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

/** @param {import('@astryxdesign/cli/authoring').ComponentPropDoc[]} [props] @returns {string} */
function formatPropsTable(props) {
  if (!props || props.length === 0) return '';
  /** @type {string[]} */
  const lines = [];
  lines.push('| Prop | Type | Default | Description |');
  lines.push('|------|------|---------|-------------|');
  for (const p of props) {
    const def = p.default ? `\`${mdCell(p.default)}\`` : '-';
    const req = p.required ? ' **(required)**' : '';
    // The text projection of the prop doc's `stability` field: an
    // experimental prop is outside the stable compatibility promise.
    const stability =
      p.stability === 'experimental' ? ' **(experimental)**' : '';
    lines.push(
      `| \`${mdCell(p.name)}\` | \`${mdCell(p.type)}\` | ${def} | ${mdCell(p.description)}${req}${stability} |`,
    );
  }
  return lines.join('\n');
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
 * @returns {string[]}
 */
function formatSubComponent(comp) {
  const out = [`### ${comp.name}\n`];
  if (comp.description) {
    out.push(comp.description + '\n');
  }
  out.push(...formatAccessibility(comp.usage?.accessibility, '####'));
  const table = formatPropsTable(comp.props);
  if (table) {
    out.push(table + '\n');
  } else {
    out.push(
      `See \`${getCliInvocation()} component ${comp.name}\` for props and usage.\n`,
    );
  }
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
  lines.push(
    '|-----------------|---------------------------|-------|--------|',
  );

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
    sections.push('|---------|----------|-------------|');
    for (const el of docs.usage.anatomy) {
      const req = el.required ? 'Yes' : 'No';
      sections.push(
        `| ${mdCell(el.name)} | ${req} | ${mdCell(el.description)} |`,
      );
    }
    sections.push('');
  }

  if (docs.usage?.bestPractices?.length) {
    sections.push('## Best Practices\n');
    for (const bp of docs.usage.bestPractices) {
      const badge = bp.guidance ? '**Do:**' : "**Don't:**";
      sections.push(`- ${badge} ${bp.description}`);
    }
    sections.push('');
  }

  sections.push(...formatAccessibility(docs.usage?.accessibility));

  // Single component props
  if ('props' in docs) {
    sections.push('## Props\n');
    sections.push(formatPropsTable(docs.props) + '\n');
  }

  // Multi-component
  if ('components' in docs) {
    sections.push('## Components\n');
    for (const comp of docs.components) {
      sections.push(...formatSubComponent(comp));
      if (comp.examples?.length) {
        for (const ex of comp.examples) {
          if (ex.label) sections.push(`#### ${ex.label}\n`);
          sections.push('```tsx\n' + ex.code + '\n```\n');
        }
      }
    }
  }

  if (docs.examples?.length) {
    sections.push('## Examples\n');
    for (const ex of docs.examples) {
      if (ex.label) sections.push(`### ${ex.label}\n`);
      sections.push('```tsx\n' + ex.code + '\n```\n');
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
        const exampleLines = ['Override in defineTheme:\n```ts\ncomponents: {'];
        const rootTarget = exampleTargets[0];
        const rootKey = targetKey(rootTarget);
        exampleLines.push(`  '${rootKey}': {`);
        exampleLines.push(`    base: { /* CSS properties */ },`);
        if (rootTarget.visualProps?.length) {
          const firstVariant = rootTarget.visualProps[0];
          exampleLines.push(
            `    '${firstVariant}:value': { /* variant-specific */ },`,
          );
        }
        if (rootTarget.states?.length) {
          const firstState = rootTarget.states[0];
          exampleLines.push(`    '${firstState}': { /* state-specific */ },`);
        }
        exampleLines.push(`  },`);
        if (exampleTargets.length > 1) {
          const subTarget = exampleTargets[1];
          const subKey = targetKey(subTarget);
          exampleLines.push(`  '${subKey}': {`);
          exampleLines.push(`    base: { /* CSS properties */ },`);
          if (subTarget.states?.length) {
            const firstState = subTarget.states[0];
            exampleLines.push(`    '${firstState}': { /* state-specific */ },`);
          }
          exampleLines.push(`  },`);
        }
        exampleLines.push('}\n```\n');
        sections.push(exampleLines.join('\n'));
      }
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
        varLines.push('|-------------|---------|-------------|');
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
          .map((/** @type {any} */ d) => `      ${d.property}: '...',`)
          .join('\n');
        const expandExamples = docs.theming.derived
          .filter((/** @type {any} */ d) => d.expand === 'container')
          .map(
            (/** @type {any} */ d) =>
              `      ${d.property}: '...',  // expands to container layout tokens`,
          )
          .join('\n');
        const allExamples = [derivedExamples, expandExamples]
          .filter(Boolean)
          .join('\n');
        if (allExamples) {
          sections.push(
            'Some properties are set via standard CSS in component overrides:\n```ts\ncomponents: {\n  ' +
              varsKey +
              ': {\n    base: {\n' +
              allExamples +
              '\n    },\n  },\n}\n```\n',
          );
        }
      }
    }
  }

  return sections.join('\n');
}

/**
 * Format compact docs for LLM consumption (replaces extractCompact + ensureImportStatement).
 * Includes: import, best practices, props, theming.
 * @param {any} docs
 * @param {string} componentName
 * @param {string} [importHint]
 * @returns {string}
 */
export function formatCompact(docs, componentName, importHint) {
  // Bare name (un-prefix migration P5a): the CLI now presents component names
  // without the Astryx prefix. componentName is already bare post-P4.
  const displayName = componentName.startsWith('XDS')
    ? componentName.slice(3)
    : componentName;

  /** @type {string[]} */
  const sections = [];

  sections.push(`# ${docs.name}\n`);
  const desc = docs.usage?.description || docs.description || '';
  sections.push(desc + '\n');

  if (docs.usage?.anatomy?.length) {
    sections.push(
      'Anatomy: ' +
        docs.usage.anatomy
          .map((/** @type {any} */ el) => {
            const req = el.required ? '' : ' (optional)';
            return `${el.name}${req}`;
          })
          .join(', ') +
        '\n',
    );
  }

  if (importHint) {
    sections.push('## Import\n');
    sections.push(
      `\`\`\`tsx\nimport { ${displayName} } from '${importHint}';\n\`\`\`\n`,
    );
  }

  if (docs.usage?.bestPractices?.length) {
    sections.push('## Best Practices\n');
    for (const bp of docs.usage.bestPractices) {
      const badge = bp.guidance ? '**Do:**' : "**Don't:**";
      sections.push(`- ${badge} ${bp.description}`);
    }
    sections.push('');
  }

  sections.push(...formatAccessibility(docs.usage?.accessibility));

  // Props
  if ('props' in docs) {
    sections.push('## Props\n');
    sections.push(formatPropsTable(docs.props) + '\n');
  }

  if ('components' in docs) {
    for (const comp of docs.components) {
      sections.push(...formatSubComponent(comp));
    }
  }

  // Limited examples (max 3)
  const examples = docs.examples?.slice(0, 3) || [];
  if (examples.length) {
    sections.push('## Usage\n');
    for (const ex of examples) {
      if (ex.label) sections.push(`### ${ex.label}\n`);
      sections.push('```tsx\n' + ex.code + '\n```\n');
    }
  }

  // Derived theming properties (compact includes these for theme consumers)
  if (docs.theming?.derived?.length) {
    sections.push('## Derived Theme Properties\n');
    sections.push('Standard CSS properties that also set internal vars:\n');
    const propLines = [];
    propLines.push('| CSS Property | Sets |');
    propLines.push('|-------------|------|');
    for (const d of docs.theming.derived) {
      const target =
        d.expand === 'container'
          ? 'container layout tokens'
          : (d.vars || [])
              .map((/** @type {any} */ v) => `\`${mdCell(v)}\``)
              .join(', ');
      propLines.push(`| \`${mdCell(d.property)}\` | ${target} |`);
    }
    sections.push(propLines.join('\n') + '\n');
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
  const sigStr =
    signatureProps.length > 0
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

  // First code example
  if (examples.length > 0) {
    const code = examples[0].code;
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
    return `## Props\n\n${formatPropsTable(docs.props)}\n`;
  }

  if ('components' in docs) {
    /** @type {string[]} */
    const sections = [];
    for (const comp of docs.components) {
      sections.push(`### ${comp.name} Props\n`);
      sections.push(formatPropsTable(comp.props) + '\n');
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
