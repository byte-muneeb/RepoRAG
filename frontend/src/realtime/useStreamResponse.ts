import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeStore } from './eventBus';
import { extractFileMentions, filePathToShardId } from './shardMapping';
import type { StreamTransport } from './types';

const DEFAULT_MOCK_RESPONSE =
  'Path to impact: src/api/routes.ts -> src/core/engine.ts -> src/pipeline/queue.ts -> src/core/indexer.ts. Mitigation: enforce idempotent dedupe keys and constrain rerank to top-k slices.';

const TOKEN_SPLIT_REGEX = /(\s+)/;

export interface StreamRequest {
  prompt: string;
  endpoint?: string;
  transport?: StreamTransport;
  sessionId?: string;
  mockResponse?: string;
  tokenDelayMs?: number;
}

export interface UseStreamResponseOptions {
  defaultTransport?: StreamTransport;
  onTokenReceived?: (token: string, accumulatedText: string, sessionId: string) => void;
  onCompleted?: (fullText: string, sessionId: string) => void;
  onError?: (errorMessage: string, sessionId: string) => void;
}

export interface StreamController {
  start: (request: StreamRequest) => Promise<void>;
  cancel: () => void;
  text: string;
  isStreaming: boolean;
  error: string | null;
  sessionId: string | null;
}

function createSessionId(): string {
  return `session-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function tokenize(text: string): string[] {
  return text.split(TOKEN_SPLIT_REGEX).filter((token) => token.length > 0);
}

export function useStreamResponse(options: UseStreamResponseOptions = {}): StreamController {
  const publish = useRealtimeStore((state) => state.publish);
  const emitPulse = useRealtimeStore((state) => state.emitPulse);
  const pulseShard = useRealtimeStore((state) => state.pulseShard);

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<number | null>(null);
  const accumulatedRef = useRef('');

  const defaultTransport = options.defaultTransport ?? 'mock';

  const cleanupSource = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const emitToken = useCallback(
    (token: string, sid: string) => {
      accumulatedRef.current += token;
      const nextText = accumulatedRef.current;
      setText(nextText);

      publish({
        type: 'llm.token',
        sessionId: sid,
        token,
        accumulatedText: nextText,
        ts: Date.now(),
      });

      emitPulse('workbench', 'low', 'token-received');

      const mentionedFiles = extractFileMentions(token);
      for (const filePath of mentionedFiles) {
        pulseShard(filePathToShardId(filePath), 0.86, 900, 'token-mention');
      }

      options.onTokenReceived?.(token, nextText, sid);
    },
    [emitPulse, options, publish, pulseShard],
  );

  const finalize = useCallback(
    (sid: string) => {
      setIsStreaming(false);
      emitPulse('insight-rail', 'medium', 'stream-complete');

      publish({
        type: 'llm.stream.completed',
        sessionId: sid,
        fullText: accumulatedRef.current,
        ts: Date.now(),
      });

      options.onCompleted?.(accumulatedRef.current, sid);
    },
    [emitPulse, options, publish],
  );

  const fail = useCallback(
    (sid: string, message: string) => {
      setError(message);
      setIsStreaming(false);

      publish({
        type: 'llm.stream.error',
        sessionId: sid,
        message,
        ts: Date.now(),
      });

      options.onError?.(message, sid);
    },
    [options, publish],
  );

  const start = useCallback(
    async (request: StreamRequest): Promise<void> => {
      cleanupSource();

      const sid = request.sessionId ?? createSessionId();
      const transport = request.transport ?? defaultTransport;
      accumulatedRef.current = '';
      setText('');
      setError(null);
      setIsStreaming(true);
      setSessionId(sid);

      publish({
        type: 'llm.stream.started',
        sessionId: sid,
        prompt: request.prompt,
        ts: Date.now(),
      });

      emitPulse('center', 'medium', 'stream-started');

      if (transport === 'sse') {
        if (!request.endpoint) {
          fail(sid, 'SSE endpoint is required when transport is sse.');
          return;
        }

        const url = `${request.endpoint}?prompt=${encodeURIComponent(request.prompt)}&sessionId=${encodeURIComponent(sid)}`;
        const source = new EventSource(url);
        sourceRef.current = source;

        source.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data) as { type?: string; token?: string; error?: string };

            if (payload.type === 'token' && payload.token) {
              emitToken(payload.token, sid);
              return;
            }

            if (payload.type === 'done') {
              cleanupSource();
              finalize(sid);
              return;
            }

            if (payload.type === 'error') {
              cleanupSource();
              fail(sid, payload.error ?? 'Unknown SSE stream error.');
              return;
            }

            // Fallback for plain text message packets.
            emitToken(event.data, sid);
          } catch {
            emitToken(event.data, sid);
          }
        };

        source.onerror = () => {
          cleanupSource();
          fail(sid, 'SSE connection dropped.');
        };

        return;
      }

      const mockResponse = request.mockResponse ?? DEFAULT_MOCK_RESPONSE;
      const tokens = tokenize(mockResponse);
      let index = 0;
      const delayMs = request.tokenDelayMs ?? 60;

      timerRef.current = window.setInterval(() => {
        const token = tokens[index];
        index += 1;

        if (token) {
          emitToken(token, sid);
        }

        if (index >= tokens.length) {
          cleanupSource();
          finalize(sid);
        }
      }, delayMs);
    },
    [cleanupSource, defaultTransport, emitPulse, emitToken, fail, finalize, publish],
  );

  const cancel = useCallback(() => {
    if (!sessionId) {
      cleanupSource();
      return;
    }

    cleanupSource();
    setIsStreaming(false);

    publish({
      type: 'llm.stream.error',
      sessionId,
      message: 'Stream cancelled by user.',
      ts: Date.now(),
    });
  }, [cleanupSource, publish, sessionId]);

  useEffect(() => {
    return () => {
      cleanupSource();
    };
  }, [cleanupSource]);

  return useMemo(
    () => ({
      start,
      cancel,
      text,
      isStreaming,
      error,
      sessionId,
    }),
    [cancel, error, isStreaming, sessionId, start, text],
  );
}
