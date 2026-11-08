// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input Everything the lab has been tuned to this session
 * @output The two artefacts the foundation milestone ships, plus the lint rule
 * @position /motion/export
 *
 * The only page that decides nothing. It emits: the token block in the shape
 * the proposal actually lands in — an addition to two objects core already
 * defines through StyleX, not a `:root` block, because `:root` is not how this
 * codebase defines tokens — the JS mirror, and the lint entries that would
 * keep both honest.
 */

import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Link} from '@astryxdesign/core/Link';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import {LabPage} from '../PageFrame';
import {parseMs, useMotionLab} from '../MotionLabStore';
import {
  ALL_TUNABLE_TOKENS,
  CURRENT_EASE,
  DEFAULT_TOKEN_VALUES,
  PRIMITIVE_DURATIONS,
  SEMANTIC_DURATIONS,
  SEMANTIC_EASES,
  SPRINGS,
  STAGGERS,
} from '../motionTokens';
import {isNamedCurve, parseBezier} from '../spring';
import {AUDIT_COUNTS, LITERAL_VALUES} from '../__generated__/motionAudit';

const sx = stylex.create({
  mono: {fontFamily: 'var(--font-family-code)'},
  prose: {maxWidth: '72ch'},
});

const PRIMITIVE_MS = new Map(PRIMITIVE_DURATIONS);

/** The brief's budget for the sweep, against the measured total. */
const BRIEF_HARDCODED_BUDGET = 28;

type CodeLine = {readonly text: string; readonly added?: boolean};

function render(lines: ReadonlyArray<CodeLine>): {
  code: string;
  highlightLines: number[];
} {
  return {
    code: lines.map(line => line.text).join('\n'),
    highlightLines: lines
      .map((line, i) => (line.added === true ? i + 1 : 0))
      .filter(n => n > 0),
  };
}

/**
 * The token block. Semantic durations emit as `var(--primitive)` — the pattern
 * `typeScaleDefaults` already uses for type — so a theme retunes both layers at
 * once. A value tuned away from its primitive cannot alias, and says so.
 */
function tokenBlockLines(
  rawToken: (token: string) => string,
): ReadonlyArray<CodeLine> {
  const durationLines = SEMANTIC_DURATIONS.map(duration => {
    const ms = parseMs(rawToken(duration.name));
    const primitiveMs =
      duration.primitive != null
        ? PRIMITIVE_MS.get(duration.primitive)
        : undefined;
    if (primitiveMs != null && primitiveMs === ms) {
      return {
        text: `  '${duration.name}': 'var(${duration.primitive})',`,
        added: true,
      };
    }
    const drift =
      primitiveMs != null
        ? ` // tuned off ${duration.primitive} (${primitiveMs}ms) — move the primitive or accept the fork`
        : ' // no primitive: the reduced-motion escape';
    return {text: `  '${duration.name}': '${ms}ms',${drift}`, added: true};
  });

  return [
    {text: '// @astryxdesign/core/src/theme/tokens.stylex.ts'},
    {
      text: '// Additions only. The nine primitives and --ease-standard do not move.',
    },
    {text: ''},
    {text: 'export const easeDefaults = {'},
    {
      text: `  '${CURRENT_EASE.name}': '${CURRENT_EASE.value}', // kept; deprecated in docs, not in code`,
    },
    ...SEMANTIC_EASES.map(ease => ({
      text: `  '${ease.name}': '${rawToken(ease.name)}',`,
      added: true,
    })),
    {text: '} as const;'},
    {text: ''},
    {text: 'export const easeVars = stylex.defineVars(easeDefaults);'},
    {text: ''},
    {text: 'export const durationDefaults = {'},
    ...PRIMITIVE_DURATIONS.map(([name, ms]) => ({
      text: `  '${name}': '${ms}ms',`,
    })),
    {text: ''},
    {
      text: '  // Semantic layer. Aliased, so the motion scale a theme sets still owns',
    },
    {text: '  // these — the same shape typeScaleDefaults uses for type.'},
    ...durationLines,
    {text: '} as const;'},
    {text: ''},
    {text: 'export const durationVars = stylex.defineVars(durationDefaults);'},
    {text: ''},
    {
      text: '// Stagger is a delay between siblings, not a duration, so it gets its own',
    },
    {text: '// group rather than widening DurationVarName.'},
    {text: 'export const staggerDefaults = {', added: true},
    ...STAGGERS.map(([name]) => ({
      text: `  '${name}': '${parseMs(rawToken(name))}ms',`,
      added: true,
    })),
    {text: '} as const;', added: true},
    {text: '', added: true},
    {
      text: 'export const staggerVars = stylex.defineVars(staggerDefaults);',
      added: true,
    },
  ];
}

