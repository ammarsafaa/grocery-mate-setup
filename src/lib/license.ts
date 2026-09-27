import { getLicense, saveLicense } from "./db";

/**
 * Offline licensing. The owner signs the machine code with a private key
 * (kept outside the app). The app only holds the public key and verifies.
 * In the Windows build the machine code comes from the hardware ID.
 */
const PUBLIC_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "oFO-LnjjfLrZ86m4p4TNd7oC7IeTZi6tzhJEByhNiOk",
  y: "XKgvz5k0AYk1KY3xvOihlLPP2sRtDruuy4CXgi6r1oc",
};

const MID_KEY = "grocery-pos:machine";

export function getMachineId(): string {
  const w = window as unknown as { posNative?: { machineId?: () => string } };
  const native = w.posNative?.machineId?.();
  if (native) return native;
  let id = localStorage.getItem(MID_KEY);
  if (!id) {
    const b = crypto.getRandomValues(new Uint8Array(6));
    id = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
    id = id.match(/.{4}/g)!.join("-");
    localStorage.setItem(MID_KEY, id);
  }
  return id;
}

function b64uToBytes(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, ""));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
function bytesToB64u(b: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verifyKey(machineId: string, key: string): Promise<boolean> {
  try {
    const pub = await crypto.subtle.importKey("jwk", PUBLIC_JWK, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      b64uToBytes(key.trim()) as BufferSource,
      new TextEncoder().encode(machineId),
    );
  } catch {
    return false;
  }
}

export async function isLicensed(): Promise<boolean> {
  const l = getLicense();
  if (!l.activated || !l.key) return false;
  const mid = getMachineId();
  if (l.machineId !== mid) return false;
  return verifyKey(mid, l.key);
}

export async function activate(key: string): Promise<boolean> {
  const mid = getMachineId();
  if (!(await verifyKey(mid, key))) return false;
  saveLicense({ activated: true, key: key.trim(), machineId: mid, activatedAt: new Date().toISOString() });
  return true;
}

/** Owner tool: sign a machine code with the private key (base64 JWK text). */
export async function generateKey(privateKeyText: string, machineId: string): Promise<string> {
  const jwk = JSON.parse(atob(privateKeyText.trim())) as JsonWebKey;
  const priv = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, new TextEncoder().encode(machineId.trim().toUpperCase()));
  return bytesToB64u(sig);
}
