# george-profile2024

個人プロフィールサイト。Astro の静的ページ + 固定フルスクリーン WebGL。

## コマンド

- `npm run dev` → http://localhost:4321
- `npm run build` / `npm run preview`

## 地図

- DOM / Alpine / Lenis: `src/script/app.js`
- WebGL 入口: `src/components/webgl/WebGLScene.astro` → `src/script/webgl/WebGLSceneController.ts`
- コンテンツ: `src/lib/projects.js`、nav は `src/components/Home.astro`

## 設計

- スパゲッティを避ける。責務は既存の層（DOM / scroll / theatre / scene / interaction）に載せる。
- わかりやすさと保守性を優先するが、関数・ファイルを長くしすぎない。
- ファイルは必要なら増やしてよい。増やす必要がなければ増やさない。同じファイル内の関数分割で足りるならそれでよい。責務が別物になった・2箇所以上で使う・既存ファイルが明らかに肥大、なら分割する。「綺麗だから」「将来使うかも」だけでは足さない。
- 繰り返す UI / マークアップは Astro コンポーネントにする。
- vertex / fragment は必ず別 `.glsl`（TS へのインライン禁止）。置き場は `src/script/webgl/shaders/`。既存: `plateVertex/Fragment`、`photoVertex/Fragment`。`?raw` で import する。

## 不変条件

- スクロールの正は Lenis。ネイティブ `scrollTo` に戻さない。
- 3D タイムラインは Theatre.js（`theatre/TheatreController.ts`）。シーケンス JSON を安易に再生成しない。
- `WebGLScrollController` と `scroll-snap.js` の同期を壊さない。
- メニュー / モーダルの Lenis stop/start を二重実装しない。
- デバッグ: `?debug=lil`（gui+stats）、`?debug=theatre`（Studio UI）。Studio は常時初期化、UI は theatre 時のみ。
- カメラ既定値は `WebGLSceneLayout` が上書きする。

## 振る舞い

横断ルール。後で User Rule へ移す。

- 説明・コメント・エージェント向け文書は日本語。
- 不明なら仮定して実装しない。先に確認する。
- 頼まれたことだけ。単発のための抽象・設定は作らない。
- 関係ないコメント・整形・リファクタはしない。自分が不要にしたコードだけ消す。
- 成功条件を先に置く。検証手段はそのリポジトリに合わせる。今ここはテストより、`npm run dev` でスクロール / ホバー / テーマ / PC・SP を確認する。

## 検証

- WebGL・スクロール変更は見た目のスクショ不止。スクロール・ホバー・テーマ・PC/SP まで触る。
