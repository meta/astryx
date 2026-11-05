// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Accessibility.tsx
 * @input Structured component accessibility requirements and audited theme coverage
 * @output Renders the component detail Accessibility tab
 * @position Component-detail tab content, selected by ComponentDetailClient
 */

import * as stylex from '@stylexjs/stylex';
import {useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {List, ListItem} from '@astryxdesign/core/List';
import {Popover} from '@astryxdesign/core/Popover';
import {Table, proportional, type TablePlugin} from '@astryxdesign/core/Table';
import {Heading, Text} from '@astryxdesign/core/Text';
import type {
  AccessibilityRequirement,
  AccessibilityThemeCoverage,
  AccessibilityThemeMode,
} from '../../generated/componentRegistry';

const CATEGORY_ORDER = [
  'Color contrast',
  'Keyboard',
  'Semantics',
  'Content',
  'General',
] as const;

const styles = stylex.create({
  measurement: {
    fontVariantNumeric: 'tabular-nums',
  },
  colorPair: {
    alignItems: 'center',
    borderColor: 'var(--color-border)',
    borderRadius: 3,
    borderStyle: 'solid',
    borderWidth: 1,
    display: 'inline-flex',
    flexShrink: 0,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  colorPairForeground: {
    borderColor: 'var(--color-border)',
    borderRadius: '50%',
    borderStyle: 'solid',
    borderWidth: 1,
    height: 10,
    width: 10,
  },
  breakdownGrid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (max-width: 480px)': '1fr',
    },
  },
  breakdownItem: {
    minWidth: 0,
  },
  breakdownTrigger: {
    backgroundColor: 'transparent',
    borderStyle: 'none',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    padding: 0,
    textAlign: 'start',
    textDecoration: 'underline',
  },
});

const fitTableStyle = {
  tableLayout: 'fixed',
  width: '100%',
} as const;

const responsiveCoverageTableStyle = {
  ...fitTableStyle,
  minWidth: 1100,
} as const;