/** Seconds and numbers — the shape Motion, WAAPI and canvas take. */
function emitMirror(
  rawToken: (token: string) => string,
  springs: Readonly<Record<string, {duration: number; bounce: number}>>,
): string {
  const short = (name: string) =>
    name.replace(/^--(duration|ease|stagger)-/, '');
  const seconds = (name: string) =>
    Number((parseMs(rawToken(name)) / 1000).toFixed(3));
  const curve = (name: string) => {
    const value = rawToken(name);
    return isNamedCurve(value)
      ? JSON.stringify(value)
      : `[${parseBezier(value).join(', ')}]`;
  };

  return `// @generated from the Astryx theme by scripts/generate-motion-mirror.mjs.
// Values are resolved through resolveThemeTokens, so a theme that retunes the
// motion scale retunes this file too.

export const duration = {
${SEMANTIC_DURATIONS.map(d => `  ${short(d.name)}: ${seconds(d.name)},`).join('\n')}
} as const;

export const ease = {
${SEMANTIC_EASES.map(e => `  ${short(e.name)}: ${curve(e.name)},`).join('\n')}
} as const;

export const stagger = {
${STAGGERS.map(([name]) => `  ${short(name)}: ${seconds(name)},`).join('\n')}
} as const;

/** No CSS form, so authored here rather than mirrored. */
export const spring = {
${SPRINGS.map(
  s =>
    `  ${s.name}: {duration: ${springs[s.name].duration}, bounce: ${springs[s.name].bounce}},`,
).join('\n')}
} as const;`;
}

const LINT_CODE = `// internal/eslint-plugin-xds/index.js — rule: xds/no-hardcoded-styles
//
// STYLE_PROPERTIES already covers type, spacing, radius and colour. It has no
// motion entry, which is why ${AUDIT_COUNTS.hardcodedTotal} hardcoded duration and easing values
// pass lint today. Six additions, in the shape the map already uses:

const STYLE_PROPERTIES = {
  // ...fontSize, padding, borderRadius, color — unchanged

  transitionDuration: {
    pattern: /^['"]?[\\d.]+m?s['"]?$/,
    tokenVar: 'durationVars',
    message: 'Use a duration token: var(--duration-*)',
    examples: ["durationVars['--duration-enter']"],
  },
  animationDuration: {
    pattern: /^['"]?[\\d.]+m?s['"]?$/,
    tokenVar: 'durationVars',
    message: 'Use a duration token: var(--duration-*)',
    examples: ["durationVars['--duration-continuous']"],
  },
  transitionDelay: {
    pattern: /^['"]?[\\d.]+m?s['"]?$/,
    tokenVar: 'staggerVars',
    message: 'Use var(--stagger-*) for a group offset, var(--duration-*) otherwise',
    examples: ["staggerVars['--stagger-base']"],
  },
  animationDelay: {
    pattern: /^['"]?[\\d.]+m?s['"]?$/,
    tokenVar: 'staggerVars',
    message: 'Use var(--stagger-*) for a group offset, var(--duration-*) otherwise',
    examples: ["staggerVars['--stagger-tight']"],
  },
  transitionTimingFunction: {
    pattern: /^['"]?(cubic-bezier\\([^)]*\\)|linear|ease(-in|-out|-in-out)?|steps\\([^)]*\\))['"]?$/,
    tokenVar: 'easeVars',
    message: 'Use an easing token: var(--ease-*)',
    examples: ["easeVars['--ease-entry']", "easeVars['--ease-exit']"],
  },
  animationTimingFunction: {
    pattern: /^['"]?(cubic-bezier\\([^)]*\\)|linear|ease(-in|-out|-in-out)?|steps\\([^)]*\\))['"]?$/,
    tokenVar: 'easeVars',
    message: 'Use an easing token: var(--ease-*)',
    examples: ["easeVars['--ease-linear']"],
  },
};

// One carve-out is needed. SKIP_VALUES lets '0', 'none' and 'auto' through for
// every property, which is right for padding and wrong for motion: it is what
// hides transitionProperty: 'none'. The structural rules below need to see it.`;

