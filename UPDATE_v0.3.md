# AI Outfit Studio v0.3 Update Guide

## 更新前

現在の変更をGitへ保存してください。

```powershell
git add .
git commit -m "chore: save v0.2.2 before v0.3 update"
```

## 上書き

更新パッケージ内のファイルを、Git管理中の`AI-Outfit-Studio`フォルダへ上書きします。`.git`フォルダは削除しません。

## 依存関係と確認

PowerShellでプロジェクトフォルダへ移動し、次を実行します。

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run dev
```

新しい外部ライブラリは追加していませんが、ワークスペースのバージョンと`package-lock.json`を同期するため`npm.cmd install`を推奨します。

## 動作確認

1. VRMを読み込む
2. 右側にマテリアル一覧が出る
3. テンプレート画像を追加する
4. マテリアルを選び、テンプレートを適用する
5. 色・Opacity・Repeat・Offsetを変更する
6. 選択のみ復元、全て復元を確認する
7. `.aos`保存後、再起動して設定が復元される
8. 以前のSchema 1 `.aos`が開ける

## GitHubへ反映

```powershell
git add .
git commit -m "feat: add v0.3 material preview foundation"
git push
```
