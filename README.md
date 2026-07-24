# AI Outfit Studio

AIを活用したVRM・VRoid向け衣装制作環境です。

現在のリリースは **Version 0.3 Material Preview Foundation / Sprint 03** です。VRM表示、`.aos`プロジェクト管理、参考画像・テンプレート管理に加え、VRMのマテリアルへテンプレート画像をリアルタイム適用して確認できます。

## Version 0.3でできること

- VRM 0.x / VRM 1.0の読み込みと3D表示
- 回転・ズーム・パン・全身表示・カメラリセット
- VRM内のユニークなマテリアルを自動抽出
- マテリアル名、シェーダー型、利用メッシュ数、元テクスチャ有無を表示
- 登録済みテンプレート画像を選択マテリアルへリアルタイム適用
- Base Color、Opacity、Repeat X/Y、Offset X/Yを編集
- 選択マテリアルまたは全マテリアルを元の状態へ復元
- マテリアル設定を`.aos`へ保存し、再オープン時に再適用
- Schema 1プロジェクトをSchema 2へ自動移行
- 参考画像・VRoidテンプレートの複数登録とプレビュー
- 最近使用したプロジェクト、未保存警告、ネイティブファイルダイアログ
- FPS・Triangles・Draw Callsなどのデバッグ表示

## 必要環境

- Windows 10 / 11
- Node.js 22.12以上
- npm 10以上
- Git

## 起動

PowerShellでは`npm.ps1`の実行制限を避けるため、`npm.cmd`を使用してください。

```powershell
npm.cmd install
npm.cmd run dev
```

または`START_DEV.bat`を実行します。

### 3D操作

- 左ドラッグ：回転
- マウスホイール：ズーム
- 右ドラッグ：パン
- `F`：モデル全体へカメラを合わせる
- `R`：初期視点へ戻す

### マテリアルプレビュー

1. VRMを読み込む
2. VRoidテンプレート画像を追加する
3. 右側の`MATERIALS`から編集対象を選ぶ
4. `プレビューテクスチャ`から画像を選ぶ
5. 色、不透明度、Repeat、Offsetを調整する
6. `.aos`を保存する

この機能は現段階では**非破壊プレビュー**です。元のVRMやPNGを書き換えません。

### プロジェクト操作

- `Ctrl + N`：新規プロジェクト
- `Ctrl + O`：プロジェクトを開く
- `Ctrl + S`：保存
- `Ctrl + Shift + S`：名前を付けて保存

## `.aos`形式について

Version 0.3はSchema 2を使用します。プロジェクト情報、ローカルアセットへのリンク、マテリアルの差分設定をJSONとして保存します。VRMや画像そのものは`.aos`内へ埋め込みません。

詳細は[`docs/aos-project-format.md`](docs/aos-project-format.md)を参照してください。

## ビルド

```powershell
npm.cmd run typecheck
npm.cmd run build
```

## Windows向けパッケージ作成

```powershell
npm.cmd run package:win
```

出力先は`apps/desktop/release/`です。

## リポジトリ構成

```text
AI-Outfit-Studio/
├─ apps/
│  └─ desktop/            Electronデスクトップアプリ
├─ packages/
│  ├─ common/             共通型・プロジェクト形式
│  └─ vrm-engine/         Three.js / VRM / Material preview
├─ docs/                  設計・スプリント記録
└─ .github/workflows/     CI
```

## 次の開発候補

1. マテリアル選択部分を3D上でハイライト
2. UVテンプレートと3D表示の連動選択
3. 3Dビューのスクリーンショット保存
4. MToon Shade / Rim / Emission編集
5. テクスチャレイヤー・マスク・PNG書き出し
6. Undo / Redo
7. ComfyUI接続の最小プラグイン

## ライセンス

ライセンスは正式決定前です。公開運用を続ける前に、MIT、Apache-2.0、または別の方針を選択してください。
