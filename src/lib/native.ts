/** Bridge to the Windows app (Electron). Undefined in the browser preview. */
export interface PosNative {
  machineId: () => string;
  pickFolder: () => Promise<string | null>;
  saveBackup: (folder: string, name: string, content: string) => Promise<boolean>;
  readWeight: (host: string, port: number) => Promise<{ ok: boolean; weight?: number; error?: string }>;
  dbGetAll: () => Record<string, string>;
  dbSet: (key: string, value: string) => boolean;
  backupDb: (folder: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  listPrinters: () => Promise<Array<{ name: string; displayName?: string; isDefault?: boolean }>>;
  printReceipt: (html: string, printerName: string, copies: number) => Promise<{ ok: boolean; error?: string }>;
  onCloseRequested?: (cb: () => void) => () => void;
  quitApp?: () => void;
}

export function native(): PosNative | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { posNative?: PosNative }).posNative;
}
