# Version 0.1 → 0.2 更新手順

## 推奨手順

1. 現在のGitHub管理フォルダをバックアップするか、変更をcommitする
2. Version 0.2 ZIP内の`AI-Outfit-Studio`フォルダの中身を、既存リポジトリのルートへ上書きコピーする
3. `.git`フォルダは既存リポジトリ側のものを維持する
4. PowerShellをリポジトリのルートで開く
5. 以下を実行する

```powershell
npm install
npm run typecheck
npm run dev
```

今回、新しい外部依存パッケージは追加していません。Version 0.1の`node_modules`が残っている場合、まず`npm run dev`で起動確認しても構いません。ただし、内部パッケージのバージョンと`package-lock.json`を揃えるため、最終的には`npm install`を推奨します。

## 動作確認

1. VRMを読み込み、表示と操作を確認
2. 参考画像を追加
3. VRoidテンプレートPNGを追加
4. プロジェクト名を変更
5. `.aos`として保存
6. アプリを再起動
7. 「最近使用したプロジェクト」または「開く」から再読込
8. VRM・参考画像・テンプレートが復元されることを確認
9. 変更後にアプリを閉じ、未保存警告を確認

## GitHubへ反映

```powershell
git status
git add .
git commit -m "feat: add v0.2 asset and project foundation"
git tag -a v0.2.0 -m "AI Outfit Studio v0.2 Asset and Project Foundation"
git push
git push origin v0.2.0
```

## 注意

Version 0.2の`.aos`はリンク型です。元のVRMや画像を移動・削除すると、プロジェクト再読込時に復元できません。ポータブル型プロジェクトは今後追加予定です。
