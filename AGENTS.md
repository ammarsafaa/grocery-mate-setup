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
- Business records use append-only stock movements; posted purchases are reversed on cancellation so inventory history remains auditable.
- Receipt layouts are stored as structured element settings per paper width, not arbitrary HTML, to keep printing safe and portable.
