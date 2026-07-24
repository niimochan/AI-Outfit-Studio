# Changelog

## 0.3.1 — TypeScript 7 validation fix

### Fixed

- `.aos` manifest validationでSchema 1とSchema 2を確認する際に発生していたTypeScript 7の`TS2367`を修正
- `schemaVersion`の検証用型を、Schema 2固定型から独立した数値型へ変更

## 0.3.0 — Material Preview Foundation

### Added

- VRM内のユニークマテリアル自動抽出
- マテリアル一覧、名前、シェーダー型、利用メッシュ数の表示
- 登録済みテンプレート画像のBase Colorへのリアルタイム適用
- 色、不透明度、Repeat X/Y、Offset X/Yの編集
- 選択マテリアルと全マテリアルの復元
- `.aos` Schema 2へのマテリアルオーバーライド保存
- Schema 1プロジェクトの自動マイグレーション
- 適用テクスチャの再利用、差し替え、GPUリソース解放

### Changed

- アプリケーションとワークスペースのバージョンを0.3.0へ更新
- Inspectorへマテリアル数と編集数を追加
- ドキュメントをSprint 03へ更新

### Known limitations

- 現段階は3Dプレビューのみで、VRMやVRoid用PNGへの書き戻しは未実装
- Base Color以外のMToonチャンネルは未対応
- Undo / Redoは未実装
- このビルド環境ではnpmレジストリへ接続できないため、最終の実依存ビルドはWindows環境で確認が必要

## 0.2.2 - Development shutdown fix

- Treat a clean Electron window close as successful completion of the development session.
- Keep failure reporting when the renderer, Electron build watcher, or Electron process exits abnormally first.
- Use `npm.cmd` explicitly in `START_DEV.bat` for PowerShell/Windows compatibility.
- Show a normal-close message instead of a false startup failure after the user exits the app.

## 0.2.0 — Asset & Project Foundation

### Added

- `.aos`プロジェクトの新規作成・保存・再読み込み
- 名前を付けて保存
- 最近使用したプロジェクト
- 未保存表示と終了時の破棄確認
- 参考画像とVRoidテンプレートの複数管理
- 画像プレビューとアセットInspector
- ネイティブファイルダイアログ
- アプリケーションメニューとショートカット
- VRM・画像のドラッグ＆ドロップ
- VRMをプロジェクトから外した際の3Dモデル解放

### Changed

- UIをプロジェクト・アセット管理向けに再構成
- アプリケーションバージョンを0.2.0へ更新

### Known limitations

- `.aos`はリンク型で、アセット本体を内包しない
- Undo / Redoは未実装
- このビルド環境ではnpmレジストリへ接続できないため、最終の実依存ビルドはWindows環境で確認が必要

## 0.1.0 — VRM Viewer Foundation

- Electron + React + TypeScript基盤
- VRM 0.x / 1.0表示
- 回転・ズーム・パン
- カメラフィット・リセット
- リアルタイム描画統計
