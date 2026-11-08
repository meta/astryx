// Copyright (c) Meta Platforms, Inc. and affiliates.

// Generates one skill doc per arm from a single template.
//
// Checker Protocol §2 ("only the system under test varies") is enforced here
// rather than by inspection: every arm shares byte-identical intro, prop table
// rows, Step description, example 1, and anti-pattern. The ONLY substitutions
// are the prop rows, the prose describing them, and example 2 — and the prose
// is the same sentence with the names swapped, so no arm gets a wording
// advantage against the prompt battery.

import {writeFileSync} from 'node:fs';

const TEMPLATE = `# Stepper

\`\`\`
import {Step, Stepper} from '@astryxdesign/core/Stepper';
\`\`\`

A horizontal \`Stepper\` renders a numbered sequence with a label under each
step. It measures its own width. Once each step has less than about 112px to
work with, the stepper **collapses**: the labels drop away leaving a bare
segmented progress track, and a row appears beneath that track carrying the
current step's name and — when \`onStepClick\` is set — Previous/Next controls.
A vertical stepper never collapses.

## Props

| prop | type | default |
| --- | --- | --- |
| \`activeStep\` | \`number\` | — |
| \`children\` | \`ReactNode\` | — |
| \`onStepClick\` | \`(index: number) => void\` | — |
| \`label\` | \`string\` | \`'Progress'\` |
| \`orientation\` | \`'horizontal' \\| 'vertical'\` | \`'horizontal'\` |
| \`density\` | \`'compact' \\| 'balanced' \\| 'spacious'\` | \`'balanced'\` |
| \`indicatorPosition\` | \`'separated' \\| 'on-track'\` | \`'separated'\` |
__PROP_ROWS__

\`activeStep\` is the zero-based index of the current step. \`onStepClick\` makes
steps clickable for non-linear navigation.

__PROP_PROSE__

\`Step\` takes \`step\` (zero-based index), \`label\`, and optionally \`description\`,
\`status\` (\`'accent' | 'success' | 'warning' | 'error'\`), and \`isOptional\`.

## Examples

Default, no configuration:

\`\`\`tsx
<Stepper activeStep={step} onStepClick={setStep}>
  <Step step={0} label="Cart" />
  <Step step={1} label="Address" />
  <Step step={2} label="Payment" />
</Stepper>
\`\`\`

__EXAMPLE_2__

## Anti-pattern

Don't hide the collapsed row with CSS:

\`\`\`css
/* Don't do this */
[data-astryx-stepper-summary] { display: none; }
\`\`\`

It leaves the controls in the tab order with nothing visible to show for them.
__ANTIPATTERN_TAIL__
`;

/** Two-boolean arms: identical prose, only the names change. */
function booleanArm(controlsProp, labelProp) {
  return {
    PROP_ROWS: `| \`${controlsProp}\` | \`boolean\` | \`true\` |\n| \`${labelProp}\` | \`boolean\` | \`true\` |`,
    PROP_PROSE:
      `\`${controlsProp}\` sets whether the collapsed stepper shows Previous/Next\n` +
      `controls beneath the track; they only ever appear when \`onStepClick\` is set.\n` +
      `\`${labelProp}\` sets whether the collapsed stepper names the current step\n` +
      `beneath the track. The name stays in the accessible sequence either way.\n` +
      `Neither has any effect while the stepper is wide enough to show its labels.`,
    EXAMPLE_2:
      `Turning off one half of the collapsed row:\n\n` +
      '```tsx\n' +
      `<Stepper activeStep={step} onStepClick={setStep} ${controlsProp}={false}>\n` +
      `  <Step step={0} label="Cart" />\n` +
      `  <Step step={1} label="Address" />\n` +
      `  <Step step={2} label="Payment" />\n` +
      `</Stepper>\n` +
      '```',
    ANTIPATTERN_TAIL: `Use \`${controlsProp}\` / \`${labelProp}\` instead.`,
  };
}

const ARMS = {
  'arm-a-collapsed': booleanArm('hasCollapsedControls', 'hasCollapsedLabel'),
  'arm-b-bare': booleanArm('hasControls', 'hasLabel'),
  'arm-c-summary': booleanArm('hasSummaryControls', 'hasSummaryLabel'),
  'arm-d-enum': {
    PROP_ROWS:
      "| `collapsedSummary` | `'auto' \\| 'label' \\| 'controls' \\| 'none'` | `'auto'` |",
    PROP_PROSE:
      '`collapsedSummary` sets what the collapsed stepper shows beneath the track.\n' +
      "`'auto'` shows the current step's name, plus Previous/Next controls when\n" +
      "`onStepClick` is set. `'label'` shows the name only. `'controls'` shows the\n" +
      "controls only. `'none'` shows nothing, leaving the bare track. The name stays\n" +
      'in the accessible sequence under every value. It has no effect while the\n' +
      'stepper is wide enough to show its labels.',
    EXAMPLE_2:
      'Turning off one half of the collapsed row:\n\n' +
      '```tsx\n' +
      '<Stepper activeStep={step} onStepClick={setStep} collapsedSummary="label">\n' +
      '  <Step step={0} label="Cart" />\n' +
      '  <Step step={1} label="Address" />\n' +
      '  <Step step={2} label="Payment" />\n' +
      '</Stepper>\n' +
      '```',
    ANTIPATTERN_TAIL: 'Use `collapsedSummary` instead.',
  },
  // Recall probe: the behavior is described and the two halves are said to be
  // configurable, but no prop is named and no second example is given. The
  // agent has to produce the name it expects.
  'arm-recall': {
    PROP_ROWS: '',
    PROP_PROSE:
      'The collapsed row is configurable. The Previous/Next controls and the\n' +
      "current step's name can each be turned off independently, so a page that\n" +
      'already provides its own navigation, or its own step heading, is not shown a\n' +
      'second copy of it. The name stays in the accessible sequence either way, and\n' +
      'nothing here has any effect while the stepper is wide enough to show its\n' +
      'labels. **The props that do this are not listed in this reference.**',
    EXAMPLE_2: '',
    ANTIPATTERN_TAIL: "Use the component's own API instead.",
  },
};

for (const [name, subs] of Object.entries(ARMS)) {
  let out = TEMPLATE;
  for (const [key, value] of Object.entries(subs)) {
    out = out.replace(`__${key}__`, value);
  }
  // Collapse the blank lines an empty substitution leaves behind.
  out = out.replace(/\n{3,}/g, '\n\n');
  const path = `/tmp/stepper-naming-vibe/docs/${name}.md`;
  writeFileSync(path, out);
  const words = out.split(/\s+/).filter(Boolean).length;
  console.log(`${name.padEnd(18)} ${String(words).padStart(4)} words`);
}
