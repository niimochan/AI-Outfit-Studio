# `.aos` Project Format — Schema 1

## Status

- Application version: 0.2.0
- Schema version: 1
- Encoding: UTF-8 JSON
- Storage model: linked assets

## Example

```json
{
  "schemaVersion": 1,
  "appVersion": "0.2.0",
  "id": "7e6d90a7-...",
  "name": "Akane Outfit Project",
  "createdAt": "2026-07-24T12:00:00.000Z",
  "updatedAt": "2026-07-24T12:30:00.000Z",
  "assets": {
    "avatar": {
      "id": "...",
      "kind": "avatar",
      "name": "avatar.vrm",
      "sourcePath": "C:\\Projects\\avatar.vrm",
      "size": 12345678,
      "mimeType": "model/gltf-binary",
      "importedAt": "2026-07-24T12:05:00.000Z"
    },
    "references": [],
    "templates": []
  }
}
```

## Asset kinds

- `avatar`: VRMモデル。1プロジェクトにつき最大1件
- `reference`: 衣装の参考画像。複数件
- `template`: VRoid向けUVテンプレート。複数件

## Portability

Schema 1は`sourcePath`に絶対パスを保存します。元ファイルが移動・削除された場合、アプリは該当アセットを読み込まず、見つからないパス数を通知します。

ポータブルプロジェクトは将来のSchemaで導入予定です。候補構造：

```text
project.aos
├─ manifest.json
├─ assets/avatar/
├─ assets/references/
├─ assets/templates/
└─ cache/thumbnails/
```

既存Schema 1との後方互換性を維持し、マイグレーション処理を用意する方針です。
