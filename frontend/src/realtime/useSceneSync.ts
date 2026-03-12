import { useEffect } from 'react';
import { useRealtimeStore } from './eventBus';
import { extractFileMentions, filePathToShardId } from './shardMapping';
import type { ReporagEvent } from './types';

function mapEventToReactions(event: ReporagEvent): void {
  const state = useRealtimeStore.getState();

  if (event.type === 'llm.token') {
    state.emitPulse('workbench', 'low', 'token');

    const fileMentions = extractFileMentions(event.token);
    for (const filePath of fileMentions) {
      state.pulseShard(filePathToShardId(filePath), 0.8, 900, 'token-mention');
    }
    return;
  }

  if (event.type === 'file.indexed') {
    state.pulseShard(event.shardId, 1, 1200, 'file-indexed');
    state.emitPulse('left-rail', 'medium', 'file-indexed');
    return;
  }

  if (event.type === 'llm.stream.completed') {
    state.emitPulse('insight-rail', 'high', 'stream-completed');
    return;
  }

  if (event.type === 'ingestion.progress' && event.phase === 'ready') {
    state.emitPulse('center', 'high', 'ingestion-complete');
  }
}

// Use once near app root so every incoming event can produce UI + scene side effects.
export function useSceneEventMapping(): void {
  useEffect(() => {
    const unsubscribe = useRealtimeStore.subscribe(
      (store) => store.lastEvent,
      (event) => {
        if (!event) {
          return;
        }
        mapEventToReactions(event);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);
}

// Hook for Three.js components. Example usage inside a shard material:
// const signal = useShardSignal('shard-42');
// material.emissiveIntensity = signal?.intensity ?? 0.12;
export function useShardSignal(shardId: string) {
  return useRealtimeStore((store) => store.shardSignals[shardId]);
}
