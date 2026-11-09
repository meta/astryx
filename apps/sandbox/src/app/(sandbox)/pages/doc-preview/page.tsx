// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, useEffect} from 'react';
import * as stylex from '@stylexjs/stylex';
import {HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Spinner} from '@astryxdesign/core/Spinner';
import type {ReferenceDoc} from '@astryxdesign/cli/authoring';
import {DocPreview} from './DocPreview';
import {ThemeContext} from '@astryxdesign/core/theme';
import {useContext} from 'react';

const styles = stylex.create({
  page: {
    minHeight: '100vh',
  },
  topBar: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    backgroundColor: 'var(--color-background-body)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    padding: '12px 32px',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 64,
  },
});

/** Foundational doc topics — the section docs that have tokenCategory */
const TOPICS = [
  {value: 'color', label: 'Color'},
  {value: 'spacing', label: 'Spacing'},
  {value: 'typography', label: 'Typography'},
  {value: 'elevation', label: 'Elevation'},
  {value: 'shape', label: 'Shape'},
  {value: 'motion', label: 'Motion'},
] as const;

export default function DocPreviewPage() {
  const [topic, setTopic] = useState<string>('color');
  const [docs, setDocs] = useState<Record<string, ReferenceDoc>>({});
  const [version, setVersion] = useState('');
  const [loading, setLoading] = useState(true);

  // Load pre-generated doc data
  useEffect(() => {
    import('../../../../generated/foundationDocs.json')
      .then(mod => {
        const data = mod.default as Record<string, unknown>;
        setVersion((data.__version as string) ?? '');
        const {__version: _, ...topics} = data;
        setDocs(topics as Record<string, ReferenceDoc>);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const ctx = useContext(ThemeContext);
  const doc = docs[topic] ?? null;

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.topBar)}>
        <HStack gap={4} align="center">
          <Text type="label" color="secondary">
            Foundations
          </Text>
          <SegmentedControl
            value={topic}
            onChange={setTopic}
            label="Doc topic"
            size="sm">
            {TOPICS.map(t => (
              <SegmentedControlItem
                key={t.value}
                value={t.value}
                label={t.label}
              />
            ))}
          </SegmentedControl>
        </HStack>
      </div>
      {loading ? (
        <div {...stylex.props(styles.loading)}>
          <Spinner size="md" />
        </div>
      ) : doc ? (
        ctx?.theme ? (
          <DocPreview doc={doc} version={version} theme={ctx.theme} />
        ) : null
      ) : (
        <div {...stylex.props(styles.loading)}>
          <Text color="secondary">No doc found for &quot;{topic}&quot;</Text>
        </div>
      )}
    </div>
  );
}
