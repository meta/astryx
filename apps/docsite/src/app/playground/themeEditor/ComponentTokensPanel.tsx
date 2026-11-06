// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useCallback, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack, HStack, StackItem} from '@astryxdesign/core/Stack';
import {Selector} from '@astryxdesign/core/Selector';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {
  COMPONENT_VARS,
  ALL_COMPONENT_NAMES,
  COMPONENT_VAR_TO_OVERRIDE,
  resolveOptionLabel,
} from './constants';

const styles = stylex.create({
  fullWidthField: {width: '100%'},
  row: {
    paddingBlock: 6,
    gap: 10,
  },
  // minWidth: 0 lets the description truncate (maxLines) instead of overflowing.
  rowLabel: {
    minWidth: 0,
  },
  // Fixed-width value-control column for each component-token row.
  rowControl: {
    flexShrink: 0,
    width: 180,
  },
});

/**
 * Read the value a seeded theme set for a component-token control, by reverse-
 * mapping the playground var (e.g. `--card-radius`) through
 * COMPONENT_VAR_TO_OVERRIDE to the component + CSS property it controls, then
 * looking it up in the theme's `base` overrides. Lets the controls reflect the
 * selected theme instead of always showing the generic default.
 */
function readSeededValue(
  baseComponents: Record<string, unknown>,
  varName: string,
): string | undefined {
  const mapping = COMPONENT_VAR_TO_OVERRIDE[varName]?.[0];
  if (!mapping) {
    return undefined;
  }
  const comp = baseComponents[mapping.component];
  if (!comp || typeof comp !== 'object') {
    return undefined;
  }
  const base = (comp as Record<string, unknown>).base;
  if (!base || typeof base !== 'object') {
    return undefined;
  }
  const value = (base as Record<string, unknown>)[mapping.cssProperty];
  return typeof value === 'string' ? value : undefined;
}

export interface CustomOverride {
  id: string;
  component: string;
  property: string;
  value: string;
}

interface ComponentTokensPanelProps {
  tokens: Record<string, string>;
  onTokenChange: (name: string, value: string) => void;
  customOverrides: CustomOverride[];
  onCustomOverridesChange: (overrides: CustomOverride[]) => void;
  /** Component overrides from the seeded preset theme (theme.components). */
  baseComponents: Record<string, unknown>;
}

