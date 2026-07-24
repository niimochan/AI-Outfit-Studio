# Architecture — v0.3 Material Preview Foundation

## 目的

実機確認済みのVRM表示・プロジェクト管理基盤の上に、非破壊のマテリアルプレビュー層を追加します。

## レイヤー

```text
Electron Main Process
  ├─ Window lifecycle / menu
  ├─ Native file dialogs
  ├─ .aos read / write and Schema migration
  ├─ Recent projects
  └─ Unsaved-close guard

Preload Bridge
  └─ Typed IPC surface

React Renderer
  ├─ Project and runtime asset state
  ├─ Material override state
  ├─ Asset browser / Inspector
  ├─ Material list and controls
  └─ VRM viewport integration

Common Package
  ├─ Application constants
  ├─ Schema 2 project types
  ├─ Asset metadata
  └─ Material override contract

VRM Engine Package
  ├─ Three.js / three-vrm loading
  ├─ Unique material discovery
  ├─ Original material snapshots
  ├─ Runtime texture loading
  ├─ Color / opacity / UV transforms
  ├─ Restore and GPU cleanup
  └─ Camera, lighting and metrics
```

## 非破壊マテリアル処理

1. VRMロード後に各ユニークマテリアルを走査する
2. 元のMap、Color、Opacity、Transparent、AlphaTest、DepthWriteをスナップショットする
3. 編集内容は`AosMaterialOverride`としてRenderer stateに保持する
4. テンプレート画像はObject URL経由でThree.js Textureへ変換する
5. glTF互換のため`flipY = false`、色空間はsRGBに設定する
6. 同じ画像のUV・色変更時はTextureを再利用する
7. 復元時は元スナップショットへ戻す
8. 差し替え・VRM削除・アプリ終了時に生成Textureを破棄する

## プロジェクト保存

マテリアル編集は画像そのものを埋め込まず、テンプレートAsset IDへの参照と数値設定のみ保存します。元画像が見つからない場合は、色・不透明度は適用し、テクスチャは元のMapへフォールバックします。

## セキュリティ境界

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- RendererへNode APIを直接公開しない
- ファイルI/OはMain processへ限定
- 外部URLはOSブラウザで開く

## 次の分離方針

- `packages/project-core`: スキーマ検証・マイグレーション
- `packages/texture-engine`: UV固定、レイヤー、マスク、合成、PNG出力
- `packages/material-engine`: MToonのShade / Rim / Emission管理
- `packages/plugin-sdk`: AI・出力プラグイン契約
- `plugins/comfyui`: ComfyUI連携
