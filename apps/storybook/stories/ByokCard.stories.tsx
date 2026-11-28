// Copyright (c) Meta Platforms, Inc. and affiliates.

import type * as React from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {ByokCard} from '@astryxdesign/core/ByokCard';
import {Grid} from '@astryxdesign/core/Grid';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';

const meta: Meta<typeof ByokCard> = {
  title: 'Container/ByokCard',
  component: ByokCard,
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'radio',
      options: ['disconnected', 'connected'],
      description: 'Connection status of the provider',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disables card interactions and buttons',
    },
  },
};

export default meta;
type Story = StoryObj<typeof ByokCard>;

export const Disconnected: Story = {
  args: {
    provider: {
      id: 'openai',
      name: 'OpenAI',
      description: 'GPT-4o, o1, o3-mini models',
    },
    status: 'disconnected',
  },
};

export const Connected: Story = {
  args: {
    provider: {
      id: 'anthropic',
      name: 'Anthropic',
      description: 'Claude 3.5 Sonnet, Claude 3.7 Sonnet',
    },
    status: 'connected',
    accountLabel: 'sk-ant-api03-...94ba',
  },
};

export const Disabled: Story = {
  args: {
    provider: {
      id: 'google',
      name: 'Google Gemini',
      description: 'Gemini 2.0 Flash, Gemini 1.5 Pro',
    },
    status: 'disconnected',
    isDisabled: true,
  },
};

export const ProviderGrid: Story = {
  render: () => {
    const providers = [
      {
        id: 'openai',
        name: 'OpenAI',
        description: 'GPT-4o, o1, o3-mini models',
        status: 'connected' as const,
        accountLabel: 'sk-proj-...8a21',
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        description: 'Claude 3.5 Sonnet, Claude 3.7 Sonnet',
        status: 'connected' as const,
        accountLabel: 'sk-ant-...b12e',
      },
      {
        id: 'google',
        name: 'Google Gemini',
        description: 'Gemini 2.0 Flash, Gemini 1.5 Pro',
        status: 'disconnected' as const,
      },
      {
        id: 'groq',
        name: 'Groq',
        description: 'Ultra-fast Llama 3 & DeepSeek inference',
        status: 'disconnected' as const,
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        description: 'DeepSeek-V3, DeepSeek-R1 reasoning',
        status: 'disconnected' as const,
      },
      {
        id: 'mistral',
        name: 'Mistral AI',
        description: 'Mistral Large, Codestral, Pixtral',
        status: 'disconnected' as const,
      },
    ];

    return (
      <VStack gap={4}>
        <div>
          <Heading level={3}>Bring Your Own Key (BYOK)</Heading>
          <Text type="body" color="secondary">
            Connect and manage API keys for direct model provider access.
          </Text>
        </div>
        <Grid columns={{minWidth: 280, max: 3}} gap={3}>
          {providers.map(p => (
            <ByokCard
              key={p.id}
              provider={{
                id: p.id,
                name: p.name,
                description: p.description,
              }}
              status={p.status}
              accountLabel={p.accountLabel}
              onConnect={key => alert(`Connecting ${p.name} with key: ${key}`)}
              onRotate={key => alert(`Rotating ${p.name} with new key: ${key}`)}
              onDelete={() => alert(`Deleting key for ${p.name}`)}
            />
          ))}
        </Grid>
      </VStack>
    );
  },
};
