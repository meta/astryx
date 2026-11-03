// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Section} from '@astryxdesign/core/Section';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {
  MagnifyingGlassIcon,
  EnvelopeIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof TextInput> = {
  title: 'Core/TextInput',
  component: TextInput,
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Label text (required)',
    },
    isLabelHidden: {
      control: 'boolean',
      description:
        'Visually hide the label (still accessible to screen readers)',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    description: {
      control: 'text',
      description: 'Description text displayed between the label and input',
    },
    value: {
      control: 'text',
      description: 'Current input value (required)',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size variant',
    },
    isOptional: {
      control: 'boolean',
      description:
        'Whether the field is optional (mutually exclusive with isRequired)',
    },
    isRequired: {
      control: 'boolean',
      description:
        'Whether the field is required (mutually exclusive with isOptional)',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Whether the input is disabled',
    },
    isReadOnly: {
      control: 'boolean',
      description:
        'Whether the input is read-only. The value still submits with the form but cannot be edited. Unlike isDisabled it is not dimmed and keeps its form value.',
    },
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the input focusable via aria-disabled (the field becomes read-only). Use this instead of wrapping a disabled TextInput in Tooltip.',
    },
    status: {
      control: 'object',
      description:
        'Status indicator with type (warning/error/success) and optional message',
    },
    labelTooltip: {
      control: 'text',
      description:
        'Tooltip text to display in an info icon at the end of the label',
    },
  },
};

export default meta;
type Story = StoryObj<typeof TextInput>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Name',
    placeholder: 'Enter your name',
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Email',
    description: "We'll never share your email with anyone.",
    placeholder: 'Enter your email',
  },
};

export const WithHiddenLabel: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Search',
    isLabelHidden: true,
    placeholder: 'Search...',
  },
};

export const WithValue: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'Hello, world!');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Greeting',
    value: 'Hello, world!',
  },
};

export const AllVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState('');
    const [value2, setValue2] = useState('');
    const [value3, setValue3] = useState('Pre-filled value');
    const [value4, setValue4] = useState('');
    const [value5, setValue5] = useState('');
    const [value6, setValue6] = useState('');
    const [value7, setValue7] = useState('');
    const [value8, setValue8] = useState('Disabled input');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <TextInput
          label="Visible label"
          value={value1}
          onChange={setValue1}
          placeholder="Enter text..."
        />
        <TextInput
          label="With description"
          description="Helpful description text"
          value={value4}
          onChange={setValue4}
          placeholder="Enter text..."
        />
        <TextInput
          label="Hidden label"
          isLabelHidden
          value={value2}
          onChange={setValue2}
          placeholder="Hidden label input"
        />
        <TextInput label="With value" value={value3} onChange={setValue3} />
        <TextInput
          label="Optional field"
          isOptional
          value={value5}
          onChange={setValue5}
          placeholder="Optional..."
        />
        <TextInput
          label="Required field"
          isRequired
          value={value6}
          onChange={setValue6}
          placeholder="Required..."
        />
        <TextInput
          label="Description with optional"
          description="Enter your nickname"
          isOptional
          value={value7}
          onChange={setValue7}
          placeholder="Nickname..."
        />
        <TextInput
          label="Disabled field"
          isDisabled
          value={value8}
          onChange={setValue8}
        />
      </div>
    );
  },
};

export const OptionalField: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Nickname',
    isOptional: true,
    placeholder: 'Enter your nickname',
  },
};

export const RequiredField: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Username',
    isRequired: true,
    placeholder: 'Enter your username',
  },
};

export const DescriptionWithOptional: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Bio',
    description: 'Tell us about yourself',
    isOptional: true,
    placeholder: 'Your bio here...',
  },
};

// Read-only shows a value the user should see and send but not change. Unlike
// a disabled field it is not dimmed and still submits.
export const ReadOnly: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'ACCT-4417-9920');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Account number',
    isReadOnly: true,
    value: 'ACCT-4417-9920',
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'Cannot edit this');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Locked Field',
    isDisabled: true,
    value: 'Cannot edit this',
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the input to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the input stays focusable (editing is still blocked).
// Use disabledMessage instead of wrapping a disabled TextInput in Tooltip:
// disabled controls swallow the pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'alice@example.com');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Owner',
    isDisabled: true,
    disabledMessage: 'You need the Editor role to change this',
    value: 'alice@example.com',
  },
};

