import { createFileRoute } from "@tanstack/react-router";
import { isAllowedUpdateFile, parseRepo, sameSecret } from "@/lib/updateFeed";

// Private GitHub release feed for the Windows app. GitHub token stays server-side.
export const Route = createFileRoute("/api/public/updates/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const key = process.env["UPDATE_DOWNLOAD_KEY"] ?? "";
        const token = process.env["GITHUB_UPDATE_TOKEN"] ?? "";
        const repo = parseRepo(process.env["GITHUB_UPDATE_REPO"]);
        if (!key || !token || !repo) return new Response("خدمة التحديث غير مهيأة", { status: 503 });
        if (!sameSecret(request.headers.get("x-zeros-update-key") ?? "", key)) return new Response("غير مصرح", { status: 401 });
        const name = String(params._splat ?? "");
        if (!isAllowedUpdateFile(name)) return new Response("ملف غير مسموح", { status: 404 });

        const gh = { Authorization: `Bearer ${token}`, "User-Agent": "zeros-updater", "X-GitHub-Api-Version": "2022-11-28" };
        const rel = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`, { headers: { ...gh, Accept: "application/vnd.github+json" } });
        if (!rel.ok) return new Response("تعذر قراءة الإصدار", { status: rel.status === 404 ? 404 : 502 });
        const data = (await rel.json()) as { assets?: Array<{ name: string; url: string }> };
        const asset = data.assets?.find((a) => a.name === name);
        if (!asset) return new Response("الملف غير موجود", { status: 404 });
        if (!asset.url.startsWith(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/assets/`)) return new Response("مصدر غير مسموح", { status: 502 });

        const first = await fetch(asset.url, { headers: { ...gh, Accept: "application/octet-stream" }, redirect: "manual" });
        let file = first;
        const loc = first.headers.get("location");
        if (first.status >= 300 && first.status < 400 && loc) {
          const target = new URL(loc);
          if (target.protocol !== "https:" || !["release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(target.hostname)) return new Response("مصدر غير مسموح", { status: 502 });
          const range = request.headers.get("range");
          file = await fetch(loc, { headers: range ? { Range: range } : {} }); // signed URL, no token sent
        }
        if (!file.ok || !file.body) return new Response("تعذر تنزيل الملف", { status: 502 });
        const headers = new Headers({ "Content-Type": name.endsWith(".yml") ? "text/yaml" : "application/octet-stream", "Cache-Control": "no-store" });
        for (const h of ["content-length", "content-range", "accept-ranges"]) { const v = file.headers.get(h); if (v) headers.set(h, v); }
        return new Response(file.body, { status: file.status, headers });
      },
    },
  },
});