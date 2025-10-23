export default function handler(req, res) {
  // vercel.appドメインの場合のみ認証をチェック
  if (req.headers.host && req.headers.host.endsWith('.vercel.app')) {
    const user = process.env.BASIC_AUTH_USER;
    const pass = process.env.BASIC_AUTH_PASSWORD;

    const auth = req.headers.authorization;
    if (!auth) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Preview"');
      return res.status(401).send('Authentication required');
    }

    const [inputUser, inputPass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
    if (inputUser !== user || inputPass !== pass) {
      return res.status(401).send('Unauthorized');
    }
  }

  // 認証成功またはvercel.app以外の場合は元のページにリダイレクト
  res.redirect(302, req.url);
}