export const WithStartIcon: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Search',
    placeholder: 'Search...',
    startIcon: MagnifyingGlassIcon,
  },
};

export const WithStartIconAndSmallSize: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Search',
    placeholder: 'Search...',
    startIcon: MagnifyingGlassIcon,
    size: 'sm',
  },
};

export const SizeVariants: Story = {
  render: () => {
    const [sm, setSm] = useState('');
    const [md, setMd] = useState('');
    const [lg, setLg] = useState('');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <TextInput
          label="Small (28px)"
          value={sm}
          onChange={setSm}
          placeholder="Small size"
          size="sm"
        />
        <TextInput
          label="Medium (32px)"
          value={md}
          onChange={setMd}
          placeholder="Medium size (default)"
          size="md"
        />
        <TextInput
          label="Large (36px)"
          value={lg}
          onChange={setLg}
          placeholder="Large size"
          size="lg"
        />
      </div>
    );
  },
};

export const StartIconVariations: Story = {
  render: () => {
    const [search, setSearch] = useState('');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <TextInput
          label="Search"
          value={search}
          onChange={setSearch}
          placeholder="Search..."
          startIcon={MagnifyingGlassIcon}
        />
        <TextInput
          label="Email"
          value={email}
          onChange={setEmail}
          placeholder="Enter your email"
          startIcon={EnvelopeIcon}
        />
        <TextInput
          label="Username"
          value={username}
          onChange={setUsername}
          placeholder="Enter your username"
          startIcon={UserIcon}
        />
      </div>
    );
  },
};

export const ErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'invalid@');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Email',
    placeholder: 'Enter your email',
    status: {type: 'error', message: 'Please enter a valid email address'},
  },
};

export const WarningStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'user123');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Username',
    placeholder: 'Enter your username',
    status: {type: 'warning', message: 'This username is already taken'},
  },
};

export const SuccessStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'validuser');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Username',
    placeholder: 'Enter your username',
    status: {type: 'success', message: 'Username is available'},
  },
};

export const StatusWithoutMessage: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'test');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Field',
    placeholder: 'Enter value',
    status: {type: 'error'},
  },
};

export const StatusVariations: Story = {
  render: () => {
    const [error, setError] = useState('invalid@');
    const [warning, setWarning] = useState('user123');
    const [success, setSuccess] = useState('validuser');
    const [errorNoMsg, setErrorNoMsg] = useState('test');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <TextInput
          label="Error with message"
          value={error}
          onChange={setError}
          status={{type: 'error', message: 'Please enter a valid email'}}
        />
        <TextInput
          label="Warning with message"
          value={warning}
          onChange={setWarning}
          status={{type: 'warning', message: 'This username may be taken'}}
        />
        <TextInput
          label="Success with message"
          value={success}
          onChange={setSuccess}
          status={{type: 'success', message: 'Username is available'}}
        />
        <TextInput
          label="Error without message"
          value={errorNoMsg}
          onChange={setErrorNoMsg}
          status={{type: 'error'}}
        />
      </div>
    );
  },
};

export const WithTooltip: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'API Key',
    placeholder: 'Enter your API key',
    labelTooltip: 'Your unique API key for authentication. Keep this secret!',
  },
};

export const Password: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    type: 'password',
    label: 'Password',
    placeholder: 'Enter your password',
  },
};

export const TooltipWithOptional: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Webhook URL',
    placeholder: 'https://example.com/webhook',
    labelTooltip: 'The URL where we will send event notifications.',
    isOptional: true,
  },
};

export const Clearable: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'Hello world');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Search',
    placeholder: 'Type to search...',
    hasClear: true,
  },
};

export const ClearableWithStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'invalid-email');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Email',
    hasClear: true,
    status: {type: 'error', message: 'Invalid email address'},
  },
};

export const StatusVariantComparison: Story = {
  render: () => {
    const [a, setA] = useState('invalid@');
    const [b, setB] = useState('invalid@');
    const [c, setC] = useState('invalid@');
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 24, width: 280}}>
        <TextInput
          label="Attached (default)"
          value={a}
          onChange={setA}
          status={{type: 'error', message: 'Enter a valid email'}}
        />
        <TextInput
          label="Detached"
          value={b}
          onChange={setB}
          status={{type: 'error', message: 'Enter a valid email'}}
          statusVariant="detached"
        />
        <TextInput
          label="Tooltip (focus, hover, or tap the status icon)"
          value={c}
          onChange={setC}
          status={{type: 'error', message: 'Enter a valid email'}}
          statusVariant="tooltip"
        />
      </div>
    );
  },
};

