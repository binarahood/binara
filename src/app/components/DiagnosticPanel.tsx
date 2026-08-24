'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface DiagnosticData {
  // Chain connectivity
  chainReachable: boolean;
  chainId: number | null;
  chainHeadBlock: number | null;
  rpcLatencyMs: number | null;

  // Subgraph health
  subgraphReachable: boolean;
  subgraphEndpoint: string;
  subgraphLatencyMs: number | null;
  subgraphError: string | null;
  subgraphLastResponse: number | null;

  // Indexer state
  indexerStatus: string;
  lastIndexedBlock: number | null;
  lastIndexedTimestamp: number | null;
  poolsDiscovered: number;
  swapsIndexed: number;
  factoryAddress: string;
  protocol: string;
  indexerError: string | null;

  // Pool data
  poolCount: number;
  apiStatus: string;
  apiError: string | null;
  apiLastFetch: number | null;
  apiLatencyMs: number | null;

  // Error log
  errorLog: ErrorEntry[];
}

interface ErrorEntry {
  ts: number;
  source: 'rpc' | 'subgraph' | 'indexer' | 'api';
  message: string;
}

interface ApiResponse {
  status?: string;
  error?: string;
  detail?: string;
  chainId?: number;
  blockNumber?: number;
  pools?: unknown[];
  indexer?: {
    status?: string;
    lastIndexedBlock?: number;
    lastIndexedTimestamp?: number;
    poolsDiscovered?: number;
    swapsIndexed?: number;
    factoryAddress?: string;
    subgraphEndpoint?: string;
    protocol?: string;
    error?: string | null;
  };
}

const SUBGRAPH_URL = 'https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql';
const FACTORY_ADDRESS = '0xdcD5F77697914E27f56FD263EF82923C8524AbAc';

function formatTs(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function formatAgo(ts: number | null): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (ok) return <span className="inline-block w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />;
  if (warn) return <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse flex-shrink-0" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />;
}

