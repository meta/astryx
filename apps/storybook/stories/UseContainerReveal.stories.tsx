// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {useState} from 'react';
import {useContainerReveal} from '@astryxdesign/core/hooks';
import {Button} from '@astryxdesign/core/Button';
import {mergeProps} from '@astryxdesign/core/utils';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';
import {TrashIcon, PencilIcon} from '@heroicons/react/24/outline';

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxWidth: 360,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '8px 12px',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(0,0,0,0.12)',
    background: {
      default: 'transparent',
      ':hover': 'rgba(0,0,0,0.03)',
    },
  },
  label: {fontSize: 14},
  actions: {display: 'flex', gap: 4},
  hint: {
    fontSize: 12,
    color: colorVars['--color-text-secondary'],
    marginBottom: 8,
  },
  toggle: {marginBottom: 8},
  nested: {
    marginTop: 8,
    marginInlineStart: 24,
    borderInlineStartWidth: 2,
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: 'rgba(0,0,0,0.08)',
    paddingInlineStart: 8,
  },
});

/**
 * A row whose secondary actions are hidden at rest and revealed when the row
 * is hovered or focused. The action stays in the a11y tree and tab order.
 */
function RevealRow({label}: {label: string}) {
  const {getContainerProps, getContentRevealProps} = useContainerReveal();
  return (
    <div {...mergeProps(getContainerProps(), stylex.props(styles.row))}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <span
        {...mergeProps(getContentRevealProps(), stylex.props(styles.actions))}>
        <Button
          label={`Edit ${label}`}
          variant="ghost"
          isIconOnly
          icon={<PencilIcon style={{width: 16, height: 16}} />}
        />
        <Button
          label={`Delete ${label}`}
          variant="ghost"
          isIconOnly
          icon={<TrashIcon style={{width: 16, height: 16}} />}
        />
      </span>
    </div>
  );
}

const meta: Meta = {
  title: 'Core/Hooks/useContainerReveal',
};
export default meta;
type Story = StoryObj;

/** Hover or tab into a row to reveal its actions. */
export const Reveal: Story = {
  render: () => (
    <div {...stylex.props(styles.stack)}>
      <p {...stylex.props(styles.hint)}>
        Hover a row — or press Tab to focus into it — to reveal its actions. On
        touch devices the actions are always visible.
      </p>
      <RevealRow label="report.pdf" />
      <RevealRow label="budget.xlsx" />
      <RevealRow label="notes.txt" />
    </div>
  ),
};

/**
 * Inverted: content is visible at rest and fades OUT on hover. Mouse-only —
 * it never hides on keyboard focus and stays visible on touch.
 */
export const InvertedConceal: Story = {
  render: () => {
    function ConcealRow({label}: {label: string}) {
      const {getContainerProps, getContentRevealProps} = useContainerReveal();
      return (
        <div {...mergeProps(getContainerProps(), stylex.props(styles.row))}>
          <span {...stylex.props(styles.label)}>{label}</span>
          <span
            {...mergeProps(
              getContentRevealProps({isRevealInverted: true}),
              stylex.props(styles.label),
            )}>
            edited 2h ago
          </span>
        </div>
      );
    }
    return (
      <div {...stylex.props(styles.stack)}>
        <p {...stylex.props(styles.hint)}>
          The timestamp shows at rest and fades out on mouse hover (a visual
          declutter). It stays put for keyboard and touch users.
        </p>
        <ConcealRow label="report.pdf" />
        <ConcealRow label="budget.xlsx" />
      </div>
    );
  },
};

/**
 * Layout-preserved reveal reserves the action's box at rest, so surrounding
 * content does not shift when it appears.
 */
