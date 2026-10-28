import { createContext, useContext } from 'react';

export interface PickedFile {
  id: number;
  file: File;
  /** Preview for images (revoked when removed). */
  url: string | null;
  /** Why it can't be sent, or null when ready. */
  problem: string | null;
}

const TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const EXTENSIONS = /\.(jpe?g|png|pdf)$/i;

/** Checked again by the server (which looks at the file content, not the name). */
export function fileProblem(file: File, maxFileMb: number): string | null {
  if (!TYPES.includes(file.type) && !EXTENSIONS.test(file.name)) return 'รองรับเฉพาะ JPG, PNG, PDF';
  if (file.size > maxFileMb * 1024 * 1024) return `ไฟล์ใหญ่เกิน ${maxFileMb} MB`;
  if (file.size === 0) return 'ไฟล์ว่างเปล่า';
  return null;
}

export interface ScanFilesValue {
  files: PickedFile[];
  add: (files: File[], maxFileMb: number) => void;
  remove: (id: number) => void;
  clear: () => void;
  /** Result of the last send: codes on success, message on failure. */
  result: { codes: string[] } | { error: string } | null;
  setResult: (result: ScanFilesValue['result']) => void;
}

export const ScanFilesContext = createContext<ScanFilesValue | null>(null);

export function useScanFiles() {
  const value = useContext(ScanFilesContext);
  if (!value) throw new Error('useScanFiles outside ScanFilesProvider');
  return value;
}
