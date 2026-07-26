# ComfyUI Integration — v0.6

AI Outfit Studio v0.6 can send the active texture document, an inpainting mask, and an optional prepared reference image to a local or remote ComfyUI server.

## Requirements

- ComfyUI must be running and reachable over HTTP.
- Default endpoint: `http://127.0.0.1:8188`
- The workflow must be exported in **API format**, not the normal UI workflow format.
- The workflow must end with a node that returns an image, normally `SaveImage`.

## Quick start with the included example

1. Open `examples/comfyui/aos-sdxl-inpaint-api-workflow.json` in a text editor.
2. Replace `YOUR_CHECKPOINT.safetensors` with a checkpoint filename installed in ComfyUI.
3. In AI Outfit Studio, open a 2D texture document.
4. In `AI ASSIST`, test the endpoint.
5. Load the edited workflow JSON.
6. Select an AI edit range and run generation.

The example uses only common ComfyUI nodes:

- CheckpointLoaderSimple
- LoadImage
- ImageToMask
- CLIPTextEncode
- VAEEncodeForInpaint
- KSampler
- VAEDecode
- SaveImage

## Tokens

The following tokens are replaced before the workflow is queued:

- `__AOS_INPUT_IMAGE__`
- `__AOS_MASK_IMAGE__`
- `__AOS_POSITIVE_PROMPT__`
- `__AOS_NEGATIVE_PROMPT__`
- `__AOS_REFERENCE_IMAGE__`
- `__AOS_REFERENCE_STRENGTH__`
- `__AOS_DENOISE__`
- `__AOS_TEMPLATE_PRESERVE__`
- `__AOS_MODE__`
- `__AOS_OUTPUT_PREFIX__`
- `__AOS_SEED__`

AI Outfit Studio also tries to detect common `LoadImage`, `CLIPTextEncode`, and `SaveImage` nodes by class type and node title. Tokens remain the most reliable method when a workflow contains several image loaders or text encoders.

## Reference preparation

`REFERENCE PREP` can remove a simple background from the selected reference image before generation. The transparent result is persisted as an `AI GENERATED` asset and added to the active texture document as a layer.

Because the prepared result becomes part of the input canvas, the included img2img workflow can already react to it. Workflows containing IPAdapter or another reference-image node can also consume the separate `__AOS_REFERENCE_IMAGE__` input.

For automatic image-loader assignment, give the reference `LoadImage` node a title containing `reference`, `style`, or `ipadapter`.

## Mask modes

### Template Alpha

White mask is generated from the opaque region of the VRoid template. Use this to redesign the entire garment area while keeping the original canvas and transparent margins.

### Selected Layer Eraser

The circular eraser strokes on the selected layer become the white inpainting region. Use this for local repairs or adding details.

### Full Canvas

The whole canvas becomes editable. This is not recommended for strict VRoid UV workflows unless the workflow restores transparency afterward.

## Output handling

The first image returned by the ComfyUI history entry is downloaded and stored under Electron's application data directory. It is registered as an `AI GENERATED` asset and, when enabled, added to the active texture document as a new non-destructive layer.

## Troubleshooting

- **Connection failed:** Confirm ComfyUI is running and the endpoint includes the correct port.
- **No output image:** Add or verify a `SaveImage` node.
- **Node validation error:** Confirm the workflow is API JSON and the checkpoint name exists.
- **Mask has no effect:** Use a separate `LoadImage` for `__AOS_MASK_IMAGE__`, convert its red channel with `ImageToMask`, and connect it to the inpaint encoder.
- **Selected Layer Eraser error:** Select a layer and draw at least one eraser stroke before running AI.
