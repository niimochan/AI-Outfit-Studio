# AI Outfit Studio v0.2.2 Update

This maintenance update fixes the false error shown by the development launcher after the Electron window is closed normally.

## Changed files

- `apps/desktop/package.json`
- `package.json`
- `START_DEV.bat`
- `CHANGELOG.md`

## Validation

Run:

```powershell
npm.cmd run typecheck
npm.cmd run dev
```

Close the application window. The terminal should finish without an npm lifecycle error.
