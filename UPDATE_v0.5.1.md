# AI Outfit Studio v0.5.1

## Sprint A: Reference-Aware AI Assist

### Added
- AI生成モードを追加
  - Prompt Only
  - Reference Guided
  - Reference + Inpaint
- 参考画像セレクタを追加
- AI送信内容の実行プレビューを追加
- 参照強度 / Denoise / テンプレ保持 スライダーを追加
- ComfyUIへ参考画像をアップロードして送信する仕組みを追加
- 新しいWorkflowトークンを追加
  - `__AOS_REFERENCE_IMAGE__`
  - `__AOS_REFERENCE_STRENGTH__`
  - `__AOS_DENOISE__`
  - `__AOS_TEMPLATE_PRESERVE__`
  - `__AOS_MODE__`
- AIジョブ履歴にモード / 参考画像名 / Workflow名を保存
- `.aos` schema を v5 に更新

### Notes
- Reference Guided / Reference + Inpaint を使う場合は、Reference画像を1枚選択してください。
- Workflow側で上記トークンを使うと制御しやすくなります。
- 既存Workflowでも、LoadImageノードのtitleに `reference`, `style`, `ipadapter` などが含まれている場合は自動注入を試みます。