export default function DiagnosticPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DiagnosticData | null>(null);
  const [lastRun, setLastRun] = useState<number | null>(null);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    const errors: ErrorEntry[] = [];

    // ── 1. Call /api/chain/pools ──────────────────────────────────────────────
    let apiData: ApiResponse | null = null;
    let apiReachable = false;
    let apiLatencyMs: number | null = null;
    let apiError: string | null = null;
    let apiLastFetch: number | null = null;

    try {
      const t0 = Date.now();
      const res = await fetch('/api/chain/pools', { cache: 'no-store' });
      apiLatencyMs = Date.now() - t0;
      apiLastFetch = Date.now();
      apiData = await res.json() as ApiResponse;
      if (!res.ok || apiData.error) {
        apiError = apiData.error || apiData.detail || `HTTP ${res.status}`;
        errors.push({ ts: Date.now(), source: 'api', message: apiError });
      } else {
        apiReachable = true;
      }
    } catch (e: unknown) {
      apiError = e instanceof Error ? e.message : 'Fetch failed';
      errors.push({ ts: Date.now(), source: 'api', message: apiError });
    }

    // ── 2. Probe subgraph directly ────────────────────────────────────────────
    let subgraphReachable = false;
    let subgraphLatencyMs: number | null = null;
    let subgraphError: string | null = null;
    let subgraphLastResponse: number | null = null;

    try {
      const t0 = Date.now();
      const sgRes = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `{ DLMMPool(limit: 1) { id } }`,
        }),
        signal: AbortSignal.timeout(8000),
      });
      subgraphLatencyMs = Date.now() - t0;
      if (sgRes.ok) {
        const sgData = await sgRes.json() as { errors?: { message: string }[] };
        if (sgData.errors && sgData.errors.length > 0) {
          subgraphError = sgData.errors.map((e) => e.message).join('; ');
          errors.push({ ts: Date.now(), source: 'subgraph', message: subgraphError });
        } else {
          subgraphReachable = true;
          subgraphLastResponse = Date.now();
        }
      } else {
        subgraphError = `HTTP ${sgRes.status}`;
        errors.push({ ts: Date.now(), source: 'subgraph', message: subgraphError });
      }
    } catch (e: unknown) {
      subgraphError = e instanceof Error ? e.message : 'Subgraph unreachable';
      errors.push({ ts: Date.now(), source: 'subgraph', message: subgraphError });
    }

    // ── 3. Assemble result ────────────────────────────────────────────────────
    const indexer = apiData?.indexer;
    const pools = apiData?.pools ?? [];

    const result: DiagnosticData = {
      // Chain
      chainReachable: apiReachable,
      chainId: apiData?.chainId ?? null,
      chainHeadBlock: apiData?.blockNumber ?? null,
      rpcLatencyMs: apiLatencyMs,

      // Subgraph
      subgraphReachable,
      subgraphEndpoint: SUBGRAPH_URL,
      subgraphLatencyMs,
      subgraphError,
      subgraphLastResponse,

      // Indexer
      indexerStatus: indexer?.status ?? apiData?.status ?? 'unknown',
      lastIndexedBlock: indexer?.lastIndexedBlock ?? null,
      lastIndexedTimestamp: indexer?.lastIndexedTimestamp
        ? indexer.lastIndexedTimestamp * 1000
        : null,
      poolsDiscovered: indexer?.poolsDiscovered ?? 0,
      swapsIndexed: indexer?.swapsIndexed ?? 0,
      factoryAddress: indexer?.factoryAddress ?? FACTORY_ADDRESS,
      protocol: indexer?.protocol ?? 'Ramses DLMM',
      indexerError: indexer?.error ?? null,

      // Pool data
      poolCount: pools.length,
      apiStatus: apiData?.status ?? (apiError ? 'error' : 'unknown'),
      apiError,
      apiLastFetch,
      apiLatencyMs,

      // Errors
      errorLog: errors,
    };

    if (indexer?.error) {
      errors.push({ ts: Date.now(), source: 'indexer', message: indexer.error });
    }

    setData(result);
    setLastRun(Date.now());
    setLoading(false);
  }, []);

  // Auto-run when panel opens
  useEffect(() => {
    if (open && !data) {
      runDiagnostics();
    }
  }, [open, data, runDiagnostics]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header — always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen((v) => !v); }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">🔬 Pool Indexer Diagnostics</span>
          {data && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
              data.poolCount > 0
                ? 'bg-green-500/10 text-green-400'
                : data.errorLog.length > 0
                ? 'bg-red-500/10 text-red-400' :'bg-yellow-500/10 text-yellow-400'
            }`}>
              {data.poolCount > 0
                ? `${data.poolCount} pools`
                : data.errorLog.length > 0
                ? `${data.errorLog.length} error${data.errorLog.length > 1 ? 's' : ''}`
                : 'no pools'}
            </span>
          )}
          {lastRun && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Last run: {formatAgo(lastRun)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); runDiagnostics(); }}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {loading ? 'Running…' : 'Run'}
          </button>
          <span className="text-muted-foreground text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {loading && !data && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
              Running diagnostics…
            </div>
          )}

          {data && (
            <>
              {/* ── Section 1: Chain & RPC ──────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Chain / RPC
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <DiagRow
                    label="RPC Reachable"
                    value={data.chainReachable ? 'Yes' : 'No'}
                    ok={data.chainReachable}
                  />
                  <DiagRow
                    label="Chain ID"
                    value={data.chainId !== null ? String(data.chainId) : '—'}
                    ok={data.chainId === 4663}
                    warn={data.chainId !== null && data.chainId !== 4663}
                  />
                  <DiagRow
                    label="Head Block"
                    value={data.chainHeadBlock !== null ? `#${data.chainHeadBlock.toLocaleString()}` : '—'}
                    ok={data.chainHeadBlock !== null}
                  />
                  <DiagRow
                    label="RPC Latency"
                    value={data.rpcLatencyMs !== null ? `${data.rpcLatencyMs}ms` : '—'}
                    ok={data.rpcLatencyMs !== null && data.rpcLatencyMs < 2000}
                    warn={data.rpcLatencyMs !== null && data.rpcLatencyMs >= 2000}
                  />
                </div>
              </div>

              {/* ── Section 2: Subgraph ─────────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Subgraph Query Health
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <DiagRow
                    label="Subgraph Reachable"
                    value={data.subgraphReachable ? 'Yes' : 'No'}
                    ok={data.subgraphReachable}
                  />
                  <DiagRow
                    label="Latency"
                    value={data.subgraphLatencyMs !== null ? `${data.subgraphLatencyMs}ms` : '—'}
                    ok={data.subgraphLatencyMs !== null && data.subgraphLatencyMs < 3000}
                    warn={data.subgraphLatencyMs !== null && data.subgraphLatencyMs >= 3000}
                  />
                  <DiagRow
                    label="Last Response"
                    value={formatTs(data.subgraphLastResponse)}
                    ok={data.subgraphReachable}
                  />
                  <DiagRow
                    label="Subgraph Error"
                    value={data.subgraphError ?? 'None'}
                    ok={!data.subgraphError}
                    mono={!!data.subgraphError}
                  />
                </div>
                <div className="mt-1.5">
                  <p className="text-xs text-muted-foreground font-mono break-all">
                    {data.subgraphEndpoint}
                  </p>
                </div>
              </div>

              {/* ── Section 3: Indexer State ────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Indexer State
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <DiagRow
                    label="Status"
                    value={data.indexerStatus}
                    ok={data.indexerStatus === 'live'}
                    warn={data.indexerStatus === 'indexing' || data.indexerStatus === 'idle'}
                  />
                  <DiagRow
                    label="Last Indexed Block"
                    value={data.lastIndexedBlock ? `#${data.lastIndexedBlock.toLocaleString()}` : '—'}
                    ok={data.lastIndexedBlock !== null && data.lastIndexedBlock > 0}
                  />
                  <DiagRow
                    label="Last Indexed At"
                    value={formatTs(data.lastIndexedTimestamp)}
                    ok={data.lastIndexedTimestamp !== null}
                  />
                  <DiagRow
                    label="Pools Discovered"
                    value={String(data.poolsDiscovered)}
                    ok={data.poolsDiscovered > 0}
                    warn={data.poolsDiscovered === 0}
                  />
                  <DiagRow
                    label="Swaps Indexed"
                    value={String(data.swapsIndexed)}
                    ok={data.swapsIndexed > 0}
                    warn={data.swapsIndexed === 0}
                  />
                  <DiagRow
                    label="Protocol"
                    value={data.protocol}
                    ok
                  />
                  <DiagRow
                    label="Factory"
                    value={`${data.factoryAddress.slice(0, 6)}…${data.factoryAddress.slice(-4)}`}
                    ok
                    mono
                    title={data.factoryAddress}
                  />
                  <DiagRow
                    label="Indexer Error"
                    value={data.indexerError ?? 'None'}
                    ok={!data.indexerError}
                    mono={!!data.indexerError}
                  />
                </div>
              </div>

              {/* ── Section 4: Pool Count ───────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Pool Data (/api/chain/pools)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <DiagRow
                    label="API Status"
                    value={data.apiStatus}
                    ok={data.apiStatus === 'live'}
                    warn={data.apiStatus === 'indexing'}
                  />
                  <DiagRow
                    label="Pool Count"
                    value={String(data.poolCount)}
                    ok={data.poolCount > 0}
                    warn={data.poolCount === 0}
                  />
                  <DiagRow
                    label="API Latency"
                    value={data.apiLatencyMs !== null ? `${data.apiLatencyMs}ms` : '—'}
                    ok={data.apiLatencyMs !== null && data.apiLatencyMs < 3000}
                    warn={data.apiLatencyMs !== null && data.apiLatencyMs >= 3000}
                  />
                  <DiagRow
                    label="Last Fetch"
                    value={formatTs(data.apiLastFetch)}
                    ok={data.apiLastFetch !== null}
                  />
                  {data.apiError && (
                    <div className="col-span-2 sm:col-span-4">
                      <DiagRow
                        label="API Error"
                        value={data.apiError}
                        ok={false}
                        mono
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section 5: Error Log ────────────────────────────────── */}
              {data.errorLog.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Error Log ({data.errorLog.length})
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {data.errorLog.map((entry, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-xs font-mono bg-red-500/5 border border-red-500/20 rounded px-2 py-1.5"
                      >
                        <span className="text-muted-foreground flex-shrink-0">{formatTs(entry.ts)}</span>
                        <span className={`flex-shrink-0 px-1 rounded text-[10px] uppercase font-semibold ${
                          entry.source === 'subgraph' ? 'bg-orange-500/20 text-orange-400' :
                          entry.source === 'rpc' ? 'bg-blue-500/20 text-blue-400' :
                          entry.source === 'indexer'? 'bg-purple-500/20 text-purple-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {entry.source}
                        </span>
                        <span className="text-red-400 break-all">{entry.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Diagnosis summary ──────────────────────────────────── */}
              <DiagnosisSummary data={data} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DiagRow({
  label,
  value,
  ok,
  warn,
  mono,
  title,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
  mono?: boolean;
  title?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-muted/20 rounded-lg px-2.5 py-2">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-1.5">
        <StatusDot ok={!!ok} warn={warn && !ok} />
        <span
          className={`text-xs truncate ${mono ? 'font-mono' : ''} ${
            ok ? 'text-foreground' : warn ? 'text-yellow-400' : 'text-red-400'
          }`}
          title={title ?? value}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function DiagnosisSummary({ data }: { data: DiagnosticData }) {
  const issues: string[] = [];

  if (!data.chainReachable) issues.push('RPC endpoint is unreachable — check ROBINHOOD_RPC_URL env var.');
  if (data.chainId !== null && data.chainId !== 4663) issues.push(`Wrong chain ID: got ${data.chainId}, expected 4663.`);
  if (!data.subgraphReachable) issues.push('Subgraph is unreachable — pools cannot be discovered without it.');
  if (data.subgraphError) issues.push(`Subgraph error: ${data.subgraphError}`);
  if (data.poolsDiscovered === 0 && data.subgraphReachable) issues.push('Subgraph reachable but returned 0 pools — factory address may be wrong or no pools exist yet.');
  if (data.indexerStatus === 'idle') issues.push('Indexer is idle — it may not have started yet. Try refreshing.');
  if (data.indexerError) issues.push(`Indexer error: ${data.indexerError}`);
  if (data.poolCount === 0 && data.poolsDiscovered > 0) issues.push('Pools were discovered but not returned by API — check formatPoolForAPI logic.');

  if (issues.length === 0 && data.poolCount === 0) {
    issues.push('No specific errors detected. The indexer may still be in its first sync cycle — wait 30–60 seconds and re-run.');
  }

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${
      data.poolCount > 0
        ? 'border-green-500/30 bg-green-500/5'
        : issues.length > 0
        ? 'border-red-500/30 bg-red-500/5' :'border-yellow-500/30 bg-yellow-500/5'
    }`}>
      <p className="text-xs font-semibold mb-1.5 text-foreground">
        {data.poolCount > 0
          ? `✅ ${data.poolCount} pool${data.poolCount > 1 ? 's' : ''} indexed — data pipeline is working`
          : '⚠ Why /api/chain/pools returns empty'}
      </p>
      {data.poolCount === 0 && (
        <ul className="space-y-1">
          {issues.map((issue, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-yellow-400 flex-shrink-0 mt-0.5">→</span>
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
