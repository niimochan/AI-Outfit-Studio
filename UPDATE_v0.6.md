# AI Outfit Studio v0.6.0

## Sprint B：Auto Extract & Auto Fit Foundation

v0.6では、ComfyUIへ送る前に参考衣装画像を整えるローカル前処理機能を追加しました。

## 基本手順

1. `REFERENCES`へ衣装の参考画像を追加します。
2. Texture Editorの`AI ASSIST > SOURCE`で参考画像を選択します。
3. `REFERENCE PREP`で背景抽出方法を選択します。
4. Original / Extractedプレビューを見ながら、しきい値とフェザーを調整します。
5. 自動フィット方法を選択します。
6. `背景除去して自動フィット`を押します。
7. 抽出された透過PNGが`AI GENERATED`と新規レイヤーへ追加されます。
8. 抽出結果がReference Guided用の参照画像として自動選択されます。

## 追加機能

- ComfyUIカスタムノード不要のローカル背景除去
- 四隅から自動判定
- 白背景を除去
- 黒背景を除去
- 既存Alphaのみ使用
- 抽出しきい値
- 境界フェザー
- Original / Extracted比較プレビュー
- テンプレートAlpha範囲への自動フィット
- キャンバス内接・全面フィット
- テンプレート余白調整
- 抽出PNGの永続保存
- 新規レイヤーへの自動追加
- Reference Guided参照画像への自動切り替え
- `.aos` Schema 6への更新

## 補足

今回の背景除去は、背景色との距離を使うローカル抽出です。複雑な背景、影、衣装と背景の色が近い画像、被写体が画像端に接している画像では、しきい値調整が必要になる場合があります。

抽出結果は2Dキャンバスのレイヤーへ追加されるため、既存のimg2img Workflowでも参考画像の内容が入力へ含まれます。IPAdapter Workflowでは、さらに`__AOS_REFERENCE_IMAGE__`から別画像として利用できます。