export function ComponentTokensPanel({
  tokens,
  onTokenChange,
  customOverrides,
  onCustomOverridesChange,
  baseComponents,
}: ComponentTokensPanelProps) {
  const [customVars, setCustomVars] = useState<Set<string>>(new Set());
  const [newComponent, setNewComponent] = useState('button');
  const [newProperty, setNewProperty] = useState('');
  const [newValue, setNewValue] = useState('');
  // Initialize from existing overrides to avoid duplicate keys after remount
  const nextIdRef = useRef(
    customOverrides.reduce((max, o) => {
      const num = parseInt(o.id.replace('custom-', ''), 10);
      return isNaN(num) ? max : Math.max(max, num + 1);
    }, 0),
  );

  const handleAddCustom = useCallback(() => {
    if (!newComponent || !newProperty || !newValue) {
      return;
    }
    onCustomOverridesChange([
      ...customOverrides,
      {
        id: `custom-${nextIdRef.current++}`,
        component: newComponent,
        property: newProperty,
        value: newValue,
      },
    ]);
    setNewProperty('');
    setNewValue('');
  }, [
    newComponent,
    newProperty,
    newValue,
    customOverrides,
    onCustomOverridesChange,
  ]);

  const handleRemoveCustom = useCallback(
    (index: number) => {
      onCustomOverridesChange(customOverrides.filter((_, i) => i !== index));
    },
    [customOverrides, onCustomOverridesChange],
  );

  const handleUpdateCustomValue = useCallback(
    (index: number, value: string) => {
      const updated = [...customOverrides];
      updated[index] = {...updated[index], value};
      onCustomOverridesChange(updated);
    },
    [customOverrides, onCustomOverridesChange],
  );

  return (
    <VStack gap={4}>
      {Object.entries(COMPONENT_VARS).map(([key, comp]) => (
        <VStack key={key} gap={2}>
          <Heading level={4}>{comp.label}</Heading>
          <VStack gap={1}>
            {comp.vars.map(v => {
              // Prefer an explicit token edit; otherwise fall back to the
              // value the seeded theme set for this control (if any).
              const currentValue =
                tokens[v.name] || readSeededValue(baseComponents, v.name) || '';
              const isCustom = customVars.has(v.name);
              const isPresetValue =
                !isCustom &&
                (!currentValue ||
                  v.options.some(o => o.value === currentValue));

              return (
                <HStack
                  key={v.name}
                  vAlign="center"
                  justify="between"
                  xstyle={styles.row}>
                  <StackItem size="fill" xstyle={styles.rowLabel}>
                    <Text type="label" color="secondary" maxLines={1}>
                      {v.description}
                    </Text>
                  </StackItem>
                  <StackItem xstyle={styles.rowControl}>
                    {!isPresetValue ? (
                      <TextInput
                        label={v.name}
                        isLabelHidden
                        size="sm"
                        value={currentValue}
                        placeholder={v.default}
                        onChange={(val: string) => {
                          if (val.trim() === '') {
                            onTokenChange(v.name, '');
                            setCustomVars(prev => {
                              const next = new Set(prev);
                              next.delete(v.name);
                              return next;
                            });
                          } else {
                            onTokenChange(v.name, val);
                          }
                        }}
                      />
                    ) : (
                      <Selector
                        label={v.name}
                        isLabelHidden
                        size="sm"
                        controlXstyle={styles.fullWidthField}
                        options={[
                          ...v.options.map(o => ({
                            value: o.value,
                            label: resolveOptionLabel(o, tokens),
                          })),
                          {value: '__custom__', label: 'Custom...'},
                        ]}
                        value={currentValue || v.default}
                        onChange={(val: string) => {
                          if (val === '__custom__') {
                            setCustomVars(prev => new Set(prev).add(v.name));
                          } else {
                            onTokenChange(v.name, val);
                          }
                        }}
                      />
                    )}
                  </StackItem>
                </HStack>
              );
            })}
          </VStack>
        </VStack>
      ))}

      <Divider />

      <VStack gap={3}>
        <Heading level={4}>Custom Overrides</Heading>
        <Text type="supporting" color="secondary">
          Override any CSS property on any component.
        </Text>

        {customOverrides.map((override, i) => (
          <VStack key={override.id} gap={1}>
            <HStack gap={2} vAlign="end">
              <StackItem size="fill" xstyle={styles.rowLabel}>
                <Text type="supporting" color="secondary" maxLines={1}>
                  .astryx-{override.component} → {override.property}
                </Text>
              </StackItem>
              <Button
                label="Remove"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveCustom(i)}
              />
            </HStack>
            <TextInput
              label={`${override.component} ${override.property}`}
              isLabelHidden
              size="sm"
              value={override.value}
              onChange={(val: string) => handleUpdateCustomValue(i, val)}
            />
          </VStack>
        ))}

        <VStack gap={2}>
          <Selector
            label="Component"
            size="sm"
            value={newComponent}
            onChange={setNewComponent}
            options={ALL_COMPONENT_NAMES.map(n => ({value: n, label: n}))}
          />
          <TextInput
            label="CSS property (camelCase)"
            size="sm"
            value={newProperty}
            placeholder="e.g. borderRadius"
            onChange={setNewProperty}
          />
          <TextInput
            label="CSS value"
            size="sm"
            value={newValue}
            placeholder="e.g. 9999px"
            onChange={setNewValue}
          />
          <Button
            label="Add Override"
            variant="secondary"
            size="sm"
            onClick={handleAddCustom}
            isDisabled={!newProperty || !newValue}
          />
        </VStack>
      </VStack>
    </VStack>
  );
}
