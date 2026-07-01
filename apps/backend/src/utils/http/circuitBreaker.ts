/**
 * Minimal circuit breaker implementation.
 * No external packages required.
 *
 * States:
 *   CLOSED  → normal operation, requests pass through
 *   OPEN    → requests fail immediately with CircuitOpenError
 *   HALF-OPEN → one probe request allowed to test if service recovered
 *
 * Usage:
 *   const cb = new CircuitBreaker('zoom-api', { failureThreshold: 3, recoveryTimeout: 30_000 });
 *   const result = await cb.execute(() => somePotentiallyFailingCall());
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 3 */
  failureThreshold?: number;
  /** Milliseconds to wait before transitioning OPEN → HALF-OPEN. Default: 30000 */
  recoveryTimeout?: number;
  /** Maximum concurrent executions before short-circuiting. Default: 1 */
  maxConcurrent?: number;
  /** Name used in log messages. Default: 'circuit-breaker' */
  name?: string;
}

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_RECOVERY_TIMEOUT  = 30_000;
const DEFAULT_MAX_CONCURRENT    = 1;

export class CircuitOpenError extends Error {
  readonly serviceName: string;
  constructor(serviceName: string) {
    super(`CircuitBreaker [${serviceName}]: circuit is OPEN — request rejected`);
    this.name = 'CircuitOpenError';
    this.serviceName = serviceName;
  }
}

export class CircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly recoveryTimeout: number;
  private readonly maxConcurrent: number;

  private state: CircuitState = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private ongoing = 0;
  private halfOpenProbeStarted = false;

  constructor(options: CircuitBreakerOptions = {}) {
    this.name              = options.name              ?? 'circuit-breaker';
    this.failureThreshold  = options.failureThreshold  ?? DEFAULT_FAILURE_THRESHOLD;
    this.recoveryTimeout   = options.recoveryTimeout   ?? DEFAULT_RECOVERY_TIMEOUT;
    this.maxConcurrent     = options.maxConcurrent     ?? DEFAULT_MAX_CONCURRENT;
  }

  getState(): CircuitState {
    this._maybeTransition();
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  /** Attempt to execute fn through the circuit breaker. Throws CircuitOpenError when open. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this._maybeTransition();

    if (this.state === 'open') {
      throw new CircuitOpenError(this.name);
    }

    if (this.state === 'half-open') {
      if (this.ongoing >= this.maxConcurrent) {
        throw new CircuitOpenError(this.name);
      }
    }

    if (this.ongoing >= this.maxConcurrent) {
      throw new CircuitOpenError(this.name);
    }

    this.ongoing++;
    let result: T;
    try {
      result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    } finally {
      this.ongoing--;
    }
  }

  /** Force the circuit into a given state. Useful for testing or admin resets. */
  reset(newState: CircuitState = 'closed'): void {
    this.state = newState;
    this.failures = 0;
    this.lastFailureTime = 0;
    this.halfOpenProbeStarted = false;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _maybeTransition(): void {
    if (this.state === 'open' && Date.now() - this.lastFailureTime >= this.recoveryTimeout) {
      this.state = 'half-open';
      this.halfOpenProbeStarted = false;
    }
  }

  private _onSuccess(): void {
    if (this.state === 'half-open') {
      // Recovery succeeded — close the circuit
      this.state = 'closed';
      this.failures = 0;
      this.halfOpenProbeStarted = false;
    } else if (this.state === 'closed') {
      // Reset failure counter on success
      this.failures = 0;
    }
  }

  private _onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Probe failed — go back to open
      this.state = 'open';
      this.halfOpenProbeStarted = false;
    } else if (this.state === 'closed' && this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }
}

// ── Singleton instances for Zoom API calls ─────────────────────────────────────

const DEFAULT_ZOOM_OPTIONS: CircuitBreakerOptions = {
  name:             'zoom-api',
  failureThreshold: 3,
  recoveryTimeout:  30_000,
  maxConcurrent:    3,
};

/** Circuit breaker for Zoom OAuth token exchange / refresh operations */
export const zoomOAuthCircuit = new CircuitBreaker({
  ...DEFAULT_ZOOM_OPTIONS,
  name: 'zoom-oauth',
});

/** Circuit breaker for general Zoom API calls (meeting list, insights, etc.) */
export const zoomApiCircuit = new CircuitBreaker({
  ...DEFAULT_ZOOM_OPTIONS,
  name: 'zoom-api',
});