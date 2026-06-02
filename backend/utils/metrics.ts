/**
 * metrics.ts
 *
 * In-process observability metrics for the Yaksha FAQ backend.
 *
 * Exposes a Prometheus-compatible /api/metrics endpoint with:
 *   - Counter  : cumulative counts (e.g. search_requests_total)
 *   - Gauge    : current values (e.g. queue_size)
 *   - Histogram: distributions (e.g. search_latency_ms)
 *
 * No external dependencies — uses only Node.js built-ins.
 *
 * Usage:
 *   import { httpRequestDuration, searchRequests } from './utils/metrics.js';
 *
 *   // Increment a counter:
 *   searchRequests.inc({ source: 'redis' });
 *
 *   // Observe a latency:
 *   httpRequestDuration.observe({ method: 'POST', route: '/api/search' }, 45.3);
 *
 *   // Read all metrics (for /api/metrics endpoint):
 *   const snapshot = getMetrics();
 */

import { getRequestId } from './requestContext.js';

// ─── Metric Type Definitions ───────────────────────────────────────────────────

type Labels = Record<string, string | number | boolean>;

interface Counter {
  inc(labels?: Labels): void;
  value(): number;
}

interface Gauge {
  inc(labels?: Labels): void;
  dec(labels?: Labels): void;
  set(value: number, labels?: Labels): void;
  value(labels?: Labels): number;
}

interface Histogram {
  observe(labels: Labels, value: number): void;
  value(): Map<string, number>;
}

interface MetricSnapshot {
  counters: Map<string, number>;
  gauges: Map<string, number>;
  histograms: Map<string, { count: number; sum: number; buckets: Map<string, number> }>;
}

// ─── Storage ───────────────────────────────────────────────────────────────────

// Raw storage: metricName -> labelKey -> value
// For counters/gauges: { [metricName]: { [labelKey]: number } }
// For histograms: { [metricName]: { [labelKey]: { count, sum, buckets: { [bucket]: count } } } }
const store: Map<string, Map<string, unknown>> = new Map();

const HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/** Build a deterministic label key from a Labels object. */
function labelKey(labels: Labels = {}): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${String(v)}"`)
    .join(',');
}

// ─── Counter ───────────────────────────────────────────────────────────────────

function ensureCounter(name: string): Map<string, number> {
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name) as Map<string, number>;
}

/**
 * Create or get a Counter metric.
 *
 * Counter semantics: only increments; never decrements. Value is cumulative
 * across the process lifetime.
 */
export function getCounter(name: string): Counter {
  return {
    inc(labels: Labels = {}): void {
      const key = labelKey(labels);
      const map = ensureCounter(name);
      map.set(key, (map.get(key) ?? 0) + 1);
    },
    value(): number {
      const map = store.get(name) as Map<string, number> | undefined;
      if (!map) return 0;
      let total = 0;
      for (const v of map.values()) total += v;
      return total;
    },
  };
}

// ─── Gauge ─────────────────────────────────────────────────────────────────────

function ensureGauge(name: string): Map<string, number> {
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name) as Map<string, number>;
}

/**
 * Create or get a Gauge metric.
 *
 * Gauge semantics: can go up or down; reflects current value at observation time.
 */
export function getGauge(name: string): Gauge {
  return {
    inc(labels: Labels = {}): void {
      const key = labelKey(labels);
      const map = ensureGauge(name);
      map.set(key, (map.get(key) ?? 0) + 1);
    },
    dec(labels: Labels = {}): void {
      const key = labelKey(labels);
      const map = ensureGauge(name);
      map.set(key, (map.get(key) ?? 0) - 1);
    },
    set(value: number, labels: Labels = {}): void {
      const key = labelKey(labels);
      ensureGauge(name).set(key, value);
    },
    value(labels: Labels = {}): number {
      const map = store.get(name) as Map<string, number> | undefined;
      if (!map) return 0;
      return map.get(labelKey(labels)) ?? 0;
    },
  };
}

// ─── Histogram ─────────────────────────────────────────────────────────────────

interface HistogramData {
  count: number;
  sum: number;
  buckets: Map<string, number>;
}

function ensureHistogram(name: string): Map<string, HistogramData> {
  if (!store.has(name)) {
    const buckets = new Map<string, number>();
    for (const b of HISTOGRAM_BUCKETS) buckets.set(String(b), 0);
    store.set(name, new Map());
  }
  return store.get(name) as Map<string, HistogramData>;
}

/**
 * Create or get a Histogram metric.
 *
 * Histogram semantics: tracks count and sum of observations, plus
 * cumulative bucket counts for latency/Size distributions.
 */
