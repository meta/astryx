// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState, useEffect, useCallback} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Markdown} from '@astryxdesign/core/Markdown';
import type {MarkdownSource} from '@astryxdesign/core/Markdown';
import {Button} from '@astryxdesign/core/Button';

const meta: Meta<typeof Markdown> = {
  title: 'Core/MarkdownCitations',
  component: Markdown,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Markdown>;

// ---------------------------------------------------------------------------
// Shared sources
// ---------------------------------------------------------------------------

const SEARCH_SOURCES: Record<string, MarkdownSource> = {
  abc1: {
    title: 'Tokyo - Wikipedia',
    url: 'https://en.wikipedia.org/wiki/Tokyo',
    icon: 'https://en.wikipedia.org/favicon.ico',
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
    icon: 'https://www.reuters.com/favicon.ico',
  },
  mno5: {
    title: 'UN Urbanization Prospects',
    url: 'https://population.un.org/wup/',
  },
};

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

const BRACKET_MD = [
  '## Tokyo Overview',
  '',
  'Tokyo is the capital of Japan with a population of over 14 million[abc1].',
  "It's the most populous metropolitan area in the world[def2][ghi3].",
  '',
  '### Economy',
  '',
  "Tokyo's GDP exceeds $1.9 trillion, making it the largest city economy globally[jkl4].",
  'The metropolitan area is expected to remain the most populous urban agglomeration through 2035[mno5].',
  '',
  '### Key Facts',
  '',
  '- Population: 13.96 million (city proper)[abc1]',
  '- Metro area: 37.4 million[def2]',
  '- GDP: $1.93 trillion[jkl4]',
  '',
  'For more details, see the [full Wikipedia article](https://en.wikipedia.org/wiki/Tokyo).',
].join('\n');

export const BracketNotation: Story = {
  name: 'Bracket [id]',
  args: {
    children: BRACKET_MD,
    sources: SEARCH_SOURCES,
    density: 'compact',
    headingLevelStart: 3,
  },
};

const FULLWIDTH_MD = [
  '## Search Results',
  '',
  'Tokyo has a population of over 14 million\u3010abc1\u3011.',
  'The greater Tokyo area houses 37 million people\u3010def2\u3011\u3010ghi3\u3011.',
  '',
  "The city's economy is the largest in the world\u3010jkl4\u3011,",
  'and urbanization trends suggest continued growth\u3010mno5\u3011.',
].join('\n');

export const FullwidthNotation: Story = {
  name: 'Fullwidth \u3010id\u3011',
  args: {
    children: FULLWIDTH_MD,
    sources: SEARCH_SOURCES,
    density: 'compact',
    headingLevelStart: 3,
  },
};

export const NoCitations: Story = {
  name: 'No Sources (passthrough)',
  args: {
    children:
      'Text with [abc1] bracket markers but no sources prop.\n\nThey render as plain text.',
  },
};

const STREAMING_CITATION_MD = [
  '## AI Research Summary',
  '',
  'Large language models have shown remarkable capabilities in recent years[abc1].',
  'Scaling laws suggest continued improvement with more compute[def2].',
  '',
  '### Key Findings',
  '',
  '- Models above 100B parameters show emergent abilities[ghi3]',
  '- Fine-tuning remains critical for task-specific performance[jkl4]',
  '- Safety alignment is an active area of research[mno5]',
  '',
  'These results have broad implications for the field.',
].join('\n');

export const StreamingWithCitations: Story = {
  name: 'Streaming',
  render: () => {
    const text = STREAMING_CITATION_MD;
    const [charIndex, setCharIndex] = useState(0);
    const [isStreaming, setIsStreaming] = useState(true);
    const [key, setKey] = useState(0);

    useEffect(() => {
      if (!isStreaming) {
        return;
      }
      if (charIndex >= text.length) {
        setIsStreaming(false);
        return;
      }
      const chunkSize = Math.floor(Math.random() * 8) + 2;
      const delay = 30 + Math.random() * 60;
      const timer = setTimeout(() => {
        setCharIndex(prev => Math.min(prev + chunkSize, text.length));
      }, delay);
      return () => clearTimeout(timer);
    }, [charIndex, isStreaming, text]);

    const replay = useCallback(() => {
      setCharIndex(0);
      setIsStreaming(true);
      setKey(k => k + 1);
    }, []);

    return (
      <div>
        <div
          style={{
            marginBlockEnd: 12,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}>
          <Button
            label="Replay"
            variant="secondary"
            size="sm"
            onClick={replay}
            isDisabled={isStreaming}
          />
          <span style={{fontSize: 12, color: 'var(--color-text-secondary)'}}>
            {isStreaming
              ? `Streaming... ${charIndex}/${text.length}`
              : 'Complete'}
          </span>
        </div>
        <Markdown
          key={key}
          isStreaming={isStreaming}
          density="compact"
          headingLevelStart={3}
          sources={SEARCH_SOURCES}>
          {text.slice(0, charIndex)}
        </Markdown>
      </div>
    );
  },
};
