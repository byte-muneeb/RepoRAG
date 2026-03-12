import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Line, OrbitControls, Stars, Text } from '@react-three/drei';
import {
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  CirclePlus,
  FileCode,
  Folder,
  LoaderCircle,
  MessageSquare,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchRepositoryTree, fetchSystemHealth, streamChatResponse } from '../lib/apiClient';

const TOKEN_BUDGET = 12000;
const MAX_GRAPH_NODES = 280;
const MAX_GRAPH_EDGES = 720;

const RETRIEVAL_STYLES = {
  idle: 'text-neutral-300 border-white/15 bg-white/5',
  retrieving: 'text-cyan-300 border-cyan-400/35 bg-cyan-400/10',
  streaming: 'text-emerald-300 border-emerald-400/35 bg-emerald-500/10',
  ready: 'text-indigo-200 border-indigo-400/35 bg-indigo-500/10',
};

function Panel({ children, className = '' }) {
  return (
    <div
      className={`pointer-events-auto rounded-2xl border border-white/10 bg-neutral-900/90 backdrop-blur-md shadow-[0_8px_20px_rgba(0,0,0,0.45)] ${className}`}
    >
      {children}
    </div>
  );
}

function estimateTokens(path, type) {
  const base = type === 'folder' ? 900 : 520;
  const variance = (path.length * 37) % 540;
  return base + variance;
}

function normalizeTreeNodes(nodes) {
  return [...nodes].sort((left, right) => {
    if (left.depth !== right.depth) {
      return left.depth - right.depth;
    }
    return left.path.localeCompare(right.path);
  });
}

function toTarget(node) {
  return {
    id: node.id,
    path: node.path,
    name: node.name,
    type: node.type,
    tokens: estimateTokens(node.path, node.type),
  };
}

function resolveSelectionToFiles(selection, treeNodes) {
  const files = new Set();

  selection.forEach((target) => {
    if (target.type === 'file') {
      files.add(target.path);
      return;
    }

    treeNodes.forEach((node) => {
      if (node.type !== 'file') {
        return;
      }
      if (node.path === target.path || node.path.startsWith(`${target.path}/`)) {
        files.add(node.path);
      }
    });
  });

  return [...files];
}

