# AI Outfit Studio v0.4 Update

## 更新方法

1. 現在のv0.3.1をGitへ保存します。

```powershell
git add .
git commit -m "chore: save v0.3.1 before v0.4 update"
git push
```

2. 更新ZIPの中身をGit管理中の`AI-Outfit-Studio`へ上書きします。`.git`フォルダは削除しません。

3. プロジェクト本体フォルダで実行します。

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run dev
```

## 動作確認

1. 既存の`.aos`を開ける
2. VRMとv0.3.1のマテリアルプレビューが動く
3. テンプレートを選択して「2D編集を開始」できる
4. 参考画像をレイヤーとして追加できる
5. 移動、Scale、回転、不透明度、描画順が動く
6. 消しゴム、Undo、Redoが動く
7. Alphaマスクを切り替えられる
8. PNGを書き出せる
9. 編集結果をMaterialの「2D編集結果」から選択できる
10. 保存・再起動後にレイヤーとMaterial設定が復元される

## GitHub反映

```powershell
git add .
git commit -m "feat: add v0.4 texture editor foundation"
git push
```
