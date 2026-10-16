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
- Receipt and shift report printing both render from src/lib/printLayout.ts (mm-positioned elements, per kind and paper slot); the designer preview uses the same content and CSS so preview matches print.
- Licensing keys are issued only from the password-gated web page /owner (server-side signing with LICENSE_PRIVATE_KEY secret); the in-app generator was removed so customers never see it.
- Multi-cashier sync: each cashier keeps local SQLite and syncs to an optional in-store SQL Server via src/lib/sync.ts (records upserted by id with a server sequence, product stock synced as deltas) so selling never depends on the network.
- The sync on/off state lives in its own meta record (meta:syncLinked via isSyncLinked/setSyncLinked), not in the settings object, so stale settings saves can never switch auto-reconnect off; only the admin's checkbox turns it off.
- Licensing accepts two key types: legacy ECDSA P-256 signatures and ZEROS License Center keys (ZEROS1.payload.signature, Ed25519 via @noble/curves); only public keys live in src/lib/license.ts so activation stays offline.
- Aclas LS6 scales are driven over LAN by running the bundled official electron/aclas/AclasSDKConsole.exe (PLU download as UTF-16 tab file) from src/lib/aclas.ts; the SDK has no live-weight call, so sales use the weight-barcode label.
- Settings sections remain mounted while hidden behind top navigation so switching sections preserves unsaved inputs and device-operation state.
- POS product and group grids use fixed-width square tiles driven by the same persisted, bounded size option; unused row space stays outside tiles so the chosen size controls the actual box, not just its image.
- Weighted offers reuse product offer quantity/price fields as weight and total price; shared pricing applies proportionally before cash rounding across live weight, manual entry and weight barcodes, while price-encoded labels retain their encoded amount.
- POS line amounts remain exact across weight entry and barcode paths; optional settlement rounding is centralized in saleTotal after the invoice discount so posted totals and change use one consistent amount.
- Cashier screens must stay usable at 1024x768, adapting with the `narrow`/`short` variants defined in src/styles.css instead of new ad-hoc breakpoints, so one layout serves every register size.
- Windows private updates use a Cloud release proxy; GitHub credentials stay server-side and the installer carries only a restricted download key, so clients cannot access repository contents.
- Update notifications mount once in the root; installation must wait for closed shifts and a successful SQLite backup, so updates cannot interrupt selling or lose the recovery copy.
