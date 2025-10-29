/**
 * Basic認証ユーティリティ
 * 開発プレビュー環境での簡易保護用
 */
export class BasicAuth {
  constructor() {
    // 環境変数から認証情報を取得（AstroのPUBLIC_プレフィックスを使用）
    this.username = import.meta.env.PUBLIC_BASIC_AUTH_USER || '';
    this.password = import.meta.env.PUBLIC_BASIC_AUTH_PASSWORD || '';
    this.isEnabled = this.username && this.password;
    
    // Vercelのプレビュー環境かどうかを判定
    this.isPreviewEnv = this.checkPreviewEnvironment();
    
    // 認証が必要かどうか
    this.authRequired = this.isEnabled && this.isPreviewEnv;
    
    // デバッグ用ログ
    console.log('BasicAuth initialized:', {
      isEnabled: this.isEnabled,
      isPreviewEnv: this.isPreviewEnv,
      authRequired: this.authRequired,
      hasUsername: !!this.username,
      hasPassword: !!this.password,
      hostname: typeof window !== 'undefined' ? window.location.hostname : 'N/A',
      port: typeof window !== 'undefined' ? window.location.port : 'N/A'
    });
  }

  /**
   * プレビュー環境かどうかを判定（vercel.appドメインまたはポート4321）
   */
  checkPreviewEnvironment() {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const port = window.location.port;
      
      // vercel.appドメインまたはポート4321（ローカル開発環境）
      return hostname.includes('.vercel.app') || port === '4321';
    }
    return false;
  }

  /**
   * 認証状態をチェック
   */
  isAuthenticated() {
    if (!this.authRequired) {
      return true; // 認証不要
    }
    
    // セッションストレージから認証状態を確認
    const authToken = sessionStorage.getItem('basic_auth_token');
    if (!authToken) {
      return false;
    }
    
    // トークンを検証
    try {
      const [storedUser, storedPass] = atob(authToken).split(':');
      return storedUser === this.username && storedPass === this.password;
    } catch {
      return false;
    }
  }

  /**
   * 認証を実行
   */
  authenticate(username, password) {
    if (username === this.username && password === this.password) {
      // 認証成功：トークンをセッションストレージに保存
      const token = btoa(`${username}:${password}`);
      sessionStorage.setItem('basic_auth_token', token);
      return true;
    }
    return false;
  }

  /**
   * 認証ダイアログを表示
   */
  showAuthDialog() {
    if (!this.authRequired) {
      return; // 認証不要
    }

    // オーバーレイ作成
    const overlay = document.createElement('div');
    overlay.id = 'basic-auth-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 1);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // コンテナ作成
    const container = document.createElement('div');
    container.style.cssText = `
      background: white;
      padding: 2rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      text-align: center;
      max-width: 400px;
      width: 90%;
    `;

    // フォーム作成
    const form = document.createElement('form');
    form.innerHTML = `
      <h2 style="margin: 0 0 1rem 0; color: #333;">AUTHENTICATION REQUIRED</h2>
      <p style="margin: 0 0 1.5rem 0; color: #666; font-size: 0.9rem;">
        This site is a under development.
      </p>
      <input 
        type="text" 
        id="auth-username" 
        placeholder="USERNAME" 
        required
        style="width: 100%; padding: 0.75rem; margin: 0.5rem 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 1rem;"
      />
      <input 
        type="password" 
        id="auth-password" 
        placeholder="PASSWORD" 
        required
        style="width: 100%; padding: 0.75rem; margin: 0.5rem 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 1rem;"
      />
      <button 
        type="submit"
        style="width: 100%; padding: 0.75rem; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; margin-top: 0.5rem;"
      >
        O P E N
      </button>
      <div id="auth-error" style="color: #e74c3c; margin-top: 0.5rem; font-size: 0.9rem; display: none;"></div>
    `;

    // フォーム送信処理
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const username = document.getElementById('auth-username').value;
      const password = document.getElementById('auth-password').value;
      const errorDiv = document.getElementById('auth-error');
      
      if (this.authenticate(username, password)) {
        overlay.remove();
        // 認証成功後、ページをリロードしてコンテンツを表示
        window.location.reload();
      } else {
        errorDiv.textContent = 'ユーザー名またはパスワードが正しくありません。';
        errorDiv.style.display = 'block';
      }
    });

    container.appendChild(form);
    overlay.appendChild(container);
    document.body.appendChild(overlay);
  }

  /**
   * 認証チェックを実行
   */
  checkAuth() {
    if (!this.authRequired) {
      return; // 認証不要
    }

    if (!this.isAuthenticated()) {
      this.showAuthDialog();
    }
  }
}

// 自動実行は削除。app.jsから呼び出されるように変更
