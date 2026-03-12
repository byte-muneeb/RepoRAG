/// <reference lib="webworker" />

export {};

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const FILES = [
  'src/api/routes.ts',
  'src/core/engine.ts',
  'src/core/indexer.ts',
  'src/core/embedder.ts',
  'src/pipeline/queue.ts',
  'src/pipeline/chunker.ts',
  'src/observability/trace.ts',
];

const STEPS = [
  { phase: 'clone', message: 'Cloning repository topology...' },
  { phase: 'parse', message: 'Parsing AST and symbols...' },
  { phase: 'embed', message: 'Generating semantic embeddings...' },
  { phase: 'index', message: 'Hydrating vector index...' },
  { phase: 'ready', message: 'Ingestion stream complete.' },
] as const;

let timerId: number | null = null;

function stop(): void {
  if (timerId !== null) {
    ctx.clearInterval(timerId);
    timerId = null;
  }
}

function start(): void {
  stop();

  let tick = 0;
  timerId = ctx.setInterval(() => {
    const row = STEPS[Math.min(tick, STEPS.length - 1)];
    const progress = Math.min(Math.round(((tick + 1) / STEPS.length) * 100), 100);

    ctx.postMessage({
      type: 'progress',
      phase: row.phase,
      progress,
      message: row.message,
      indexedFile: FILES[tick],
    });

    tick += 1;

    if (tick >= STEPS.length) {
      stop();
      ctx.postMessage({ type: 'complete' });
    }
  }, 350);
}

ctx.onmessage = (event: MessageEvent<{ type: 'start' | 'stop' }>) => {
  if (event.data.type === 'start') {
    start();
  }

  if (event.data.type === 'stop') {
    stop();
  }
};
