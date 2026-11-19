// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState(false);
  const [projects, setProjects] = useState<string[]>([]);
  const onOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setName('');
      setError(false);
    }
  };
  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button>New project</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-2"
            onSubmit={event => {
              event.preventDefault();
              if (name.trim() === '') {
                setError(true);
                return;
              }
              setProjects([...projects, name.trim()]);
              onOpenChange(false);
            }}>
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              autoFocus
              value={name}
              onChange={event => setName(event.target.value)}
              aria-invalid={error}
              aria-describedby={error ? 'project-name-error' : undefined}
            />
            {error && (
              <p id="project-name-error" className="text-sm text-destructive">
                Enter a project name
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ul>
        {projects.map(project => (
          <li key={project}>{project}</li>
        ))}
      </ul>
    </div>
  );
}
