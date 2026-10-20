import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';

/** The current time, refreshed every `intervalMs` (a minute by default), for the "now" line. */
export function useNow(intervalMs = 60_000): Dayjs {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
