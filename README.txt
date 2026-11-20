Lyric Notes PWA / Vercel + Render無料Web Service

構成
Vercel: PWA画面。Render: 動画音声取得・MP3変換。
文字起こし: 利用端末のブラウザーでWhisper tinyを実行。
スマートフォンでも画面を開いたまま処理する必要があります。
PC向けローカル版のsmallモデルより認識精度が落ちる場合があります。

公開手順
1. このフォルダーの内容をGitHubリポジトリに入れる（認証情報を含めない）。
2. VercelでそのリポジトリをImport。Framework PresetはOther。
   vercel.jsonのoutputDirectory: publicを使用。ビルドコマンドは不要。
3. RenderでNew > Blueprintから同じリポジトリを接続。
   render.yamlはplan: freeを指定しています。有料インスタンスへ変更しない。
   FRONTEND_ORIGINはVercel公開URLのオリジン（末尾の/なし）に設定。
4. Renderサービスの環境変数APP_PASSWORDは自動生成されます。
   Render管理画面で値を確認し、PWAの接続設定に貼り付ける。
   サーバーURLにはRenderのhttps://....onrender.com を設定。
5. PWAのインストールボタン、またはChrome/Edgeのメニューからインストール。
   iPhoneの場合はSafariの共有 > ホーム画面に追加。

無料枠について
Renderは無通信15分で停止し、次回アクセス時に約1分で起動します。
生成ファイルは再起動で失われます。画面からMP3/TXTを保存してください。
1件ずつ処理、最大10分、取得ファイル最大100MB。MP3は直近最大3件を保持。
終了したジョブは次のジョブ受付時に期限・件数に従い削除されます。
無料利用時間・通信量・ビルド時間は各サービスのアカウント全体で共有されます。
Render/Vercelの課金設定と利用上限を確認してください。
無料枠を超えた通信量などについて、無条件の完全無料は保証できません。
クラウドIPからのYouTubeアクセスが制限される場合があります。
取得サイトの制限を回避するCookieやプロキシの機能はありません。
認識モデルとライブラリの初回ダウンロードにはインターネットが必要です。
PWAの画面と最後に編集した歌詞は端末に保存。MP3取得はオンライン必須。
アクセスキーはタブ単位のsessionStorageにのみ保存。ソースに入れないでください。

https://render.com/docs/free
https://vercel.com/docs
https://huggingface.co/docs/transformers.js/v3.8.1/en/installation
