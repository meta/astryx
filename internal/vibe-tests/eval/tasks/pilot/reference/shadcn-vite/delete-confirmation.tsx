// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {Button} from '@/components/ui/button';

export default function App() {
  const [files, setFiles] = useState([
    'Q1 report.pdf',
    'Q2 report.pdf',
    'Q3 report.pdf',
  ]);
  return (
    <div className="flex flex-col gap-2 p-6">
      {files.map(file => (
        <div key={file} className="flex items-center gap-2">
          <span>{file}</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" aria-label={`Delete ${file}`}>
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete file?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete {file}?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() =>
                    setFiles(current => current.filter(other => other !== file))
                  }>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
    </div>
  );
}
