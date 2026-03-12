import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeStore } from './eventBus';
import { filePathToShardId } from './shardMapping';
import type { IngestionPhase } from './types';

interface WorkerProgressPayload {
  type: 'progress';
  phase: IngestionPhase;
  progress: number;
  message: string;
  indexedFile?: string;
}

interface WorkerCompletePayload {
  type: 'complete';
}

interface WorkerErrorPayload {
  type: 'error';
  message: string;
}

type WorkerPayload = WorkerProgressPayload | WorkerCompletePayload | WorkerErrorPayload;

export interface UseIngestionWorkerOptions {
  workerFactory?: () => Worker;
  simulateWhenUnavailable?: boolean;
  simulationTickMs?: number;
}

export interface IngestionController {
  start: () => void;
  stop: () => void;
  isRunning: boolean;
}

const SIMULATION_FILES = [
  'src/api/routes.ts',
  'src/core/engine.ts',
  'src/core/indexer.ts',
  'src/core/embedder.ts',
  'src/pipeline/queue.ts',
  'src/pipeline/chunker.ts',
  'src/observability/trace.ts',
];

const PHASES: Array<{ phase: IngestionPhase; message: string }> = [
  { phase: 'clone', message: 'Cloning repository and collecting manifests...' },
  { phase: 'parse', message: 'Building AST and symbol edges...' },
  { phase: 'embed', message: 'Generating semantic vectors...' },
  { phase: 'index', message: 'Hydrating retrieval index...' },
  { phase: 'ready', message: 'Workspace is ready.' },
];

export function useIngestionWorker(options: UseIngestionWorkerOptions = {}): IngestionController {
  const publish = useRealtimeStore((state) => state.publish);
  const pulseShard = useRealtimeStore((state) => state.pulseShard);
  const emitPulse = useRealtimeStore((state) => state.emitPulse);

  const [isRunning, setIsRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const simulationTimerRef = useRef<number | null>(null);

  const stopSimulation = useCallback(() => {
    if (simulationTimerRef.current !== null) {
      window.clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    stopSimulation();

    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    setIsRunning(false);
  }, [stopSimulation]);

  const applyProgress = useCallback(
    (payload: WorkerProgressPayload) => {
      publish({
        type: 'ingestion.progress',
        phase: payload.phase,
        progress: payload.progress,
        message: payload.message,
        indexedFile: payload.indexedFile,
        ts: Date.now(),
      });

      emitPulse('left-rail', 'low', `ingestion-${payload.phase}`);

      if (payload.indexedFile) {
        const shardId = filePathToShardId(payload.indexedFile);
        publish({
          type: 'file.indexed',
          path: payload.indexedFile,
          shardId,
          progress: payload.progress,
          ts: Date.now(),
        });
        pulseShard(shardId, 0.95, 1100, 'file-indexed');
      }
    },
    [emitPulse, publish, pulseShard],
  );

  const handleWorkerPayload = useCallback(
    (payload: WorkerPayload) => {
      if (payload.type === 'progress') {
        applyProgress(payload);
        return;
      }

      if (payload.type === 'complete') {
        publish({
          type: 'ingestion.progress',
          phase: 'ready',
          progress: 100,
          message: 'Background ingestion completed.',
          ts: Date.now(),
        });
        setIsRunning(false);
        return;
      }

      publish({
        type: 'ingestion.progress',
        phase: 'error',
        progress: 100,
        message: payload.message,
        ts: Date.now(),
      });
      setIsRunning(false);
    },
    [applyProgress, publish],
  );

  const startSimulation = useCallback(() => {
    let index = 0;
    const tickMs = options.simulationTickMs ?? 380;
    setIsRunning(true);

    simulationTimerRef.current = window.setInterval(() => {
      const progress = Math.min(Math.round(((index + 1) / PHASES.length) * 100), 100);
      const phaseRow = PHASES[Math.min(index, PHASES.length - 1)];
      const indexedFile = index < SIMULATION_FILES.length ? SIMULATION_FILES[index] : undefined;

      applyProgress({
        type: 'progress',
        phase: phaseRow.phase,
        progress,
        message: phaseRow.message,
        indexedFile,
      });

      index += 1;
      if (index >= PHASES.length) {
        stopSimulation();
        setIsRunning(false);
      }
    }, tickMs);
  }, [applyProgress, options.simulationTickMs, stopSimulation]);

  const start = useCallback(() => {
    stop();

    const allowSimulation = options.simulateWhenUnavailable ?? true;

    try {
      const worker = options.workerFactory
        ? options.workerFactory()
        : new Worker(new URL('../workers/mock-ingestion.worker.ts', import.meta.url), { type: 'module' });

      workerRef.current = worker;
      setIsRunning(true);

      worker.onmessage = (event: MessageEvent<WorkerPayload>) => {
        handleWorkerPayload(event.data);
      };

      worker.onerror = () => {
        worker.terminate();
        workerRef.current = null;
        setIsRunning(false);

        if (allowSimulation) {
          startSimulation();
        }
      };

      worker.postMessage({ type: 'start' });
    } catch {
      if (allowSimulation) {
        startSimulation();
      }
    }
  }, [handleWorkerPayload, options, startSimulation, stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    start,
    stop,
    isRunning,
  };
}
