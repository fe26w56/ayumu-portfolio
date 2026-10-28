export type TimeSeriesRange = "7" | "28" | "90" | "365";
export type TimeSeriesResolution = "daily" | "weekly" | "monthly";
export type TimeSeriesDatum = { date: string; value?: number };
export type AggregatedTimeSeriesDatum = {
  key: string;
  startDate: string;
  endDate: string;
  value?: number;
  sampleCount: number;
};

export const timeSeriesRanges: Array<{ value: TimeSeriesRange; label: string }> = [
  { value: "7", label: "1週間" },
  { value: "28", label: "4週間" },
  { value: "90", label: "3か月" },
  { value: "365", label: "1年" },
];

export function rangeDays(range: TimeSeriesRange) {
  return Number(range);
}

export function rangeResolution(range: TimeSeriesRange): TimeSeriesResolution {
  if (range === "90") return "weekly";
  if (range === "365") return "monthly";
  return "daily";
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateDistance(laterDate: string, earlierDate: string) {
  const later = new Date(`${laterDate}T12:00:00Z`).getTime();
  const earlier = new Date(`${earlierDate}T12:00:00Z`).getTime();
  return Math.round((later - earlier) / 86_400_000);
}

export function periodOffsetForDate(latestDate: string, selectedDate: string, range: TimeSeriesRange) {
  return Math.max(0, Math.floor(Math.max(0, dateDistance(latestDate, selectedDate)) / rangeDays(range)));
}

export function periodBounds(latestDate: string, range: TimeSeriesRange, offset = 0) {
  const days = rangeDays(range);
  const endDate = shiftDate(latestDate, -Math.max(0, offset) * days);
  return { startDate: shiftDate(endDate, -(days - 1)), endDate };
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

export function aggregateTimeSeries(data: TimeSeriesDatum[], startDate: string, endDate: string, resolution: TimeSeriesResolution) {
  const byDate = new Map(data.map((item) => [item.date, item.value]));
  if (resolution === "daily") {
    const days = dateDistance(endDate, startDate) + 1;
    return Array.from({ length: Math.max(0, days) }, (_, index): AggregatedTimeSeriesDatum => {
      const date = shiftDate(startDate, index);
      const value = byDate.get(date);
      return { key: date, startDate: date, endDate: date, value, sampleCount: value == null ? 0 : 1 };
    });
  }

  const groups = new Map<string, { startDate: string; endDate: string; values: number[] }>();
  const totalDays = dateDistance(endDate, startDate) + 1;
  for (let index = 0; index < totalDays; index += 1) {
    const date = shiftDate(startDate, index);
    const key = resolution === "weekly" ? `week-${Math.floor(index / 7)}` : date.slice(0, 7);
    const group = groups.get(key) ?? { startDate: date, endDate: date, values: [] };
    group.endDate = date;
    const value = byDate.get(date);
    if (value != null) group.values.push(value);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    startDate: group.startDate,
    endDate: group.endDate,
    value: average(group.values),
    sampleCount: group.values.length,
  }));
}

export function contiguousValueSegments<T extends { value?: number }>(values: T[]) {
  const segments: T[][] = [];
  values.forEach((item, index) => {
    if (item.value == null) return;
    const previous = values[index - 1];
    if (!segments.length || previous?.value == null) segments.push([]);
    segments.at(-1)!.push(item);
  });
  return segments;
}
