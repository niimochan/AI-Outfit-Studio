# Sprint 05 — AI Texture Assist Foundation

## Goal

Connect the non-destructive texture editor to ComfyUI without allowing AI to control canvas dimensions, UV layout, project persistence, or export guarantees.

## Delivered

- ComfyUI endpoint configuration and connection test
- API workflow JSON import
- Automatic common-node mapping plus explicit workflow tokens
- Current texture document upload
- Template-alpha, selected-layer-eraser, and full-canvas masks
- Prompt and negative prompt controls
- Queue submission, polling, timeout, output download, and error handling
- Generated image persistence under application data
- Generated assets and non-destructive result layers
- AI job history in `.aos` Schema 4
- Layer auto-fit modes: contain, cover, stretch, and original size
- Schema 1–3 migration to Schema 4

## Non-goals

- Bundling ComfyUI or model files
- Installing checkpoints or custom nodes
- Guaranteeing compatibility with every third-party workflow
- SAM2 or RemBG segmentation in this release
- Cloud AI providers in this release
