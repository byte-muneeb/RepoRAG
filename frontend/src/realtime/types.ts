export type StreamTransport = 'sse' | 'mock' | 'websocket';

export type IngestionPhase = 'clone' | 'parse' | 'embed' | 'index' | 'ready' | 'error';

export type UIPulseTarget = 'left-rail' | 'workbench' | 'insight-rail' | 'center';

export type PulseStrength = 'low' | 'medium' | 'high';

export interface EventBase {
  ts: number;
}

export interface LlmStreamStartedEvent extends EventBase {
  type: 'llm.stream.started';
  sessionId: string;
  prompt: string;
}

export interface LlmTokenEvent extends EventBase {
  type: 'llm.token';
  sessionId: string;
  token: string;
  accumulatedText: string;
}

export interface LlmStreamCompletedEvent extends EventBase {
  type: 'llm.stream.completed';
  sessionId: string;
  fullText: string;
}

export interface LlmStreamErrorEvent extends EventBase {
  type: 'llm.stream.error';
  sessionId: string;
  message: string;
}

export interface IngestionProgressEvent extends EventBase {
  type: 'ingestion.progress';
  phase: IngestionPhase;
  progress: number;
  message: string;
  indexedFile?: string;
}

export interface FileIndexedEvent extends EventBase {
  type: 'file.indexed';
  path: string;
  shardId: string;
  progress: number;
}

export interface SceneShardPulseEvent extends EventBase {
  type: 'scene.shard.pulse';
  shardId: string;
  intensity: number;
  durationMs: number;
  reason: 'token-mention' | 'file-indexed' | 'manual';
}

export interface UiPulseEvent extends EventBase {
  type: 'ui.pulse';
  target: UIPulseTarget;
  strength: PulseStrength;
  reason: string;
}

export type ReporagEvent =
  | LlmStreamStartedEvent
  | LlmTokenEvent
  | LlmStreamCompletedEvent
  | LlmStreamErrorEvent
  | IngestionProgressEvent
  | FileIndexedEvent
  | SceneShardPulseEvent
  | UiPulseEvent;

export interface StreamSessionState {
  text: string;
  tokenCount: number;
  isStreaming: boolean;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

export interface IngestionState {
  phase: IngestionPhase;
  progress: number;
  message: string;
  indexedFiles: number;
  startedAt?: number;
  updatedAt?: number;
}

export interface UITransientPulse {
  id: string;
  target: UIPulseTarget;
  strength: PulseStrength;
  reason: string;
  createdAt: number;
  expiresAt: number;
}

export interface ShardSignal {
  shardId: string;
  intensity: number;
  reason: string;
  createdAt: number;
  expiresAt: number;
}