function isNodeCoveredBySelection(node, selection) {
  return selection.some((target) => {
    if (target.type === 'file') {
      return target.path === node.path;
    }
    return node.path === target.path || node.path.startsWith(`${target.path}/`);
  });
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function formatNodeLabel(node) {
  const maxLength = node.type === 'folder' ? 22 : 28;
  const shortName = node.name.length > maxLength ? `${node.name.slice(0, maxLength - 1)}...` : node.name;
  return `${shortName}\n${node.type} | d${node.depth}`;
}

function getClusterKey(node) {
  if (!node?.path) {
    return '__root__';
  }
  const segments = node.path.split('/').filter(Boolean);
  if (!segments.length) {
    return '__root__';
  }
  return segments[0];
}

function buildRepoViewGraph(treeNodes) {
  const limitedNodes = treeNodes.slice(0, MAX_GRAPH_NODES);
  const nodeById = new Map();
  const childrenByParent = new Map();

  limitedNodes.forEach((node) => {
    nodeById.set(node.id, node);
    const key = node.parent_id || '__root__';
    if (!childrenByParent.has(key)) {
      childrenByParent.set(key, []);
    }
    childrenByParent.get(key).push(node);
  });

  const clusterKeys = [];
  const clusterIndexByKey = new Map();

  limitedNodes.forEach((node) => {
    const key = getClusterKey(node);
    if (!clusterIndexByKey.has(key)) {
      clusterIndexByKey.set(key, clusterKeys.length);
      clusterKeys.push(key);
    }
  });

  const clusterAnchors = new Map();
  const totalClusters = Math.max(1, clusterKeys.length);
  clusterKeys.forEach((key, index) => {
    const angle = (index / totalClusters) * Math.PI * 2;
    const ring = 3.5 + (index % 3) * 0.6;
    const anchor = [
      Math.cos(angle) * ring,
      Math.sin(index * 0.7) * 1.2,
      Math.sin(angle) * ring,
    ];
    clusterAnchors.set(key, anchor);
  });

  const positionById = new Map();
  const unresolved = [...limitedNodes];
  let safety = 0;

  while (unresolved.length && safety < limitedNodes.length * 3) {
    safety += 1;
    const node = unresolved.shift();
    if (!node) {
      continue;
    }

    let parentPosition = null;
    if (node.parent_id && positionById.has(node.parent_id)) {
      parentPosition = positionById.get(node.parent_id);
    }

    if (node.parent_id && !parentPosition && nodeById.has(node.parent_id)) {
      unresolved.push(node);
      continue;
    }

    const hash = hashString(node.path || node.id);
    const seedAngle = (hash % 6283) / 1000;
    const seedTilt = (((hash >> 8) % 220) - 110) / 110;
    const clusterAnchor = clusterAnchors.get(getClusterKey(node)) || [0, 0, 0];

    let position;
    if (node.depth === 0) {
      position = [0, 0, 0];
    } else if (!parentPosition) {
      const spread = node.type === 'folder' ? 0.65 : 0.48;
      const radius = 0.55 + Math.min(2.6, node.depth * 0.36) + ((hash >> 13) % 100) / 360;
      position = [
        clusterAnchor[0] + Math.cos(seedAngle) * radius * spread,
        clusterAnchor[1] + seedTilt * 0.6,
        clusterAnchor[2] + Math.sin(seedAngle) * radius * spread,
      ];
    } else {
      const siblings = childrenByParent.get(node.parent_id) || [];
      const siblingIndex = Math.max(0, siblings.findIndex((item) => item.id === node.id));
      const siblingAngle = seedAngle + siblingIndex * 0.62;
      const siblingRadius = node.type === 'folder' ? 0.58 : 0.43;
      position = [
        parentPosition[0] + Math.cos(siblingAngle) * siblingRadius,
        parentPosition[1] + seedTilt * 0.34,
        parentPosition[2] + Math.sin(siblingAngle) * siblingRadius,
      ];
    }

    positionById.set(node.id, position);
  }

  const visualNodes = limitedNodes.map((node) => ({
    ...node,
    position: positionById.get(node.id) || [0, 0, 0],
    clusterKey: getClusterKey(node),
  }));

  const nodeVisualById = new Map(visualNodes.map((node) => [node.id, node]));
  const edges = [];
  for (const node of visualNodes) {
    if (!node.parent_id || edges.length >= MAX_GRAPH_EDGES) {
      continue;
    }
    const parent = nodeVisualById.get(node.parent_id);
    if (!parent) {
      continue;
    }
    edges.push([parent.position, node.position]);
  }

  return {
    nodes: visualNodes,
    edges,
    clusters: clusterKeys,
  };
}

function HealthPill({ label, ok }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
        ok
          ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
          : 'border-amber-400/35 bg-amber-500/10 text-amber-200'
      }`}
    >
      {label}: {ok ? 'ok' : 'off'}
    </span>
  );
}

function ContextPickerModal({
  open,
  treeNodes,
  selectedTargets,
  search,
  setSearch,
  onToggleTarget,
  onClose,
  resolvedContextCount,
}) {
  const selectedIds = useMemo(() => new Set(selectedTargets.map((item) => item.id)), [selectedTargets]);

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return treeNodes;
    }
    return treeNodes.filter((node) => node.path.toLowerCase().includes(q));
  }, [search, treeNodes]);

  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto">
      <Panel className="w-full max-w-3xl max-h-[88vh] flex min-h-0 flex-col">
        <div className="border-b border-white/10 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-neutral-100">Select files or folders</p>
            <p className="text-xs text-neutral-500 mt-1">Folder selection includes all descendant files in chat grounding.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-neutral-300 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
            <Search className="h-3.5 w-3.5 text-neutral-500" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find file or folder"
              className="w-full bg-transparent text-sm text-neutral-200 outline-none placeholder:text-neutral-600"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
            <span>{selectedTargets.length} selected targets</span>
            <span>{resolvedContextCount} resolved files</span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
          {!filteredNodes.length && <p className="py-3 text-xs text-neutral-500">No matching files found.</p>}

          <ul className="space-y-0.5">
            {filteredNodes.map((node) => {
              const selected = selectedIds.has(node.id);
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => onToggleTarget(node)}
                    className={`w-full flex items-center gap-2 rounded-md py-1.5 pr-2 transition-colors ${
                      selected
                        ? 'bg-indigo-500/15 text-indigo-100'
                        : 'text-neutral-300 hover:bg-white/5'
                    }`}
                    style={{ paddingLeft: `${node.depth * 1.1 + 0.45}rem` }}
                  >
                    {node.type === 'folder' ? (
                      <Folder className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-indigo-200' : 'text-indigo-400/70'}`} />
                    ) : (
                      <FileCode className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-cyan-200' : 'text-neutral-500'}`} />
                    )}

                    <span className={node.type === 'folder' ? 'text-xs' : 'text-xs font-mono'}>{node.path}</span>
                    {selected && (
                      <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-indigo-200">selected</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-white/10 px-4 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-indigo-400/40 bg-indigo-500/20 px-3 py-1.5 text-xs text-indigo-100 hover:bg-indigo-500/30"
          >
            Done
          </button>
        </div>
      </Panel>
    </div>
  );
}

