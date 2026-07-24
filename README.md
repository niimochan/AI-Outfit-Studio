# AI Outfit Studio

AIを活用したVRM・VRoid向け衣装制作環境です。

このリポジトリは **Version 0.1 Foundation / Sprint 01** の土台です。現時点で、Electronデスクトップアプリを起動し、ローカルのVRMファイルを読み込み、Three.js上に表示できます。

## 現在できること

- Electron + React + TypeScript + Viteのデスクトップ基盤
- VRM 0.x / VRM 1.0の読み込み
- Three.js + `@pixiv/three-vrm`による表示
- OrbitControlsによる回転・ズーム・パン
- モデルに合わせたカメラ自動調整
- 読み込み進捗、エラー、FPS、描画情報の表示
- VRM差し替えとリソース解放
- GitHub Actionsによる型チェック・ビルド

## 必要環境

- Windows 10/11（最初の対象）
- Node.js 22.12以上
- npm 10以上
- Git

## 起動

```bash
npm install
npm run dev
```

アプリが起動したら、左側の **VRMを読み込む** を押して `.vrm` ファイルを選択します。

### 3D操作

- 左ドラッグ：回転
- マウスホイール：ズーム
- 右ドラッグ：パン
- `F` または「全身を表示」：モデル全体へカメラを合わせる
- `R` または「カメラをリセット」：初期視点へ戻す

## ビルド

```bash
npm run build
```

## Windows向けパッケージ作成

```bash
npm run package:win
```

出力先は `apps/desktop/release/` です。

## リポジトリ構成

```text
AI-Outfit-Studio/
├─ apps/
│  └─ desktop/            Electronデスクトップアプリ
├─ packages/
│  ├─ common/             共通型・定数
│  └─ vrm-engine/         Three.js / VRM表示エンジン
├─ docs/                  設計・スプリント記録
└─ .github/workflows/     CI
```

## GitHubへ登録

```bash
git init
git add .
git commit -m "feat: add v0.1 VRM viewer foundation"
git branch -M main
git remote add origin <YOUR_REPOSITORY_URL>
git push -u origin main
```

## 次のスプリント候補

1. `.aos`プロジェクト保存・再読み込み
2. 参考画像とVRoidテンプレートのアセット管理
3. VRMメタデータ・ボーン構造・マテリアル一覧のInspector表示
4. スクリーンショット、背景、ライトプリセット
5. ComfyUI接続の最小プラグイン

## ライセンス

ライセンスは正式決定前です。公開前にMIT、Apache-2.0、または非公開運用を選択してください。
