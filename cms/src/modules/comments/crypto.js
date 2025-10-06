import crypto from 'node:crypto';
import sha256 from 'js-sha256';

export const createEditKey = () => crypto.randomBytes(16).toString('hex');

export const hashEditKey = (editKey, pepper) => sha256.hmac(pepper, editKey);

export const hashIp = (ip, pepper) => sha256.hmac(pepper, ip || 'unknown');

export const networkHash = (ip, pepper) => {
  if (!ip) return sha256.hmac(pepper, 'unknown-net');
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return sha256.hmac(pepper, ip);
  }
  const net = `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  return sha256.hmac(pepper, net);
};
