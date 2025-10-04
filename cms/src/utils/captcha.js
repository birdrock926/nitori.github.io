import axios from 'axios';

const isSecretConfigured = (secret = '') => {
  if (!secret) return false;
  const normalized = secret.trim();
  if (!normalized) return false;
  if (/set-before-production/i.test(normalized)) return false;
  if (/replace-with/i.test(normalized)) return false;
  if (/^dev-.*placeholder$/i.test(normalized)) return false;
  return true;
};

export const verifyCaptcha = async ({ provider, secret, token, remoteip }) => {
  if (!provider || provider === 'none') {
    return true;
  }
  if (!isSecretConfigured(secret)) {
    console.warn('[captcha] シークレットが未設定のため検証をスキップしました');
    return true;
  }
  if (!token) {
    throw new Error('CAPTCHA が未入力です');
  }
  if (provider === 'turnstile') {
    const response = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', new URLSearchParams({
      secret,
      response: token,
      remoteip,
    }));
    if (!response.data.success) {
      throw new Error('CAPTCHA 検証に失敗しました');
    }
    return true;
  }
  if (provider === 'recaptcha') {
    const response = await axios.post('https://www.google.com/recaptcha/api/siteverify', new URLSearchParams({
      secret,
      response: token,
      remoteip,
    }));
    if (!response.data.success) {
      throw new Error('CAPTCHA 検証に失敗しました');
    }
    return true;
  }
  throw new Error('未知の CAPTCHA プロバイダです');
};
