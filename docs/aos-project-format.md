# `.aos` Project Format — Schema 3

## Status

- Application version: 0.4.0
- Schema version: 3
- Encoding: UTF-8 JSON
- Storage model: linked assets
- Backward compatibility: Schema 1 / 2を自動移行

## Top-level fields

```json
{
  "schemaVersion": 3,
  "appVersion": "0.4.0",
  "id": "project-uuid",
  "name": "Akane Outfit Project",
  "createdAt": "2026-07-25T01:00:00.000Z",
  "updatedAt": "2026-07-25T02:00:00.000Z",
  "assets": {
    "avatar": null,
    "references": [],
    "templates": []
  },
  "materialOverrides": [],
  "textureDocuments": []
}
```

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
      "sourceAssetId": "reference-asset-uuid",
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

## Virtual texture IDs

Texture Documentの合成結果は、実ファイルではなく次の仮想IDでMaterial Overrideから参照します。

```text
texture-document:<document-id>
```

プロジェクトを開いた際は、リンクされた元画像とTexture Documentの設定からPNGを再生成します。

## Material overrides

`materialOverrides`は元VRMを変更せず、アプリ内プレビューへ適用する差分設定です。`textureAssetId`は次のいずれかです。

- `assets.templates`内の画像ID
- `texture-document:<document-id>`
- `null`：元テクスチャ

## Migration

- Schema 1 → `materialOverrides: []`と`textureDocuments: []`を追加
- Schema 2 → `textureDocuments: []`を追加
- 読み込み時にメモリ上でSchema 3へ正規化
- 元ファイルは開いただけでは変更せず、次回保存時にSchema 3で保存

## Portability

Schema 3も`sourcePath`に絶対パスを保存するリンク型です。元のVRM・参考画像・テンプレートを移動または削除すると、該当レイヤーやテンプレートを復元できません。
