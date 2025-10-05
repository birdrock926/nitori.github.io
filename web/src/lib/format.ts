import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import 'dayjs/locale/ja.js';
import { TIMEZONE } from '@config/site';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ja');

export const formatDateTime = (iso: string) =>
  dayjs(iso).tz(TIMEZONE).format('YYYY-MM-DD HH:mm');

export const relative = (iso: string) => dayjs(iso).fromNow();

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const toMultilineHtml = (value?: string | null) => {
  if (!value) return '';
  const normalized = value.replace(/\r\n?/g, '\n');
  return escapeHtml(normalized).replace(/\n/g, '<br />');
};
