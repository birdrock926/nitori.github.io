import { jest } from '@jest/globals';
import {
  validateBody,
  evaluateModeration,
  hashIp,
  networkHash,
  generateAlias,
  sanitizeAliasInput,
  resolveAlias,
  enforceRateLimit,
  detectSimilarity,
  createClientMeta,
  readClientMeta,
  buildCommentResponse,
} from '../comment.js';

describe('コメントユーティリティ', () => {
  test('本文バリデーション成功', () => {
    expect(validateBody('これはテストです')).toBe('これはテストです');
  });

  test('本文は1文字でも許可される', () => {
    expect(validateBody('あ')).toBe('あ');
  });

  test('禁止語はモデレーション対象になる', () => {
    const result = evaluateModeration('これは違法な投稿です');
    expect(result.requiresReview).toBe(true);
    expect(result.reasons.some((reason) => reason.type === 'word')).toBe(true);
  });

  test('URL 数が多い場合はモデレーション対象', () => {
    const body =
      'a ' +
      Array.from({ length: 4 })
        .map((_, idx) => `https://youtube.com/watch?v=${idx}`)
        .join(' ');
    const result = evaluateModeration(body);
    expect(result.requiresReview).toBe(true);
    expect(result.reasons.some((reason) => reason.type === 'link-count')).toBe(true);
  });

  test('ハッシュは同じ入力で一致', () => {
    expect(hashIp('1.1.1.1', 'pepper')).toBe(hashIp('1.1.1.1', 'pepper'));
    expect(networkHash('1.1.1.1', 'pepper')).toBe(networkHash('1.1.1.2', 'pepper'));
  });

  test('エイリアス生成はテンプレートを尊重する', () => {
    const alias = generateAlias('1.2.3.4', 1, 'salt', '名無しの冒険者さん');
    expect(alias).toBe('名無しの冒険者さん');
  });

  test('表示名のサニタイズ', () => {
    expect(sanitizeAliasInput(' テスト ')).toBe('テスト');
    expect(() => sanitizeAliasInput('あ')).toThrow('表示名');
  });

  test('入力があればそのまま利用する', () => {
    const result = resolveAlias({
      requestedAlias: 'コアメンバー',
      template: '名無しのプレイヤーさん',
      ip: '1.1.1.1',
      postId: 1,
      aliasSalt: 'salt',
    });
    expect(result.alias).toBe('コアメンバー');
    expect(result.provided).toBe(true);
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

  test('クライアントメタの生成と参照', () => {
    const payload = createClientMeta({
      ip: '203.0.113.5',
      ua: 'jest-agent',
      submittedAt: '2025-10-04T00:00:00.000Z',
    });
    expect(payload.ip).toBe('203.0.113.5');
    expect(payload.maskedIp).toBe('203.0.113.xxx');
    const restored = readClientMeta(payload);
    expect(restored.ip).toBe('203.0.113.5');
    expect(restored.maskedIp).toBe('203.0.113.xxx');
    expect(restored.ua).toBe('jest-agent');
    expect(restored.submittedAt).toBe('2025-10-04T00:00:00.000Z');
  });

  test('コメントレスポンスのステータスを正規化する', () => {
    const result = buildCommentResponse({
      id: 1,
      body: 'test',
      alias: 'tester',
      status: 'Published',
      createdAt: '2025-10-04T00:00:00.000Z',
      isModerator: false,
      meta: null,
      children: [],
    });
    expect(result.status).toBe('published');
  });
});
