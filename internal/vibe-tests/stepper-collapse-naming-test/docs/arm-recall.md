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

`activeStep` is the zero-based index of the current step. `onStepClick` makes
steps clickable for non-linear navigation.

The collapsed row is configurable. The Previous/Next controls and the
current step's name can each be turned off independently, so a page that
already provides its own navigation, or its own step heading, is not shown a
second copy of it. The name stays in the accessible sequence either way, and
nothing here has any effect while the stepper is wide enough to show its
labels. **The props that do this are not listed in this reference.**

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

## Anti-pattern

Don't hide the collapsed row with CSS:

```css
/* Don't do this */
[data-astryx-stepper-summary] { display: none; }
```

It leaves the controls in the tab order with nothing visible to show for them.
Use the component's own API instead.
