// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Citation} from '@astryxdesign/core/Citation';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Icon} from '@astryxdesign/core/Icon';
import {BookIcon} from '@astryxdesign/template-icons';
import {CodeIcon} from '@astryxdesign/template-icons';
import {GlobeIcon} from '@astryxdesign/template-icons';

const sources = [
  {
    title: 'React Documentation',
    url: 'https://react.dev',
    icon: <Icon icon={CodeIcon} size="xsm" />,
  },
  {
    title: 'TypeScript Handbook',
    url: 'https://www.typescriptlang.org/docs/handbook/',
    icon: <Icon icon={BookIcon} size="xsm" />,
  },
  {
    title: 'MDN Web Docs',
    url: 'https://developer.mozilla.org',
    icon: <Icon icon={GlobeIcon} size="xsm" />,
  },
  {
    title: 'W3C WAI-ARIA Specification',
    url: 'https://www.w3.org/TR/wai-aria/',
  },
];

export default function CitationSourceList() {
  return (
    <Stack direction="vertical" gap={3}>
      <Text type="supporting" color="secondary">
        Sources
      </Text>
      <Stack direction="horizontal" gap={2} style={{flexWrap: 'wrap'}}>
        {sources.map((source, i) => (
          <Citation
            key={source.title}
            source={source}
            number={i + 1}
            variant="label"
          />
        ))}
      </Stack>
    </Stack>
  );
}
