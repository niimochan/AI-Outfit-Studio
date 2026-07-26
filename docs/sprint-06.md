# Sprint 06 — Auto Extract & Auto Fit Foundation

## Objective

Turn a user-selected clothing reference into a reusable transparent PNG and place it automatically on a VRoid texture template.

## Renderer pipeline

```text
Reference image
  -> Decode to Canvas
  -> Estimate background color
  -> Convert background similarity to alpha
  -> Feather the alpha boundary
  -> Persist transparent PNG
  -> Detect source alpha bounds
  -> Detect template alpha bounds
  -> Calculate fit transform
  -> Add generated layer
```

## Extraction modes

- `auto-corners`: average visible pixels sampled from the four corners.
- `white-background`: fixed white background model.
- `black-background`: fixed black background model.
- `alpha-only`: preserve the existing alpha channel without color removal.

## Fit modes

- `template-bounds`: fit the extracted visible content inside the template alpha bounding box.
- `contain`: fit the complete extracted image inside the texture canvas.
- `cover`: cover the complete texture canvas.

## Persistence

Extracted images are written to Electron's generated asset directory. The returned file payload is registered in `assets.generated`, allowing the output to survive project reopen.

## Limitations

This is color-distance extraction rather than semantic segmentation. Complex scenery and low-contrast clothing backgrounds are intentionally deferred to a later segmentation sprint.
