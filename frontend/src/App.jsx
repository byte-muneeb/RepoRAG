import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { FileCode2, SendHorizontal } from 'lucide-react';
import { LoadingView } from './components/LoadingView';
import { WorkspaceView } from './components/WorkspaceView';
import { createRepository, validateGithubRepoUrl } from './lib/apiClient';

function CustomCursor() {
  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);
  const mouse = useMemo(() => ({ x: mouseX, y: mouseY }), [mouseX, mouseY]);

  const smoothX = useSpring(mouse.x, { stiffness: 300, damping: 20 });
  const smoothY = useSpring(mouse.y, { stiffness: 300, damping: 20 });

  useEffect(() => {
    const manageMouseMove = (event) => {
      mouse.x.set(event.clientX);
      mouse.y.set(event.clientY);
    };

    window.addEventListener('pointermove', manageMouseMove);

    return () => {
      window.removeEventListener('pointermove', manageMouseMove);
    };
  }, [mouseX, mouseY]);

  return (
    <>
      <motion.div
        className="fixed top-0 left-0 z-[9999] pointer-events-none w-3 h-3 rounded-full bg-indigo-400"
        style={{ x: mouse.x, y: mouse.y, translateX: '-50%', translateY: '-50%' }}
      />
      <motion.div
        className="fixed top-0 left-0 z-[9999] pointer-events-none w-10 h-10 rounded-full border border-indigo-400/50 shadow-[0_0_15px_rgba(129,140,248,0.5)]"
        style={{ x: smoothX, y: smoothY, translateX: '-50%', translateY: '-50%' }}
      />
    </>
  );
}

function LandingSwarm() {
  const instanceCount = 1500;
  const groupRef = useRef(null);
  const meshRef = useRef(null);

  const shardMatrices = useMemo(() => {
    const dummy = new THREE.Object3D();

    return Array.from({ length: instanceCount }, () => {
      dummy.position.set(
        THREE.MathUtils.randFloatSpread(40),
        THREE.MathUtils.randFloatSpread(40),
        THREE.MathUtils.randFloatSpread(40),
      );
      dummy.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      );

      // Slight scale variation keeps shards organic while preserving their elongated profile.
      const scaleX = THREE.MathUtils.randFloat(0.8, 1.4);
      const scaleY = THREE.MathUtils.randFloat(0.8, 1.3);
      const scaleZ = THREE.MathUtils.randFloat(0.8, 1.3);
      dummy.scale.set(scaleX, scaleY, scaleZ);

      dummy.updateMatrix();
      return dummy.matrix.clone();
    });
  }, []);

  useEffect(() => {
    if (!meshRef.current) {
      return;
    }

    shardMatrices.forEach((matrix, index) => {
      meshRef.current.setMatrixAt(index, matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [shardMatrices]);

  useFrame((state) => {
    if (!groupRef.current) {
      return;
    }

    const maxScroll = document.body.scrollHeight - window.innerHeight;
    const scrollPercent = maxScroll > 0 ? window.scrollY / maxScroll : 0;
    const clampedScroll = THREE.MathUtils.clamp(scrollPercent, 0, 1);

    const targetRotationY = clampedScroll * Math.PI * 2;
    const targetRotationX = (clampedScroll - 0.5) * Math.PI * 0.6;

    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotationY, 0.06);
    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotationX, 0.06);

    // Idle drift keeps the swarm alive when scroll is static.
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.y += Math.sin(t * 0.18) * 0.0012;
    groupRef.current.rotation.x += Math.cos(t * 0.14) * 0.0009;
    groupRef.current.rotation.z = Math.sin(t * 0.12) * 0.08;
    groupRef.current.position.y = Math.sin(t * 0.2) * 0.9;
    groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, -clampedScroll * 2.5, 0.04);
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[null, null, instanceCount]} frustumCulled={false}>
        <boxGeometry args={[0.6, 0.05, 0.15]} />
        <meshStandardMaterial
          color="#3730a3"
          roughness={0.4}
          metalness={0.8}
          transparent
          opacity={0.8}
        />
      </instancedMesh>
    </group>
  );
}