export const PreserveLayout: Story = {
  render: () => {
    function PreserveRow({label}: {label: string}) {
      const {getContainerProps, getContentRevealProps} = useContainerReveal();
      return (
        <div {...mergeProps(getContainerProps(), stylex.props(styles.row))}>
          <span {...stylex.props(styles.label)}>{label}</span>
          <span
            {...mergeProps(
              getContentRevealProps({isLayoutPreserved: true}),
              stylex.props(styles.actions),
            )}>
            <Button
              label={`Delete ${label}`}
              variant="ghost"
              isIconOnly
              icon={<TrashIcon style={{width: 16, height: 16}} />}
            />
          </span>
        </div>
      );
    }
    return (
      <div {...stylex.props(styles.stack)}>
        <p {...stylex.props(styles.hint)}>
          The action's space is reserved even while hidden — no reflow when it
          fades in.
        </p>
        <PreserveRow label="report.pdf" />
        <PreserveRow label="budget.xlsx" />
      </div>
    );
  },
};

/**
 * Nested containers each get their own scoped marker from the pool, so
 * hovering the outer row does NOT reveal the inner row's actions.
 */
export const NestedIsolation: Story = {
  render: () => (
    <div {...stylex.props(styles.stack)}>
      <p {...stylex.props(styles.hint)}>
        Hover the outer row: only its own actions appear. The nested row keeps
        its actions hidden until you hover it directly — proof that the pool
        gives each container an isolated marker.
      </p>
      <div>
        <RevealRow label="Parent folder" />
        <div {...stylex.props(styles.nested)}>
          <RevealRow label="Nested file" />
        </div>
      </div>
    </div>
  ),
};

/**
 * A flat list of 20 rows. Sibling containers never nest, so every row can share
 * the same reveal scope: hovering one row reveals only that row's actions, and
 * mounting the list produces no console warnings.
 */
export const ManyRows: Story = {
  render: () => (
    <div {...stylex.props(styles.stack)}>
      <p {...stylex.props(styles.hint)}>
        Twenty rows on one page. Hover any row — including the last — to reveal
        its actions.
      </p>
      {Array.from({length: 20}, (_, i) => (
        <RevealRow
          key={i}
          label={`file-${String(i + 1).padStart(2, '0')}.txt`}
        />
      ))}
    </div>
  ),
};

/**
 * `isEnabled` is read on every render: flipping it off removes the reveal
 * styles and leaves the content permanently visible.
 */
export const ToggleEnabled: Story = {
  render: () => {
    function ToggleRow() {
      const [isEnabled, setIsEnabled] = useState(true);
      const {getContainerProps, getContentRevealProps} = useContainerReveal({
        isEnabled,
      });
      return (
        <div {...stylex.props(styles.stack)}>
          <div {...stylex.props(styles.toggle)}>
            <Button
              label={isEnabled ? 'Reveal on hover' : 'Always visible'}
              variant="secondary"
              onClick={() => setIsEnabled(v => !v)}
            />
          </div>
          <div {...mergeProps(getContainerProps(), stylex.props(styles.row))}>
            <span {...stylex.props(styles.label)}>report.pdf</span>
            <span
              {...mergeProps(
                getContentRevealProps(),
                stylex.props(styles.actions),
              )}>
              <Button
                label="Delete report.pdf"
                variant="ghost"
                isIconOnly
                icon={<TrashIcon style={{width: 16, height: 16}} />}
              />
            </span>
          </div>
        </div>
      );
    }
    return <ToggleRow />;
  },
};

/**
 * `hoverDelay` gates the reveal on dwell: sweep the pointer down the list and
 * nothing paints in its wake, but rest on a row and its actions fade in.
 */
export const HoverIntentDelay: Story = {
  render: () => {
    function DelayedRow({label}: {label: string}) {
      const {getContainerProps, getContentRevealProps} = useContainerReveal();
      return (
        <div
          {...mergeProps(
            getContainerProps({hoverDelay: 250}),
            stylex.props(styles.row),
          )}>
          <span {...stylex.props(styles.label)}>{label}</span>
          <span
            {...mergeProps(
              getContentRevealProps(),
              stylex.props(styles.actions),
            )}>
            <Button
              label={`Edit ${label}`}
              variant="ghost"
              isIconOnly
              icon={<PencilIcon style={{width: 16, height: 16}} />}
            />
            <Button
              label={`Delete ${label}`}
              variant="ghost"
              isIconOnly
              icon={<TrashIcon style={{width: 16, height: 16}} />}
            />
          </span>
        </div>
      );
    }
    return (
      <div {...stylex.props(styles.stack)}>
        <p {...stylex.props(styles.hint)}>
          A 250ms dwell. Sweep the cursor across the rows — none of them light
          up. Stop on one and its actions appear. Tab moves through them with no
          delay at all.
        </p>
        {Array.from({length: 6}, (_, i) => (
          <DelayedRow key={i} label={`file-${i + 1}.txt`} />
        ))}
      </div>
    );
  },
};

