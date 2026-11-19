// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';

export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState(false);
  const [projects, setProjects] = useState<string[]>([]);
  const close = () => {
    setIsOpen(false);
    setName('');
    setError(false);
  };
  return (
    <VStack gap={3} padding={6}>
      <Button
        label="New project"
        variant="primary"
        onClick={() => setIsOpen(true)}
      />
      {projects.map(project => (
        <Text key={project}>{project}</Text>
      ))}
      <Dialog
        isOpen={isOpen}
        onOpenChange={open => (open ? setIsOpen(true) : close())}>
        <DialogHeader title="Create project" />
        <VStack gap={3} padding={4}>
          <TextInput
            label="Project name"
            value={name}
            onChange={setName}
            hasAutoFocus
            status={
              error
                ? {type: 'error', message: 'Enter a project name'}
                : undefined
            }
          />
          <HStack gap={2}>
            <Button label="Cancel" onClick={close} />
            <Button
              label="Create"
              variant="primary"
              onClick={() => {
                if (name.trim() === '') {
                  setError(true);
                  return;
                }
                setProjects([...projects, name.trim()]);
                close();
              }}
            />
          </HStack>
        </VStack>
      </Dialog>
    </VStack>
  );
}