/**
 * Keyboard traits: what each field tells a touch keyboard. On a phone, focus
 * each field to see its keyboard and its Return key: a Search key that does
 * not capitalize, the phone pad, the URL keyboard with Go, the number pad for
 * a one-time code, and a username field that neither capitalizes nor corrects.
 */
export const KeyboardTraits: Story = {
  render: () => {
    const [query, setQuery] = useState('');
    const [phone, setPhone] = useState('');
    const [website, setWebsite] = useState('');
    const [code, setCode] = useState('');
    const [username, setUsername] = useState('');
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 16, width: 320}}>
        <TextInput
          label="Search"
          type="search"
          value={query}
          onChange={setQuery}
          startIcon={MagnifyingGlassIcon}
          enterKeyHint="search"
          autoCapitalize="none"
          hasAutoCorrect={false}
          hasClear
        />
        <TextInput
          label="Phone"
          type="tel"
          value={phone}
          onChange={setPhone}
          autoComplete="tel"
          enterKeyHint="next"
        />
        <TextInput
          label="Website"
          type="url"
          value={website}
          onChange={setWebsite}
          autoComplete="url"
          enterKeyHint="go"
        />
        <TextInput
          label="Verification code"
          value={code}
          onChange={setCode}
          inputMode="numeric"
          autoComplete="one-time-code"
          enterKeyHint="done"
        />
        <TextInput
          label="Username"
          value={username}
          onChange={setUsername}
          startIcon={UserIcon}
          autoComplete="username"
          autoCapitalize="none"
          hasAutoCorrect={false}
          hasSpellCheck={false}
          enterKeyHint="next"
        />
      </div>
    );
  },
};

/**
 * Mobile keyboard: on a phone, the keyboard never covers the focused field.
 * The fields sit low on the first screen, and the page scrolls the focused one
 * 10 px above the keyboard. The Message field sits in a toolbar fixed at the
 * viewport's bottom, which rides up with the keyboard, its bottom on the
 * keyboard's top.
 */
export const MobileKeyboard: Story = {
  name: 'Mobile keyboard',
  parameters: {layout: 'fullscreen'},
  render: () => <MobileKeyboardPage bar="docked" />,
};

/**
 * Mobile keyboard, with the toolbar floating 16 px above the bottom edge. The
 * app positions that toolbar, so it stays where the app puts it.
 */
export const MobileKeyboardFloatingBar: Story = {
  name: 'Mobile keyboard: floating bar',
  parameters: {layout: 'fullscreen'},
  render: () => <MobileKeyboardPage bar="floating" />,
};

/**
 * Mobile keyboard, with a toolbar that sets its own `translate`. The app
 * positions that toolbar, so it stays where the app puts it.
 */
export const MobileKeyboardOwnTranslate: Story = {
  name: 'Mobile keyboard: bar with its own translate',
  parameters: {layout: 'fullscreen'},
  render: () => <MobileKeyboardPage bar="translated" />,
};

/**
 * Mobile keyboard, at the end of a short page. The page scrolls 84 px, and its
 * last field sits at its end.
 */
export const MobileKeyboardEndOfPage: Story = {
  name: 'Mobile keyboard: end of a short page',
  parameters: {layout: 'fullscreen'},
  render: () => <EndOfPageFixture />,
};

/**
 * Mobile keyboard, at the end of a scroll area that fills the viewport. The
 * area scrolls 84 px, and its last field sits at its end.
 */
export const MobileKeyboardEndOfScrollArea: Story = {
  name: 'Mobile keyboard: end of a scroll area',
  parameters: {layout: 'fullscreen'},
  render: () => <EndOfScrollAreaFixture />,
};

/**
 * Mobile keyboard, in a scroll area low on the page. The keyboard covers the
 * area's whole box, so the page scrolls the focused field above it.
 */
export const MobileKeyboardLowScrollArea: Story = {
  name: 'Mobile keyboard: a scroll area low on the page',
  parameters: {layout: 'fullscreen'},
  render: () => <LowScrollAreaFixture />,
};