function RepoGraphNode({ node, selected, pinned, onHoverNode, onSelectNode }) {
  const groupRef = useRef(null);
  const pulseSeed = useMemo(() => (node.path.length * 0.173 + node.depth * 0.41) % Math.PI, [node.depth, node.path.length]);

  useFrame((state) => {
    if (!groupRef.current) {
      return;
    }

    const t = state.clock.elapsedTime + pulseSeed;
    const pulse = pinned
      ? 1 + Math.sin(t * 4.2) * 0.34
      : selected
        ? 1 + Math.sin(t * 3.6) * 0.24
        : 1 + Math.sin(t * 2.4) * 0.1;
    groupRef.current.scale.setScalar(pulse);
    groupRef.current.position.y = node.position[1] + Math.sin(t * 0.9) * 0.03;
  });

  const baseColor =
    node.type === 'folder'
      ? pinned
        ? '#f0abfc'
        : selected
        ? '#7dd3fc'
        : '#60a5fa'
      : pinned
        ? '#fda4af'
        : selected
        ? '#34d399'
        : '#a3a3a3';

  return (
    <group ref={groupRef} position={node.position}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode(node);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHoverNode(node);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          onHoverNode(null);
        }}
      >
        <sphereGeometry args={[node.type === 'folder' ? 0.12 : 0.075, 18, 18]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={pinned ? '#f472b6' : selected ? '#67e8f9' : '#0f172a'}
          emissiveIntensity={pinned ? 0.9 : selected ? 0.62 : 0.15}
          metalness={0.3}
          roughness={0.34}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[node.type === 'folder' ? 0.17 : 0.11, 14, 14]} />
        <meshBasicMaterial color={baseColor} transparent opacity={selected ? 0.2 : 0.08} />
      </mesh>

      {node.type === 'folder' && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.2, 0.01, 8, 30]} />
          <meshBasicMaterial color={pinned ? '#f9a8d4' : selected ? '#a5f3fc' : '#93c5fd'} transparent opacity={0.4} />
        </mesh>
      )}

      {pinned && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.29, 0.012, 10, 40]} />
          <meshBasicMaterial color="#f9a8d4" transparent opacity={0.72} />
        </mesh>
      )}

      <Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0.2, 0.08, 0]}>
        <Text
          color={selected ? '#f0f9ff' : '#d1d5db'}
          outlineColor="#020617"
          outlineWidth={0.01}
          fontSize={node.type === 'folder' ? 0.085 : 0.07}
          anchorX="left"
          anchorY="top"
          maxWidth={3.4}
          lineHeight={1.25}
        >
          {formatNodeLabel(node)}
        </Text>
      </Billboard>
    </group>
  );
}

function EdgeFlowParticles({ edges }) {
  const particleRefs = useRef([]);

  const emitters = useMemo(() => {
    const sampled = edges.slice(0, Math.min(200, edges.length));
    return sampled.map((edge, index) => ({
      edge,
      speed: 0.08 + ((index % 7) + 1) * 0.02,
      phase: ((index * 13) % 100) / 100,
      size: index % 5 === 0 ? 0.03 : 0.02,
      color: index % 3 === 0 ? '#67e8f9' : index % 3 === 1 ? '#93c5fd' : '#c4b5fd',
      opacity: index % 4 === 0 ? 0.9 : 0.65,
    }));
  }, [edges]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    emitters.forEach((emitter, index) => {
      const mesh = particleRefs.current[index];
      if (!mesh) {
        return;
      }

      const [from, to] = emitter.edge;
      const progress = (emitter.phase + t * emitter.speed) % 1;
      const x = from[0] + (to[0] - from[0]) * progress;
      const y = from[1] + (to[1] - from[1]) * progress;
      const z = from[2] + (to[2] - from[2]) * progress;

      mesh.position.set(x, y, z);
    });
  });

  return (
    <group>
      {emitters.map((emitter, index) => (
        <mesh
          key={`edge-flow-${index}`}
          ref={(ref) => {
            particleRefs.current[index] = ref;
          }}
        >
          <sphereGeometry args={[emitter.size, 10, 10]} />
          <meshBasicMaterial color={emitter.color} transparent opacity={emitter.opacity} />
        </mesh>
      ))}
    </group>
  );
}