function DataGyroscope() {
  const ringARef = useRef(null);
  const ringBRef = useRef(null);
  const ringCRef = useRef(null);

  useFrame((_, delta) => {
    if (ringARef.current) {
      ringARef.current.rotation.x += delta * 1.5;
      ringARef.current.rotation.y += delta * 1.9;
    }
    if (ringBRef.current) {
      ringBRef.current.rotation.y -= delta * 2.2;
      ringBRef.current.rotation.z += delta * 1.2;
    }
    if (ringCRef.current) {
      ringCRef.current.rotation.x += delta * 2.1;
      ringCRef.current.rotation.z -= delta * 1.5;
    }
  });

  return (
    <group>
      <mesh ref={ringARef} rotation={[0.4, 0.2, 0]}>
        <torusGeometry args={[1.1, 0.03, 24, 180]} />
        <meshBasicMaterial color="#818cf8" wireframe transparent opacity={0.4} toneMapped={false} />
      </mesh>
      <mesh ref={ringBRef} rotation={[0.1, 1, 0.8]}>
        <torusGeometry args={[1.8, 0.03, 24, 200]} />
        <meshBasicMaterial color="#6366f1" wireframe transparent opacity={0.4} toneMapped={false} />
      </mesh>
      <mesh ref={ringCRef} rotation={[1, 0.2, 0.4]}>
        <torusGeometry args={[2.5, 0.03, 24, 220]} />
        <meshBasicMaterial color="#4f46e5" wireframe transparent opacity={0.4} toneMapped={false} />
      </mesh>
    </group>
  );
}

function DependencyGraph() {
  const groupRef = useRef(null);

  const nodes = useMemo(() => {
    return Array.from({ length: 20 }, (_, index) => {
      const phi = Math.acos(1 - (2 * (index + 0.5)) / 20);
      const theta = Math.PI * (1 + Math.sqrt(5)) * index;
      const radius = 1.9 + (index % 4) * 0.16;

      return [
        Math.cos(theta) * Math.sin(phi) * radius,
        Math.cos(phi) * radius,
        Math.sin(theta) * Math.sin(phi) * radius,
      ];
    });
  }, []);

  const edges = useMemo(() => {
    const pairs = [];

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const dx = nodes[i][0] - nodes[j][0];
        const dy = nodes[i][1] - nodes[j][1];
        const dz = nodes[i][2] - nodes[j][2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < 2.25) {
          pairs.push([nodes[i], nodes[j]]);
        }
      }
    }

    return pairs.slice(0, 34);
  }, [nodes]);

  useFrame((_, delta) => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.rotation.y += delta * 0.06;
    groupRef.current.rotation.x += delta * 0.02;
  });

  return (
    <group ref={groupRef}>
      {edges.map((edge, index) => (
        <Line key={index} points={edge} color="#a5b4fc" transparent opacity={0.22} lineWidth={0.7} />
      ))}
      {nodes.map((position, index) => (
        <mesh key={index} position={position}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Background3DScene({ currentStage }) {
  if (currentStage === 'WORKSPACE') {
    return (
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 22% 18%, rgba(59,130,246,0.10), transparent 42%), radial-gradient(circle at 82% 78%, rgba(148,163,184,0.08), transparent 44%), #0a0a0b',
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Canvas camera={{ position: [0, 0, 24], fov: 55 }} dpr={[1, 2]}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 10]} intensity={2} color="#818cf8" />

        {currentStage === 'LANDING' && <LandingSwarm />}
        {currentStage === 'LOADING' && <DataGyroscope />}
      </Canvas>
    </div>
  );
}

function UrlInputView({ repositoryUrl, onRepositoryUrlChange, onAnalyze, isSubmitting, validationError }) {
  return (
    <div className="w-full max-w-3xl pointer-events-auto">
      <div className="p-8 rounded-2xl bg-neutral-900/40 backdrop-blur-2xl border border-indigo-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] pointer-events-auto">
        <div className="inline-flex items-center gap-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-300">
          <FileCode2 className="h-3.5 w-3.5" />
          Repository Gateway
        </div>

        <h2 className="mt-5 text-2xl sm:text-3xl font-semibold text-neutral-50">Initialize your codebase workspace</h2>
        <p className="mt-2 text-sm text-neutral-400">Paste a public repository URL to launch semantic analysis.</p>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <input
            value={repositoryUrl}
            onChange={(event) => onRepositoryUrlChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onAnalyze();
              }
            }}
            placeholder="https://github.com/org/repo"
            className={`w-full rounded-xl border bg-neutral-900/60 px-4 py-3 text-sm text-neutral-100 outline-none focus:ring-2 ${
              validationError
                ? 'border-rose-400/70 focus:border-rose-400 focus:ring-rose-400/30'
                : 'border-white/10 focus:border-indigo-400 focus:ring-indigo-500/40'
            }`}
          />
          <button
            onClick={onAnalyze}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {isSubmitting ? 'Starting...' : 'Analyze'}
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>

        {validationError && <p className="mt-3 text-sm text-rose-300">{validationError}</p>}
      </div>
    </div>
  );
}

