# George Profile 2025

Astroベースで構築されたモダンなプロフィールサイトです。WebGL、Three.js、スムーススクロールなどの最新技術を活用したインタラクティブな体験を提供します。

## 🚀 技術スタック

- **フレームワーク**: [Astro](https://astro.build/) v5.12.8
- **スタイリング**: [Tailwind CSS](https://tailwindcss.com/) v4.1.6
- **3Dグラフィックス**: [Three.js](https://threejs.org/) v0.178.0 + [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- **スムーススクロール**: [Lenis](https://lenis.studiofreight.com/) v1.3.11
- **アニメーション**: [GSAP](https://greensock.com/gsap/) v3.13.0
- **JavaScript**: [Alpine.js](https://alpinejs.dev/) v3.15.0
- **デプロイ**: [Vercel](https://vercel.com/)

## 📁 プロジェクト構造

```
src/
├── components/          # Astroコンポーネント
│   ├── webgl/          # WebGL関連コンポーネント
│   ├── Header.astro    # ヘッダーコンポーネント
│   ├── Home.astro      # ホームページコンポーネント
│   └── ...
├── layouts/            # レイアウトテンプレート
├── pages/              # ページルーティング
├── script/             # JavaScriptファイル
│   ├── app.js          # メインアプリケーション
│   ├── lenis-smooth-scroll.js  # スムーススクロール
│   └── scroll-animations.js    # スクロールアニメーション
├── styles/             # スタイルシート
└── lib/                # ユーティリティ関数
```

## 🛠️ セットアップ

### 前提条件

- Node.js 18.0.0以上
- npm または yarn

### インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd george-profile2024

# 依存関係をインストール
npm install
```

### 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:4321](http://localhost:4321) を開いてサイトを確認できます。

## 📜 利用可能なスクリプト

```bash
# 開発サーバーを起動
npm run dev

# プロダクションビルド
npm run build

# ビルド結果をプレビュー
npm run preview

# Astro CLIを直接実行
npm run astro
```

## ✨ 主な機能

- **レスポンシブデザイン**: デスクトップ・モバイル対応
- **スムーススクロール**: Lenisによる滑らかなスクロール体験
- **WebGLアニメーション**: Three.jsを使用した3Dグラフィックス
- **インタラクティブナビゲーション**: Alpine.jsによる動的なUI
- **パフォーマンス最適化**: Astroの静的サイト生成
- **モダンなアニメーション**: GSAPによる高品質なアニメーション

## 🎨 カスタマイズ

### テーマ設定

`src/styles/variables.css`でカラーテーマやその他のデザイントークンを変更できます。

### コンテンツの編集

- プロジェクト情報: `src/lib/projects.js`
- ナビゲーション項目: `src/components/Home.astro`内の`navItems`
- スタイル: `src/styles/`ディレクトリ内のファイル

## 🚀 デプロイ

### Vercel（推奨）

```bash
# Vercel CLIをインストール
npm i -g vercel

# デプロイ
vercel
```

### その他のプラットフォーム

```bash
# ビルド
npm run build

# dist/ディレクトリが生成されるので、任意のホスティングサービスにアップロード
```

## 📱 ブラウザサポート

- Chrome (最新版)
- Firefox (最新版)
- Safari (最新版)
- Edge (最新版)

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 📞 お問い合わせ

プロジェクトに関する質問や提案がございましたら、お気軽にお問い合わせください。

---

**注意**: このプロジェクトは個人のプロフィールサイトとして作成されています。