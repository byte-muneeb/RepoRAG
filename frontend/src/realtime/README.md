# RepoRAG Frontend Realtime Module

This folder contains optional realtime primitives (event bus + hooks) for decoupled UI event handling.

## Current Project Status

The main application currently uses direct API integrations in `frontend/src/lib/apiClient.js` for ingestion and chat streams.

This `realtime/` module is kept as a reusable layer for advanced scene synchronization and future refactors.

## Module Contents

- `types.ts`: shared event payload types
- `eventBus.ts`: central pub/sub store and lifecycle helpers
- `useStreamResponse.ts`: token streaming helpers
- `useIngestionWorker.ts`: ingestion progress hook abstraction
- `useSceneSync.ts`: maps events to scene-level signal updates
- `shardMapping.ts`: deterministic file path to shard mapping

## When To Use This Module

Use the realtime module if you want:

- a single event source fan-out to multiple UI regions
- scene effects that react to chat and ingestion events
- a cleaner separation between transport and presentation layers

Keep using `apiClient.js` directly if you want the simplest path for the existing app behavior.

## Minimal Integration Example

```tsx
import { useEffect } from 'react';
import { startRealtimeGarbageCollector } from './realtime/eventBus';
import { useSceneEventMapping } from './realtime/useSceneSync';

function AppRealtimeBridge() {
  useSceneEventMapping();

  useEffect(() => {
    const stop = startRealtimeGarbageCollector(250);
    return stop;
  }, []);

  return null;
}
```

Mount one bridge near the app root when you choose to adopt this layer.
