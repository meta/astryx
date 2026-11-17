// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useCombobox.stories.tsx
 * @input Uses useCombobox from @astryxdesign/core/Selector, useAnnounce,
 *   usePopover, Dialog, Layout, and Button
 * @output Comboboxes over single-line fields the story renders itself: a
 *   search field whose results replace a page section, an assignee field
 *   whose matches open in a layer, and a field in a dialog; each shows an
 *   empty message when nothing matches and announces each new result count
 *   through useAnnounce
 * @position Storybook stories for useCombobox's field props;
 *   ComboboxField.a11y.chromium.spec.ts drives these stories in Chromium
 */

import type {Meta, StoryObj} from '@storybook/react';
import {useId, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useCombobox} from '@astryxdesign/core/Selector';
import {useAnnounce} from '@astryxdesign/core/hooks';
import {usePopover} from '@astryxdesign/core/Popover';
import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const meta: Meta = {
  title: 'Core/Hooks/useCombobox',
  parameters: {
    docs: {
      description: {
        component:
          'useCombobox over a single-line text field the product renders itself. The story owns the field, the rows and where the list renders; the hook owns the roles, the keys and the pointer model. Each story announces each new query’s result count through useAnnounce, as AST-075 leaves to the caller. Focus never leaves the field: arrows move the active option, Enter picks it, Escape hides the list.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

type Option = {value: string; label: string; disabled?: boolean};

const PEOPLE: Option[] = [
  {value: 'ada', label: 'Ada Lovelace'},
  {value: 'alan', label: 'Alan Turing'},
  {value: 'barbara', label: 'Barbara Liskov'},
  {value: 'edsger', label: 'Edsger Dijkstra'},
  {value: 'grace', label: 'Grace Hopper (away)', disabled: true},
  {value: 'katherine', label: 'Katherine Johnson'},
  {value: 'margaret', label: 'Margaret Hamilton'},
];

const SETTINGS: Option[] = [
  {value: 'notifications', label: 'Notifications'},
  {value: 'notification-sound', label: 'Notification sound'},
  {value: 'appearance', label: 'Appearance'},
  {value: 'language', label: 'Language and region'},
  {value: 'shortcuts', label: 'Keyboard shortcuts'},
  {value: 'password', label: 'Password'},
  {value: 'two-factor', label: 'Two-factor authentication'},
];

function matching(options: Option[], query: string): Option[] {
  const needle = query.trim().toLowerCase();
  return options.filter(option => option.label.toLowerCase().includes(needle));
}

function firstEnabled(options: Option[]): number {
  return options.findIndex(option => !option.disabled);
}

/** The words announced for a new query: its count, or the words shown for none. */
function resultWords(count: number, none: string): string {
  return count === 0 ? none : count === 1 ? '1 result' : `${count} results`;
}

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
    width: 360,
    fontFamily: 'inherit',
  },
  field: {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: 36,
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border-emphasized'],
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-surface'],
    color: colorVars['--color-text-primary'],
    font: 'inherit',
  },
  listbox: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 224,
    overflowY: 'auto',
    padding: spacingVars['--spacing-1'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-popover'],
  },
  option: {
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    borderRadius: radiusVars['--radius-element'],
    color: colorVars['--color-text-primary'],
    cursor: 'pointer',
    userSelect: 'none',
  },
  active: {
    backgroundColor: colorVars['--color-overlay-hover'],
  },
  disabled: {
    color: colorVars['--color-text-disabled'],
    cursor: 'default',
  },
  layerListbox: {
    minWidth: 240,
    borderStyle: 'none',
  },
  muted: {
    margin: 0,
    color: colorVars['--color-text-secondary'],
  },
});

type Combobox = ReturnType<typeof useCombobox<Option>>;

/** The caller's rows: plain elements carrying the hook's option props. */
function Rows({combobox, options}: {combobox: Combobox; options: Option[]}) {
  return options.map((option, index) => (
    <div
      key={option.value}
      {...combobox.getOptionProps(index)}
      {...stylex.props(
        styles.option,
        index === combobox.highlightedIndex && styles.active,
        option.disabled && styles.disabled,
      )}>
      {option.label}
    </div>
  ));
}

// ---------------------------------------------------------------------------
// A search field: an input whose results replace a page section in flow.
// ---------------------------------------------------------------------------

function SearchFieldExample() {
  const listboxId = useId();
  const announce = useAnnounce();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [picked, setPicked] = useState<string>();
  const options = query.trim() === '' ? [] : matching(SETTINGS, query);
  const isShown = isOpen && query.trim() !== '';

  const combobox = useCombobox({
    selectableItems: options,
    isOpen: isShown,
    onOpen: () => {
      if (query.trim() === '') {
        return false;
      }
      setIsOpen(true);
    },
    onClose: () => setIsOpen(false),
    onSelect: value => {
      setPicked(SETTINGS.find(setting => setting.value === value)?.label);
      setQuery('');
    },
    listboxId,
  });

  return (
    <div {...stylex.props(styles.stack)}>
      <input
        aria-label="Search settings"
        type="text"
        value={query}
        placeholder="Search settings"
        onChange={event => {
          const next = event.currentTarget.value;
          setQuery(next);
          setIsOpen(true);
          // The results answer a new query, so nothing is active until an
          // arrow or the pointer picks a row; Enter stays the field's.
          combobox.setHighlightedIndex(-1);
          // The caller announces each new query's count (AST-075 FR7, DEC-2),
          // with the words it shows for none.
          if (next.trim() !== '' && next.trim() !== query.trim()) {
            const count = matching(SETTINGS, next).length;
            announce(resultWords(count, 'No settings match'));
          }
        }}
        onBlur={() => setIsOpen(false)}
        {...combobox.getFieldProps()}
        {...stylex.props(styles.field)}
      />
      {isShown ? (
        options.length > 0 ? (
          <div
            aria-label="Settings"
            {...combobox.getListboxProps()}
            {...stylex.props(styles.listbox)}>
            <Rows combobox={combobox} options={options} />
          </div>
        ) : (
          <p {...stylex.props(styles.muted)}>No settings match</p>
        )
      ) : (
        <p {...stylex.props(styles.muted)}>
          {picked == null
            ? 'Recent: Notifications, Appearance'
            : `Opened ${picked}`}
        </p>
      )}
    </div>
  );
}

/**
 * A single-line search field whose results replace a page section, in the
 * page's flow rather than a layer. ArrowDown brings back hidden results; a
 * press on a result picks it while focus stays in the field.
 */
export const SearchField: Story = {
  render: () => <SearchFieldExample />,
};

// ---------------------------------------------------------------------------
// An assignee field: an input whose matches open in a layer.
// ---------------------------------------------------------------------------

function AssigneeFieldExample() {
  const listboxId = useId();
  const announce = useAnnounce();
  const [query, setQuery] = useState('');
  const [assignee, setAssignee] = useState<string>();
  const options = query.trim() === '' ? [] : matching(PEOPLE, query);
  const popover = usePopover({
    hasLightDismiss: true,
    hasCloseButton: false,
    hasAutoFocus: false,
    role: 'none',
  });
  const isShown = popover.isOpen && query.trim() !== '';

  const combobox = useCombobox({
    selectableItems: options,
    isOpen: isShown,
    onOpen: () => {
      if (query.trim() === '') {
        return false;
      }
      popover.show();
    },
    onClose: () => popover.hide(),
    onSelect: value => {
      setAssignee(PEOPLE.find(person => person.value === value)?.label);
      setQuery('');
      popover.hide();
    },
    listboxId,
  });

  return (
    <div {...stylex.props(styles.stack)}>
      <input
        ref={popover.triggerRef}
        aria-label="Assignee"
        type="text"
        value={query}
        placeholder="Assign to"
        onChange={event => {
          const next = event.currentTarget.value;
          setQuery(next);
          if (next.trim() === '') {
            popover.hide();
            return;
          }
          popover.show();
          const matches = matching(PEOPLE, next);
          // A new query makes its first match active, so Enter picks it.
          combobox.setHighlightedIndex(firstEnabled(matches));
          if (next.trim() !== query.trim()) {
            announce(resultWords(matches.length, 'No one matches'));
          }
        }}
        {...combobox.getFieldProps()}
        {...stylex.props(styles.field)}
      />
      {popover.render(
        options.length > 0 ? (
          <div
            aria-label="People"
            {...combobox.getListboxProps()}
            {...stylex.props(styles.listbox, styles.layerListbox)}>
            <Rows combobox={combobox} options={options} />
          </div>
        ) : (
          <p {...stylex.props(styles.muted)}>No one matches</p>
        ),
      )}
      <p {...stylex.props(styles.muted)}>
        {assignee == null ? 'Unassigned' : `Assigned to ${assignee}`}
      </p>
    </div>
  );
}

/**
 * An input whose matches open in a layer anchored to it. Focus stays in the
 * field: the arrows move between matches, Enter picks the active one, and
 * Escape hides the layer.
 */
export const AssigneeField: Story = {
  render: () => <AssigneeFieldExample />,
};

// ---------------------------------------------------------------------------
// A field inside a dialog: Escape hides the list before it closes the dialog.
// ---------------------------------------------------------------------------

/**
 * The dialog's field and its list, rendered inside the Dialog. An announcement
 * follows where useAnnounce is called, so the count reaches the dialog's own
 * live region.
 */
function SharePeopleField() {
  const listboxId = useId();
  const announce = useAnnounce();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [shared, setShared] = useState<string[]>([]);
  const options = query.trim() === '' ? [] : matching(PEOPLE, query);
  const isShown = isOpen && query.trim() !== '';

  const combobox = useCombobox({
    selectableItems: options,
    isOpen: isShown,
    onOpen: () => {
      if (query.trim() === '') {
        return false;
      }
      setIsOpen(true);
    },
    onClose: () => setIsOpen(false),
    onSelect: value => {
      const person = PEOPLE.find(candidate => candidate.value === value);
      if (person != null) {
        setShared([...shared, person.label]);
      }
      setQuery('');
    },
    listboxId,
  });

  return (
    <div {...stylex.props(styles.stack)}>
      <input
        aria-label="Add people"
        type="text"
        value={query}
        onChange={event => {
          const next = event.currentTarget.value;
          setQuery(next);
          setIsOpen(true);
          const matches = matching(PEOPLE, next);
          combobox.setHighlightedIndex(firstEnabled(matches));
          if (next.trim() !== '' && next.trim() !== query.trim()) {
            announce(resultWords(matches.length, 'No one matches'));
          }
        }}
        {...combobox.getFieldProps()}
        {...stylex.props(styles.field)}
      />
      {isShown ? (
        options.length > 0 ? (
          <div
            aria-label="People"
            {...combobox.getListboxProps()}
            {...stylex.props(styles.listbox)}>
            <Rows combobox={combobox} options={options} />
          </div>
        ) : (
          <p {...stylex.props(styles.muted)}>No one matches</p>
        )
      ) : null}
      <p {...stylex.props(styles.muted)}>
        {shared.length > 0
          ? `Shared with ${shared.join(', ')}`
          : 'Not shared yet'}
      </p>
    </div>
  );
}

function InDialogExample() {
  const [isDialogOpen, setIsDialogOpen] = useState(true);

  return (
    <>
      <Button
        label="Share"
        variant="secondary"
        onClick={() => setIsDialogOpen(true)}
      />
      <Dialog isOpen={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <Layout
          header={<DialogHeader title="Share" onOpenChange={setIsDialogOpen} />}
          content={
            <LayoutContent>
              <SharePeopleField />
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

/**
 * A field inside a dialog, its matches listed in the dialog's flow and an
 * empty message shown when nothing matches. With either shown, the first
 * Escape hides it and the dialog stays; the next Escape closes the dialog.
 */
export const InDialog: Story = {
  render: () => <InDialogExample />,
};
