// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input ChatSendButton, shared icon lookup, and local theme slot mappings.
 * @output Interactive AS-IS/TO-BE comparisons of send icon resolution.
 * @position Storybook evidence for the ChatSendButton send icon slot.
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {
  ChatSendButton,
  type ChatSendButtonProps,
} from '@astryxdesign/core/Chat';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {Icon, useIcon} from '@astryxdesign/core/Icon';
import {Stack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {defineTheme, Theme, type DefinedTheme} from '@astryxdesign/core/theme';

const meta = {
  title: 'Core/ChatSendButton',
  component: ChatSendButton,
  tags: ['no-visual'],
  args: {size: 'md'},
  argTypes: {
    size: {control: 'inline-radio', options: ['sm', 'md']},
  },
  parameters: {
    controls: {include: ['size']},
    docs: {
      description: {
        component:
          'AS-IS reproduces the previous direct registry lookup using the same button shell. TO-BE renders the current ChatSendButton. Both columns receive the same props and theme. Click a button, or use Enter/Space, to check its action count.',
      },
    },
  },
} satisfies Meta<typeof ChatSendButton>;

export default meta;
type Story = StoryObj<typeof meta>;

const fallbackTheme = defineTheme({name: 'send-slot-fallback-example'});
const mappedTheme = defineTheme({
  name: 'send-slot-mapped-example',
  componentIcons: {'chat-send-button-send': 'check'},
});
const hiddenTheme = defineTheme({
  name: 'send-slot-hidden-example',
  componentIcons: {'chat-send-button-send': null},
});

type Scenario = {
  id: string;
  title: string;
  configuration: string;
  theme: DefinedTheme;
  props?: ChatSendButtonProps;
  result?: {before: string; after: string};
};

const scenarios: readonly Scenario[] = [
  {
    id: 'mapped',
    title: '1. 테마에서 전송 아이콘을 ✓로 지정',
    configuration: "'chat-send-button-send': 'check'",
    theme: mappedTheme,
    result: {
      before: '↑ 유지 — 테마 설정 무시',
      after: '✓ 표시 — 테마 설정 반영',
    },
  },
  {
    id: 'hidden',
    title: '2. 테마에서 전송 아이콘 숨김 지정',
    configuration: "'chat-send-button-send': null",
    theme: hiddenTheme,
    result: {
      before: '↑ 유지 — 숨김 설정 무시',
      after: '아이콘 없음 — 버튼은 유지',
    },
  },
  {
    id: 'fallback',
    title: '설정 없음: 양쪽 모두 ↑ (변경 없음)',
    configuration: 'componentIcons: {}',
    theme: fallbackTheme,
  },
  {
    id: 'caller',
    title: '직접 지정한 sendIcon이 우선',
    configuration: 'slot: null; sendIcon={<Icon icon="clock" />}',
    theme: hiddenTheme,
    props: {sendIcon: <Icon icon="clock" size="sm" />},
  },
  {
    id: 'caller-null',
    title: 'sendIcon={null}은 테마 설정을 사용',
    configuration: "slot: 'check'; sendIcon={null}",
    theme: mappedTheme,
    props: {sendIcon: null},
  },
  {
    id: 'disabled',
    title: '비활성 전송 버튼은 실행하지 않음',
    configuration: "slot: 'check'; isDisabled={true}",
    theme: mappedTheme,
    props: {isDisabled: true},
  },
  {
    id: 'stop',
    title: '중지 아이콘과 동작은 그대로',
    configuration: 'slot: null; isStopShown; isDisabled',
    theme: hiddenTheme,
    props: {isStopShown: true, isDisabled: true},
  },
];

function BeforeChatSendButton(props: ChatSendButtonProps) {
  const defaultSendIcon = useIcon('arrowUp');
  // Caller content bypasses the new slot and preserves the previous lookup rule.
  return (
    <ChatSendButton {...props} sendIcon={props.sendIcon ?? defaultSendIcon} />
  );
}

function ComparisonAction({
  phase,
  scenario,
  size,
}: {
  phase: 'AS-IS' | 'TO-BE';
  scenario: Scenario;
  size: ChatSendButtonProps['size'];
}) {
  const [calls, setCalls] = useState(0);
  const Control = phase === 'AS-IS' ? BeforeChatSendButton : ChatSendButton;
  const activate = () => setCalls(value => value + 1);
  const result =
    phase === 'AS-IS' ? scenario.result?.before : scenario.result?.after;
  return (
    <Stack
      gap={2}
      align="start"
      role="group"
      aria-label={`${scenario.title}: ${phase}`}>
      <Text type="label">
        {phase} · {phase === 'AS-IS' ? '수정 전' : '수정 후'}
      </Text>
      {result && <Text type="large">{result}</Text>}
      <Control
        isDisabled={false}
        {...scenario.props}
        size={size}
        onSend={activate}
        onStop={activate}
      />
      <Text type="supporting" hasTabularNumbers>
        {scenario.props?.isStopShown ? '중지' : '전송'} 실행: {calls}회
      </Text>
    </Stack>
  );
}

const styles = stylex.create({
  row: {
    borderBlockEndStyle: 'solid',
    borderBlockEndWidth: 1,
    borderBlockEndColor: 'var(--color-border)',
  },
});

export const BeforeAfter: Story = {
  name: 'Send icon slot — AS-IS / TO-BE',
  render: ({size}, context) => {
    const mode = context.globals.colorMode === 'dark' ? 'dark' : 'light';
    return (
      <Theme theme={fallbackTheme} mode={mode}>
        <Stack gap={4} maxWidth={960}>
          <Heading level={1}>
            달라진 점: 테마의 전송 아이콘 설정을 반영합니다
          </Heading>
          <Text>
            전송 기능을 바꾼 수정이 아닙니다. 같은 테마 설정을 왼쪽은 무시하고,
            오른쪽은 반영합니다. 아래 두 예제의 아이콘을 비교해 보세요.
          </Text>
          <Text type="supporting">
            클릭 횟수가 양쪽에서 같은 것은 정상입니다. AS-IS는 기존 아이콘
            선택식을 재현하고, TO-BE는 수정된 실제 ChatSendButton을 사용합니다.
          </Text>
          <Stack gap={3}>
            {scenarios.map(scenario => (
              <Theme key={scenario.id} theme={scenario.theme} mode={mode}>
                {scenario.id === 'fallback' && (
                  <Heading level={2}>
                    추가 비교: 기본값·직접 지정·전송/중지
                  </Heading>
                )}
                <Grid columns={3} gap={4} align="center" xstyle={styles.row}>
                  <Stack gap={1} paddingBlock={3}>
                    <Text type="label">{scenario.title}</Text>
                    <Text type="code">{scenario.configuration}</Text>
                  </Stack>
                  <ComparisonAction
                    phase="AS-IS"
                    scenario={scenario}
                    size={size}
                  />
                  <ComparisonAction
                    phase="TO-BE"
                    scenario={scenario}
                    size={size}
                  />
                </Grid>
              </Theme>
            ))}
          </Stack>
          <Theme theme={mappedTheme} mode={mode}>
            <Stack direction="horizontal" gap={2} align="center">
              <Icon icon="arrowUp" size="sm" />
              <Text type="supporting">
                전송 슬롯을 check로 바꿔도 다른 곳에서 사용하는 arrowUp은
                그대로입니다.
              </Text>
            </Stack>
          </Theme>
          <Text type="supporting">
            Controls에서 sm/md 크기를 바꿀 수 있습니다. 버튼 크기, 접근 가능한
            Send/Stop 이름, 비활성 동작과 중지 기능은 유지됩니다.
          </Text>
        </Stack>
      </Theme>
    );
  },
};
