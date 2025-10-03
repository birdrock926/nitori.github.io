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
