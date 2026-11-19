// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Center} from '@astryxdesign/core/Center';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Icon} from '@astryxdesign/core/Icon';
import {BookIcon} from '@astryxdesign/template-icons';
import {ArticleIcon} from '@astryxdesign/template-icons';

const sources = {
  abc1: {
    title: 'Tokyo - Wikipedia',
    url: 'https://en.wikipedia.org/wiki/Tokyo',
    icon: <Icon icon={BookIcon} size="xsm" />,
  },
  def2: {
    title: 'Japan Statistics Bureau - Population',
    url: 'https://www.stat.go.jp/english/',
  },
  ghi3: {
    title: 'World Population Review',
    url: 'https://worldpopulationreview.com/world-cities/tokyo-population',
  },
  jkl4: {
    title: 'Reuters — Tokyo GDP',
    url: 'https://www.reuters.com/markets/',
    icon: <Icon icon={ArticleIcon} size="xsm" />,
  },
  mno5: {
    title: 'UN Urbanization Prospects',
    url: 'https://population.un.org/wup/',
  },
};

const content = [
  '## Tokyo Overview',
  '',
  'Tokyo is the capital of Japan with a population of over 14 million[abc1].',
  "It's the most populous metropolitan area in the world[def2][ghi3].",
  '',
  '### Key Facts',
  '',
  '- Population: 13.96 million (city proper)[abc1]',
  '- Metro area: 37.4 million[def2]',
  '- GDP: $1.93 trillion[jkl4]',
].join('\n');

export default function MarkdownCitedContent() {
  return (
    <Center width="100%" style={{maxWidth: 450}}>
      <Markdown sources={sources} density="compact" headingLevelStart={3}>
        {content}
      </Markdown>
    </Center>
  );
}