const STRUCTURAL_CODE = `// A second visitor, because these are properties of the style object rather
// than of one value — the existing rule only ever looks at a single literal.

'motion/require-duration-with-property': {
  // transitionProperty with no duration in the same object inherits 0s and
  // animates nothing. Catches: ${AUDIT_COUNTS.noopTransitions} today.
},
'motion/require-curve-with-duration': {
  // A duration with no timing function silently gets the CSS default (ease),
  // which is a decision nobody made. Catches: ${AUDIT_COUNTS.durationWithoutCurve} today.
},
'motion/no-transition-all': {
  // transitionProperty: 'all' animates layout and paint properties nobody
  // intended. Catches: ${AUDIT_COUNTS.transitionAll} today — a ratchet, not a cleanup.
},`;

const LINT_RULES: ReadonlyArray<{
  readonly rule: string;
  readonly allows: string;
  readonly catches: string;
  readonly kind: string;
}> = [
  {
    rule: 'transitionDuration / animationDuration',
    allows: 'var(--duration-*)',
    catches: `${AUDIT_COUNTS.hardcodedDuration} hardcoded durations`,
    kind: 'value',
  },
  {
    rule: 'transitionDelay / animationDelay',
    allows: 'var(--stagger-*), var(--duration-*)',
    catches: 'included in the count above',
    kind: 'value',
  },
  {
    rule: 'transitionTimingFunction / animationTimingFunction',
    allows: 'var(--ease-*)',
    catches: `${AUDIT_COUNTS.hardcodedEasing} hardcoded curves`,
    kind: 'value',
  },
  {
    rule: 'motion/require-duration-with-property',
    allows: 'a duration beside every transitionProperty',
    catches: `${AUDIT_COUNTS.noopTransitions} no-op transition`,
    kind: 'structural',
  },
  {
    rule: 'motion/require-curve-with-duration',
    allows: 'a curve beside every duration',
    catches: `${AUDIT_COUNTS.durationWithoutCurve} durations with no declared curve`,
    kind: 'structural',
  },
  {
    rule: 'motion/no-transition-all',
    allows: 'named properties only',
    catches: `${AUDIT_COUNTS.transitionAll} today — prevents regressions`,
    kind: 'structural',
  },
];

