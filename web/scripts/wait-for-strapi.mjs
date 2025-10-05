#!/usr/bin/env node
import { setTimeout as sleep } from 'node:timers/promises';

const DEFAULT_BASE = 'http://localhost:1337';
const timeoutMs = Number(process.env.STRAPI_WAIT_TIMEOUT_MS || 120000);
const intervalMs = Number(process.env.STRAPI_WAIT_INTERVAL_MS || 3000);

const baseUrl = (process.env.STRAPI_API_URL || DEFAULT_BASE).replace(/\/$/, '');
const probePath = process.env.STRAPI_WAIT_ENDPOINT || '/api/posts?pagination[pageSize]=1';

const abortController = new AbortController();

const now = () => new Date().toISOString();

async function probeOnce() {
  try {
    const response = await fetch(`${baseUrl}${probePath}`, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      return true;
    }
    console.warn(`[wait-for-strapi] ${now()} probe failed with status ${response.status}`);
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[wait-for-strapi] ${now()} probe error: ${message}`);
    return false;
  }
}

async function waitForStrapi() {
  const startedAt = Date.now();
  console.log(`[wait-for-strapi] Waiting for Strapi at ${baseUrl}${probePath}`);
  while (Date.now() - startedAt < timeoutMs) {
    if (await probeOnce()) {
      console.log('[wait-for-strapi] Strapi is reachable, continuing...');
      return;
    }
    await sleep(intervalMs, undefined, { signal: abortController.signal }).catch(() => {});
  }
  console.warn('[wait-for-strapi] Timeout reached, continuing without Strapi');
}

waitForStrapi().then(() => {
  // no-op: script exits naturally
});
