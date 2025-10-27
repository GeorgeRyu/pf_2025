// src/lib/auth.ts
export function isPreviewMode(): boolean {
  // Vercelのプレビューデプロイメントかどうかを判定
  return process.env.VERCEL_ENV === 'preview' || 
         process.env.NODE_ENV === 'development' ||
         process.env.VERCEL_ENV === 'development';
}

export function getAuthMessage(): string | null {
  if (isPreviewMode()) {
    return 'このサイトは開発中のプレビュー環境です。認証が必要です。';
  }
  return null;
}

export function shouldRequireAuth(): boolean {
  return isPreviewMode() && 
         process.env.BASIC_AUTH_USER && 
         process.env.BASIC_AUTH_PASSWORD;
}