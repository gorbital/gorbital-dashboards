/**
 * The System tab keeps the last 60 samples of a few numbers client-side
 * (the portal answers one sample at a time) for the sparklines.
 */

export const SAMPLE_WINDOW = 60;

/** `history` with `value` appended, at most `max` long (the oldest drops off). */
export function pushSample(history: number[], value: number, max = SAMPLE_WINDOW): number[] {
  const v = Number.isFinite(value) ? value : 0;
  const next = history.length >= max ? [...history.slice(history.length - max + 1), v] : [...history, v];
  return next;
}

export type SampleSeries = { at: string; cpu: number[]; app_cpu: number[]; memory: number[]; app_rss: number[]; goroutines: number[]; heap: number[] };

export const emptySeries: SampleSeries = { at: "", cpu: [], app_cpu: [], memory: [], app_rss: [], goroutines: [], heap: [] };

/** One sample folded into the series; a sample with the same `sampled_at` as the last is skipped (the poll outran the sampler). */
export function addSample(series: SampleSeries, sample: { at: string; cpu: number; app_cpu?: number; memory: number; app_rss?: number; goroutines?: number; heap?: number }): SampleSeries {
  if (sample.at && sample.at === series.at) return series;
  return {
    at: sample.at,
    cpu: pushSample(series.cpu, sample.cpu),
    app_cpu: pushSample(series.app_cpu, sample.app_cpu ?? 0),
    memory: pushSample(series.memory, sample.memory),
    app_rss: pushSample(series.app_rss, sample.app_rss ?? 0),
    goroutines: sample.goroutines === undefined ? series.goroutines : pushSample(series.goroutines, sample.goroutines),
    heap: sample.heap === undefined ? series.heap : pushSample(series.heap, sample.heap),
  };
}

/** A series padded to at least two points so the sparkline draws a line, not nothing. */
export function sparkData(values: number[]): number[] {
  if (values.length === 0) return [0, 0];
  if (values.length === 1) return [values[0], values[0]];
  return values;
}
