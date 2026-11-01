// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState, type CSSProperties} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {Stepper, Step} from '@astryxdesign/core/Stepper';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {Icon} from '@astryxdesign/core/Icon';
import {Badge} from '@astryxdesign/core/Badge';
import {Popover} from '@astryxdesign/core/Popover';

const meta: Meta<typeof Stepper> = {
  title: 'Core/Stepper',
  component: Stepper,
  tags: ['autodocs'],
  argTypes: {
    activeStep: {control: {type: 'number', min: 0, max: 5}},
    orientation: {control: 'select', options: ['horizontal', 'vertical']},
    density: {control: 'select', options: ['compact', 'balanced', 'spacious']},
    indicatorPosition: {
      control: 'select',
      options: ['separated', 'on-track'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Stepper>;

// ============================================================
// DEFAULT (auto indicator)
// ============================================================

export const Default: Story = {
  name: 'Default',
  render: () => {
    const [active, setActive] = useState(2);
    return (
      <div style={{maxWidth: 400}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          onStepClick={setActive}>
          <Step
            step={0}
            label="Create workspace"
            description="Name and configure your workspace"
          />
          <Step
            step={1}
            label="Invite team members"
            description="Add collaborators by email"
          />
          <Step
            step={2}
            label="Set up integrations"
            description="Connect Slack, GitHub, Jira"
          />
          <Step
            step={3}
            label="Import data"
            description="Bring in existing projects"
          />
          <Step step={4} label="Launch" description="Go live with your team" />
        </Stepper>
      </div>
    );
  },
};

export const DefaultHorizontal: Story = {
  name: 'Default — Horizontal',
  render: () => {
    const [active, setActive] = useState(1);
    return (
      <div style={{maxWidth: 700}}>
        <Stepper
          activeStep={active}
          orientation="horizontal"
          onStepClick={setActive}>
          <Step step={0} label="Workspace" />
          <Step step={1} label="Team" />
          <Step step={2} label="Integrations" />
          <Step step={3} label="Import" />
          <Step step={4} label="Launch" />
        </Stepper>
      </div>
    );
  },
};

// ============================================================
// NUMBERED (always number — procedural flows)
// ============================================================

export const NumberedVertical: Story = {
  name: 'Numbered — Deploy Pipeline',
  render: () => {
    const [active, setActive] = useState(2);
    return (
      <div style={{maxWidth: 400}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          onStepClick={setActive}>
          <Step
            step={0}
            label="Push to main"
            description="Merge your pull request"
            indicator="number"
          />
          <Step
            step={1}
            label="Run CI checks"
            description="Lint, type-check, test"
            indicator="number"
          />
          <Step
            step={2}
            label="Build container"
            description="Docker image to registry"
            indicator="number"
          />
          <Step
            step={3}
            label="Deploy to staging"
            description="Verify in staging environment"
            indicator="number"
          />
          <Step
            step={4}
            label="Promote to production"
            description="Canary → full rollout"
            indicator="number"
          />
        </Stepper>
      </div>
    );
  },
};

export const NumberedHorizontal: Story = {
  name: 'Numbered — Horizontal Checkout',
  render: () => {
    const [active, setActive] = useState(1);
    return (
      <div style={{maxWidth: 600}}>
        <Stepper
          activeStep={active}
          orientation="horizontal"
          onStepClick={setActive}>
          <Step step={0} label="Cart" indicator="number" />
          <Step step={1} label="Shipping" indicator="number" />
          <Step step={2} label="Payment" indicator="number" />
          <Step step={3} label="Confirm" indicator="number" />
        </Stepper>
      </div>
    );
  },
};

// ============================================================
// STATUS (semantic status — validation flows)
//
// In the default `auto` mode, `status` sets both the indicator color and a
// matching glyph: success → green check-circle, warning/error → the shared
// Input status icons. `accent` is color-only. The current (in-progress) step
// always keeps its current-step ring, so status glyphs show on the other
// steps. `status` never recolors the connector/track.
// ============================================================

export const StatusVertical: Story = {
  name: 'Status — Account Verification',
  render: () => {
    const [active, setActive] = useState(3);
    return (
      <div style={{maxWidth: 400}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          onStepClick={setActive}>
          <Step
            step={0}
            label="Email verified"
            description="alice@example.com"
            status="success"
          />
          <Step
            step={1}
            label="Phone verified"
            description="+1 (555) 012-3456"
            status="success"
          />
          <Step
            step={2}
            label="Identity document"
            description="Passport upload failed"
            status="error"
          />
          <Step
            step={3}
            label="Address verification"
            description="Pending review"
            status="accent"
          />
          <Step
            step={4}
            label="Background check"
            isOptional
            description="Skipped"
          />
          <Step step={5} label="Account activated" />
        </Stepper>
      </div>
    );
  },
};

export const StatusAllStates: Story = {
  name: 'Status — Semantic Colors Reference',
  render: () => {
    // Start past all steps so each status glyph is visible (the current step
    // always shows the ring, which would otherwise mask one status).
    const [active, setActive] = useState(5);
    return (
      <div style={{maxWidth: 400}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          onStepClick={setActive}>
          <Step
            step={0}
            label="Accent"
            description="--color-accent"
            status="accent"
          />
          <Step
            step={1}
            label="Success"
            description="--color-icon-success"
            status="success"
          />
          <Step
            step={2}
            label="Warning"
            description="--color-icon-warning"
            status="warning"
          />
          <Step
            step={3}
            label="Error"
            description="--color-icon-error"
            status="error"
          />
          <Step
            step={4}
            label="Default (no status)"
            description="progress-derived color"
          />
        </Stepper>
      </div>
    );
  },
};

// ============================================================
// MINIMAL (no indicator — content-focused)
// ============================================================

export const MinimalVertical: Story = {
  name: 'Minimal — Interview Process',
  render: () => {
    const [active, setActive] = useState(2);
    return (
      <div style={{maxWidth: 400}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          onStepClick={setActive}>
          <Step
            step={0}
            label="Phone screen"
            description="30 min with recruiter"
            indicator="none"
          />
          <Step
            step={1}
            label="Technical interview"
            description="1 hour coding session"
            indicator="none"
          />
          <Step
            step={2}
            label="System design"
            description="45 min whiteboard"
            indicator="none"
          />
          <Step
            step={3}
            label="Team match"
            description="Meet potential teammates"
            indicator="none"
          />
          <Step step={4} label="Offer" indicator="none" />
        </Stepper>
      </div>
    );
  },
};

export const MinimalHorizontal: Story = {
  name: 'Minimal — Video Upload',
  render: () => {
    const [active, setActive] = useState(1);
    return (
      <div style={{maxWidth: 500}}>
        <Stepper
          activeStep={active}
          orientation="horizontal"
          onStepClick={setActive}>
          <Step step={0} label="Upload" indicator="none" />
          <Step step={1} label="Details" indicator="none" />
          <Step step={2} label="Audience" indicator="none" />
          <Step step={3} label="Publish" indicator="none" />
        </Stepper>
      </div>
    );
  },
};

// ============================================================
// INDICATOR COMPARISON
// ============================================================

export const IndicatorComparison: Story = {
  name: 'Indicator Modes — Side by Side',
  render: () => {
    const [active, setActive] = useState(2);
    return (
      <div style={{display: 'flex', gap: 48}}>
        <div style={{maxWidth: 280}}>
          <Text type="label">Auto (default)</Text>
          <Stepper
            activeStep={active}
            orientation="vertical"
            onStepClick={setActive}>
            <Step step={0} label="Account" />
            <Step step={1} label="Profile" />
            <Step step={2} label="Settings" />
            <Step step={3} label="Review" />
            <Step step={4} label="Done" />
          </Stepper>
        </div>
        <div style={{maxWidth: 280}}>
          <Text type="label">Number</Text>
          <Stepper
            activeStep={active}
            orientation="vertical"
            onStepClick={setActive}>
            <Step step={0} label="Account" indicator="number" />
            <Step step={1} label="Profile" indicator="number" />
            <Step step={2} label="Settings" indicator="number" />
            <Step step={3} label="Review" indicator="number" />
            <Step step={4} label="Done" indicator="number" />
          </Stepper>
        </div>
        <div style={{maxWidth: 280}}>
          <Text type="label">Custom indicator</Text>
          <Stepper
            activeStep={active}
            orientation="vertical"
            onStepClick={setActive}>
            <Step
              step={0}
              label="Account"
              indicator={<Icon icon="info" size="sm" />}
            />
            <Step
              step={1}
              label="Profile"
              indicator={<Icon icon="search" size="sm" />}
            />
            <Step
              step={2}
              label="Settings"
              indicator={<Icon icon="wrench" size="sm" />}
            />
            <Step
              step={3}
              label="Review"
              indicator={<Icon icon="clock" size="sm" />}
            />
            <Step
              step={4}
              label="Done"
              indicator={<Icon icon="check" size="sm" />}
            />
          </Stepper>
        </div>
        <div style={{maxWidth: 280}}>
          <Text type="label">None</Text>
          <Stepper
            activeStep={active}
            orientation="vertical"
            onStepClick={setActive}>
            <Step step={0} label="Account" indicator="none" />
            <Step step={1} label="Profile" indicator="none" />
            <Step step={2} label="Settings" indicator="none" />
            <Step step={3} label="Review" indicator="none" />
            <Step step={4} label="Done" indicator="none" />
          </Stepper>
        </div>
      </div>
    );
  },
};

// ============================================================
// WITH CONTENT SLOT
// ============================================================

export const WithContentSlot: Story = {
  name: 'With Content — Multi-Step Form',
  render: () => {
    const [active, setActive] = useState(0);
    return (
      <div style={{maxWidth: 480}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          onStepClick={setActive}>
          <Step step={0} label="Project details" indicator="number">
            {active === 0 && (
              <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                <TextInput
                  label="Project name"
                  placeholder="My awesome project"
                  value=""
                />
                <TextInput
                  label="Repository URL"
                  placeholder="https://github.com/..."
                  value=""
                />
                <div>
                  <Button
                    label="Continue"
                    variant="primary"
                    onClick={() => setActive(1)}
                  />
                </div>
              </div>
            )}
          </Step>
          <Step step={1} label="Environment" indicator="number">
            {active === 1 && (
              <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                <TextInput label="Node version" placeholder="20" value="" />
                <TextInput
                  label="Build command"
                  placeholder="npm run build"
                  value=""
                />
                <div style={{display: 'flex', gap: 8}}>
                  <Button
                    label="Back"
                    variant="secondary"
                    onClick={() => setActive(0)}
                  />
                  <Button
                    label="Continue"
                    variant="primary"
                    onClick={() => setActive(2)}
                  />
                </div>
              </div>
            )}
          </Step>
          <Step step={2} label="Deploy" indicator="number">
            {active === 2 && (
              <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                <Text type="body">
                  Ready to deploy. This will create a production build and push
                  to your configured hosting.
                </Text>
                <div style={{display: 'flex', gap: 8}}>
                  <Button
                    label="Back"
                    variant="secondary"
                    onClick={() => setActive(1)}
                  />
                  <Button
                    label="Deploy now"
                    variant="primary"
                    onClick={() => setActive(3)}
                  />
                </div>
              </div>
            )}
          </Step>
          <Step step={3} label="Done" indicator="number" />
        </Stepper>
      </div>
    );
  },
};

export const ContentSlotAlignment: Story = {
  name: 'With Content — Alignment',
  render: () => (
    // The content slot renders outside the density-padded hover target, so it
    // has to re-apply that padding to line up with the label above it. Spacious
    // density is the widest pad, and on-track uses a different scale to
    // separated, so between them these two catch a slot that has drifted.
    <div style={{display: 'flex', gap: 48, flexWrap: 'wrap'}}>
      {(['separated', 'on-track'] as const).map(position => (
        <div key={position} style={{width: 320}}>
          <Text type="label">{position}, spacious</Text>
          <Stepper
            activeStep={1}
            orientation="vertical"
            indicatorPosition={position}
            density="spacious">
            <Step step={0} label="Contact details" />
            <Step
              step={1}
              label="Billing address"
              description="Used for invoices and tax">
              <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                <TextInput label="Street" placeholder="1 Hacker Way" value="" />
                <div>
                  <Button label="Save address" variant="primary" />
                </div>
              </div>
            </Step>
            <Step step={2} label="Review" />
          </Stepper>
        </div>
      ))}
    </div>
  ),
};

// ============================================================
// DENSITY
// ============================================================

export const DensityComparison: Story = {
  name: 'Density — Compact / Balanced / Spacious',
  render: () => {
    const [active, setActive] = useState(1);
    return (
      <div style={{display: 'flex', gap: 48}}>
        <div style={{maxWidth: 250}}>
          <Text type="label">Compact</Text>
          <Stepper
            activeStep={active}
            orientation="vertical"
            onStepClick={setActive}
            density="compact">
            <Step step={0} label="Account" indicator="number" />
            <Step step={1} label="Profile" indicator="number" />
            <Step step={2} label="Payment" indicator="number" />
            <Step step={3} label="Review" indicator="number" />
          </Stepper>
        </div>
        <div style={{maxWidth: 250}}>
          <Text type="label">Balanced</Text>
          <Stepper
            activeStep={active}
            orientation="vertical"
            onStepClick={setActive}
            density="balanced">
            <Step step={0} label="Account" indicator="number" />
            <Step step={1} label="Profile" indicator="number" />
            <Step step={2} label="Payment" indicator="number" />
            <Step step={3} label="Review" indicator="number" />
          </Stepper>
        </div>
        <div style={{maxWidth: 250}}>
          <Text type="label">Spacious</Text>
          <Stepper
            activeStep={active}
            orientation="vertical"
            onStepClick={setActive}
            density="spacious">
            <Step step={0} label="Account" indicator="number" />
            <Step step={1} label="Profile" indicator="number" />
            <Step step={2} label="Payment" indicator="number" />
            <Step step={3} label="Review" indicator="number" />
          </Stepper>
        </div>
      </div>
    );
  },
};

// ============================================================
// EDGE CASES
// ============================================================

export const TwoSteps: Story = {
  name: 'Edge — Two Steps',
  render: () => {
    const [active, setActive] = useState(0);
    return (
      <div style={{maxWidth: 400}}>
        <Stepper
          activeStep={active}
          orientation="horizontal"
          onStepClick={setActive}>
          <Step step={0} label="Before" />
          <Step step={1} label="After" />
        </Stepper>
      </div>
    );
  },
};

export const ManySteps: Story = {
  name: 'Edge — Seven Steps (Horizontal)',
  render: () => {
    const [active, setActive] = useState(3);
    return (
      <Stepper
        activeStep={active}
        orientation="horizontal"
        onStepClick={setActive}>
        <Step step={0} label="Idea" indicator="number" />
        <Step step={1} label="Design" indicator="number" />
        <Step step={2} label="Build" indicator="number" />
        <Step step={3} label="Test" indicator="number" />
        <Step step={4} label="Review" indicator="number" />
        <Step step={5} label="Deploy" indicator="number" />
        <Step step={6} label="Monitor" indicator="number" />
      </Stepper>
    );
  },
};

export const DisabledSteps: Story = {
  name: 'Edge — Disabled Steps',
  render: () => {
    const [active, setActive] = useState(1);
    return (
      <div style={{maxWidth: 400}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          onStepClick={setActive}>
          <Step step={0} label="Basic info" />
          <Step step={1} label="Permissions" />
          <Step
            step={2}
            label="Admin settings"
            description="Requires admin role"
            isDisabled
          />
          <Step step={3} label="Confirm" />
        </Stepper>
      </div>
    );
  },
};

export const OptionalSteps: Story = {
  name: 'Edge — Optional + Skipped',
  render: () => {
    const [active, setActive] = useState(3);
    return (
      <div style={{maxWidth: 400}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          onStepClick={setActive}>
          <Step step={0} label="Basic profile" />
          <Step
            step={1}
            label="Profile photo"
            isOptional
            description="Skipped"
          />
          <Step step={2} label="Connect socials" isOptional />
          <Step step={3} label="Preferences" />
          <Step step={4} label="All done" />
        </Stepper>
      </div>
    );
  },
};

export const LongLabels: Story = {
  name: 'Edge — Long Labels & Descriptions',
  render: () => {
    const [active, setActive] = useState(1);
    return (
      <div style={{maxWidth: 400}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          onStepClick={setActive}>
          <Step
            step={0}
            label="Configure your development environment"
            description="Install dependencies, set up local database, configure environment variables"
          />
          <Step
            step={1}
            label="Create initial data migration"
            description="Define schema, seed data, and run migrations against staging"
          />
          <Step
            step={2}
            label="Submit for code review"
            description="Open pull request and address reviewer feedback"
          />
        </Stepper>
      </div>
    );
  },
};

// ============================================================
// ON-TRACK — indicator slotted into the connector line
// ============================================================

export const OnTrackVertical: Story = {
  name: 'On-Track — Vertical',
  render: () => {
    const [active, setActive] = useState(2);
    return (
      <div style={{maxWidth: 400}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          indicatorPosition="on-track"
          onStepClick={setActive}>
          <Step step={0} label="Create workspace" />
          <Step step={1} label="Invite team members" />
          <Step step={2} label="Set up integrations" />
          <Step step={3} label="Import data" />
          <Step step={4} label="Launch" />
        </Stepper>
      </div>
    );
  },
};

// The outer track holds its connectors 6px off each indicator. The popover is
// a layer opened from a step, so the Stepper inside it starts from its own 0px
// default: its connectors run into the indicators rather than copying the gap.
export const OnTrackGapInLayer: Story = {
  name: 'On-Track — Gap Stops at a Layer',
  render: () => {
    const [isOpen, setIsOpen] = useState(true);
    return (
      <div
        style={{maxWidth: 400, '--step-connector-gap': '6px'} as CSSProperties}>
        <Stepper
          activeStep={1}
          orientation="vertical"
          indicatorPosition="on-track">
          <Step step={0} label="Create workspace" />
          <Step step={1} label="Set up integrations">
            <Popover
              label="Integration steps"
              isOpen={isOpen}
              onOpenChange={setIsOpen}
              placement="end"
              content={
                <Stepper
                  activeStep={1}
                  orientation="vertical"
                  indicatorPosition="on-track">
                  <Step step={0} label="Connect" />
                  <Step step={1} label="Map fields" />
                  <Step step={2} label="Sync" />
                </Stepper>
              }>
              <Button label="Integration steps" variant="secondary" />
            </Popover>
          </Step>
          <Step step={2} label="Launch" />
        </Stepper>
      </div>
    );
  },
};

export const OnTrackHorizontal: Story = {
  name: 'On-Track — Horizontal',
  render: () => {
    const [active, setActive] = useState(2);
    return (
      <div style={{maxWidth: 700}}>
        <Stepper
          activeStep={active}
          orientation="horizontal"
          indicatorPosition="on-track"
          onStepClick={setActive}>
          <Step step={0} label="Cart" indicator="number" />
          <Step step={1} label="Shipping" indicator="number" />
          <Step step={2} label="Payment" indicator="number" />
          <Step step={3} label="Review" indicator="number" />
          <Step step={4} label="Confirm" indicator="number" />
        </Stepper>
      </div>
    );
  },
};

export const OnTrackVerticalDescriptions: Story = {
  name: 'On-Track — Vertical (with description)',
  render: () => {
    const [active, setActive] = useState(2);
    return (
      <div style={{maxWidth: 400}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          indicatorPosition="on-track"
          onStepClick={setActive}>
          <Step
            step={0}
            label="Create workspace"
            description="Name and configure your workspace"
          />
          <Step
            step={1}
            label="Invite team members"
            description="Add collaborators by email"
          />
          <Step
            step={2}
            label="Set up integrations"
            description="Connect Slack, GitHub, Jira"
          />
          <Step
            step={3}
            label="Import data"
            description="Bring in existing projects"
          />
          <Step step={4} label="Launch" description="Go live with your team" />
        </Stepper>
      </div>
    );
  },
};

export const OnTrackHorizontalDescriptions: Story = {
  name: 'On-Track — Horizontal (with description)',
  render: () => {
    const [active, setActive] = useState(2);
    return (
      <div style={{maxWidth: 760}}>
        <Stepper
          activeStep={active}
          orientation="horizontal"
          indicatorPosition="on-track"
          onStepClick={setActive}>
          <Step
            step={0}
            label="Cart"
            indicator="number"
            description="Review your items"
          />
          <Step
            step={1}
            label="Shipping"
            indicator="number"
            description="Where to deliver"
          />
          <Step
            step={2}
            label="Payment"
            indicator="number"
            description="Card or PayPal"
          />
          <Step
            step={3}
            label="Review"
            indicator="number"
            description="Confirm details"
          />
          <Step
            step={4}
            label="Confirm"
            indicator="number"
            description="Place your order"
          />
        </Stepper>
      </div>
    );
  },
};

export const OnTrackComparison: Story = {
  name: 'On-Track — vs Separated',
  render: () => {
    const [active, setActive] = useState(2);
    return (
      <div style={{display: 'flex', gap: 64}}>
        <div style={{maxWidth: 280}}>
          <Text type="label">separated (current)</Text>
          <Stepper
            activeStep={active}
            orientation="vertical"
            indicatorPosition="separated"
            onStepClick={setActive}>
            <Step step={0} label="Account" description="Basic details" />
            <Step step={1} label="Profile" description="About you" />
            <Step step={2} label="Settings" description="Preferences" />
            <Step step={3} label="Review" description="Confirm details" />
          </Stepper>
        </div>
        <div style={{maxWidth: 280}}>
          <Text type="label">on-track</Text>
          <Stepper
            activeStep={active}
            orientation="vertical"
            indicatorPosition="on-track"
            onStepClick={setActive}>
            <Step step={0} label="Account" description="Basic details" />
            <Step step={1} label="Profile" description="About you" />
            <Step step={2} label="Settings" description="Preferences" />
            <Step step={3} label="Review" description="Confirm details" />
          </Stepper>
        </div>
      </div>
    );
  },
};

export const OnTrackStatus: Story = {
  name: 'On-Track — Status Colors',
  render: () => {
    const [active, setActive] = useState(3);
    return (
      <div style={{maxWidth: 400}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          indicatorPosition="on-track"
          onStepClick={setActive}>
          <Step
            step={0}
            label="Email verified"
            description="alice@example.com"
            status="success"
          />
          <Step
            step={1}
            label="Phone verified"
            description="+1 (555) 012-3456"
            status="success"
          />
          <Step
            step={2}
            label="Identity document"
            description="Passport upload failed"
            status="error"
          />
          <Step
            step={3}
            label="Address verification"
            description="Pending review"
            status="accent"
          />
          <Step step={4} label="Background check" isOptional />
          <Step step={5} label="Account activated" />
        </Stepper>
      </div>
    );
  },
};

export const OnTrackHorizontalManySteps: Story = {
  name: 'On-Track — Horizontal, Many Steps',
  render: () => {
    const [active, setActive] = useState(3);
    return (
      <Stepper
        activeStep={active}
        orientation="horizontal"
        indicatorPosition="on-track"
        onStepClick={setActive}>
        <Step step={0} label="Idea" indicator="number" />
        <Step step={1} label="Design" indicator="number" />
        <Step step={2} label="Build" indicator="number" />
        <Step step={3} label="Test" indicator="number" />
        <Step step={4} label="Review" indicator="number" />
        <Step step={5} label="Deploy" indicator="number" />
        <Step step={6} label="Monitor" indicator="number" />
      </Stepper>
    );
  },
};

// ============================================================
// SLOTS & CUSTOMIZATION
// ============================================================

export const EndContent: Story = {
  name: 'Slots — endContent (trailing badges)',
  render: () => {
    const [active, setActive] = useState(2);
    return (
      <div style={{maxWidth: 440}}>
        <Stepper
          activeStep={active}
          orientation="vertical"
          onStepClick={setActive}>
          <Step
            step={0}
            label="Draft"
            description="Written 2 days ago"
            endContent={<Badge variant="success" label="Done" />}
          />
          <Step
            step={1}
            label="Review"
            description="2 approvals required"
            endContent={<Badge variant="info" label="2 pending" />}
          />
          <Step
            step={2}
            label="Publish"
            description="Scheduled for Monday"
            endContent={<Badge variant="warning" label="Blocked" />}
          />
          <Step step={3} label="Archive" />
        </Stepper>
      </div>
    );
  },
};

const xstyles = stylex.create({
  padded: {
    padding: 24,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-container)',
  },
});

export const CustomXStyle: Story = {
  name: 'Customization — xstyle + accessible label',
  render: () => {
    const [active, setActive] = useState(1);
    return (
      <div style={{maxWidth: 520}}>
        <Stepper
          activeStep={active}
          orientation="horizontal"
          onStepClick={setActive}
          label="Checkout progress"
          xstyle={xstyles.padded}>
          <Step step={0} label="Cart" indicator="number" />
          <Step step={1} label="Shipping" indicator="number" />
          <Step step={2} label="Payment" indicator="number" />
          <Step step={3} label="Confirm" indicator="number" />
        </Stepper>
      </div>
    );
  },
};

// ============================================================
// CONNECTOR FILL MOTION
// ============================================================

export const StepAdvance: Story = {
  name: 'Motion — Step Advance',
  render: () => {
    // One change animates the connector: advancing a single step. Clicking the
    // next number along grows the fill across the span it just covered;
    // clicking anything else — further ahead, or back — lands at once. Both
    // halves of the rule are worth seeing next to each other, which is what
    // this story is for. All four layouts share one activeStep so the same
    // change can be compared across them, and the buttons reach further than
    // clicking the steps themselves makes convenient.
    const [active, setActive] = useState(0);
    const labels = ['Cart', 'Shipping', 'Payment', 'Review', 'Confirm'];
    // A vertical on-track step carrying content draws a third segment down the
    // side of the slot, so the span leaving it is stitched from three pieces
    // rather than two — the case most likely to show a seam.
    const stepsFor = (withContent: boolean) => (
      <>
        {labels.map((label, i) => (
          <Step key={label} step={i} label={label} indicator="number">
            {withContent && i === 2 ? (
              <Text type="body">Applied at checkout.</Text>
            ) : null}
          </Step>
        ))}
      </>
    );
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 32}}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <Text type="label">Jump to</Text>
            {labels.map((label, i) => (
              <Button
                key={label}
                label={`${i}`}
                variant={i === active ? 'primary' : 'secondary'}
                onClick={() => setActive(i)}
              />
            ))}
          </div>
          <Text type="body">
            Advancing one step animates the fill. Jumping further ahead, and
            every move backwards, lands at once.
          </Text>
        </div>
        <div style={{display: 'flex', gap: 48, flexWrap: 'wrap'}}>
          {(['separated', 'on-track'] as const).map(position => (
            <div
              key={position}
              style={{display: 'flex', flexDirection: 'column', gap: 24}}>
              <div style={{width: 460}}>
                <Text type="label">{position}, horizontal</Text>
                <Stepper
                  activeStep={active}
                  orientation="horizontal"
                  indicatorPosition={position}
                  onStepClick={setActive}
                  data-testid={`h-${position}`}>
                  {stepsFor(false)}
                </Stepper>
              </div>
              <div style={{width: 460}}>
                <Text type="label">
                  {position}, vertical (step 3 has content)
                </Text>
                <Stepper
                  activeStep={active}
                  orientation="vertical"
                  indicatorPosition={position}
                  onStepClick={setActive}
                  data-testid={`v-${position}`}>
                  {stepsFor(true)}
                </Stepper>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
};

// ============================================================
// NARROW CONTAINERS — the stepper collapses itself
// ============================================================

export const NarrowCollapse: Story = {
  name: 'Narrow — Collapsed Track',
  parameters: {
    docs: {
      description: {
        story:
          "A horizontal stepper measures its own width and collapses once a step has less than `horizontalOptions.minimumStepWidth` pixels (112 by default), so the breakpoint follows the step count rather than the viewport. `horizontalOptions.collapsedVariant` selects `'withLabelAndControls'`, `'withLabel'`, or `'hiddenLabel'`; the last renders only the bare progress track with no compact row. The two indicator positions collapse differently on purpose: `separated` drops its indicators with the labels and repeats the active indicator beside the compact label, while `on-track` keeps its indicators as presentational nodes on the rail and does not repeat the active one beside the label. Controls appear only for `withLabelAndControls` when `onStepClick` is set.",
      },
    },
  },
  render: () => {
    const [a, setA] = useState(1);
    const [b, setB] = useState(1);
    const [c, setC] = useState(1);
    const steps = ['Cart', 'Shipping', 'Delivery', 'Payment'];
    return (
      <div style={{display: 'grid', gap: 40}}>
        <div style={{maxWidth: 560}}>
          <Text type="label">560px — four steps still fit</Text>
          <Stepper activeStep={a} onStepClick={setA} label="Checkout">
            {steps.map((s, i) => (
              <Step key={s} step={i} label={s} />
            ))}
          </Stepper>
        </div>
        <div style={{maxWidth: 320}}>
          <Text type="label">320px — separated, navigable</Text>
          <Stepper activeStep={a} onStepClick={setA} label="Checkout">
            {steps.map((s, i) => (
              <Step key={s} step={i} label={s} />
            ))}
          </Stepper>
        </div>
        <div style={{maxWidth: 320}}>
          <Text type="label">320px — custom 64px threshold stays expanded</Text>
          <Stepper
            activeStep={a}
            onStepClick={setA}
            horizontalOptions={{
              minimumStepWidth: 64,
              collapsedVariant: 'withLabelAndControls',
            }}
            label="Checkout">
            {steps.map((s, i) => (
              <Step key={s} step={i} label={s} />
            ))}
          </Stepper>
        </div>
        <div style={{maxWidth: 320}}>
          <Text type="label">320px — on-track keeps nodes on the rail</Text>
          <Stepper
            activeStep={b}
            onStepClick={setB}
            indicatorPosition="on-track"
            label="Checkout">
            {steps.map((s, i) => (
              <Step key={s} step={i} label={s} indicator="number" />
            ))}
          </Stepper>
        </div>
        <div style={{maxWidth: 320}}>
          <Text type="label">320px — no onStepClick, so no controls</Text>
          <Stepper activeStep={c} label="Checkout">
            {steps.map((s, i) => (
              <Step key={s} step={i} label={s} />
            ))}
          </Stepper>
          <div style={{marginTop: 12, display: 'flex', gap: 8}}>
            <Button
              label="Back"
              variant="secondary"
              onClick={() => setC(n => Math.max(0, n - 1))}
            />
            <Button
              label="Continue"
              onClick={() => setC(n => Math.min(3, n + 1))}
            />
          </div>
        </div>
        <div style={{maxWidth: 320}}>
          <Text type="label">
            320px — a description rides along with the current step
          </Text>
          <Stepper activeStep={a} onStepClick={setA} label="Checkout">
            <Step step={0} label="Cart" description="Review your items" />
            <Step step={1} label="Shipping" description="Where it goes" />
            <Step step={2} label="Delivery" description="How fast" />
            <Step step={3} label="Payment" description="How you pay" />
          </Stepper>
        </div>
      </div>
    );
  },
};

export const NarrowCollapsedVariants: Story = {
  name: 'Narrow — Collapsed Variants',
  parameters: {
    docs: {
      description: {
        story:
          'The same 320px horizontal Stepper with each collapsedVariant. hiddenLabel omits the entire compact row—even though onStepClick is present—so it is shorter and leaves only the progress track.',
      },
    },
  },
  render: () => {
    const [active, setActive] = useState(1);
    const steps = ['Cart', 'Shipping', 'Delivery', 'Payment'];
    const variants = [
      {
        value: 'withLabelAndControls',
        label: 'withLabelAndControls — label and controls',
      },
      {value: 'withLabel', label: 'withLabel — label only'},
      {value: 'hiddenLabel', label: 'hiddenLabel — bare track'},
    ] as const;

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 320px))',
          alignItems: 'start',
          gap: 40,
        }}>
        {variants.map(variant => (
          <div key={variant.value} style={{width: '100%', maxWidth: 320}}>
            <Text type="label">{variant.label}</Text>
            <Stepper
              activeStep={active}
              onStepClick={setActive}
              label="Checkout"
              horizontalOptions={{
                minimumStepWidth: 112,
                collapsedVariant: variant.value,
              }}>
              {steps.map((step, index) => (
                <Step key={step} step={index} label={step} />
              ))}
            </Stepper>
          </div>
        ))}
      </div>
    );
  },
};

// ============================================================
// FRAGMENT-GROUPED STEPS
// ============================================================

export const FragmentGroupedSteps: Story = {
  name: 'Fragment-Grouped Steps',
  render: () => {
    const steps = (
      <>
        <Step step={0} label="Cart" indicator="number" />
        <Step step={1} label="Shipping" indicator="number" />
        <Step step={2} label="Payment" indicator="number" />
        <Step step={3} label="Review" indicator="number" />
      </>
    );
    return (
      <div style={{display: 'grid', gap: 40, maxWidth: 700}}>
        <div>
          <Text type="label">Steps passed directly</Text>
          <Stepper activeStep={2} indicatorPosition="on-track">
            <Step step={0} label="Cart" indicator="number" />
            <Step step={1} label="Shipping" indicator="number" />
            <Step step={2} label="Payment" indicator="number" />
            <Step step={3} label="Review" indicator="number" />
          </Stepper>
        </div>
        <div>
          <Text type="label">Same steps grouped in a fragment</Text>
          <Stepper activeStep={2} indicatorPosition="on-track">
            {steps}
          </Stepper>
        </div>
        <div>
          <Text type="label">Fragment-grouped, vertical</Text>
          <Stepper
            activeStep={2}
            orientation="vertical"
            indicatorPosition="on-track">
            {steps}
          </Stepper>
        </div>
      </div>
    );
  },
};
