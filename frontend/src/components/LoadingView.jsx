import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Activity, ArrowLeft, CheckCircle2, Cpu, Database, FolderTree, Sparkles } from 'lucide-react';
import { fetchRepositoryStatus, openRepositoryEventStream } from '../lib/apiClient';

const BOOT_STEPS = [
  { id: 'clone', label: 'Cloning repository topology', icon: FolderTree },
  { id: 'parse', label: 'Compiling AST and symbol graph', icon: Cpu },
  { id: 'embed', label: 'Generating semantic embeddings', icon: Sparkles },
  { id: 'index', label: 'Hydrating retrieval index', icon: Database },
  { id: 'ready', label: 'Calibrating workspace cockpit', icon: CheckCircle2 },
];

function mapEventToStep(eventName) {
  if (eventName.includes('clone')) {
    return 0;
  }
  if (eventName.includes('parse')) {
    return 1;
  }
  if (eventName.includes('embedding')) {
    return 2;
  }
  if (eventName.includes('index') || eventName.includes('file.indexed')) {
    return 3;
  }
  if (eventName.includes('ready')) {
    return 4;
  }
  return null;
}

function mapStatusToStep(status) {
  if (status === 'queued' || status === 'running') {
    return 0;
  }
  if (status === 'ready') {
    return 4;
  }
  return null;
}