/**
 * `forceState` pins the container's trigger: 'inactive' while something else
 * owns the pointer (a scroll, a drag, a velocity gate), 'active' to keep a row
 * lit — e.g. while its overflow menu is open. It is state, not appearance: the
 * inverted timestamp does the opposite of the actions, from the same flag.
 */
export const ForcedContainerState: Story = {
  render: () => {
    function ForcedRow() {
      const [forced, setForced] = useState<'active' | 'inactive' | undefined>(
        undefined,
      );
      const {getContainerProps, getContentRevealProps} = useContainerReveal();
      const cycle = () =>
        setForced(prev =>
          prev === undefined
            ? 'active'
            : prev === 'active'
              ? 'inactive'
              : undefined,
        );
      return (
        <div {...stylex.props(styles.stack)}>
          <div {...stylex.props(styles.toggle)}>
            <Button
              label={`forceState: ${forced ?? 'unset (hover drives it)'}`}
              variant="secondary"
              onClick={cycle}
            />
          </div>
          <div
            {...mergeProps(
              getContainerProps({forceState: forced}),
              stylex.props(styles.row),
            )}>
            <span {...stylex.props(styles.label)}>report.pdf</span>
            <span
              {...mergeProps(
                getContentRevealProps({isRevealInverted: true}),
                stylex.props(styles.label),
              )}>
              edited 2h ago
            </span>
            <span
              {...mergeProps(
                getContentRevealProps(),
                stylex.props(styles.actions),
              )}>
              <Button
                label="Delete report.pdf"
                variant="ghost"
                isIconOnly
                icon={<TrashIcon style={{width: 16, height: 16}} />}
              />
            </span>
          </div>
          <p {...stylex.props(styles.hint)}>
            'active' brings the actions in and takes the timestamp out — one
            state, two opposite appearances. While it is 'inactive', hovering
            does nothing, but tabbing in still reveals the action, so it can
            never be trapped out of reach of the keyboard.
          </p>
        </div>
      );
    }
    return <ForcedRow />;
  },
};

/**
 * `forceVisibility` is the same idea one level down, on a single element: it
 * says how THAT content looks regardless of the container. Here the row's
 * actions are pinned per row while the container is left on hover.
 */
export const ForcedContentVisibility: Story = {
  render: () => {
    function PinnedRow({
      label,
      forceVisibility,
    }: {
      label: string;
      forceVisibility?: 'shown' | 'hidden';
    }) {
      const {getContainerProps, getContentRevealProps} = useContainerReveal();
      return (
        <div {...mergeProps(getContainerProps(), stylex.props(styles.row))}>
          <span {...stylex.props(styles.label)}>{label}</span>
          <span
            {...mergeProps(
              getContentRevealProps({forceVisibility}),
              stylex.props(styles.actions),
            )}>
            <Button
              label={`Delete ${label}`}
              variant="ghost"
              isIconOnly
              icon={<TrashIcon style={{width: 16, height: 16}} />}
            />
          </span>
        </div>
      );
    }
    return (
      <div {...stylex.props(styles.stack)}>
        <p {...stylex.props(styles.hint)}>
          Row 1 follows the pointer, row 2 is pinned shown, row 3 is pinned
          hidden — and tabbing into row 3 still brings its action back.
        </p>
        <PinnedRow label="follows-hover.txt" />
        <PinnedRow label="pinned-shown.txt" forceVisibility="shown" />
        <PinnedRow label="pinned-hidden.txt" forceVisibility="hidden" />
      </div>
    );
  },
};