export function getHistogram(name: string): Histogram {
  return {
    observe(labels: Labels, value: number): void {
      const key = labelKey(labels);
      const map = ensureHistogram(name);
      let data = map.get(key);
      if (!data) {
        const buckets = new Map<string, number>();
        for (const b of HISTOGRAM_BUCKETS) buckets.set(String(b), 0);
        data = { count: 0, sum: 0, buckets };
        map.set(key, data);
      }
      data.count++;
      data.sum += value;
      // Update buckets
      for (const [boundStr, count] of data.buckets) {
        if (value <= Number(boundStr)) {
          data.buckets.set(boundStr, count + 1);
        }
      }
    },
    value(): Map<string, number> {
      const map = store.get(name) as Map<string, HistogramData> | undefined;
      if (!map) return new Map();
      const result = new Map<string, number>();
      for (const [key, data] of map.entries()) {
        result.set(key, data.count);
      }
      return result;
    },
  };
}

// ─── Prometheus Exposition Format ─────────────────────────────────────────────

function formatCounter(name: string, map: Map<string, number>): string {
  const help = ''; // metrics don't carry help strings in this simple impl
  const lines: string[] = [];
  for (const [labels, value] of map.entries()) {
    const labelBlock = labels ? `{${labels}}` : '';
    lines.push(`# TYPE ${name} counter`);
    lines.push(`# HELP ${name} counter metric`);
    lines.push(`${name}${labelBlock} ${value}`);
  }
  return lines.join('\n');
}

function formatGauge(name: string, map: Map<string, number>): string {
  const lines: string[] = [];
  for (const [labels, value] of map.entries()) {
    const labelBlock = labels ? `{${labels}}` : '';
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`# HELP ${name} gauge metric`);
    lines.push(`${name}${labelBlock} ${value}`);
  }
  return lines.join('\n');
}

function formatHistogram(name: string, map: Map<string, HistogramData>): string {
  const lines: string[] = [];
  for (const [labels, data] of map.entries()) {
    const labelBlock = labels ? `{${labels}}` : '';
    lines.push(`# TYPE ${name} histogram`);
    lines.push(`# HELP ${name} histogram metric`);
    // Bucket lines
    const sortedBuckets = [...data.buckets.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
    for (const [bound, count] of sortedBuckets) {
      lines.push(`${name}_bucket${labelBlock}{le="${bound}"} ${count}`);
    }
    lines.push(`${name}_bucket${labelBlock}{le="+Inf"} ${data.count}`);
    lines.push(`${name}_sum${labelBlock} ${data.sum}`);
    lines.push(`${name}_count${labelBlock} ${data.count}`);
  }
  return lines.join('\n');
}

/**
 * Get a snapshot of all registered metrics in Prometheus exposition format.
 */
export function getMetrics(): string {
  const parts: string[] = [];

  for (const [name, inner] of store.entries()) {
    if (!inner) continue;

    if (name.includes('_histogram')) {
      parts.push(formatHistogram(name, inner as Map<string, HistogramData>));
    } else if (inner instanceof Map) {
      const firstVal = inner.values().next().value;
      if (typeof firstVal === 'number') {
        parts.push(formatGauge(name, inner as Map<string, number>));
      } else if (typeof firstVal === 'object' && firstVal !== null) {
        // Could be histogram data
        const sample = firstVal as HistogramData;
        if ('count' in sample && 'sum' in sample) {
          parts.push(formatHistogram(name, inner as Map<string, HistogramData>));
        }
      }
    }
  }

  // Append process metrics
  const mem = process.memoryUsage();
  parts.push(
    `# TYPE process_memory_bytes gauge`,
    `# HELP process_memory_bytes process memory usage`,
    `process_memory_bytes{type="rss"} ${mem.rss}`,
    `process_memory_bytes{type="heapUsed"} ${mem.heapUsed}`,
    `process_memory_bytes{type="heapTotal"} ${mem.heapTotal}`,
    `process_memory_bytes{type="external"} ${mem.external}`,
    `# TYPE process_uptime_seconds gauge`,
    `# HELP process_uptime_seconds process uptime`,
    `process_uptime_seconds ${Math.floor(process.uptime())}`,
  );

  return parts.join('\n') + '\n';
}

/**
 * Reset all metrics (useful for testing).
 */
export function resetMetrics(): void {
  store.clear();
}

// ─── Predefined Application Metrics ───────────────────────────────────────────

/** Total search requests, labelled by source (redis, lru, fresh). */
export const searchRequests = getCounter('search_requests_total');

/** Total search results returned, labelled by source. */
export const searchResultsReturned = getHistogram('search_results_returned');

/** Search latency in milliseconds, labelled by route. */
export const searchLatency = getHistogram('search_latency_ms');

/** HTTP request duration in milliseconds, labelled by method and route. */
export const httpRequestDuration = getHistogram('http_request_duration_ms');

/** Escalation events total. */
export const escalationsTotal = getCounter('escalations_total');

/** Job queue size (gauge). */
export const jobQueueSize = getGauge('job_queue_size');

/** Jobs processed total, labelled by outcome (completed, failed). */
export const jobQueueProcessed = getCounter('job_queue_processed_total');

/** Active search log flush in progress (gauge). */
export const searchLogFlushActive = getGauge('search_log_flush_active');

/** Total search log flushes. */
export const searchLogFlushes = getCounter('search_log_flushes_total');