# AI Outfit Studio

AIを活用したVRM・VRoid向け衣装制作環境です。

現在のリリースは **Version 0.5 AI Texture Assist Foundation / Sprint 05** です。VRM表示、`.aos`プロジェクト管理、マテリアルプレビュー、非破壊2Dテクスチャ編集に加え、ローカルComfyUIへ画像・マスク・プロンプトを送信して生成結果を新規レイヤーとして受け取れる基盤を搭載しています。

## Version 0.5でできること

- VRM 0.x / VRM 1.0の読み込みと3D表示
- 回転・ズーム・パン・全身表示・カメラリセット
- VRMマテリアルの自動抽出とBase Colorプレビュー
- VRoidテンプレートから2D編集ドキュメントを作成
- 参考画像・テンプレート・AI生成結果を画像レイヤーとして追加
- レイヤーの表示、非表示、不透明度、描画順、合成モード
- レイヤーの位置、X/Yスケール、回転
- 内接・全面・引き伸ばし・原寸中央の自動フィット
- 消しゴムストロークによる非破壊編集
- テンプレートAlphaによるUV領域外の自動マスク
- Undo / Redoと透過PNG書き出し
- ComfyUI接続テスト
- ComfyUI API Workflow JSONの読み込み
- 入力画像・マスク・Positive/Negative Promptの自動送信
- テンプレートAlpha、選択レイヤーの消去部分、キャンバス全体からAIマスクを生成
- ComfyUIキュー監視、タイムアウト、出力取得、エラー表示
- AI生成結果を`AI GENERATED`へ保存し、新規レイヤーとして自動追加
- AI処理履歴と設定を`.aos`へ保存・復元
- Schema 1 / 2 / 3プロジェクトをSchema 4へ自動移行

## 必要環境

- Windows 10 / 11
- Node.js 22.12以上
- npm 10以上
- Git
- AI生成を使う場合：起動済みのComfyUI

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
3. レイヤー追加欄から参考画像、別テンプレート、またはAI生成結果を追加する
4. 自動フィット、移動、スケール、回転、不透明度、合成方法を調整する
5. 消しゴムツールで不要部分またはAI編集範囲を描く
6. 必要に応じて「テンプレートのAlphaでマスク」を有効にする
7. 「PNG書き出し」でVRoid用透過PNGを保存する

### Texture Editor操作

- **移動**：選択レイヤーをキャンバス上でドラッグ
- **消しゴム**：選択レイヤー上をドラッグ
- **パン**：キャンバス表示位置をドラッグ
- **ホイール**：ズーム
- **Ctrl+Z**：Undo
- **Ctrl+Y / Ctrl+Shift+Z**：Redo

## ComfyUI連携

1. ComfyUIを起動する
2. 2D編集画面の`AI ASSIST`を開く
3. 接続先を確認し「接続テスト」を押す
4. ComfyUIのAPI形式Workflow JSONを読み込む
5. Positive / Negative PromptとAI編集範囲を設定する
6. 「AIテクスチャ生成を実行」を押す
7. 結果が`AI GENERATED`と編集レイヤーへ追加されることを確認する

すぐ試す場合は、[`examples/comfyui/aos-sdxl-inpaint-api-workflow.json`](examples/comfyui/aos-sdxl-inpaint-api-workflow.json)のチェックポイント名を手元のモデル名へ変更してください。

詳細は[`docs/comfyui-integration.md`](docs/comfyui-integration.md)を参照してください。

## 3Dへのリアルタイム反映

1. VRMを読み込む
2. Texture Editorで編集ドキュメントを作成する
3. 右側の`MATERIALS`から対象マテリアルを選ぶ
4. `プレビューテクスチャ`の「2D編集結果」または「AI生成結果」から選択する
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

Version 0.5はSchema 4を使用します。プロジェクト情報、ローカルアセットへのリンク、AI生成物へのリンク、マテリアル差分、テクスチャ編集ドキュメント、ComfyUI設定、AI履歴をJSONとして保存します。VRMや元画像そのものは`.aos`へ埋め込みません。

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
│  ├─ common/             共通型・Schema 4
│  └─ vrm-engine/         Three.js / VRM / Material preview
├─ examples/
│  └─ comfyui/            ComfyUI API Workflow例
├─ docs/                  設計・スプリント記録
└─ .github/workflows/     CI
```

## 現在の制限

- ComfyUI本体、モデル、Custom Nodeは同梱しない
- Workflow構成によってはトークンまたはノードタイトルの調整が必要
- SAM2、RemBG、GroundingDINOによる衣装自動抽出は次段階
- ブラシ描画、選択範囲、自由変形、テキストレイヤーは未実装
- 消しゴムは円形ストローク方式で、硬さ調整は未実装
- MToonのShade、Rim、Emission、Normalチャンネルは未対応
- `.aos`はリンク型のため、元素材を移動すると再読み込みできない

## ライセンス

ライセンスは正式決定前です。公開運用を続ける前に、MIT、Apache-2.0、または別の方針を選択してください。