function CameraFocusController({ controlsRef, focusNode }) {
  const { camera } = useThree();

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    const hasFocus = Boolean(focusNode?.position);
    const focusTarget = hasFocus ? focusNode.position : [0, 0, 0];
    const focusOffset = hasFocus
      ? focusNode.type === 'folder'
        ? [2.2, 1.3, 2.6]
        : [1.9, 1.1, 2.4]
      : [0, 0, 8.5];
    const cameraTarget = [
      focusTarget[0] + focusOffset[0],
      focusTarget[1] + focusOffset[1],
      focusTarget[2] + focusOffset[2],
    ];
    const lerpAmount = hasFocus ? 0.12 : 0.04;

    controls.target.x += (focusTarget[0] - controls.target.x) * lerpAmount;
    controls.target.y += (focusTarget[1] - controls.target.y) * lerpAmount;
    controls.target.z += (focusTarget[2] - controls.target.z) * lerpAmount;

    camera.position.x += (cameraTarget[0] - camera.position.x) * lerpAmount;
    camera.position.y += (cameraTarget[1] - camera.position.y) * lerpAmount;
    camera.position.z += (cameraTarget[2] - camera.position.z) * lerpAmount;

    controls.update();
  });

  return null;
}

function RepositoryGraphScene({ treeNodes, selectedTargets, pinnedNode, onHoverNode, onSelectNode }) {
  const groupRef = useRef(null);
  const graph = useMemo(() => buildRepoViewGraph(treeNodes), [treeNodes]);

  useFrame((state, delta) => {
    if (!groupRef.current) {
      return;
    }

    const drift = Math.sin(state.clock.elapsedTime * 0.32) * 0.06;
    groupRef.current.rotation.y += delta * 0.05;
    groupRef.current.rotation.x = drift;
  });

  return (
    <group ref={groupRef}>
      {graph.edges.map((edge, index) => (
        <Line
          key={`edge-${index}`}
          points={edge}
          color="#94a3b8"
          transparent
          opacity={0.33}
          lineWidth={1.1}
        />
      ))}

      <EdgeFlowParticles edges={graph.edges} />

      {graph.nodes.map((node) => (
        <RepoGraphNode
          key={node.id}
          node={node}
          selected={isNodeCoveredBySelection(node, selectedTargets)}
          pinned={pinnedNode?.id === node.id}
          onHoverNode={onHoverNode}
          onSelectNode={onSelectNode}
        />
      ))}
    </group>
  );
}

