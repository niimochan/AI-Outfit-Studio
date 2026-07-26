# `.aos` Project Format — Schema 6

## Status

- Application version: 0.6.1
- Schema version: 6
- Encoding: UTF-8 JSON
- Storage model: linked assets
- Backward compatibility: Schema 1 / 2 / 3 / 4 / 5を自動移行

## Top-level fields

```json
{
  "schemaVersion": 6,
  "appVersion": "0.6.1",
  "id": "project-uuid",
  "name": "Akane Outfit Project",
  "createdAt": "2026-07-25T01:00:00.000Z",
  "updatedAt": "2026-07-25T02:00:00.000Z",
  "assets": {
    "avatar": null,
    "references": [],
    "templates": [],
    "generated": []
  },
  "materialOverrides": [],
  "textureDocuments": [],
  "aiSettings": {},
  "aiJobs": []
}
```

## Assets

`assets.generated`にはComfyUIから取得してElectronのユーザーデータ領域へ保存した画像へのリンクを記録します。構造は参考画像・テンプレートと同じ`AosProjectAsset`です。

## Texture document

```json
{
  "id": "texture-document-uuid",
  "name": "Tops Edit",
  "templateAssetId": "template-asset-uuid",
  "width": 2048,
  "height": 2048,
  "maskToTemplateAlpha": true,
  "showTemplateBase": true,
  "createdAt": "2026-07-25T01:10:00.000Z",
  "updatedAt": "2026-07-25T01:20:00.000Z",
  "layers": [
    {
      "id": "layer-uuid",
      "name": "Reference.png",
      "sourceAssetId": "reference-or-generated-asset-uuid",
      "visible": true,
      "opacity": 1,
      "blendMode": "source-over",
      "x": 1024,
      "y": 1024,
      "scaleX": 0.8,
      "scaleY": 0.8,
      "rotation": 0,
      "eraserStrokes": [
        { "id": "stroke-uuid", "x": 530, "y": 412, "radius": 48 }
      ]
    }
  ]
}
```

### Blend modes

- `source-over`: 通常
- `multiply`: 乗算
- `screen`: スクリーン
- `overlay`: オーバーレイ

## AI settings

```json
{
  "provider": "comfyui",
  "endpoint": "http://127.0.0.1:8188",
  "workflowName": "aos-sdxl-inpaint-api-workflow.json",
  "workflowJson": "{ ... }",
  "positivePrompt": "high quality VRoid clothing texture",
  "negativePrompt": "text, watermark",
  "maskMode": "template-alpha",
  "mode": "reference-guided",
  "referenceAssetId": "reference-asset-uuid",
  "referenceStrength": 0.7,
  "denoiseStrength": 0.55,
  "templatePreserve": 0.85,
  "referencePrep": {
    "extractMode": "auto-corners",
    "threshold": 0.14,
    "feather": 0.08,
    "fitMode": "template-bounds",
    "padding": 0.04
  },
  "timeoutSeconds": 300,
  "autoAddResultLayer": true
}
```

`maskMode`は以下のいずれかです。

- `template-alpha`
- `selected-layer-eraser`
- `full-canvas`

`referencePrep`は参考画像のローカル前処理設定です。

- `extractMode`: `auto-corners` / `white-background` / `black-background` / `alpha-only`
- `threshold`: 背景との色距離しきい値
- `feather`: Alpha境界のぼかし幅
- `fitMode`: `template-bounds` / `contain` / `cover`
- `padding`: テンプレートAlpha範囲内の余白

## AI jobs

```json
{
  "id": "job-uuid",
  "provider": "comfyui",
  "documentId": "texture-document-uuid",
  "documentName": "Tops Edit",
  "status": "completed",
  "positivePrompt": "...",
  "negativePrompt": "...",
  "maskMode": "template-alpha",
  "mode": "reference-guided",
  "referenceAssetId": "reference-asset-uuid",
  "referenceAssetName": "Reference Outfit.jpg",
  "workflowName": "aos-reference-workflow.json",
  "createdAt": "2026-07-25T01:30:00.000Z",
  "completedAt": "2026-07-25T01:31:00.000Z",
  "promptId": "comfyui-prompt-id",
  "outputAssetId": "generated-asset-uuid",
  "error": null
}
```

アプリが異常終了し、`running`の履歴が残った場合は、次回読込時に失敗扱いへ正規化します。

## Virtual texture IDs

Texture Documentの合成結果は、実ファイルではなく次の仮想IDでMaterial Overrideから参照します。

```text
texture-document:<document-id>
```

プロジェクトを開いた際は、リンクされた元画像とTexture Documentの設定からPNGを再生成します。

## Material overrides

`materialOverrides`は元VRMを変更せず、アプリ内プレビューへ適用する差分設定です。`textureAssetId`は次のいずれかです。

- `assets.templates`内の画像ID
- `assets.generated`内の画像ID
- `texture-document:<document-id>`
- `null`：元テクスチャ

## Migration

- Schema 1 → Material・Texture・AI関連の初期値を追加
- Schema 2 → Texture・AI関連の初期値を追加
- Schema 3 → `assets.generated`、`aiSettings`、`aiJobs`を追加
- Schema 4 → Reference-Aware AI設定の初期値を追加
- Schema 5 → `referencePrep`の初期値を追加
- 読み込み時にメモリ上でSchema 6へ正規化
- 元ファイルは開いただけでは変更せず、次回保存時にSchema 6で保存

## Portability

Schema 6も`sourcePath`に絶対パスを保存するリンク型です。元のVRM・参考画像・テンプレートを移動または削除すると復元できません。AI生成画像はElectronのユーザーデータ領域に保存されるため、別PCへ移動する場合は生成画像もコピーする必要があります。
