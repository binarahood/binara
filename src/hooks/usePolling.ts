'use client';

// This file is kept for backward compatibility.
// All live data fetching is now handled by useChainData.ts
// usePoolsPolling and useSinglePoolPolling are deprecated — use usePoolsData and useSinglePoolData instead.

export { usePoolsData as usePoolsPolling, useSinglePoolData as useSinglePoolPolling } from './useChainData';
export type { DashboardMetrics } from './useChainData';