export default function MotionExportPage() {
  const {rawToken, springs, dirtyTokens} = useMotionLab();
  const {code: tokenCode, highlightLines} = render(tokenBlockLines(rawToken));

  const tokenDiff = ALL_TUNABLE_TOKENS.filter(
    name => rawToken(name) !== DEFAULT_TOKEN_VALUES[name],
  ).map(name => ({
    name,
    proposed: DEFAULT_TOKEN_VALUES[name],
    tuned: rawToken(name),
  }));

  const springDiff = SPRINGS.flatMap(spec => {
    const tuned = springs[spec.name];
    const rows: Array<{name: string; proposed: string; tuned: string}> = [];
    if (tuned.duration !== spec.duration) {
      rows.push({
        name: `spring.${spec.name}.duration`,
        proposed: `${spec.duration}s`,
        tuned: `${tuned.duration}s`,
      });
    }
    if (tuned.bounce !== spec.bounce) {
      rows.push({
        name: `spring.${spec.name}.bounce`,
        proposed: String(spec.bounce),
        tuned: String(tuned.bounce),
      });
    }
    return rows;
  });

  const changes = [...tokenDiff, ...springDiff];
  const instantCount =
    LITERAL_VALUES.find(([value]) => value === '0.01s')?.[1] ?? 0;

  return (
    <LabPage
      title="Export tuning"
      intro="Everything tuned in this session, as the two artefacts the foundation milestone ships: the token block and the JS mirror. Plus the lint entries that stop the next one from arriving."
      decides="Nothing — it emits whatever the rest of the lab has been tuned to."
      badges={
        <Badge
          variant={changes.length > 0 ? 'warning' : 'neutral'}
          label={
            changes.length > 0
              ? `${changes.length} changed`
              : 'proposal defaults'
          }
        />
      }>
      <VStack gap={3}>
        <Heading level={2}>What moved</Heading>
        {changes.length === 0 ? (
          <Card padding={4}>
            <EmptyState
              title="Nothing has been tuned this session"
              description="Every value below is the proposal exactly as authored. Change a curve on the tokens page or a spring on the springs page and the differences appear here."
            />
          </Card>
        ) : (
          <Card padding={0}>
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Token</TableHeaderCell>
                  <TableHeaderCell>Proposal</TableHeaderCell>
                  <TableHeaderCell>Tuned</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.map(row => (
                  <TableRow key={row.name}>
                    <TableCell>
                      <Text {...stylex.props(sx.mono)}>{row.name}</Text>
                    </TableCell>
                    <TableCell>
                      <Text {...stylex.props(sx.mono)} color="secondary">
                        {row.proposed}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <Text {...stylex.props(sx.mono)} weight="semibold">
                        {row.tuned}
                      </Text>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
        {dirtyTokens.length > 0 && (
          <Text type="supporting" color="secondary">
            The rail counts {dirtyTokens.length} tuned token(s); springs are
            counted separately because they are not custom properties.
          </Text>
        )}
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>The token block</Heading>
        <Text color="secondary" {...stylex.props(sx.prose)}>
          Highlighted lines are the addition. Core defines tokens through{' '}
          <code>stylex.defineVars</code>, so this is a diff against two existing
          objects rather than a <code>:root</code> block — <code>:root</code>{' '}
          would bypass the theme system entirely and could not be retuned by a
          theme. Semantic durations emit as <code>var(--primitive)</code>, which
          is the shape <code>typeScaleDefaults</code> already uses for type, so
          a theme that moves the motion scale moves these with it.
        </Text>
        <CodeBlock
          language="ts"
          title="@astryxdesign/core/src/theme/tokens.stylex.ts"
          hasCopyButton
          hasLineNumbers
          highlightLines={highlightLines}
          code={tokenCode}
        />
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>The JS mirror</Heading>
        <Text color="secondary" {...stylex.props(sx.prose)}>
          Same values, in the shape a JS animation takes. Generated from the
          theme in the same build step that emits the CSS — see{' '}
          <Link href="/pages/motion-lab/js-mirror/">JS token mirror</Link> for
          why it cannot be a handwritten constants file.
        </Text>
        <CodeBlock
          language="ts"
          title="@astryxdesign/core/motion — generated"
          hasCopyButton
          code={emitMirror(rawToken, springs)}
        />
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>The lint rule</Heading>
        <Text color="secondary" {...stylex.props(sx.prose)}>
          The token linter already polices type, spacing, radius and colour, and
          simply has no entry for duration or easing. That is the whole reason{' '}
          {AUDIT_COUNTS.hardcodedTotal} values are hardcoded: nothing ever told
          anyone not to. Six property entries drop straight into the existing
          pattern map — three rules once the duration, delay and timing-function
          pairs are grouped. The other three are structural: they are properties
          of the whole style object, and the current rule only ever looks at one
          literal at a time.
        </Text>
        <Card padding={0}>
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Rule</TableHeaderCell>
                <TableHeaderCell>Allows</TableHeaderCell>
                <TableHeaderCell>Measured catch</TableHeaderCell>
                <TableHeaderCell>Kind</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LINT_RULES.map(rule => (
                <TableRow key={rule.rule}>
                  <TableCell>
                    <Text {...stylex.props(sx.mono)}>{rule.rule}</Text>
                  </TableCell>
                  <TableCell>
                    <Text {...stylex.props(sx.mono)} color="secondary">
                      {rule.allows}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text>{rule.catches}</Text>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={rule.kind === 'structural' ? 'info' : 'neutral'}
                      label={rule.kind}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <CodeBlock
          language="js"
          title="internal/eslint-plugin-xds/index.js — value entries"
          hasCopyButton
          isWrapped
          code={LINT_CODE}
        />
        <CodeBlock
          language="js"
          title="The structural companions"
          hasCopyButton
          code={STRUCTURAL_CODE}
        />
      </VStack>

      <Banner
        status="warning"
        title={`The sweep is ${AUDIT_COUNTS.hardcodedTotal} sites, not ${BRIEF_HARDCODED_BUDGET}`}
        description={
          <Text>
            The brief budgets {BRIEF_HARDCODED_BUDGET} hardcoded values; the
            audit measures {AUDIT_COUNTS.hardcodedTotal} (
            {AUDIT_COUNTS.hardcodedDuration} durations,{' '}
            {AUDIT_COUNTS.hardcodedEasing} curves). Roughly a quarter of them —{' '}
            {instantCount} of {AUDIT_COUNTS.hardcodedTotal},{' '}
            {Math.round((instantCount / AUDIT_COUNTS.hardcodedTotal) * 100)}% —
            are the <code>0.01s</code> reduced-motion idiom in BottomSheet,
            DateInput and MobileNav, and those cannot be swept until{' '}
            <code>--duration-instant</code> is settled at 0 or 0.01ms: a zero
            duration fires no <code>transitionend</code>, and code sequences off
            that event. Turning the rule on before that decision lands means{' '}
            {instantCount} suppressions in the first diff. See{' '}
            <Link href="/pages/motion-lab/reduced-motion/">Reduced motion</Link>{' '}
            and{' '}
            <Link href="/pages/motion-lab/violations/">Hardcoded values</Link>.
          </Text>
        }
      />
    </LabPage>
  );
}