export function LoadingView({ repoId, setCurrentStage, onBackToLanding }) {
  const prefersReducedMotion = useReducedMotion();

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [statusLines, setStatusLines] = useState(['stream:connecting']);
  const [progressPercent, setProgressPercent] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  function transitionToWorkspace() {
    window.setTimeout(() => {
      setCurrentStage('WORKSPACE');
    }, prefersReducedMotion ? 0 : 280);
  }

  useEffect(() => {
    if (!repoId) {
      setErrorMessage('No repository job found. Start analysis again.');
      return undefined;
    }

    let isMounted = true;

    const applySnapshot = (payload) => {
      if (!payload || !isMounted) {
        return;
      }

      const stepFromStatus = mapStatusToStep(payload.status || '');
      if (stepFromStatus !== null) {
        setActiveStepIndex(stepFromStatus);
      }

      if (typeof payload.progress === 'number') {
        setProgressPercent(Math.max(0, Math.min(100, payload.progress)));
      }

      const indexedFiles = Number(payload.indexed_files || 0);
      const totalFiles = Number(payload.total_files || 0);
      setFileCount(indexedFiles);
      setTokenCount((prev) => Math.max(prev, indexedFiles * 640));

      if (payload.status === 'ready') {
        setActiveStepIndex(4);
        setProgressPercent(100);
        setStatusLines((prev) => [...prev, `ready:${indexedFiles}/${totalFiles || indexedFiles}`].slice(-4));
        transitionToWorkspace();
        return;
      }

      if (payload.status === 'error') {
        setErrorMessage(payload.error_message || 'Ingestion failed.');
      }
    };

    const stream = openRepositoryEventStream(repoId, {
      onEvent: (eventName, payload) => {
        if (!isMounted) {
          return;
        }

        if (eventName === 'repo.snapshot') {
          applySnapshot(payload);
        }

        if (payload?.progress !== undefined) {
          setProgressPercent(Math.max(0, Math.min(100, payload.progress)));
        }

        const stepIndex = mapEventToStep(eventName);
        if (stepIndex !== null) {
          setActiveStepIndex(stepIndex);
        }

        if (eventName === 'repo.file.indexed') {
          const indexedFiles = Number(payload?.indexed_files || 0);
          setFileCount(indexedFiles);
          setTokenCount((prev) => Math.max(prev, indexedFiles * 640));
        }

        if (eventName === 'repo.ready') {
          setActiveStepIndex(4);
          setProgressPercent(100);
          transitionToWorkspace();
        }

        if (eventName === 'repo.error') {
          setErrorMessage(payload?.message || 'Ingestion failed.');
        }

        const nextLine = payload?.message || eventName;
        setStatusLines((prev) => {
          const rows = [...prev, nextLine];
          return rows.slice(-4);
        });
      },
      onError: () => {
        if (!isMounted) {
          return;
        }
        setErrorMessage('Stream connection dropped. Checking repository status...');
      },
    });

    const statusInterval = window.setInterval(async () => {
      try {
        const status = await fetchRepositoryStatus(repoId);
        applySnapshot(status);
      } catch {
        // Keep polling for transient backend startup/network issues.
      }
    }, 1600);

    return () => {
      isMounted = false;
      stream.close();
      window.clearInterval(statusInterval);
    };
  }, [prefersReducedMotion, repoId, setCurrentStage]);

  const activeStatusLine = useMemo(() => {
    return statusLines[statusLines.length - 1] || 'waiting:backend';
  }, [statusLines]);

  return (
    <motion.div
      className="absolute inset-0 z-10 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 flex items-end justify-center pb-8 sm:pb-12 px-4">
        <motion.div
          className="pointer-events-auto w-full max-w-5xl rounded-2xl border border-white/10 bg-neutral-950/72 backdrop-blur-2xl p-4 sm:p-6"
          style={{ borderTopColor: 'rgba(129,140,248,0.44)' }}
          animate={{
            boxShadow: [
              '0 0 30px -14px rgba(99,102,241,0.35), 0 10px 28px rgba(0,0,0,0.7)',
              '0 0 48px -8px rgba(129,140,248,0.55), 0 10px 28px rgba(0,0,0,0.7)',
              '0 0 30px -14px rgba(99,102,241,0.35), 0 10px 28px rgba(0,0,0,0.7)',
            ],
          }}
          transition={{ duration: prefersReducedMotion ? 0.2 : 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-indigo-300/70">RepoRAG system boot</p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={BOOT_STEPS[activeStepIndex].id}
                    className="mt-1 text-sm sm:text-base text-neutral-100 font-medium"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
                  >
                    {BOOT_STEPS[activeStepIndex].label}
                  </motion.p>
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:border-white/25 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentStage('WORKSPACE')}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-mono text-neutral-400 hover:text-indigo-200 hover:border-indigo-400/35 transition-colors"
                >
                  [ skip boot ]
                </button>
              </div>
            </div>

            <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-white/5">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-cyan-300 to-indigo-200"
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: prefersReducedMotion ? 0.12 : 0.28, ease: 'easeOut' }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1.4fr,1fr] gap-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                  <Activity className="h-3.5 w-3.5" />
                  Live Telemetry
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={activeStatusLine}
                    className="font-mono text-xs text-neutral-300"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: prefersReducedMotion ? 0.1 : 0.16 }}
                  >
                    {activeStatusLine}
                  </motion.p>
                </AnimatePresence>

                <div className="mt-2 space-y-1.5">
                  {BOOT_STEPS.map((step, index) => {
                    const Icon = step.icon;
                    const status = index < activeStepIndex ? 'done' : index === activeStepIndex ? 'active' : 'pending';
                    return (
                      <div key={step.id} className="flex items-center gap-2 text-xs">
                        <Icon
                          className={`h-3.5 w-3.5 ${
                            status === 'done' ? 'text-emerald-300' : status === 'active' ? 'text-indigo-200' : 'text-neutral-600'
                          }`}
                        />
                        <span
                          className={
                            status === 'done'
                              ? 'text-emerald-100'
                              : status === 'active'
                                ? 'text-neutral-100'
                                : 'text-neutral-600'
                          }
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-neutral-500">Ingestion Metrics</div>
                <div className="space-y-2">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-500">Files indexed</span>
                      <span className="font-mono text-indigo-200">{fileCount}</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-500">Context tokens</span>
                      <span className="font-mono text-cyan-200">{tokenCount}</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-500">Progress</span>
                      <span className="font-mono text-emerald-200">{Math.round(progressPercent)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {errorMessage}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