/**
 * Mobile keyboard, in a scroll area inside a panel that floats above the
 * bottom edge. The keyboard covers the panel, so the page brings the focused
 * field into view.
 */
export const MobileKeyboardFloatingPanel: Story = {
  name: 'Mobile keyboard: a scroll area in a floating panel',
  parameters: {layout: 'fullscreen'},
  render: () => <FloatingPanelFixture />,
};

/**
 * Mobile keyboard, in a scroll area that fills a full-viewport panel. The
 * panel's scroll area brings the focused field above the keyboard, and the
 * page does not move.
 */
export const MobileKeyboardFullViewportPanel: Story = {
  name: 'Mobile keyboard: a scroll area in a full-viewport panel',
  parameters: {layout: 'fullscreen'},
  render: () => <FullViewportPanelFixture />,
};

/**
 * Mobile keyboard, in a bottom sheet of a set height. The keyboard covers the
 * sheet, so the page brings the focused field into view.
 */
export const MobileKeyboardSheet: Story = {
  name: 'Mobile keyboard: a field in a sheet of a set height',
  render: () => <SheetFixture />,
};

const keyboardFixtureStyles = stylex.create({
  page: {padding: 16, paddingBlockEnd: 160},
  intro: {minHeight: '60vh'},
  fields: {width: 320},
  tail: {minHeight: '40vh'},
  bar: {position: 'fixed', insetInline: 0, insetBlockEnd: 0},
  floatingBar: {insetBlockEnd: 16},
  translatedBar: {translate: '0 -8px'},
});

const BAR_NOTES = {
  docked:
    'The toolbar rides up with the keyboard, its bottom on the keyboard’s top, and back down when it closes.',
  floating:
    'The toolbar floats above the bottom edge, so the app positions it and it stays in place.',
  translated:
    'The toolbar sets its own translate, so the app positions it and it stays in place.',
} as const;

function MobileKeyboardPage({
  bar,
}: {
  bar: 'docked' | 'floating' | 'translated';
}) {
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  return (
    <div {...stylex.props(keyboardFixtureStyles.page)}>
      <div {...stylex.props(keyboardFixtureStyles.intro)}>
        <VStack gap={2}>
          <Heading level={3}>Mobile keyboard</Heading>
          <Text type="supporting" color="secondary">
            Focus each field. The page scrolls the focused field above the
            mobile keyboard and never pans. {BAR_NOTES[bar]}
          </Text>
        </VStack>
      </div>
      <div {...stylex.props(keyboardFixtureStyles.fields)}>
        <VStack gap={4}>
          <TextInput label="Title" value={title} onChange={setTitle} />
          <NumberInput
            label="Quantity"
            value={quantity}
            onChange={setQuantity}
          />
          <TextArea label="Notes" value={notes} onChange={setNotes} />
        </VStack>
      </div>
      <div {...stylex.props(keyboardFixtureStyles.tail)} />
      <div
        {...stylex.props(
          keyboardFixtureStyles.bar,
          bar === 'floating' && keyboardFixtureStyles.floatingBar,
          bar === 'translated' && keyboardFixtureStyles.translatedBar,
        )}>
        <Card>
          <Toolbar
            label="Reply"
            startContent={
              <TextInput
                label="Message"
                isLabelHidden
                value={message}
                onChange={setMessage}
              />
            }
            endContent={<Button label="Send" onClick={() => setMessage('')} />}
          />
        </Card>
      </div>
    </div>
  );
}

const endFixtureStyles = stylex.create({
  endColumn: {
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    minHeight: 'calc(100dvh + 84px)',
    padding: 16,
  },
  grow: {flexGrow: 1},
  scrollArea: {height: '100dvh', overflowY: 'auto'},
});

function EndIntro({where}: {where: string}) {
  return (
    <VStack gap={2}>
      <Heading level={3}>Mobile keyboard</Heading>
      <Text type="supporting" color="secondary">
        {where} scrolls 84 px. Focus its last field, at its end: the field ends
        above the mobile keyboard.
      </Text>
    </VStack>
  );
}

function EndOfPageFixture() {
  const [value, setValue] = useState('');
  return (
    <div {...stylex.props(endFixtureStyles.endColumn)}>
      <EndIntro where="The page" />
      <div {...stylex.props(endFixtureStyles.grow)} />
      <TextInput label="Last field" value={value} onChange={setValue} />
    </div>
  );
}

