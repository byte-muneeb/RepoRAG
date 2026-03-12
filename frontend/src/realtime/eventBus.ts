import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  IngestionState,
  PulseStrength,
  ReporagEvent,
  ShardSignal,
  StreamSessionState,
  UITransientPulse,
  UIPulseTarget,
} from './types';

const EVENT_LOG_LIMIT = 500;
const UI_PULSE_TTL_MS = 1000;
const DEFAULT_SHARD_TTL_MS = 1200;

const initialIngestion: IngestionState = {
  phase: 'clone',
  progress: 0,
  message: 'Waiting for ingestion stream...',
  indexedFiles: 0,
};

let transientCounter = 0;

function nextId(prefix: string): string {
  transientCounter += 1;
  return `${prefix}-${Date.now()}-${transientCounter}`;
}

export interface RealtimeStore {
  eventLog: ReporagEvent[];
  lastEvent: ReporagEvent | null;
  streamingSessions: Record<string, StreamSessionState>;
  ingestion: IngestionState;
  uiPulses: UITransientPulse[];
  shardSignals: Record<string, ShardSignal>;
  publish: (event: ReporagEvent) => void;
  emitPulse: (target: UIPulseTarget, strength: PulseStrength, reason: string) => string;
  pulseShard: (shardId: string, intensity: number, durationMs?: number, reason?: ShardSignal['reason']) => void;
  clearPulse: (pulseId: string) => void;
  prune: (now?: number) => void;
  reset: () => void;
}

export const useRealtimeStore = create<RealtimeStore>()(
  subscribeWithSelector((set, get) => ({
    eventLog: [],
    lastEvent: null,
    streamingSessions: {},
    ingestion: initialIngestion,
    uiPulses: [],
    shardSignals: {},

    publish: (event) => {
      set((state) => {
        const nextLog = [...state.eventLog, event].slice(-EVENT_LOG_LIMIT);
        const nextState: Partial<RealtimeStore> = {
          eventLog: nextLog,
          lastEvent: event,
        };

        if (event.type === 'llm.stream.started') {
          const current = state.streamingSessions[event.sessionId];
          nextState.streamingSessions = {
            ...state.streamingSessions,
            [event.sessionId]: {
              text: current?.text ?? '',
              tokenCount: 0,
              isStreaming: true,
              startedAt: event.ts,
              updatedAt: event.ts,
            },
          };
        }

        if (event.type === 'llm.token') {
          const current = state.streamingSessions[event.sessionId];
          nextState.streamingSessions = {
            ...state.streamingSessions,
            [event.sessionId]: {
              text: event.accumulatedText,
              tokenCount: (current?.tokenCount ?? 0) + 1,
              isStreaming: true,
              startedAt: current?.startedAt ?? event.ts,
              updatedAt: event.ts,
            },
          };
        }

        if (event.type === 'llm.stream.completed') {
          const current = state.streamingSessions[event.sessionId];
          nextState.streamingSessions = {
            ...state.streamingSessions,
            [event.sessionId]: {
              text: event.fullText,
              tokenCount: current?.tokenCount ?? 0,
              isStreaming: false,
              startedAt: current?.startedAt ?? event.ts,
              updatedAt: event.ts,
            },
          };
        }

        if (event.type === 'llm.stream.error') {
          const current = state.streamingSessions[event.sessionId];
          nextState.streamingSessions = {
            ...state.streamingSessions,
            [event.sessionId]: {
              text: current?.text ?? '',
              tokenCount: current?.tokenCount ?? 0,
              isStreaming: false,
              startedAt: current?.startedAt ?? event.ts,
              updatedAt: event.ts,
              error: event.message,
            },
          };
        }

        if (event.type === 'ingestion.progress') {
          nextState.ingestion = {
            phase: event.phase,
            progress: Math.max(0, Math.min(100, event.progress)),
            message: event.message,
            indexedFiles: state.ingestion.indexedFiles + (event.indexedFile ? 1 : 0),
            startedAt: state.ingestion.startedAt ?? event.ts,
            updatedAt: event.ts,
          };
        }

        if (event.type === 'ui.pulse') {
          const id = nextId('ui-pulse');
          const pulse: UITransientPulse = {
            id,
            target: event.target,
            strength: event.strength,
            reason: event.reason,
            createdAt: event.ts,
            expiresAt: event.ts + UI_PULSE_TTL_MS,
          };
          nextState.uiPulses = [...state.uiPulses, pulse];
        }

        if (event.type === 'scene.shard.pulse') {
          nextState.shardSignals = {
            ...state.shardSignals,
            [event.shardId]: {
              shardId: event.shardId,
              intensity: Math.max(0, Math.min(1, event.intensity)),
              reason: event.reason,
              createdAt: event.ts,
              expiresAt: event.ts + event.durationMs,
            },
          };
        }

        return nextState;
      });
    },

    emitPulse: (target, strength, reason) => {
      const id = nextId('ui-pulse');
      get().publish({
        type: 'ui.pulse',
        target,
        strength,
        reason,
        ts: Date.now(),
      });
      return id;
    },

    pulseShard: (shardId, intensity, durationMs = DEFAULT_SHARD_TTL_MS, reason = 'manual') => {
      get().publish({
        type: 'scene.shard.pulse',
        shardId,
        intensity,
        durationMs,
        reason,
        ts: Date.now(),
      });
    },

    clearPulse: (pulseId) => {
      set((state) => ({
        uiPulses: state.uiPulses.filter((pulse) => pulse.id !== pulseId),
      }));
    },

    prune: (now = Date.now()) => {
      set((state) => {
        const uiPulses = state.uiPulses.filter((pulse) => pulse.expiresAt > now);

        const shardSignals: Record<string, ShardSignal> = {};
        for (const [key, signal] of Object.entries(state.shardSignals)) {
          if (signal.expiresAt > now) {
            shardSignals[key] = signal;
          }
        }

        return {
          uiPulses,
          shardSignals,
        };
      });
    },

    reset: () => {
      set({
        eventLog: [],
        lastEvent: null,
        streamingSessions: {},
        ingestion: initialIngestion,
        uiPulses: [],
        shardSignals: {},
      });
    },
  })),
);

export function startRealtimeGarbageCollector(intervalMs = 250): () => void {
  const timer = window.setInterval(() => {
    useRealtimeStore.getState().prune();
  }, intervalMs);

  return () => {
    window.clearInterval(timer);
  };
}
