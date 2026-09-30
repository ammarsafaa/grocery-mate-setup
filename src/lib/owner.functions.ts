import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type OwnerSession = { unlocked?: boolean };

const sessionConfig = () => ({
  password: process.env["SESSION_SECRET"]!,
  name: "zeros-owner",
  maxAge: 60 * 60 * 12,
  cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
});

function matches(a: string, b: string) {
  const x = createHash("sha256").update(a, "utf8").digest();
  const y = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(x, y);
}

function b64u(buf: ArrayBuffer) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const ownerStatus = createServerFn({ method: "GET" }).handler(async () => {
  const s = await useSession<OwnerSession>(sessionConfig());
  return { unlocked: !!s.data.unlocked };
});

export const ownerLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => ({ password: String(d.password ?? "").slice(0, 200) }))
  .handler(async ({ data }) => {
    const expected = process.env["OWNER_PASSWORD"];
    if (!expected || !matches(data.password, expected)) return { ok: false };
    const s = await useSession<OwnerSession>(sessionConfig());
    await s.update({ unlocked: true });
    return { ok: true };
  });

export const ownerLogout = createServerFn({ method: "POST" }).handler(async () => {
  const s = await useSession<OwnerSession>(sessionConfig());
  await s.clear();
  return { ok: true };
});

export const issueLicense = createServerFn({ method: "POST" })
  .inputValidator((d: { machineId: string }) => {
    const id = String(d.machineId ?? "").trim().toUpperCase();
    if (!/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(id)) throw new Error("bad-id");
    return { machineId: id };
  })
  .handler(async ({ data }) => {
    const s = await useSession<OwnerSession>(sessionConfig());
    if (!s.data.unlocked) return { ok: false as const, error: "locked" };
    const raw = process.env["LICENSE_PRIVATE_KEY"];
    if (!raw) return { ok: false as const, error: "no-key" };
    try {
      const jwk = JSON.parse(Buffer.from(raw.trim(), "base64").toString("utf8")) as JsonWebKey;
      const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(data.machineId));
      return { ok: true as const, key: b64u(sig) };
    } catch {
      return { ok: false as const, error: "bad-key" };
    }
  });
