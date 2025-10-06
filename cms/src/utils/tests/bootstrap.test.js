import { describe, expect, jest, test } from '@jest/globals';
import { ensureCommentContentManagerConfig } from '../bootstrap.js';

const createLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('ensureCommentContentManagerConfig', () => {
  test('applies configuration via content-manager service when available', async () => {
    const clearCache = jest.fn();
    const setConfiguration = jest.fn();
    const service = jest.fn().mockReturnValue({
      setConfiguration,
      clearCache,
    });
    const plugin = jest.fn().mockReturnValue({ service });
    const store = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
    const strapi = {
      plugin,
      store: jest.fn().mockResolvedValue(store),
      log: createLogger(),
    };

    await ensureCommentContentManagerConfig(strapi);

    expect(plugin).toHaveBeenCalledWith('content-manager');
    expect(service).toHaveBeenCalledWith('content-types');
    expect(setConfiguration).toHaveBeenCalledWith(
      'api::comment.comment',
      expect.objectContaining({
        settings: expect.any(Object),
        layouts: expect.any(Object),
        metadatas: expect.any(Object),
      })
    );
    expect(clearCache).toHaveBeenCalledWith('api::comment.comment');
    expect(store.set).not.toHaveBeenCalled();
  });

  test('falls back to core store when service is unavailable', async () => {
    const plugin = jest.fn().mockReturnValue({ service: jest.fn().mockReturnValue(undefined) });
    const store = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const strapi = {
      plugin,
      store: jest.fn().mockResolvedValue(store),
      log: createLogger(),
    };

    await ensureCommentContentManagerConfig(strapi);

    expect(store.set).toHaveBeenCalledWith({
      value: expect.objectContaining({
        settings: expect.any(Object),
        layouts: expect.any(Object),
        metadatas: expect.any(Object),
      }),
    });
  });
});
