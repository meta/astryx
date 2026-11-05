// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Sandbox family consumer. @input Generated CSS/ESM. @output Switching and cascade proof. @position Themes page. */

'use client';

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {Grid} from '@astryxdesign/core/Grid';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {MediaTheme} from '@astryxdesign/core/theme';
// prettier-ignore
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Stack} from '@astryxdesign/core/Stack';
import {Heading, Text} from '@astryxdesign/core/Text';
import {
  sandboxOceanCalmDeepTheme,
  sandboxOceanCalmTheme,
  sandboxOceanMidnightTheme,
  sandboxOceanTheme,
} from '../../../../themes/theme-family/sandbox-ocean-family.js';

// prettier-ignore
const members = [{label: 'Ocean', theme: sandboxOceanTheme}, {label: 'Calm', theme: sandboxOceanCalmTheme}, {label: 'Deep', theme: sandboxOceanCalmDeepTheme}, {label: 'Midnight', theme: sandboxOceanMidnightTheme}] as const;

function FamilySpecimen({
  order,
  themeName,
}: {
  order: 'before' | 'after';
  themeName: string;
}) {
  return (
    <Stack
      as="section"
      data-astryx-theme={themeName}
      data-family-order={order}
      gap={3}
      padding={4}
      xstyle={styles.specimen}>
      <Heading level={2}>Unrelated theme CSS loaded {order} the family</Heading>
      <Text>
        This prose and the controls below come from the same generated family
        stylesheet in either order.
      </Text>
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <Button label="Family primary" variant="primary" />
        <Button label="Disabled state" isDisabled />
      </Stack>
      <Stack padding={3} xstyle={styles.mediaSurface}>
        <MediaTheme mode="dark">
          <Button label="On dark media" variant="secondary" />
        </MediaTheme>
      </Stack>
    </Stack>
  );
}

function StaticFamilyTree() {
  return (
    <Grid columns={{minWidth: 280, max: 2, repeat: 'fit'}} gap={4}>
      <Stack
        as="section"
        data-astryx-theme={sandboxOceanTheme.name}
        gap={3}
        padding={4}
        xstyle={styles.specimen}>
        <Heading level={2}>Base with nested descendants</Heading>
        <Text>Ocean owns the outer scope and the inherited adaptation.</Text>
        <Button label="Base identity" variant="primary" />
        <Stack
          as="section"
          data-astryx-theme={sandboxOceanCalmTheme.name}
          gap={3}
          padding={3}
          xstyle={styles.nestedSpecimen}>
          <Heading level={3}>Calm child</Heading>
          <Text>
            The child overrides the accent and local border-width token.
          </Text>
          <Button label="Child identity" variant="primary" />
          <Stack
            as="section"
            data-astryx-theme={sandboxOceanCalmDeepTheme.name}
            gap={2}
            padding={3}
            xstyle={styles.nestedSpecimen}>
            <Heading level={4}>Deep zero-delta descendant</Heading>
            <Text>Selectable identity; inherited pixels remain unchanged.</Text>
            <Button label="Zero-delta identity" variant="primary" />
          </Stack>
        </Stack>
      </Stack>

      <Stack
        as="section"
        data-astryx-theme={sandboxOceanMidnightTheme.name}
        gap={3}
        padding={4}
        xstyle={styles.specimen}>
        <Heading level={2}>Midnight sibling</Heading>
        <Text>
          This branch keeps its own accent without leaking into the nested Calm
          branch.
        </Text>
        <Button label="Sibling identity" variant="primary" />
      </Stack>
    </Grid>
  );
}

export default function ThemeFamilyPage() {
  const [activeTheme, setActiveTheme] = useState(sandboxOceanTheme.name);

  return (
    <Layout
      contentWidth={960}
      padding={4}
      content={
        <LayoutContent>
          <Stack as="main" gap={6}>
            <Stack as="header" gap={2}>
              <Heading level={1}>Generated theme family</Heading>
              <Text color="secondary">
                One generated stylesheet and ESM module cover every member.
                Switching changes only the family identity attribute.
              </Text>
            </Stack>

            <SegmentedControl
              label="Active family member"
              layout="fill"
              value={activeTheme}
              onChange={setActiveTheme}>
              {members.map(({label, theme}) => (
                <SegmentedControlItem
                  key={theme.name}
                  label={label}
                  value={theme.name}
                />
              ))}
            </SegmentedControl>

            <Grid columns={{minWidth: 280, max: 2, repeat: 'fit'}} gap={4}>
              <FamilySpecimen order="before" themeName={activeTheme} />
              <FamilySpecimen order="after" themeName={activeTheme} />
            </Grid>

            <StaticFamilyTree />
          </Stack>
        </LayoutContent>
      }
    />
  );
}

// prettier-ignore
const styles = stylex.create({
  specimen: {backgroundColor: 'var(--color-background-surface)', borderRadius: 'var(--radius-container)', color: 'var(--color-text-primary)'},
  nestedSpecimen: {backgroundColor: 'var(--color-background-surface)', borderRadius: 'var(--radius-element)'},
  mediaSurface: {backgroundColor: 'var(--color-background-inverted)', borderRadius: 'var(--radius-element)'},
});
