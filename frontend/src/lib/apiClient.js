const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const REPO_EVENT_NAMES = [
  'stream.connected',
  'repo.snapshot',
  'repo.queued',
  'repo.clone.started',
  'repo.clone.completed',
  'repo.parse.started',
  'repo.embedding.started',
  'repo.index.started',
  'repo.file.indexed',
  'repo.ready',
  'repo.error',
];

const SSH_GITHUB_PATTERN = /^(?:ssh:\/\/)?git@github\.com[:/][^/]+\/[^/]+(?:\.git)?\/?$/i;
const GITHUB_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;

function parseSseData(raw) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function parseErrorResponse(response) {
  let detail = '';
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') {
      detail = body.detail;
    } else if (Array.isArray(body?.detail) && body.detail.length) {
      detail = body.detail.map((entry) => entry?.msg || 'validation error').join(', ');
    }
  } catch {
    // Ignore JSON parse failures and fall back to status text.
  }

  return detail || response.statusText || `HTTP ${response.status}`;
}

export function validateGithubRepoUrl(repoUrl) {
  const value = (repoUrl || '').trim();
  if (!value) {
    return { isValid: false, message: 'Repository URL is required.' };
  }

  if (SSH_GITHUB_PATTERN.test(value)) {
    return {
      isValid: true,
      message: '',
      normalizedUrl: value.replace(/\/+$/, ''),
    };
  }

  let normalizedInput = value;
  if (normalizedInput.startsWith('github.com/') || normalizedInput.startsWith('www.github.com/')) {
    normalizedInput = `https://${normalizedInput}`;
  } else if (normalizedInput.startsWith('http://')) {
    normalizedInput = `https://${normalizedInput.slice('http://'.length)}`;
  }

  let parsed;
  try {
    parsed = new URL(normalizedInput);
  } catch {
    return { isValid: false, message: 'Enter a valid GitHub repository URL.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') {
    return { isValid: false, message: 'Use a GitHub repository URL, tree/blob link, or SSH form.' };
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    return { isValid: false, message: 'Repository URL must include both owner and repository name.' };
  }

  const owner = segments[0];
  const repoRaw = segments[1];
  const repo = repoRaw.endsWith('.git') ? repoRaw.slice(0, -4) : repoRaw;
  if (!GITHUB_SEGMENT_PATTERN.test(owner) || !GITHUB_SEGMENT_PATTERN.test(repo)) {
    return { isValid: false, message: 'Repository URL contains unsupported owner or repository characters.' };
  }

  const normalizedSegments = [owner, repo, ...segments.slice(2)];
  return {
    isValid: true,
    message: '',
    normalizedUrl: `https://github.com/${normalizedSegments.join('/')}`,
  };
}

export async function createRepository(repoUrl, branch) {
  const response = await fetch(`${API_BASE_URL}/v1/repos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_url: repoUrl, branch }),
  });

  if (!response.ok) {
    const detail = await parseErrorResponse(response);
    throw new Error(`Failed to create repository: ${detail}`);
  }

  return response.json();
}

export function openRepositoryEventStream(repoId, handlers) {
  const stream = new EventSource(`${API_BASE_URL}/v1/repos/${repoId}/events`);

  REPO_EVENT_NAMES.forEach((eventName) => {
    stream.addEventListener(eventName, (event) => {
      handlers?.onEvent?.(eventName, parseSseData(event.data));
    });
  });

  stream.onmessage = (event) => {
    const payload = parseSseData(event.data);
    const eventName = payload?.event || 'message';
    handlers?.onEvent?.(eventName, payload);
  };

  stream.onerror = (error) => {
    handlers?.onError?.(error);
  };

  return stream;
}

export async function fetchRepositoryStatus(repoId) {
  const response = await fetch(`${API_BASE_URL}/v1/repos/${repoId}`);
  if (!response.ok) {
    const detail = await parseErrorResponse(response);
    throw new Error(`Failed to load repository status: ${detail}`);
  }
  return response.json();
}

export async function fetchRepositoryTree(repoId) {
  const response = await fetch(`${API_BASE_URL}/v1/repos/${repoId}/tree`);
  if (!response.ok) {
    const detail = await parseErrorResponse(response);
    throw new Error(`Failed to load tree: ${detail}`);
  }
  return response.json();
}

export async function fetchSystemHealth() {
  const response = await fetch(`${API_BASE_URL}/v1/health/deps`);
  if (!response.ok) {
    const detail = await parseErrorResponse(response);
    throw new Error(`Failed to load system health: ${detail}`);
  }
  return response.json();
}

export async function streamChatResponse({
  repoId,
  question,
  contextFilePaths = [],
  signal,
  onEvent,
}) {
  const response = await fetch(`${API_BASE_URL}/v1/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo_id: repoId,
      question,
      context_file_paths: contextFilePaths,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const detail = await parseErrorResponse(response);
    throw new Error(`Failed to stream chat: ${detail}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawCompletion = false;

  function processBlock(block) {
    if (!block) {
      return;
    }

    const lines = block.split(/\r?\n/);
    let sseEvent = 'message';
    const dataParts = [];

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      if (line.startsWith('event:')) {
        sseEvent = line.slice(6).trim();
      }
      if (line.startsWith('data:')) {
        dataParts.push(line.slice(5).trim());
      }
    }

    if (!dataParts.length) {
      return;
    }

    const payload = parseSseData(dataParts.join('\n'));
    if (payload?.event === 'rag.completed') {
      sawCompletion = true;
    }
    onEvent?.(sseEvent, payload);
  }

  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
    }

    if (done) {
      break;
    }

    const normalized = buffer.replace(/\r\n/g, '\n');
    const blocks = normalized.split('\n\n');
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      processBlock(block);
    }
  }

  const finalBlock = buffer.trim();
  if (finalBlock) {
    processBlock(finalBlock);
  }

  if (!sawCompletion && !signal?.aborted) {
    throw new Error('Chat stream ended before completion. Please try again.');
  }
}
