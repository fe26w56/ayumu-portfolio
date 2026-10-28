/** Fixed example clock. Device chrome keeps its own real-time clock. */
export const DEMO_DATE = "2030-04-11";
export function today() { return DEMO_DATE; }
export function currentHour() { return 11; }
export function useAppClock() { return `${DEMO_DATE}:11`; }
