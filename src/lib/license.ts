import { ed25519 } from "@noble/curves/ed25519.js";
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

// ZEROS License Center (Ed25519) — public key only.
const CENTER_ED25519_X = "I8bxvA6KUttkVCRiHQ71unJDTACbePyJ1av7qwLzpj8";
const PRODUCT_CODE = "ZEROS-GROCERY";

export type LicenseCheck = "ok" | "invalid" | "machine" | "product";

export function checkCenterKey(machineId: string, key: string): LicenseCheck {
  try {
    const parts = key.trim().split(".");
    if (parts.length !== 3 || parts[0] !== "ZEROS1") return "invalid";
    const payloadBytes = b64uToBytes(parts[1]!);
    const sig = b64uToBytes(parts[2]!);
    if (sig.length !== 64) return "invalid";
    if (!ed25519.verify(sig, payloadBytes, b64uToBytes(CENTER_ED25519_X))) return "invalid";
    const p = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (p.v !== 1 || p.lifetime !== true) return "invalid";
    if (p.product !== PRODUCT_CODE) return "product";
    if (String(p.machine ?? "").toUpperCase() !== machineId.trim().toUpperCase()) return "machine";
    return "ok";
  } catch {
    return "invalid";
  }
}

async function verifyLegacyKey(machineId: string, key: string): Promise<boolean> {
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

export async function checkKey(machineId: string, key: string): Promise<LicenseCheck> {
  const k = key.trim();
  if (k.startsWith("ZEROS1.")) return checkCenterKey(machineId, k);
  return (await verifyLegacyKey(machineId, k)) ? "ok" : "invalid";
}

export async function verifyKey(machineId: string, key: string): Promise<boolean> {
  return (await checkKey(machineId, key)) === "ok";
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

export { bytesToB64u };
