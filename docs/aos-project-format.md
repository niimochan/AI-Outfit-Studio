# `.aos` Project Format — Schema 2

## Status

- Application version: 0.3.1
- Schema version: 2
- Encoding: UTF-8 JSON
- Storage model: linked assets
- Backward compatibility: Schema 1 is migrated automatically

## Example

```json
{
  "schemaVersion": 2,
  "appVersion": "0.3.1",
  "id": "7e6d90a7-...",
  "name": "Akane Outfit Project",
  "createdAt": "2026-07-24T12:00:00.000Z",
  "updatedAt": "2026-07-25T01:00:00.000Z",
  "assets": {
    "avatar": {
      "id": "avatar-id",
      "kind": "avatar",
      "name": "avatar.vrm",
      "sourcePath": "C:\\Projects\\avatar.vrm",
      "size": 12345678,
      "mimeType": "model/gltf-binary",
      "importedAt": "2026-07-24T12:05:00.000Z"
    },
    "references": [],
    "templates": [
      {
        "id": "texture-id",
        "kind": "template",
        "name": "Tops.png",
        "sourcePath": "C:\\Projects\\Tops.png",
        "size": 345678,
        "mimeType": "image/png",
        "importedAt": "2026-07-25T00:30:00.000Z"
      }
    ]
  },
  "materialOverrides": [
    {
      "materialKey": "material-004",
      "materialName": "M_CLOTH_00",
      "textureAssetId": "texture-id",
      "color": "#ffffff",
      "opacity": 1,
      "repeatX": 1,
      "repeatY": 1,
      "offsetX": 0,
      "offsetY": 0
    }
  ]
}
```

## Asset kinds

- `avatar`: VRMモデル。1プロジェクトにつき最大1件
- `reference`: 衣装の参考画像。複数件
- `template`: VRoid向けUVテンプレートまたはプレビュー用テクスチャ。複数件

## Material overrides

`materialOverrides`は元VRMを変更せず、アプリ内プレビューへ適用する差分設定です。

- `materialKey`: VRMロード時に割り当てる安定化キー
- `materialName`: UI表示と診断用の元マテリアル名
- `textureAssetId`: `assets.templates`内の画像ID。`null`なら元テクスチャ
- `color`: Base Colorへ乗算するsRGBカラー
- `opacity`: 0〜1
- `repeatX`, `repeatY`: UV繰り返し倍率
- `offsetX`, `offsetY`: UVオフセット

## Migration

Schema 1を開いた場合、Main processが次の変換を行います。

```json
{
  "schemaVersion": 2,
  "materialOverrides": []
}
```

元ファイルは開いただけでは書き換えません。次回保存時にSchema 2として保存されます。

## Portability

Schema 2も`sourcePath`に絶対パスを保存するリンク型です。元ファイルが移動・削除された場合、アプリは該当アセットを読み込まず、見つからないパス数を通知します。

ポータブルプロジェクトは将来のSchemaで導入予定です。
