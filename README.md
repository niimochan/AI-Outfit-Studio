# AI Outfit Studio

AIを活用したVRM・VRoid向け衣装制作環境です。

現在のリリースは **Version 0.2 Asset & Project Foundation / Sprint 02** です。Version 0.1で実機確認済みのVRMビューアを維持しながら、`.aos`プロジェクト保存と参考画像・VRoidテンプレート管理を追加しています。

## Version 0.2でできること

- 新規プロジェクト作成
- `.aos`プロジェクトの保存・名前を付けて保存・再読み込み
- 未保存状態の表示と終了時の警告
- 最近使用したプロジェクトの一覧
- VRM 0.x / VRM 1.0の読み込みと3D表示
- 回転・ズーム・パン・全身表示・カメラリセット
- 参考画像（PNG / JPEG / WebP）の複数登録とプレビュー
- VRoidテンプレート画像の複数登録と透過チェッカープレビュー
- アセットInspectorとプロジェクトからの削除
- VRM・画像のドラッグ＆ドロップ
- FPS・Triangles・Draw Callsなどのデバッグ表示
- GitHub Actionsによる型チェック・ビルド

## 必要環境

- Windows 10 / 11
- Node.js 22.12以上
- npm 10以上
- Git

## 起動

```bash
npm install
npm run dev
```

すでにVersion 0.1で`npm install`を実行済みで、依存関係を変更していない場合は、更新ファイルを反映したあとそのまま`npm run dev`で起動できます。`package-lock.json`を更新する場合は、改めて`npm install`を実行してください。

### 3D操作

- 左ドラッグ：回転
- マウスホイール：ズーム
- 右ドラッグ：パン
- `F`：モデル全体へカメラを合わせる
- `R`：初期視点へ戻す

### プロジェクト操作

- `Ctrl + N`：新規プロジェクト
- `Ctrl + O`：プロジェクトを開く
- `Ctrl + S`：保存
- `Ctrl + Shift + S`：名前を付けて保存

## `.aos`形式について

Version 0.2の`.aos`は、プロジェクト情報とローカルアセットへのリンクを保存するJSON形式です。VRMや画像そのものは`.aos`内へ埋め込みません。

そのため、読み込み後に元のVRM・画像を移動または削除すると、次回オープン時に見つからないアセットとして通知されます。将来のバージョンでは、アセットをまとめたポータブルパッケージ方式を追加予定です。

詳細は[`docs/aos-project-format.md`](docs/aos-project-format.md)を参照してください。

## ビルド

```bash
npm run typecheck
npm run build
```

## Windows向けパッケージ作成

```bash
npm run package:win
```

出力先は`apps/desktop/release/`です。

## リポジトリ構成

```text
AI-Outfit-Studio/
├─ apps/
│  └─ desktop/            Electronデスクトップアプリ
├─ packages/
│  ├─ common/             共通型・プロジェクト形式
│  └─ vrm-engine/         Three.js / VRM表示エンジン
├─ docs/                  設計・スプリント記録
└─ .github/workflows/     CI
```

## 次のスプリント候補

1. VRMメタデータ・ボーン・マテリアルInspector
2. 3Dビューのスクリーンショット保存
3. 背景色・ライトプリセット
4. テンプレート分類とメタデータ
5. ポータブル`.aos`パッケージ
6. ComfyUI接続の最小プラグイン

## ライセンス

ライセンスは正式決定前です。公開運用を続ける前に、MIT、Apache-2.0、または別の方針を選択してください。