function ColorPairPreview({
  foreground,
  background,
}: {
  foreground: string;
  background: string;
}) {
  const label = `Foreground ${foreground} on background ${background}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      {...stylex.props(styles.colorPair)}
      style={{backgroundColor: background}}>
      <span
        {...stylex.props(styles.colorPairForeground)}
        style={{backgroundColor: foreground}}
      />
    </span>
  );
}

type MeasurementBreakdown = NonNullable<
  AccessibilityThemeMode['results'][number]['measurements'][number]['breakdown']
>;

function MeasurementBreakdownPopover({
  breakdown,
  measurementLabel,
  mode,
  variant,
}: {
  breakdown: MeasurementBreakdown;
  measurementLabel: string;
  mode: AccessibilityThemeMode['mode'];
  variant: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isBadgeBreakdown = measurementLabel === 'Badges';
  const breakdownName = isBadgeBreakdown ? 'Badge' : measurementLabel;
  const triggerText = isBadgeBreakdown
    ? `${breakdown.length} badge results`
    : `${breakdown.length} results`;

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      hasCloseButton={false}
      width="min(560px, calc(100vw - 32px))"
      label={`${mode} mode ${variant} ${breakdownName} contrast details`}
      content={
        <VStack gap={3}>
          <VStack gap={1}>
            <HStack hAlign="between" vAlign="center" gap={3}>
              <Text weight="bold">
                {mode} mode · {variant} {breakdownName} coverage
              </Text>
              <IconButton
                label="Close Badge coverage"
                icon={<Icon icon="close" color="inherit" />}
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
              />
            </HStack>
            <Text type="supporting" color="secondary">
              {isBadgeBreakdown
                ? 'Lowest result for each built-in Badge across Rest, Hover, Pointer down, Page background, and Surface background combinations.'
                : `Detailed results for ${measurementLabel}.`}
            </Text>
          </VStack>
          <div {...stylex.props(styles.breakdownGrid)}>
            {breakdown.map(item => {
              const failed = item.status === 'Fail';
              return (
                <HStack
                  key={item.label}
                  gap={2}
                  vAlign="center"
                  xstyle={styles.breakdownItem}>
                  <ColorPairPreview {...item.colorPair} />
                  <VStack gap={0}>
                    <Text weight="bold">{item.label}</Text>
                    <Text
                      type="supporting"
                      style={
                        failed ? {color: 'var(--color-text-red)'} : undefined
                      }>
                      {item.value}
                      {item.detail ? ` · ${item.detail}` : ''}
                    </Text>
                  </VStack>
                </HStack>
              );
            })}
          </div>
        </VStack>
      }>
      {triggerProps => (
        <button
          type="button"
          {...triggerProps}
          aria-label={`View all ${triggerText} for ${mode} mode ${variant}`}
          {...stylex.props(styles.breakdownTrigger)}>
          View all {triggerText}
        </button>
      )}
    </Popover>
  );
}

const WCAG_REFERENCES = {
  '1.4.3': {
    label: 'WCAG 1.4.3: Contrast (Minimum)',
    href: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
  },
  '1.4.11': {
    label: 'WCAG 1.4.11: Non-text Contrast',
    href: 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html',
  },
} as const;

function referencesFor(criterion: string) {
  return Object.entries(WCAG_REFERENCES)
    .filter(([number]) => criterion.includes(number))
    .map(([, reference]) => reference);
}

function groupRequirements(requirements: AccessibilityRequirement[]) {
  const groups = new Map<string, AccessibilityRequirement[]>();
  for (const requirement of requirements) {
    const category = requirement.category ?? 'General';
    const group = groups.get(category) ?? [];
    group.push(requirement);
    groups.set(category, group);
  }
  return [...groups.entries()].sort(
    ([a], [b]) =>
      CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number]) -
      CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number]),
  );
}

function RequirementsTable({items}: {items: AccessibilityRequirement[]}) {
  const data = items.map(item => ({
    name: item.name as unknown,
    criterion: (item.criterion ?? '—') as unknown,
    requirement: (item.requirement ?? '—') as unknown,
    states: (item.states ?? []) as unknown,
    description: item.description as unknown,
  })) as Record<string, unknown>[];

  return (
    <Card>
      <Table
        data={data}
        columns={[
          {
            key: 'name',
            header: 'Requirement',
            width: proportional(1.2, {minWidth: 0}),
            renderCell: (item: Record<string, unknown>) => (
              <Text weight="bold">{item.name as string}</Text>
            ),
          },
          {
            key: 'requirement',
            header: 'Ratio',
            width: proportional(1, {minWidth: 0}),
            renderCell: (item: Record<string, unknown>) => (
              <Text>{item.requirement as string}</Text>
            ),
          },
          {
            key: 'states',
            header: 'Applies to',
            width: proportional(1.1, {minWidth: 0}),
            renderCell: (item: Record<string, unknown>) => {
              const states = item.states as string[];
              return (
                <Text color="secondary">
                  {states.length > 0 ? states.join(', ') : '—'}
                </Text>
              );
            },
          },
          {
            key: 'description',
            header: 'Guidance',
            width: proportional(4.5, {minWidth: 0}),
            renderCell: (item: Record<string, unknown>) => {
              const references = referencesFor(item.criterion as string);
              return (
                <VStack gap={2}>
                  <Text>{item.description as string}</Text>
                  {references.length > 0 && (
                    <HStack gap={3} wrap="wrap">
                      {references.map(reference => (
                        <Link
                          key={reference.href}
                          href={reference.href}
                          type="supporting"
                          color="secondary"
                          hasUnderline
                          target="_blank">
                          {reference.label}
                        </Link>
                      ))}
                    </HStack>
                  )}
                </VStack>
              );
            },
          },
        ]}
        density="spacious"
        dividers="rows"
        style={fitTableStyle}
      />
    </Card>
  );
}

function ThemeCoverageTable({
  componentName,
  mode,
  themeName,
}: {
  componentName: string;
  mode: AccessibilityThemeMode;
  themeName: string;
}) {
  const accessibleName = `${componentName} ${themeName} theme ${mode.mode} mode contrast results`;
  const accessibilityLabelPlugin: TablePlugin<Record<string, unknown>> = {
    transformScrollWrapper: props => ({
      ...props,
      htmlProps: {...props.htmlProps, 'aria-label': accessibleName},
    }),
  };
  const measurementLabels = [
    ...new Set(
      mode.results.flatMap(result =>
        result.measurements.map(measurement => measurement.label),
      ),
    ),
  ];
  const data = mode.results.map(result => ({
    name: result.name,
    ...Object.fromEntries(
      result.measurements.flatMap(measurement => [
        [measurement.label, measurement.value],
        [`${measurement.label}Detail`, measurement.detail],
        [`${measurement.label}Applicability`, measurement.applicability],
        [`${measurement.label}ColorPair`, measurement.colorPair],
        [`${measurement.label}Breakdown`, measurement.breakdown],
        [`${measurement.label}Status`, measurement.status],
      ]),
    ),
    status: result.status,
  }));

  return (
    <Card>
      <VStack gap={3}>
        <Text weight="bold">{mode.mode} mode</Text>
        <Table
          aria-label={accessibleName}
          data={data}
          plugins={{accessibilityLabel: accessibilityLabelPlugin}}
          columns={[
            {
              key: 'name',
              header: 'Variant',
              width: proportional(1.2, {minWidth: 0}),
              renderCell: (item: Record<string, unknown>) => (
                <Text weight="bold">{item.name as string}</Text>
              ),
            },
            {
              key: 'status',
              header: 'WCAG AA',
              width: proportional(1.1, {minWidth: 0}),
              renderCell: (item: Record<string, unknown>) => {
                const status = item.status as 'Pass' | 'Fail' | 'Not tested';
                return (
                  <Badge
                    label={status}
                    variant={
                      status === 'Pass'
                        ? 'success'
                        : status === 'Fail'
                          ? 'error'
                          : 'neutral'
                    }
                  />
                );
              },
            },
            ...measurementLabels.map(label => ({
              key: label,
              header: label,
              width: proportional(label === 'Badges' ? 1.6 : 1, {minWidth: 0}),
              renderCell: (item: Record<string, unknown>) => {
                const failed = item[`${label}Status`] === 'Fail';
                const detail = item[`${label}Detail`] as string | undefined;
                const applicability = item[`${label}Applicability`] as
                  | 'Required'
                  | 'Conditional'
                  | 'Supplemental'
                  | 'Decorative'
                  | undefined;
                const colorPair = item[`${label}ColorPair`] as
                  {foreground: string; background: string} | undefined;
                const breakdown = item[`${label}Breakdown`] as
                  MeasurementBreakdown | undefined;
                return (
                  <HStack gap={2} vAlign="center">
                    {colorPair && !breakdown && (
                      <ColorPairPreview {...colorPair} />
                    )}
                    <VStack gap={1}>
                      <Text
                        xstyle={styles.measurement}
                        style={
                          failed ? {color: 'var(--color-text-red)'} : undefined
                        }>
                        {(item[label] as string | undefined) ?? '—'}
                      </Text>
                      {(applicability || detail) && (
                        <Text
                          type="supporting"
                          color={failed ? undefined : 'secondary'}
                          style={
                            failed
                              ? {color: 'var(--color-text-red)'}
                              : undefined
                          }>
                          {[applicability, detail].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                      {breakdown && (
                        <MeasurementBreakdownPopover
                          breakdown={breakdown}
                          measurementLabel={label}
                          mode={mode.mode}
                          variant={item.name as string}
                        />
                      )}
                    </VStack>
                  </HStack>
                );
              },
            })),
          ]}
          density="compact"
          dividers="rows"
          style={responsiveCoverageTableStyle}
        />
      </VStack>
    </Card>
  );
}

function ThemeCoverageSection({
  componentName,
  items,
}: {
  componentName: string;
  items: AccessibilityThemeCoverage[];
}) {
  return (
    <VStack gap={5}>
      {items.map(theme => (
        <VStack key={theme.theme} gap={4}>
          <VStack gap={2}>
            <Heading level={2} accessibilityLevel={3}>
              {theme.theme} Theme
            </Heading>
            <Text color="secondary" weight="normal">
              These tables show the required contrast checks that were measured.
              Pass means every measured value meets its WCAG AA ratio. Items
              under Not measured do not affect Pass or Fail.
            </Text>
          </VStack>
          {theme.tables.map((table, index) => (
            <VStack key={table.title ?? `${theme.theme}-${index}`} gap={4}>
              {(table.title || table.description) && (
                <VStack gap={2}>
                  {table.title && <Heading level={4}>{table.title}</Heading>}
                  {table.description && (
                    <Text color="secondary" weight="normal">
                      {table.description}
                    </Text>
                  )}
                </VStack>
              )}
              {table.modes.map(mode => (
                <ThemeCoverageTable
                  key={mode.mode}
                  componentName={componentName}
                  mode={mode}
                  themeName={theme.theme}
                />
              ))}
            </VStack>
          ))}
          {(theme.notMeasured?.length ?? 0) > 0 && (
            <VStack gap={2}>
              <Heading level={4}>Not measured</Heading>
              <List density="compact" listStyle="disc">
                {theme.notMeasured?.map(item => (
                  <ListItem
                    key={item}
                    label={
                      <Text color="secondary" weight="normal">
                        {item}
                      </Text>
                    }
                  />
                ))}
              </List>
            </VStack>
          )}
        </VStack>
      ))}
    </VStack>
  );
}

function ColorContrastIntro() {
  return (
    <Text color="secondary" weight="normal">
      Components must meet WCAG 2.2 Level AA across variants, states, and
      themes. Measure foreground and background colors as they appear together
      on screen.
    </Text>
  );
}

export function Accessibility({
  componentName,
  requirements,
  themeCoverage,
}: {
  componentName: string;
  requirements: AccessibilityRequirement[];
  themeCoverage: AccessibilityThemeCoverage[];
}) {
  const hasColorContrastRequirements = requirements.some(
    requirement => requirement.category === 'Color contrast',
  );

  return (
    <VStack gap={8} style={{paddingBlockStart: 16}}>
      {groupRequirements(requirements).map(([category, items]) => (
        <VStack key={category} gap={8}>
          <VStack gap={3}>
            <Heading level={2} type="display-3">
              {category}
            </Heading>
            {category === 'Color contrast' && <ColorContrastIntro />}
            <RequirementsTable items={items} />
          </VStack>
          {category === 'Color contrast' && themeCoverage.length > 0 && (
            <ThemeCoverageSection
              componentName={componentName}
              items={themeCoverage}
            />
          )}
        </VStack>
      ))}
      {!hasColorContrastRequirements && themeCoverage.length > 0 && (
        <VStack gap={8}>
          <VStack gap={3}>
            <Heading level={2} type="display-3">
              Color contrast
            </Heading>
            <ColorContrastIntro />
          </VStack>
          <ThemeCoverageSection
            componentName={componentName}
            items={themeCoverage}
          />
        </VStack>
      )}
    </VStack>
  );
}
