# AI Outfit Studio

AIを活用したVRM・VRoid向け衣装制作環境です。

現在のリリースは **Version 0.4 Texture Editor Foundation / Sprint 04** です。VRM表示、`.aos`プロジェクト管理、マテリアルプレビューに加え、Photoshopなしで使える非破壊2Dテクスチャ編集基盤を搭載しています。

## Version 0.4でできること

- VRM 0.x / VRM 1.0の読み込みと3D表示
- 回転・ズーム・パン・全身表示・カメラリセット
- VRMマテリアルの自動抽出とBase Colorプレビュー
- VRoidテンプレートから2D編集ドキュメントを作成
- 参考画像・別テンプレートを画像レイヤーとして追加
- レイヤーの表示、非表示、不透明度、描画順、合成モード
- レイヤーの位置、X/Yスケール、回転
- 消しゴムストロークによる非破壊マスク編集
- テンプレートAlphaによるUV領域外の自動マスク
- 2Dキャンバスのズーム、パン、全体表示
- Texture Editor内のUndo / Redo
- 編集結果をVRMマテリアルへリアルタイム適用
- 編集結果の透過PNG書き出し
- 編集レイヤーと消しゴム情報を`.aos`へ保存・復元
- Schema 1 / 2プロジェクトをSchema 3へ自動移行

## 必要環境

- Windows 10 / 11
- Node.js 22.12以上
- npm 10以上
- Git

## 起動

PowerShellでは`npm.ps1`の実行制限を避けるため、`npm.cmd`を使用してください。

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run dev
```

または`START_DEV.bat`を実行します。

## 2Dテクスチャ編集

1. `TEMPLATES`へVRoidテンプレートPNGを追加する
2. テンプレートを選択し、Inspectorの「2D編集を開始」を押す
3. レイヤー追加欄から参考画像または別テンプレートを追加する
4. 移動・スケール・回転・不透明度・合成方法を調整する
5. 消しゴムツールで不要部分を非破壊で削る
6. 必要に応じて「テンプレートのAlphaでマスク」を有効にする
7. 「PNG書き出し」でVRoid用透過PNGを保存する

### Texture Editor操作

- **移動**：選択レイヤーをキャンバス上でドラッグ
- **消しゴム**：選択レイヤー上をドラッグ
- **パン**：キャンバス表示位置をドラッグ
- **ホイール**：ズーム
- **Ctrl+Z**：Undo
- **Ctrl+Y / Ctrl+Shift+Z**：Redo

## 3Dへのリアルタイム反映

1. VRMを読み込む
2. Texture Editorで編集ドキュメントを作成する
3. 右側の`MATERIALS`から対象マテリアルを選ぶ
4. `プレビューテクスチャ`の「2D編集結果」から選択する
5. 2D編集へ戻って変更すると、生成結果が再描画されて3Dへ反映される

元のVRMや素材PNGは変更しない非破壊方式です。

## 3D操作

- 左ドラッグ：回転
- マウスホイール：ズーム
- 右ドラッグ：パン
- `F`：モデル全体へカメラを合わせる
- `R`：初期視点へ戻す

## プロジェクト操作

- `Ctrl + N`：新規プロジェクト
- `Ctrl + O`：プロジェクトを開く
- `Ctrl + S`：保存
- `Ctrl + Shift + S`：名前を付けて保存

## `.aos`形式

Version 0.4はSchema 3を使用します。プロジェクト情報、ローカルアセットへのリンク、マテリアル差分、テクスチャ編集ドキュメントをJSONとして保存します。VRMや元画像そのものは`.aos`へ埋め込みません。

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
│  └─ desktop/            Electron / Reactデスクトップアプリ
├─ packages/
│  ├─ common/             共通型・Schema 3
│  └─ vrm-engine/         Three.js / VRM / Material preview
├─ docs/                  設計・スプリント記録
└─ .github/workflows/     CI
```

## 現在の制限

- 画像レイヤーは既に登録した参考画像またはテンプレートから追加する
- ブラシ描画、選択範囲、自由変形、テキストレイヤーは未実装
- 消しゴムは円形ストローク方式で、硬さ調整は未実装
- MToonのShade、Rim、Emission、Normalチャンネルは未対応
- `.aos`はリンク型のため、元素材を移動すると再読み込みできない

## ライセンス

ライセンスは正式決定前です。公開運用を続ける前に、MIT、Apache-2.0、または別の方針を選択してください。
