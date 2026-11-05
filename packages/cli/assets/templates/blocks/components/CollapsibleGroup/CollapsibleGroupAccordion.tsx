// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {Text} from '@astryxdesign/core/Text';
import {Stack} from '@astryxdesign/core/Stack';

/**
 * `density` sets the block padding on every row in the group, so a list of
 * sections can be tuned to the surface it sits on without touching the rows
 * themselves. It follows Table's scale, and pairs with `hasDividers`, which
 * turns it on at 'balanced' by default.
 *
 * - compact  — dense surfaces: sidebars, inspectors, a panel of many rows
 * - balanced — the default, and right for most page content
 * - spacious — a short list that is the main thing on the page
 *
 * Rows share a surface here, so the triggers take body-semibold rather than
 * the trigger's default 'large': at 17px semibold each row would read as its
 * own section heading.
 */
const SECTIONS = [
  {
    value: 'a',
    trigger: 'Region',
    body: 'Where your data is stored and processed. Changing region migrates existing data and can take up to an hour.',
  },
  {
    value: 'b',
    trigger: 'Retention',
    body: 'How long deleted items stay recoverable before being purged.',
  },
  {
    value: 'c',
    trigger: 'Audit log',
    body: 'Who can read the log, and how far back it reaches.',
  },
];

function DensityExample({
  density,
  label,
}: {
  density: 'compact' | 'balanced' | 'spacious';
  label: string;
}) {
  return (
    <Stack gap={1}>
      <Text type="supporting">{label}</Text>
      <CollapsibleGroup
        type="single"
        hasDividers
        density={density}
        defaultValue="a">
        {SECTIONS.map(section => (
          <Collapsible
            key={section.value}
            value={section.value}
            trigger={
              <Text type="body" weight="semibold">
                {section.trigger}
              </Text>
            }>
            <Text type="body" color="secondary">
              {section.body}
            </Text>
          </Collapsible>
        ))}
      </CollapsibleGroup>
    </Stack>
  );
}

export default function CollapsibleGroupAccordion() {
  return (
    <Stack gap={5} maxWidth={420}>
      <DensityExample density="compact" label="compact" />
      <DensityExample density="balanced" label="balanced — the default" />
      <DensityExample density="spacious" label="spacious" />
    </Stack>
  );
}
