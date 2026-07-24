# Architecture — v0.1 Foundation

## 目的

最初のマイルストーンでは、AI機能より先に安定したデスクトップ基盤とVRM表示機能を完成させます。

## レイヤー

```text
Electron Main Process
  ├─ Window lifecycle
  ├─ Security boundary
  └─ Native integrations (future)

Preload Bridge
  └─ Minimal typed IPC API

React Renderer
  ├─ Application shell
  ├─ Asset panels
  ├─ Inspector
  └─ Viewport component

VRM Engine Package
  ├─ Three.js scene
  ├─ GLTFLoader + VRMLoaderPlugin
  ├─ Camera / OrbitControls
  ├─ Lighting
  ├─ Resource lifecycle
  └─ Runtime metrics
```

## セキュリティ

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- RendererへNode APIを直接公開しない
- 外部URLはOSブラウザで開く
- Preload APIを必要最小限に制限する

## VRMロード

1. Rendererの`input[type=file]`でローカルVRMを取得
2. `URL.createObjectURL()`で一時URLを作成
3. `GLTFLoader`へ`VRMLoaderPlugin`を登録
4. VRMオブジェクトを抽出
5. 頂点・スケルトン・モーフを最適化
6. VRM 0.xの向きを補正
7. シーンへ追加
8. BoundingBoxからカメラを自動調整
9. 差し替え時にGPUリソースとObject URLを破棄

## 将来の分離方針

- `packages/project-core`: `.aos`保存形式
- `packages/asset-engine`: 画像・テンプレート管理
- `packages/texture-engine`: UV固定、レイヤー、マスク、合成
- `packages/plugin-sdk`: AI・出力プラグイン契約
- `plugins/comfyui`: ComfyUI連携
