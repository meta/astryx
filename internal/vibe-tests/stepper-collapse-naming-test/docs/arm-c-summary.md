# Stepper

```
import {Step, Stepper} from '@astryxdesign/core/Stepper';
```

A horizontal `Stepper` renders a numbered sequence with a label under each
step. It measures its own width. Once each step has less than about 112px to
work with, the stepper **collapses**: the labels drop away leaving a bare
segmented progress track, and a row appears beneath that track carrying the
current step's name and — when `onStepClick` is set — Previous/Next controls.
A vertical stepper never collapses.

## Props

| prop | type | default |
| --- | --- | --- |
| `activeStep` | `number` | — |
| `children` | `ReactNode` | — |
| `onStepClick` | `(index: number) => void` | — |
| `label` | `string` | `'Progress'` |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` |
| `density` | `'compact' \| 'balanced' \| 'spacious'` | `'balanced'` |
| `indicatorPosition` | `'separated' \| 'on-track'` | `'separated'` |
| `hasSummaryControls` | `boolean` | `true` |
| `hasSummaryLabel` | `boolean` | `true` |

`activeStep` is the zero-based index of the current step. `onStepClick` makes
steps clickable for non-linear navigation.

`hasSummaryControls` sets whether the collapsed stepper shows Previous/Next
controls beneath the track; they only ever appear when `onStepClick` is set.
`hasSummaryLabel` sets whether the collapsed stepper names the current step
beneath the track. The name stays in the accessible sequence either way.
Neither has any effect while the stepper is wide enough to show its labels.

`Step` takes `step` (zero-based index), `label`, and optionally `description`,
`status` (`'accent' | 'success' | 'warning' | 'error'`), and `isOptional`.

## Examples

Default, no configuration:

```tsx
<Stepper activeStep={step} onStepClick={setStep}>
  <Step step={0} label="Cart" />
  <Step step={1} label="Address" />
  <Step step={2} label="Payment" />
</Stepper>
```

Turning off one half of the collapsed row:

```tsx
<Stepper activeStep={step} onStepClick={setStep} hasSummaryControls={false}>
  <Step step={0} label="Cart" />
  <Step step={1} label="Address" />
  <Step step={2} label="Payment" />
</Stepper>
```

## Anti-pattern

Don't hide the collapsed row with CSS:

```css
/* Don't do this */
[data-astryx-stepper-summary] { display: none; }
```

It leaves the controls in the tab order with nothing visible to show for them.
Use `hasSummaryControls` / `hasSummaryLabel` instead.
