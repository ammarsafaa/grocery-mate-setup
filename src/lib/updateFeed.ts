/** Files the Windows updater may request from the private release feed. */
export function isAllowedUpdateFile(name: string): boolean {
  return /^(latest\.yml|Zeros-Setup-\d+\.\d+\.\d+\.exe(\.blockmap)?)$/.test(name);
}

export function parseRepo(value: string | undefined): { owner: string; repo: string } | null {
  const m = String(value ?? "").trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").match(/^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}