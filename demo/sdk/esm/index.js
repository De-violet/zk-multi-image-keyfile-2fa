/**
 * Entry point zk-canvas-sdk (ESM & CJS)
 */

export { ZkCanvasSDK } from './sdk/ZkCanvasSDK.js';
export { calculateTimeWindow, calculateRemainingMs, calculateNextWindowTimestamp } from './core/timeWindow.js';
export { normalizeToBytes32, decomposeToWords16 } from './core/binary.js';
export { DEFAULT_PALETTE_16, extractNibblesFromWord16, mapNibbleToColor } from './core/palette.js';
export { generateNumericMatrix, matrixToGrid2D } from './core/matrix.js';
export { CanvasMatrixRenderer } from './renderer/canvasRenderer.js';
export { WorkerClient } from './worker/workerClient.js';
export { SdkEventEmitter } from './events/eventEmitter.js';
export { SnarkjsWorkerAdapter } from './zk/zkAdapter.js';
