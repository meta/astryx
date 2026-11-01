// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Field',
  displayName: 'Field',
  group: 'Field',
  category: 'Form Controls',
  keywords: ["field","formfield","formgroup","formcontrol","label","input","required","optional","helpertext","hint"],
  playground: {
    defaults: {
      label: 'Email address',
      inputID: 'email-input',
      description: 'Use Field for controls that do not already provide field under the hood.',
      descriptionID: 'email-help',
      children: {
        __element: 'input',
        props: {
          id: 'email-input',
          'aria-describedby': 'email-help',
          placeholder: 'you@example.com',
          type: 'email',
        },
      },
    },
  },
  theming: {
    targets: [
      {className: 'astryx-field', visualProps: ['layout']},
      {className: 'astryx-field-label'},
      {className: 'astryx-field-status', visualProps: ['type', 'variant']},
      {
        className: 'astryx-input-status-icon',
        visualProps: ['size', 'status'],
      },
      {className: 'astryx-input-clear-button'},
      {className: 'astryx-input-clear-icon'},
    ],
    vars: [
      {name: '--_field-radius', description: 'Border radius of input fields', default: 'var(--radius-element)', private: true},
      {name: '--_field-status-overlap', description: 'Amount an attached FieldStatus extends behind the lower half of the control. Set from the rendered control size.', default: 'calc(var(--size-element-md) / 2)', private: true},
      {name: '--_input-clear-hit-inset', description: 'Outset of the clear (\u2715) button\'s invisible hit area, applied to a ::after overlay. 0 on a fine pointer; negative on a coarse one, which grows the 20px button to the 24px touch target without changing what is drawn.', default: '0px', private: true},
      {name: '--_input-clear-hit-content', description: 'Whether the clear (\u2715) button\'s invisible hit overlay exists. `none` on a fine pointer, so no ::after is generated and hover still reaches the glyph; `""` on a coarse one, where the overlay provides the 24px touch target.', default: 'none', private: true},
    ],
    derived: [
      {property: 'borderRadius', vars: ['--_field-radius']},
    ],
  },
  description: 'Low-level form field wrapper for custom controls that need a label, description, and optional/required indicators.',
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Label text for the field (always rendered for accessibility).',
      required: true,
    },
    {
      name: 'inputID',
      type: 'string',
      description: 'ID for the input element (used for the label htmlFor attribute).',
      required: true,
    },
    {
      name: 'labelID',
      type: 'string',
      description: 'ID applied to the label element itself for group accessibility.',
    },
    {
      name: 'isGroupLabel',
      type: 'boolean',
      description: 'Renders the label as a span for control groups (radiogroup, checkbox list).',
      default: 'false',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'The input or control to render.',
      required: true,
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: 'Visually hide the label (still accessible to screen readers).',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether the associated input is disabled. Propagates disabled styling to the label.',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: 'Description text displayed between the label and input.',
    },
    {
      name: 'descriptionID',
      type: 'string',
      description: 'ID for the description element (use for aria-describedby on the input).',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: 'Whether the field is optional (mutually exclusive with isRequired).',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: 'Whether the field is required (mutually exclusive with isOptional).',
      default: 'false',
    },
    {
      name: 'labelIcon',
      type: 'ReactNode | IconType',
      description: 'Icon to display before the label text. See `astryx docs icons` for valid semantic names.',
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description:
        'Tooltip text to display in an info icon at the end of the label. Hover shows it; on a touch screen a tap on the icon opens it without focusing the field, while a mouse click on the icon focuses the field like the rest of the label.',
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string, messageID?: string}",
      description: 'Status indicator with type and optional message. When message is set, displays a colored status box. messageID is for wiring aria-describedby on the input.',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description: 'How status feedback is placed. Attached overlaps an eligible opaque, bordered, fixed-height control; detached renders a message below custom or non-bordered controls; tooltip leaves the visible affordance to the wrapped input and announces its message without a FieldStatus box.',
      default: "'attached'",
    },
    {
      name: 'width',
      type: 'SizeValue',
      description: 'Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned. Prefer this over setting width via xstyle/className/style, which only size the inner control box. Without a width, a row can shrink the whole field below the natural width of its control, so filter bars shrink instead of overflowing.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: 'Ref forwarded to the root element.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
    {
      name: 'className',
      type: 'string',
      description: 'CSS class name(s) appended to the root element. Prefer xstyle for StyleX deduplication.',
    },
    {
      name: 'style',
      type: 'React.CSSProperties',
      description: 'Inline styles applied to the root element. Takes priority over StyleX inline styles.',
    },
  ],
  components: [
    {name: 'FieldLabel'},
    {name: 'FieldStatus'},
  ],
  usage: {
    description: 'Field is a low-level wrapper for custom, native, or third-party controls that do not already provide field label, description, and status UI. Use it when you need the Field shell around a control you own; use styled Astryx inputs like TextInput, Typeahead, and Select directly when they already expose label, description, and validation props.',
    bestPractices: [
      { guidance: true, description: 'Wrap custom controls, native inputs, or third-party widgets that need labeling, helper text, optional/required indicators, or validation status.' },
      { guidance: true, description: 'Always provide a label for accessibility, even if visually hidden with isLabelHidden.' },
      { guidance: true, description: 'Use inputID and descriptionID to connect the label and description to the inner control with htmlFor and aria-describedby.' },
      { guidance: false, description: 'Nest Field around styled inputs such as TextInput, Typeahead, Select, DateInput, or TextArea; those components already render their own Field shell.' },
      { guidance: true, description: 'Use attached status only when the wrapped control is opaque, bordered, and fixed-height; use detached for custom, tall, translucent, or non-bordered controls.' },
      { guidance: false, description: 'Set both isOptional and isRequired on the same field.' },
      { guidance: false, description: 'Hide the label without providing an alternative way for the user to understand the field purpose.' },
    ],
    anatomy: [
      {name: 'Container', required: true, description: 'Root field box that owns layout, width, and local stacking for the label, control, and status.'},
      {name: 'Label', required: true, description: 'Text identifying the field. Always rendered for accessibility, optionally hidden visually.'},
      {name: 'Ordinary description', required: false, description: 'Helper text under the label in the ordinary field layout.'},
      {name: 'Horizontal-label description', required: false, description: 'Helper text in the control column when FormLayout owns horizontal labels.'},
      {name: 'Control slot', required: true, description: 'A custom, native, or third-party control that does not already render a field shell.'},
      {name: 'Status message', required: false, description: 'Inline validation feedback showing error, warning, or success with a message.'},
      {name: 'Input status icon', required: false, description: 'Shared status affordance used by Field-composed input controls.'},
      {name: 'Input clear button', required: false, description: 'Shared clear action used by Field-composed input controls.'},
      {name: 'Input clear icon', required: false, description: 'Glyph inside the shared input clear action.'},
      {name: 'Optional/Required indicator', required: false, description: 'Badge next to the label showing whether the field is optional or required.'},
      {name: 'Label tooltip trigger', required: false, description: 'Info icon beside the label that opens explanatory content.'},
      {name: 'Label tooltip surface', required: false, description: 'Layer-hosted explanatory content for the label tooltip.'},
    ],
  },
  examples: [
    {
      label: 'Filter bar',
      code: `
import {useState} from 'react';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Selector} from '@astryxdesign/core/Selector';
import {StackItem} from '@astryxdesign/core/Stack';
import {TextInput} from '@astryxdesign/core/TextInput';

// Every Field-based input (TextInput, Selector, DateInput, ...) can be shrunk
// by its row, so a filter bar never pushes the page sideways. Let the row wrap
// so that on a phone the search box keeps a full line and the selectors move
// below it; on wider screens everything stays on one line, with the search box
// taking the free space.
function OrdersFilterBar() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Awaiting fulfillment');
  const [region, setRegion] = useState('All regions');
  const [sort, setSort] = useState('Newest first');
  return (
    <HStack gap={2} wrap="wrap" vAlign="center">
      <StackItem size="fill">
        <TextInput
          label="Search orders"
          isLabelHidden
          placeholder="Search by order or customer"
          startIcon={<Icon icon="search" />}
          value={query}
          onChange={setQuery}
        />
      </StackItem>
      <Selector
        label="Status"
        isLabelHidden
        options={['All statuses', 'Awaiting fulfillment', 'Shipped', 'Delivered', 'Returned']}
        value={status}
        onChange={setStatus}
      />
      <Selector
        label="Region"
        isLabelHidden
        options={['All regions', 'North America', 'Europe', 'Asia Pacific']}
        value={region}
        onChange={setRegion}
      />
      <Selector
        label="Sort"
        isLabelHidden
        options={['Newest first', 'Oldest first', 'Highest total']}
        value={sort}
        onChange={setSort}
      />
    </HStack>
  );
}
`,
    },
    {
      label: 'Wrap a custom control',
      code: `
function CustomSliderField() {
  return (
    <Field
      label="Confidence"
      inputID="confidence-slider"
      description="Choose how strict the review should be."
      descriptionID="confidence-help"
      status={{type: 'success', message: 'Recommended default'}}
      statusVariant="detached">
      <input
        id="confidence-slider"
        type="range"
        min={0}
        max={100}
        defaultValue={60}
        aria-describedby="confidence-help"
      />
    </Field>
  );
}
`,
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description: 'Field is a low-level wrapper for custom, native, or third-party controls that do not already provide field label, description, and status UI. Use it when you need the Field shell around a control you own; use styled Astryx inputs like TextInput, Typeahead, and Select directly when they already expose label, description, and validation props.',
    bestPractices: [
      { guidance: true, description: 'Wrap custom controls, native inputs, or third-party widgets that need labeling, helper text, optional/required indicators, or validation status.' },
      { guidance: true, description: 'Always provide a label for accessibility, even if visually hidden with isLabelHidden.' },
      { guidance: true, description: 'Use inputID and descriptionID to connect the label and description to the inner control with htmlFor and aria-describedby.' },
      { guidance: false, description: 'Nest Field around styled inputs such as TextInput, Typeahead, Select, DateInput, or TextArea; those components already render their own Field shell.' },
      { guidance: true, description: 'Use attached status only when the wrapped control is opaque, bordered, and fixed-height; use detached for custom, tall, translucent, or non-bordered controls.' },
      { guidance: false, description: 'Set both isOptional and isRequired on the same field.' },
      { guidance: false, description: 'Hide the label without providing an alternative way for the user to understand the field purpose.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Low-level field shell for custom controls needing label/description/status.',
  usage: {
    description: 'Field wraps custom/native/third-party controls lacking field UI. Use TextInput, Typeahead, Select, DateInput, or TextArea directly when they already expose label/description/status props.',
    bestPractices: [
      { guidance: true, description: 'Wrap custom controls/widgets that need labeling, helper text, optional/required indicators, or validation status.' },
      { guidance: true, description: 'Always provide a label; visually hide it only when context is clear.' },
      { guidance: true, description: 'Wire inputID/descriptionID to htmlFor and aria-describedby on the inner control.' },
      { guidance: false, description: 'Nest Field around styled inputs; it double-renders labels and status UI.' },
      { guidance: true, description: 'Use attached status only for opaque, bordered, fixed-height controls; use detached for custom, tall, translucent, or non-bordered controls.' },
      { guidance: false, description: 'Set both isOptional and isRequired on the same field.' },
      { guidance: false, description: 'Hide the label without another way to understand field purpose.' },
    ],
  },
};
