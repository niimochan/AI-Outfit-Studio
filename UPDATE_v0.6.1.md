# AI Outfit Studio v0.6.1

## Garment Isolation Fix

### Fixed
- Reference Guided / Reference + Inpaint 実行時、選択した参照画像（特に `reference-extract-*`）と同じ画像を使った抽出レイヤーを、AI入力キャンバスから自動除外するよう修正
- これにより、AIが「全身キャラクターを再描画する」挙動を抑え、衣装テクスチャ化に集中しやすく改善

### Improved
- 新規プロジェクトの既定Positive Promptを「garment only / no human body」方向へ強化
- 新規プロジェクトの既定Negative Promptに person / hair / hands / legs など人物混入抑制ワードを追加
- v0.6.0 既存プロジェクトで旧既定プロンプトを使っていた場合、読み込み時に新既定へ自動置換
- AI ASSIST の Execution Preview に `Input Policy` を追加
- 参照画像カードに「抽出レイヤーをAI入力へ含めない」説明を追加

### Notes
- 参考画像を `背景除去して自動フィット` した後、その抽出レイヤーは編集用プレビューとしてキャンバスに残ります。
- ただし v0.6.1 以降は、その同じ画像を Reference として選択して AI生成する場合、AIの `INPUT_IMAGE` 側には自動で混ぜません。
- 参照は `REFERENCE_IMAGE` として送り、キャンバス側はテンプレートと通常編集レイヤー中心に保ちます。
