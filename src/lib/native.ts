/** Bridge to the Windows app (Electron). Undefined in the browser preview. */
export interface PosNative {
  machineId: () => string;
  pickFolder: () => Promise<string | null>;
  saveBackup: (folder: string, name: string, content: string) => Promise<boolean>;
  readWeight: (host: string, port: number) => Promise<{ ok: boolean; weight?: number; error?: string }>;
}

export function native(): PosNative | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { posNative?: PosNative }).posNative;
}