function HeroLandingView({ onAnalyzeRepository, analyzeError }) {
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  async function handleAnalyzeClick() {
    if (!repositoryUrl.trim() || isSubmitting) {
      return;
    }

    const validation = validateGithubRepoUrl(repositoryUrl);
    if (!validation.isValid) {
      setValidationError(validation.message || 'Invalid repository URL.');
      return;
    }

    setValidationError('');
    setIsSubmitting(true);
    try {
      await onAnalyzeRepository(validation.normalizedUrl || repositoryUrl.trim());
    } catch {
      // Parent sets the visible API error state.
    } finally {
      setIsSubmitting(false);
    }
  }

  const featureCards = [
    {
      title: 'Vector Search',
      description: 'Embeddings capture semantic meaning in your code, surfacing intent and related logic beyond plain keyword matches.',
    },
    {
      title: 'AST Parsing',
      description: 'RepoRAG understands syntax trees, symbol relationships, and dependency edges to map how your system actually works.',
    },
    {
      title: 'Contextual Chat',
      description: 'The LLM answers with grounded context and exact file citations, so every response is traceable and verifiable.',
    },
  ];

  const stepItems = [
    {
      step: '01',
      title: 'Ingest',
      detail: 'Clone and intelligently chunk the repository into semantically coherent units.',
    },
    {
      step: '02',
      title: 'Embed',
      detail: 'Convert code to vectors in ChromaDB to unlock fast, meaning-aware retrieval.',
    },
    {
      step: '03',
      title: 'Query',
      detail: 'Ask natural-language questions and generate accurate insights across your stack.',
    },
  ];

  const featureContainerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
      },
    },
  };

  const featureItemVariants = {
    hidden: { opacity: 0, y: 26 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.55,
        ease: 'easeOut',
      },
    },
  };

  return (
    <div className="relative z-10 w-full">
      <section className="min-h-screen flex items-center justify-center">
        <div className="max-w-7xl mx-auto px-6 w-full text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="text-7xl sm:text-8xl md:text-9xl font-bold tracking-tight text-neutral-50"
          >
            REPORAG
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.12, ease: 'easeOut' }}
            className="mt-5 text-base sm:text-xl text-neutral-400"
          >
            Chat with any codebase instantly.
          </motion.p>

          <motion.div
            className="mt-14 inline-flex items-center rounded-full border border-indigo-400/30 bg-neutral-900/35 px-4 py-2 text-xs uppercase tracking-[0.14em] text-indigo-300"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            Scroll to discover
          </motion.div>
        </div>
      </section>

      <section className="min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-6 w-full">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="text-center"
          >
            <h2 className="text-4xl sm:text-5xl font-semibold text-neutral-50">Features Built for Code Intelligence</h2>
            <p className="mt-3 text-neutral-400 max-w-2xl mx-auto">
              A retrieval-first workflow that combines structure-aware parsing, embeddings, and precise language generation.
            </p>
          </motion.div>

          <motion.div
            variants={featureContainerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {featureCards.map((card) => (
              <motion.div
                key={card.title}
                variants={featureItemVariants}
                whileHover={{ y: -6, borderColor: 'rgba(129,140,248,0.5)' }}
                className="bg-neutral-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-8 text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:shadow-[0_0_30px_rgba(99,102,241,0.22)] transition-shadow"
              >
                <h3 className="text-xl font-semibold text-indigo-300">{card.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-neutral-300">{card.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-6 w-full">
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <h2 className="text-center text-4xl sm:text-5xl font-semibold text-neutral-50">How It Works</h2>
            <p className="mt-3 text-center text-neutral-400 max-w-2xl mx-auto">
              Move from repository URL to grounded architectural answers in three streamlined phases.
            </p>
          </motion.div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            {stepItems.map((item) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="relative rounded-2xl border border-white/10 bg-neutral-900/35 backdrop-blur-md p-8"
              >
                <span className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-indigo-400/40 bg-indigo-500/10 text-xs font-semibold text-indigo-300">
                  {item.step}
                </span>
                <h3 className="mt-5 text-2xl font-semibold text-neutral-50">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="min-h-screen flex items-center pb-20">
        <div className="max-w-7xl mx-auto px-6 w-full">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="flex justify-center"
          >
            <UrlInputView
              repositoryUrl={repositoryUrl}
              onRepositoryUrlChange={(value) => {
                setRepositoryUrl(value);
                if (validationError) {
                  setValidationError('');
                }
              }}
              onAnalyze={handleAnalyzeClick}
              isSubmitting={isSubmitting}
              validationError={validationError}
            />
          </motion.div>
          {analyzeError && (
            <p className="mt-4 text-center text-sm text-rose-300">{analyzeError}</p>
          )}
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [currentStage, setCurrentStage] = useState('LANDING');
  const [activeRepoId, setActiveRepoId] = useState(null);
  const [analyzeError, setAnalyzeError] = useState('');

  function returnToLanding() {
    setCurrentStage('LANDING');
    setActiveRepoId(null);
    setAnalyzeError('');
  }

  async function handleAnalyzeRepository(repositoryUrl) {
    try {
      setAnalyzeError('');
      const result = await createRepository(repositoryUrl);
      setActiveRepoId(result.repo_id);
      setCurrentStage('LOADING');
    } catch (error) {
      setAnalyzeError(error instanceof Error ? error.message : 'Failed to start ingestion job.');
      throw error;
    }
  }

  return (
    <div
      className={`relative w-full min-h-screen bg-neutral-950 text-neutral-50 ${
        currentStage === 'WORKSPACE' ? 'cursor-auto' : 'cursor-none'
      }`}
    >
      <Background3DScene currentStage={currentStage} />
      {currentStage !== 'WORKSPACE' && <CustomCursor />}

      <AnimatePresence mode="wait">
        {currentStage === 'LANDING' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <HeroLandingView onAnalyzeRepository={handleAnalyzeRepository} analyzeError={analyzeError} />
          </motion.div>
        )}

        {currentStage === 'LOADING' && (
          <motion.div
            key="loading"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <LoadingView
              repoId={activeRepoId}
              setCurrentStage={setCurrentStage}
              onBackToLanding={returnToLanding}
            />
          </motion.div>
        )}

        {currentStage === 'WORKSPACE' && (
          <motion.div
            key="workspace"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <WorkspaceView repoId={activeRepoId} onBackToLanding={returnToLanding} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
