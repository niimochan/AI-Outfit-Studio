# Architecture — v0.2 Asset & Project Foundation

## 目的

実機確認済みのVRM表示基盤を維持しながら、作業を保存・再開できるデスクトップアプリケーションへ発展させます。

## レイヤー

```text
Electron Main Process
  ├─ Window lifecycle
  ├─ Application menu
  ├─ Native file dialogs
  ├─ .aos read / write
  ├─ Recent projects persistence
  ├─ Linked asset hydration
  └─ Unsaved-close guard

Preload Bridge
  ├─ Typed IPC surface
  ├─ File path resolution
  └─ Renderer command subscription

React Renderer
  ├─ Project state
  ├─ Runtime asset state
  ├─ Asset browser
  ├─ Reference / template preview
  ├─ Inspector
  ├─ Recent projects
  └─ VRM viewport integration

Common Package
  ├─ Application constants
  ├─ .aos schema types
  ├─ Asset metadata types
  └─ Project manifest factory

VRM Engine Package
  ├─ Three.js scene
  ├─ GLTFLoader + VRMLoaderPlugin
  ├─ Camera / OrbitControls
  ├─ Lighting
  ├─ Resource lifecycle
  └─ Runtime metrics
```

## プロセス境界

### Main processが担当するもの

- OSファイルダイアログ
- ローカルファイルの読み書き
- 最近使ったプロジェクトの永続化
- 終了時の未保存確認
- ウィンドウタイトルとメニューバー

### Rendererが担当するもの

- プロジェクトとアセットの編集状態
- VRM表示
- 画像プレビュー
- Inspector
- ユーザー操作と通知

Rendererへ`fs`や`path`を直接公開せず、必要な操作だけをPreload API経由で呼び出します。

## セキュリティ

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- RendererへNode APIを直接公開しない
- 外部URLはOSブラウザで開く
- IPCは用途別の明示的なチャンネルに限定
- `.aos`ロード時に最低限のスキーマ検証を行う

## `.aos`保存フロー

1. Rendererが現在のプロジェクトとアセットメタデータからmanifestを作成
2. Preload経由でMain processへ送信
3. Main processが保存先を選択
4. UTF-8 JSONとして`.aos`を書き出す
5. 最近使ったプロジェクトを更新
6. Rendererへ確定したpathとmanifestを返す
7. 未保存フラグを解除

## `.aos`読込フロー

1. Main processで`.aos`を選択
2. JSONを読み込みSchema 1を検証
3. 各`sourcePath`の存在を確認
4. 存在するVRM・画像をバイト列としてRendererへ返す
5. Rendererで`File`とObject URLを再構築
6. VRMビューアと画像プレビューへ反映
7. 見つからないアセット数を通知

## VRMロード

1. RendererでVRMの`File`を保持
2. `URL.createObjectURL()`で一時URLを作成
3. `GLTFLoader`へ`VRMLoaderPlugin`を登録
4. VRMオブジェクトを抽出
5. 頂点・スケルトン・モーフを最適化
6. VRM 0.xの向きを補正
7. シーンへ追加
8. BoundingBoxからカメラを自動調整
9. 差し替え・削除時にGPUリソースとObject URLを破棄

## 次の分離方針

Version 0.2では実装速度を優先し、プロジェクト状態管理はDesktop appに置いています。機能が安定した段階で以下へ分離します。

- `packages/project-core`: `.aos`検証・マイグレーション・パッケージ化
- `packages/asset-engine`: 画像・テンプレート・サムネイル管理
- `packages/texture-engine`: UV固定、レイヤー、マスク、合成
- `packages/plugin-sdk`: AI・出力プラグイン契約
- `plugins/comfyui`: ComfyUI連携