function EndOfScrollAreaFixture() {
  const [value, setValue] = useState('');
  return (
    <div {...stylex.props(endFixtureStyles.scrollArea)}>
      <div {...stylex.props(endFixtureStyles.endColumn)}>
        <EndIntro where="The scroll area" />
        <div {...stylex.props(endFixtureStyles.grow)} />
        <TextInput label="Last field" value={value} onChange={setValue} />
      </div>
    </div>
  );
}

const lowFixtureStyles = stylex.create({
  page: {padding: 16},
  intro: {minHeight: '60dvh'},
  area: {height: 220, overflowY: 'auto'},
  tail: {height: 400},
});

function LowScrollAreaFixture() {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  return (
    <div {...stylex.props(lowFixtureStyles.page)}>
      <div {...stylex.props(lowFixtureStyles.intro)}>
        <VStack gap={2}>
          <Heading level={3}>Mobile keyboard</Heading>
          <Text type="supporting" color="secondary">
            Focus a field in the scroll area below. The keyboard covers the
            area's whole box, so the page scrolls the field above the keyboard.
          </Text>
        </VStack>
      </div>
      <div {...stylex.props(lowFixtureStyles.area)}>
        <VStack gap={4}>
          <TextInput label="First field" value={first} onChange={setFirst} />
          <TextInput label="Second field" value={second} onChange={setSecond} />
          <div {...stylex.props(lowFixtureStyles.tail)} />
        </VStack>
      </div>
    </div>
  );
}

const panelFixtureStyles = stylex.create({
  page: {padding: 16},
  panel: {
    position: 'fixed',
    insetInline: 16,
    insetBlockEnd: 16,
    height: 220,
    overflowY: 'auto',
  },
  tail: {height: 400},
});

function FloatingPanelFixture() {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  return (
    <div {...stylex.props(panelFixtureStyles.page)}>
      <VStack gap={2}>
        <Heading level={3}>Mobile keyboard</Heading>
        <Text type="supporting" color="secondary">
          Focus a field in the floating panel below. The keyboard covers the
          panel, so the page brings the field into view.
        </Text>
      </VStack>
      <div {...stylex.props(panelFixtureStyles.panel)}>
        <Card>
          <VStack gap={4}>
            <TextInput label="Panel field" value={first} onChange={setFirst} />
            <TextInput
              label="Second panel field"
              value={second}
              onChange={setSecond}
            />
            <div {...stylex.props(panelFixtureStyles.tail)} />
          </VStack>
        </Card>
      </div>
    </div>
  );
}

const fullPanelFixtureStyles = stylex.create({
  panel: {
    position: 'fixed',
    inset: 0,
    overflowY: 'auto',
    padding: 16,
  },
  intro: {minHeight: '60dvh'},
  tail: {height: '100dvh'},
});

function FullViewportPanelFixture() {
  const [value, setValue] = useState('');
  return (
    <div {...stylex.props(fullPanelFixtureStyles.panel)}>
      <div {...stylex.props(fullPanelFixtureStyles.intro)}>
        <VStack gap={2}>
          <Heading level={3}>Mobile keyboard</Heading>
          <Text type="supporting" color="secondary">
            Focus the field below. The panel's scroll area brings it above the
            keyboard, and the page does not move.
          </Text>
        </VStack>
      </div>
      <TextInput label="Panel field" value={value} onChange={setValue} />
      <div {...stylex.props(fullPanelFixtureStyles.tail)} />
    </div>
  );
}

const sheetFixtureStyles = stylex.create({
  sheet: {height: 300},
  tail: {height: 400},
});

function SheetFixture() {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState('');
  return (
    <VStack gap={2}>
      <Heading level={3}>Mobile keyboard</Heading>
      <Text type="supporting" color="secondary">
        Open the sheet and focus its field. The keyboard covers the sheet, so
        the page brings the field into view.
      </Text>
      <Button label="Open sheet" onClick={() => setIsOpen(true)} />
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Sheet of a set height"
        xstyle={sheetFixtureStyles.sheet}>
        <Section padding={4}>
          <TextInput label="Sheet field" value={value} onChange={setValue} />
          <div {...stylex.props(sheetFixtureStyles.tail)} />
        </Section>
      </BottomSheet>
    </VStack>
  );
}