function RepositoryGraphTab({ treeNodes, treeError, selectedTargets }) {
  const fileCount = treeNodes.filter((node) => node.type === 'file').length;
  const folderCount = treeNodes.filter((node) => node.type === 'folder').length;
  const clusterCount = useMemo(
    () => new Set(treeNodes.slice(0, MAX_GRAPH_NODES).map((node) => getClusterKey(node))).size,
    [treeNodes],
  );
  const controlsRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [pinnedNode, setPinnedNode] = useState(null);
  const activeNode = pinnedNode || hoveredNode;

  function handleSelectNode(node) {
    setPinnedNode((prev) => {
      if (prev?.id === node.id) {
        return null;
      }
      return node;
    });
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(14,165,233,0.16),transparent_44%),radial-gradient(circle_at_82%_78%,rgba(99,102,241,0.18),transparent_48%),linear-gradient(140deg,#030712,#020617,#020617)]" />
      <motion.div
        className="absolute -top-28 -left-28 h-64 w-64 rounded-full bg-cyan-400/12 blur-3xl"
        animate={{ x: [0, 48, 0], y: [0, 24, 0], opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-36 -right-20 h-72 w-72 rounded-full bg-indigo-500/14 blur-3xl"
        animate={{ x: [0, -46, 0], y: [0, -26, 0], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />

      {treeError && (
        <div className="absolute left-3 top-3 z-20 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {treeError}
        </div>
      )}

      {!treeNodes.length && !treeError && (
        <div className="h-full flex items-center justify-center text-sm text-neutral-500">
          Repository graph will appear after the tree is available.
        </div>
      )}

      {!!treeNodes.length && (
        <>
          <div className="absolute left-3 top-3 z-20 rounded-lg border border-cyan-300/25 bg-slate-950/78 px-3 py-2 text-[11px] text-neutral-200">
            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">RepoVIEW Engine</p>
            <p className="mt-1">hierarchy-aware cluster layout</p>
            <p className="text-neutral-400">drag rotate | wheel zoom | right-drag pan</p>
          </div>

          <div className="absolute inset-0 cursor-grab active:cursor-grabbing">
            <Canvas camera={{ position: [0, 0, 8.5], fov: 50 }} dpr={[1, 2]} onPointerMissed={() => setHoveredNode(null)}>
              <fog attach="fog" args={['#020617', 7, 28]} />
              <ambientLight intensity={0.65} />
              <pointLight position={[4, 6, 7]} intensity={1.8} color="#93c5fd" />
              <pointLight position={[-5, -3, -4]} intensity={1.1} color="#67e8f9" />
              <pointLight position={[0, 0, 0]} intensity={0.8} color="#38bdf8" />
              <Stars radius={65} depth={34} count={1800} factor={4.2} saturation={0} fade speed={0.6} />
              <Stars radius={90} depth={50} count={1200} factor={2.7} saturation={0} fade speed={0.3} />
              <RepositoryGraphScene
                treeNodes={treeNodes}
                selectedTargets={selectedTargets}
                pinnedNode={pinnedNode}
                onHoverNode={setHoveredNode}
                onSelectNode={handleSelectNode}
              />
              <CameraFocusController controlsRef={controlsRef} focusNode={activeNode} />
              <OrbitControls
                ref={controlsRef}
                enableRotate
                enablePan
                enableZoom
                rotateSpeed={0.7}
                panSpeed={0.6}
                zoomSpeed={0.8}
                dampingFactor={0.08}
                enableDamping
                minDistance={3.2}
                maxDistance={22}
                autoRotate={!activeNode}
                autoRotateSpeed={0.28}
              />
            </Canvas>
          </div>

          <div className="absolute right-3 top-3 z-20 max-w-[360px] rounded-lg border border-cyan-300/30 bg-slate-950/85 px-3 py-2 text-[11px] text-cyan-100">
            <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300">RepoVIEW</p>
            {activeNode ? (
              <>
                <p className="mt-1 text-neutral-100">{activeNode.name}</p>
                <p className="mt-1 text-neutral-300">path: {activeNode.path}</p>
                <p className="mt-1 text-neutral-300">type: {activeNode.type} | depth: {activeNode.depth}</p>
                <p className="mt-1 text-neutral-400">mode: {pinnedNode ? 'pinned' : 'hover focus'}</p>
                {pinnedNode && (
                  <button
                    type="button"
                    onClick={() => setPinnedNode(null)}
                    className="mt-2 rounded border border-pink-300/35 bg-pink-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-pink-200 hover:bg-pink-400/20"
                  >
                    Unpin Node
                  </button>
                )}
              </>
            ) : (
              <p className="mt-1 text-neutral-300">Hover a node to inspect. Click a node to pin details and focus camera.</p>
            )}
          </div>

          <div className="absolute left-3 bottom-3 z-20 rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-[11px] text-neutral-300">
            <p>RepoVIEW nodes: {Math.min(treeNodes.length, MAX_GRAPH_NODES)} visualized</p>
            <p>files: {fileCount} | folders: {folderCount}</p>
            <p>clusters: {clusterCount}</p>
            <p>highlighted: selected files/folders from chat</p>
            <p>mouse: drag rotate, wheel zoom, right-drag pan</p>
          </div>
        </>
      )}
    </div>
  );
}

function ChatPanel({
  query,
  setQuery,
  feed,
  onSubmit,
  onAbort,
  onOpenPicker,
  onRemoveTarget,
  onClearTargets,
  selectedTargets,
  usedTokens,
  resolvedContextCount,
  feedBottomRef,
  retrievalState,
  isSubmitting,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-neutral-100">Chat</p>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${RETRIEVAL_STYLES[retrievalState]}`}
          >
            {retrievalState}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {feed.map((item) => (
          <div key={item.id} className={item.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                item.role === 'user'
                  ? 'max-w-[90%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3.5 py-3 text-sm text-white'
                  : 'max-w-[90%] rounded-2xl rounded-tl-sm border border-white/15 bg-neutral-800/80 px-3.5 py-3 text-sm text-neutral-200'
              }
            >
              {item.role === 'assistant' ? (
                <AssistantMarkdown text={item.text} />
              ) : (
                <p className="whitespace-pre-wrap break-words leading-6">{item.text}</p>
              )}
              {item.citations && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.citations.map((citation) => (
                    <span
                      key={citation}
                      className="inline-flex items-center gap-1 rounded-full border border-cyan-300/35 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-200"
                    >
                      <ArrowUpRight className="h-3 w-3" />
                      {citation}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={feedBottomRef} />
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        <div className="mb-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
          <div className="flex items-center justify-between text-[11px] text-neutral-500">
            <span>{selectedTargets.length} selected targets</span>
            <span>
              {resolvedContextCount} files grounded | {usedTokens}/{TOKEN_BUDGET} tok est
            </span>
          </div>

          <p className="mt-1 text-[11px] text-cyan-200/90">
            Guidance: for general project explanation, select README. For specific answers, select the exact file or folder.
          </p>

          {!selectedTargets.length && (
            <p className="mt-1 text-[11px] text-neutral-600">
              No file/folder selected. Use + to manually choose repository context.
            </p>
          )}

          {!!selectedTargets.length && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => onRemoveTarget(target.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/35 bg-indigo-500/15 px-2 py-0.5 text-[11px] text-indigo-100 hover:bg-indigo-500/25"
                >
                  {target.type === 'folder' ? <Folder className="h-3 w-3" /> : <FileCode className="h-3 w-3" />}
                  <span className="max-w-[260px] truncate">{target.path}</span>
                  <X className="h-3 w-3" />
                </button>
              ))}

              <button
                type="button"
                onClick={onClearTargets}
                className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-neutral-400 hover:text-neutral-100"
              >
                clear all
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenPicker}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-neutral-300 hover:border-indigo-400/40 hover:text-indigo-100"
            title="Select files or folders"
          >
            <CirclePlus className="h-4 w-4" />
          </button>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (isSubmitting) {
                  onAbort();
                } else {
                  onSubmit();
                }
              }
            }}
            placeholder="Ask anything about the repository..."
            disabled={isSubmitting}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-indigo-400/60 disabled:opacity-70"
          />
          <button
            type="button"
            onClick={isSubmitting ? onAbort : onSubmit}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-indigo-400/40 bg-indigo-500/20 px-3 text-indigo-200 hover:bg-indigo-500/30 transition-colors"
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">Press Enter to send. Press again while streaming to stop.</p>
      </div>
    </div>
  );
}

export function WorkspaceView({ repoId, onBackToLanding }) {
  const [activeTab, setActiveTab] = useState('chat');
  const [treeNodes, setTreeNodes] = useState([]);
  const [treeError, setTreeError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [query, setQuery] = useState('');
  const [retrievalState, setRetrievalState] = useState('idle');
  const [feed, setFeed] = useState([
    {
      id: 'seed-assistant',
      role: 'assistant',
      text:
        'Workspace ready. Use + to select context. For general project explanation, select README. For specific issues, select the related file or folder.',
      citations: null,
    },
  ]);
  const [systemHealth, setSystemHealth] = useState(null);

  const chatAbortRef = useRef(null);
  const feedBottomRef = useRef(null);
  const streamFlushTimerRef = useRef(null);
  const pendingAssistantTextRef = useRef('');

  const usedTokens = useMemo(
    () => selectedTargets.reduce((total, target) => total + target.tokens, 0),
    [selectedTargets],
  );

  const resolvedContextFiles = useMemo(
    () => resolveSelectionToFiles(selectedTargets, treeNodes),
    [selectedTargets, treeNodes],
  );

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
      if (streamFlushTimerRef.current) {
        window.clearTimeout(streamFlushTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [feed]);

  useEffect(() => {
    let mounted = true;

    async function loadHealth() {
      try {
        const payload = await fetchSystemHealth();
        if (!mounted) {
          return;
        }
        setSystemHealth(payload?.dependencies || null);
      } catch {
        if (!mounted) {
          return;
        }
        setSystemHealth(null);
      }
    }

    loadHealth();
    const intervalId = window.setInterval(loadHealth, 20000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadTree() {
      if (!repoId) {
        setTreeError('Repository context is missing. Start analysis again.');
        return;
      }

      try {
        setTreeError('');
        const nodes = await fetchRepositoryTree(repoId);
        if (!mounted) {
          return;
        }

        const normalized = normalizeTreeNodes(nodes);
        setTreeNodes(normalized);
        setSelectedTargets([]);
      } catch (error) {
        if (!mounted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to load repository tree.';
        setTreeError(message);
      }
    }

    loadTree();

    return () => {
      mounted = false;
    };
  }, [repoId]);

  function toggleTarget(node) {
    setSelectedTargets((prev) => {
      if (prev.some((target) => target.id === node.id)) {
        return prev.filter((target) => target.id !== node.id);
      }
      return [...prev, toTarget(node)].slice(-40);
    });
  }

  function removeTarget(targetId) {
    setSelectedTargets((prev) => prev.filter((target) => target.id !== targetId));
  }

  function clearTargets() {
    setSelectedTargets([]);
  }

  const isSubmitting = retrievalState === 'retrieving' || retrievalState === 'streaming';

  function abortActiveQuery() {
    chatAbortRef.current?.abort();
    if (streamFlushTimerRef.current) {
      window.clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    pendingAssistantTextRef.current = '';
    setRetrievalState('idle');
  }

  function applyAssistantText(assistantId, text) {
    setFeed((prev) =>
      prev.map((message) => {
        if (message.id !== assistantId) {
          return message;
        }
        return {
          ...message,
          text,
        };
      }),
    );
  }

  async function runQuery() {
    if (!query.trim() || isSubmitting) {
      return;
    }

    if (!repoId) {
      setFeed((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: 'Repository is not ready. Start analysis again from landing.',
          citations: null,
        },
      ]);
      return;
    }

    chatAbortRef.current?.abort();
    if (streamFlushTimerRef.current) {
      window.clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    pendingAssistantTextRef.current = '';
    const controller = new AbortController();
    chatAbortRef.current = controller;

    const question = query.trim();
    setQuery('');
    const userId = `user-${Date.now()}`;
    const assistantId = `assistant-${Date.now()}`;

    setFeed((prev) => [
      ...prev,
      { id: userId, role: 'user', text: question, citations: null },
      { id: assistantId, role: 'assistant', text: '', citations: null },
    ]);

    setRetrievalState('retrieving');

    try {
      await streamChatResponse({
        repoId,
        question,
        contextFilePaths: resolvedContextFiles,
        signal: controller.signal,
        onEvent: (eventName, payload) => {
          const effectiveEvent = payload?.event || eventName;

          if (effectiveEvent === 'rag.retrieval.started') {
            setRetrievalState('retrieving');
            return;
          }

          if (effectiveEvent === 'rag.token') {
            setRetrievalState('streaming');
            pendingAssistantTextRef.current =
              payload?.accumulated_text || `${pendingAssistantTextRef.current}${payload?.token || ''}`;

            if (!streamFlushTimerRef.current) {
              streamFlushTimerRef.current = window.setTimeout(() => {
                applyAssistantText(assistantId, pendingAssistantTextRef.current);
                streamFlushTimerRef.current = null;
              }, 45);
            }
            return;
          }

          if (effectiveEvent === 'rag.completed') {
            if (streamFlushTimerRef.current) {
              window.clearTimeout(streamFlushTimerRef.current);
              streamFlushTimerRef.current = null;
            }

            const citations = Array.isArray(payload?.citations) ? payload.citations : [];
            const finalText = payload?.text || pendingAssistantTextRef.current;

            setFeed((prev) =>
              prev.map((message) => {
                if (message.id !== assistantId) {
                  return message;
                }
                return {
                  ...message,
                  text: finalText || message.text,
                  citations,
                };
              }),
            );
            setRetrievalState('ready');
          }
        },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      if (streamFlushTimerRef.current) {
        window.clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
      }

      const message = error instanceof Error ? error.message : 'Chat stream failed.';
      setFeed((prev) =>
        prev.map((entry) => {
          if (entry.id !== assistantId) {
            return entry;
          }
          return {
            ...entry,
            text: `Unable to stream response: ${message}`,
          };
        }),
      );
      setRetrievalState('idle');
    }
  }

  return (
    <motion.div
      className="absolute inset-0 z-10 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="absolute top-5 left-1/2 -translate-x-1/2 pointer-events-auto rounded-xl border border-white/10 bg-neutral-900/95 px-3 py-2 backdrop-blur-md text-[11px] text-neutral-300">
        <div className="flex items-center gap-2">
          <span>Workspace {repoId ? `repo:${repoId.slice(0, 8)}` : 'no-repo'}</span>
          <div className="hidden sm:flex items-center gap-1.5">
            <HealthPill label="LLM" ok={Boolean(systemHealth?.groq?.configured)} />
            <HealthPill label="Embed" ok={Boolean(systemHealth?.gemini?.configured)} />
            <HealthPill label="Vector" ok={Boolean(systemHealth?.supabase?.enabled)} />
          </div>
        </div>
      </div>

      <div className="absolute inset-0 px-3 sm:px-5 pb-4 pt-16 pointer-events-auto">
        <Panel className="h-full min-h-0 flex flex-col overflow-hidden">
          <div className="border-b border-white/10 px-3 py-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                activeTab === 'chat' ? 'bg-indigo-500/20 text-indigo-100' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />
                Chat
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('repository')}
              className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                activeTab === 'repository' ? 'bg-indigo-500/20 text-indigo-100' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Boxes className="h-3.5 w-3.5" />
                RepoVIEW
              </span>
            </button>

            <div className="ml-auto">
              <button
                type="button"
                onClick={onBackToLanding}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-300 hover:text-white hover:border-white/25 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Landing
              </button>
            </div>
          </div>

          {activeTab === 'chat' ? (
            <ChatPanel
              query={query}
              setQuery={setQuery}
              feed={feed}
              onSubmit={runQuery}
              onAbort={abortActiveQuery}
              onOpenPicker={() => setPickerOpen(true)}
              onRemoveTarget={removeTarget}
              onClearTargets={clearTargets}
              selectedTargets={selectedTargets}
              usedTokens={usedTokens}
              resolvedContextCount={resolvedContextFiles.length}
              feedBottomRef={feedBottomRef}
              retrievalState={retrievalState}
              isSubmitting={isSubmitting}
            />
          ) : (
            <RepositoryGraphTab
              treeNodes={treeNodes}
              treeError={treeError}
              selectedTargets={selectedTargets}
            />
          )}
        </Panel>
      </div>

      <ContextPickerModal
        open={pickerOpen}
        treeNodes={treeNodes}
        selectedTargets={selectedTargets}
        search={pickerSearch}
        setSearch={setPickerSearch}
        onToggleTarget={toggleTarget}
        onClose={() => setPickerOpen(false)}
        resolvedContextCount={resolvedContextFiles.length}
      />
    </motion.div>
  );
}

function AssistantMarkdown({ text }) {
  return (
    <div className="max-w-none text-sm leading-6 text-neutral-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => <h1 {...props} className="mt-2 mb-1 text-lg font-semibold text-white" />,
          h2: ({ ...props }) => <h2 {...props} className="mt-2 mb-1 text-base font-semibold text-white" />,
          h3: ({ ...props }) => <h3 {...props} className="mt-2 mb-1 text-sm font-semibold text-white" />,
          p: ({ ...props }) => <p {...props} className="my-1.5 text-neutral-100" />,
          ul: ({ ...props }) => <ul {...props} className="my-2 list-disc pl-5 text-neutral-100" />,
          ol: ({ ...props }) => <ol {...props} className="my-2 list-decimal pl-5 text-neutral-100" />,
          li: ({ ...props }) => <li {...props} className="my-0.5" />,
          pre: ({ ...props }) => <pre {...props} className="my-2 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-2" />,
          blockquote: ({ ...props }) => <blockquote {...props} className="my-2 border-l-2 border-cyan-300/40 pl-3 text-neutral-300" />,
          a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200" />,
          code: ({ className, children, ...props }) => (
            <code {...props} className={className ? className : 'rounded bg-black/35 px-1 py-0.5'}>
              {children}
            </code>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}