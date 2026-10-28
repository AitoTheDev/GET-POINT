import dayjs from 'dayjs';
import buddhistEra from 'dayjs/plugin/buddhistEra';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import 'dayjs/locale/th';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(buddhistEra);

export const APP_TIMEZONE = 'Asia/Bangkok';

type DateInput = string | number | Date;

const inBangkok = (value: DateInput) => dayjs(value).tz(APP_TIMEZONE).locale('th');

/** "10 ต.ค. 2569" */
export const formatThaiDate = (value: DateInput) => inBangkok(value).format('D MMM BBBB');

/** "10 ต.ค. 2569 14:32" */
export const formatThaiDateTime = (value: DateInput) => inBangkok(value).format('D MMM BBBB HH:mm');

/** "10/10/2569" */
export const formatThaiShortDate = (value: DateInput) => inBangkok(value).format('DD/MM/BBBB');

/** "10/10/2569 14:32" */
export const formatThaiShortDateTime = (value: DateInput) =>
  inBangkok(value).format('DD/MM/BBBB HH:mm');

/** "1,250.00" */
export const formatMoney = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "18,420" */
export const formatNumber = (value: number) => value.toLocaleString('en-US');
