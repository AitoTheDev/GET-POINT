import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import {
  fileProblem,
  type PickedFile,
  ScanFilesContext,
  type ScanFilesValue,
} from './scanFilesContext';

/** Keeps the chosen receipts while moving between the scan page and its result screens. */
export function ScanFilesProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [result, setResult] = useState<ScanFilesValue['result']>(null);
  const nextId = useRef(1);

  const add = useCallback((picked: File[], maxFileMb: number) => {
    setFiles((current) => [
      ...current,
      ...picked.map((file) => ({
        id: nextId.current++,
        file,
        url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        problem: fileProblem(file, maxFileMb),
      })),
    ]);
  }, []);

  const remove = useCallback((id: number) => {
    setFiles((current) => {
      const gone = current.find((f) => f.id === id);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return current.filter((f) => f.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setFiles((current) => {
      for (const f of current) if (f.url) URL.revokeObjectURL(f.url);
      return [];
    });
  }, []);

  const value = useMemo(
    () => ({ files, add, remove, clear, result, setResult }),
    [files, add, remove, clear, result],
  );
  return <ScanFilesContext.Provider value={value}>{children}</ScanFilesContext.Provider>;
}
