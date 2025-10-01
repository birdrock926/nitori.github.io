import { jest } from '@jest/globals';
import {
  validateBody,
  hashIp,
  networkHash,
  generateAlias,
  enforceRateLimit,
  detectSimilarity,
} from '../comment.js';

describe('コメントユーティリティ', () => {
  test('本文バリデーション成功', () => {
    expect(() => validateBody('これはテストです')).not.toThrow();
  });

  test('禁止語を検知', () => {
    expect(() => validateBody('これは違法な投稿です')).toThrow('禁止語句');
  });

  test('URL 数制限', () => {
    const body = 'a ' + Array.from({ length: 4 })
      .map((_, idx) => `https://youtube.com/watch?v=${idx}`)
      .join(' ');
    expect(() => validateBody(body)).toThrow('URL');
  });

  test('ハッシュは同じ入力で一致', () => {
    expect(hashIp('1.1.1.1', 'pepper')).toBe(hashIp('1.1.1.1', 'pepper'));
    expect(networkHash('1.1.1.1', 'pepper')).toBe(networkHash('1.1.1.2', 'pepper'));
  });

  test('エイリアス生成は固定長', () => {
    const alias = generateAlias('1.2.3.4', 1, 'salt');
    expect(alias.startsWith('名無しさん-')).toBe(true);
    expect(alias.length).toBeGreaterThan(5);
  });

  test('レート制限', async () => {
    const counts = [];
    const strapi = {
      entityService: {
        count: jest.fn(async () => {
          counts.push(1);
          return counts.length === 1 ? 0 : 1;
        }),
      },
    };
    await expect(
      enforceRateLimit(strapi, { ipHash: 'abc', min: 1, hour: 5, day: 10 })
    ).resolves.toBeUndefined();
    await expect(
      enforceRateLimit(strapi, { ipHash: 'abc', min: 1, hour: 5, day: 10 })
    ).rejects.toThrow('投稿レート制限');
  });

  test('類似判定', async () => {
    const strapi = {
      entityService: {
        findMany: jest.fn(async () => [
          { body: 'これはテストコメントです' },
        ]),
      },
    };
    await expect(
      detectSimilarity(strapi, { ipHash: 'abc', body: 'これはテストコメントです' })
    ).rejects.toThrow('類似した投稿');
  });
});
