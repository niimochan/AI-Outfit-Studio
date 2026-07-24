AI Outfit Studio v0.2.1 TypeScript 7 compatibility patch

1. Copy the contents of this folder into the root AI-Outfit-Studio folder.
2. Overwrite apps/desktop/tsconfig.electron.json.
3. Run:
   npm.cmd run typecheck
   npm.cmd run dev

Change:
- module: CommonJS -> NodeNext
- moduleResolution: Node -> NodeNext
