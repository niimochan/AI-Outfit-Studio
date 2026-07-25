# Version 0.5 Update Guide

## 1. 現在の変更を保存

```powershell
git add .
git commit -m "chore: save v0.4 before v0.5 update"
git push
```

コミット対象がない場合は、そのまま次へ進みます。

## 2. 更新ファイルを上書き

`AI-Outfit-Studio-v0.4-to-v0.5-update`の中身を、Git管理中の`AI-Outfit-Studio`フォルダへ上書きします。`.git`フォルダは削除しません。

## 3. 型チェックと起動

必ず`package.json`があるプロジェクト本体フォルダで実行します。

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run dev
```

## 4. 基本確認

- v0.4のVRM表示、プロジェクト保存、2D編集、PNG書き出しが動作する
- レイヤーの自動フィット4種類が動作する
- v0.4の`.aos`を開くとSchema 4へ移行される
- 保存・再読込でAI設定と履歴が保持される

## 5. ComfyUI確認

- ComfyUIを起動する
- `AI ASSIST`の接続先が`http://127.0.0.1:8188`になっている
- 接続テストが成功する
- API形式Workflow JSONを読み込める
- AI生成結果が`AI GENERATED`へ追加される
- 自動追加ONの場合、結果が新規レイヤーへ追加される
- `.aos`保存後に生成物と履歴を再読込できる

## 6. GitHubへ反映

```powershell
git add .
git commit -m "feat: add v0.5 AI texture assist foundation"
git push
```
