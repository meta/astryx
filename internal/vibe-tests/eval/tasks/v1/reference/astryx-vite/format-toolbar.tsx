// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Text} from '@astryxdesign/core/Text';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {VStack} from '@astryxdesign/core/VStack';

const FORMATS = [
  {name: 'Bold', shortcut: 'Ctrl+B'},
  {name: 'Italic', shortcut: 'Ctrl+I'},
  {name: 'Underline', shortcut: 'Ctrl+U'},
];

export default function App() {
  const [active, setActive] = useState<string[]>([]);
  const ordered = FORMATS.map(format => format.name).filter(name =>
    active.includes(name),
  );
  return (
    <VStack gap={3} padding={6}>
      <Toolbar
        label="Formatting"
        startContent={FORMATS.map(format => (
          <ToggleButton
            key={format.name}
            label={format.name}
            tooltip={`${format.name} (${format.shortcut})`}
            isPressed={active.includes(format.name)}
            onPressedChange={isPressed =>
              setActive(current =>
                isPressed
                  ? [...current, format.name]
                  : current.filter(name => name !== format.name),
              )
            }
          />
        ))}
      />
      <Text>Active: {ordered.length > 0 ? ordered.join(', ') : 'none'}</Text>
    </VStack>
  );
}
