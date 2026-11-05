// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ProbeTheme.stories.tsx
 * @input The active Storybook theme selected in the toolbar
 * @output A visual reference for every top-level defineTheme axis
 * @position Core/Themes — theme-system verification, not a component demo
 *
 * Do not wrap these stories in <Theme>. The toolbar and visual gate must own
 * the active theme, otherwise the probe theme cannot be selected or tested.
 */

import * as React from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Popover} from '@astryxdesign/core/Popover';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Icon} from '@astryxdesign/core/Icon';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Stack} from '@astryxdesign/core/Stack';
import {Switch} from '@astryxdesign/core/Switch';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useTheme} from '@astryxdesign/core/theme';

const meta = {
  title: 'Core/Themes/Probe Theme',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const iconNames = [
  'close',
  'check',
  'success',
  'warning',
  'info',
  'calendar',
  'search',
  'copy',
] as const;

const code = `type ThemeAxis =
  | 'components'
  | 'tokens'
  | 'icons'
  | 'indicators'
  | 'fonts'
  | 'syntax';

export const covered = true;`;

function AxisCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div {...stylex.props(styles.axisCard)}>
        <Heading level={3} accessibilityLevel={2}>
          {title}
        </Heading>
        {children}
      </div>
    </Card>
  );
}

function TokenSwatches() {
  const {token} = useTheme();
  const tokens = [
    ['accent', '--color-accent', styles.accent],
    ['body', '--color-background-body', styles.body],
    ['text', '--color-text-primary', styles.text],
    ['border', '--color-border', styles.border],
  ] as const;

  return (
    <div {...stylex.props(styles.swatchGrid)}>
      {tokens.map(([label, name, swatch]) => (
        <div key={name} {...stylex.props(styles.swatchItem)}>
          <div {...stylex.props(styles.swatch, swatch)} />
          <Text type="label">{label}</Text>
          <Text type="supporting">{token(name)}</Text>
        </div>
      ))}
    </div>
  );
}

function RegistrySpecimen() {
  const [checked, setChecked] = React.useState<boolean | 'indeterminate'>(true);
  const [radio, setRadio] = React.useState('one');
  const [enabled, setEnabled] = React.useState(true);

  return (
    <Stack direction="vertical" gap={5}>
      <div {...stylex.props(styles.iconRow)}>
        {iconNames.map(name => (
          <div key={name} {...stylex.props(styles.iconCell)}>
            <Icon icon={name} size="lg" label={name} />
            <Text type="supporting">{name}</Text>
          </div>
        ))}
      </div>

      <div {...stylex.props(styles.controlGrid)}>
        <CheckboxInput
          label="Checkbox indicator"
          value={checked}
          onChange={setChecked}
        />
        <Switch label="Switch control" value={enabled} onChange={setEnabled} />
        <RadioList label="Radio indicator" value={radio} onChange={setRadio}>
          <RadioListItem label="First" value="one" />
          <RadioListItem label="Second" value="two" />
        </RadioList>
      </div>
    </Stack>
  );
}

function ComponentSpecimen() {
  return (
    <Stack direction="vertical" gap={5}>
      <div {...stylex.props(styles.row)}>
        <Button label="Primary" variant="primary" />
        <Button label="Secondary" variant="secondary" />
        <Button label="Ghost" variant="ghost" />
        <Button label="Destructive" variant="destructive" />
      </div>
      <div {...stylex.props(styles.row)}>
        <Badge label="Neutral" variant="neutral" />
        <Badge label="Info" variant="info" />
        <Badge label="Success" variant="success" />
        <Badge label="Warning" variant="warning" />
        <Badge label="Error" variant="error" />
      </div>
      <Popover
        isOpen
        hasAutoFocus={false}
        hasCloseButton={false}
        hasLightDismiss={false}
        label="Popover radius probe"
        width={240}
        content={<Text type="body">Painted Popover surface</Text>}>
        <Button label="Popover radius probe" />
      </Popover>
    </Stack>
  );
}

function AllAxesSheet() {
  const {name, mode} = useTheme();

  return (
    <main {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.header)}>
        <div>
          <Heading level={1}>Probe theme — all axes</Heading>
          <Text type="body">
            Select <strong>Probe (test fixture)</strong> in the Theme toolbar.
            Every axis should become unmistakably synthetic.
          </Text>
        </div>
        <Badge
          label={`${name} · ${mode}`}
          variant={name === 'probe' ? 'success' : 'neutral'}
        />
      </div>

      <div {...stylex.props(styles.grid)}>
        <AxisCard title="1 · Component targets">
          <ComponentSpecimen />
        </AxisCard>

        <AxisCard title="2 · Tokens">
          <TokenSwatches />
        </AxisCard>

        <AxisCard title="3 + 4 · Icon and indicator registries">
          <RegistrySpecimen />
        </AxisCard>

        <AxisCard title="5 · Typography">
          <Stack direction="vertical" gap={2}>
            <Heading level={2} accessibilityLevel={3}>
              AstryxProbeFace heading
            </Heading>
            <Text type="body">Body text inherits the probe font token.</Text>
            <Text type="code">const fontAxis = 'covered';</Text>
          </Stack>
        </AxisCard>

        <div {...stylex.props(styles.wide)}>
          <AxisCard title="6 · Syntax">
            <CodeBlock
              code={code}
              language="typescript"
              title="theme-axes.ts"
              hasLineNumbers
            />
          </AxisCard>
        </div>
      </div>
    </main>
  );
}

/**
 * All six top-level defineTheme axes on one surface. Switch the Theme toolbar
 * between Neutral and Probe; this story never pins its own theme.
 */
export const AllAxes: Story = {
  name: 'All Axes',
  render: () => <AllAxesSheet />,
};

/** Component targets only, for a compact pixel-diff surface. */
export const ComponentTargets: Story = {
  name: 'Component Targets',
  render: () => (
    <main {...stylex.props(styles.compactPage)}>
      <ComponentSpecimen />
    </main>
  ),
};

/** Icon and indicator swaps, separated from CSS component overrides. */
export const Registries: Story = {
  render: () => (
    <main {...stylex.props(styles.compactPage)}>
      <RegistrySpecimen />
    </main>
  ),
};

const styles = stylex.create({
  page: {
    backgroundColor: 'var(--color-background-body)',
    minHeight: '100vh',
    padding: 32,
  },
  compactPage: {
    backgroundColor: 'var(--color-background-surface)',
    minHeight: '100vh',
    padding: 32,
  },
  header: {
    alignItems: 'flex-start',
    display: 'flex',
    gap: 24,
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  grid: {
    display: 'grid',
    gap: 16,
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  wide: {
    gridColumn: '1 / -1',
  },
  axisCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 20,
  },
  row: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
  },
  iconRow: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  },
  iconCell: {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  controlGrid: {
    display: 'grid',
    gap: 16,
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  },
  swatchGrid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  },
  swatchItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  swatch: {
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
    borderStyle: 'solid',
    borderWidth: 2,
    height: 48,
  },
  accent: {
    backgroundColor: 'var(--color-accent)',
  },
  body: {
    backgroundColor: 'var(--color-background-body)',
  },
  text: {
    backgroundColor: 'var(--color-text-primary)',
  },
  border: {
    backgroundColor: 'var(--color-border)',
  },
});
