<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Licensing: offline ECDSA P-256 signature of machine ID; only public key in app (src/lib/license.ts), private key held by owner — no server needed.
- Windows app: Electron shell in electron/, builds SPA via ELECTRON_BUILD=1, copies the UI to resources/app, and publishes the installer through GitHub Actions on windows-latest (can't build exe in sandbox).
- Branding: Zeros uses the supplied grocery-cart logo in the UI, favicon, Windows window, installer, uninstaller, and desktop shortcut so the identity remains consistent offline.
- Business records use append-only stock movements; posted purchases are reversed on cancellation so inventory history remains auditable.
- Receipt layouts are stored as structured element settings per paper width, not arbitrary HTML, to keep printing safe and portable.
- Receipt element positioning uses bounded per-element offsets and a 4 mm print safe area on each edge to prevent thermal-printer clipping.
