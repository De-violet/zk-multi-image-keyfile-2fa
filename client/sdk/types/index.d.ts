export type Matrix8x8 = readonly number[];
export type ColorPalette = readonly string[];

export interface ZkCanvasSDKConfig {
  readonly secret: string | bigint;
  readonly canvas?: HTMLCanvasElement | null;
  readonly rotationIntervalMs?: number;
  readonly assetBaseUrl?: string;
  readonly wasmUrl?: string;
  readonly zkeyUrl?: string;
  readonly workerScriptUrl?: string;
  readonly customPalette?: ColorPalette;
  readonly workerTimeoutMs?: number;
  readonly customWorker?: Worker | null;
}

export interface TickEventPayload {
  readonly remainingMs: number;
  readonly currentWindow: number;
}

export interface PatternChangeEventPayload {
  readonly window: number;
  readonly matrix: Matrix8x8;
}

export interface ErrorEventPayload {
  readonly code: string;
  readonly message: string;
  readonly originalError?: unknown;
}

export interface ZkCanvasSDKEvents {
  tick: TickEventPayload;
  patternChange: PatternChangeEventPayload;
  error: ErrorEventPayload;
}

export interface Groth16Proof {
  readonly pi_a: readonly [string, string, string];
  readonly pi_b: readonly [readonly [string, string], readonly [string, string], readonly [string, string]];
  readonly pi_c: readonly [string, string, string];
  readonly protocol: 'groth16';
  readonly curve: 'bn128';
}

export interface ZkProofResult {
  readonly proof: Groth16Proof;
  readonly publicSignals: readonly string[];
  readonly durationMs: number;
}

export declare class ZkCanvasSDK {
  constructor(config: ZkCanvasSDKConfig);
  start(): Promise<void>;
  stop(): void;
  destroy(): void;
  generateProof(challenge: string | Uint8Array): Promise<ZkProofResult>;
  on<E extends keyof ZkCanvasSDKEvents>(
    event: E,
    handler: (payload: ZkCanvasSDKEvents[E]) => void
  ): () => void;
  getMatrix(): Matrix8x8 | null;
  getCurrentWindow(): number;
  isRunning(): boolean;
}

export declare function calculateTimeWindow(timestampMs: number, intervalMs?: number): number;
export declare function calculateRemainingMs(timestampMs: number, intervalMs?: number): number;
export declare function calculateNextWindowTimestamp(timestampMs: number, intervalMs?: number): number;
export declare function normalizeToBytes32(input: string | bigint | number | Uint8Array): Uint8Array;
export declare function decomposeToWords16(bytes32: Uint8Array): Uint16Array;
export declare const DEFAULT_PALETTE_16: ColorPalette;
export declare function extractNibblesFromWord16(word16: number): number[];
export declare function mapNibbleToColor(nibble: number, palette?: ColorPalette): string;
export declare function generateNumericMatrix(seed: string | bigint | number | Uint8Array): number[];
export declare function matrixToGrid2D(cells: number[]): number[][];
