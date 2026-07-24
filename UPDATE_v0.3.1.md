# AI Outfit Studio v0.3.1 Update

This patch fixes TypeScript 7 error TS2367 in `apps/desktop/electron/main.ts`.

## Apply

Copy the contents of the update package into the existing `AI-Outfit-Studio` repository and overwrite files.

Then run:

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run dev
```
