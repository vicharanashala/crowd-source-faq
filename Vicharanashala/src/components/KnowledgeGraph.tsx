import React, { useMemo, useState, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { faqData, CATEGORIES, FAQItem } from '../data/faqs.js';

interface KnowledgeGraphProps {
  onSelectFAQ: (faq: FAQItem) => void;
  focusFaqId?: string | null;
}

// Precalculate 3D centers for the 13 categories
const categoryCenters = CATEGORIES.reduce((acc, cat, idx) => {
  const theta = (idx / CATEGORIES.length) * Math.PI * 2;
  const phi = Math.acos((2 * (idx + 0.5)) / CATEGORIES.length - 1);
  const radius = 4.5;
  const x = Math.sin(phi) * Math.cos(theta) * radius;
  const y = Math.sin(phi) * Math.sin(theta) * radius;
  const z = Math.cos(phi) * radius;
  acc[cat] = [x, y, z];
  return acc;
}, {} as Record<string, [number, number, number]>);

// Precalculate positions for the 24 FAQs
const nodePositions = faqData.map((faq, idx) => {
  const center = categoryCenters[faq.category] || [0, 0, 0];
  // Calculate relative cluster offset
  const angle = (idx * 1.5) % (Math.PI * 2);
  const radius = 0.8 + (idx % 3) * 0.25;
  const x = center[0] + Math.cos(angle) * radius;
  const y = center[1] + Math.sin(angle) * radius;
  const z = center[2] + (idx % 2 === 0 ? 0.4 : -0.4);
  return {
    faq,
    position: [x, y, z] as [number, number, number],
  };
});

// Map of FAQ ID -> Position
const positionMap = nodePositions.reduce((acc, item) => {
  acc[item.faq.id] = item.position;
  return acc;
}, {} as Record<string, [number, number, number]>);

// Generate lines for related FAQs
const connectionLines = nodePositions.flatMap((node) => {
  const start = node.position;
  return node.faq.related
    .map((relId) => {
      const end = positionMap[relId];
      if (!end) return null;
      // Filter out duplicate lines to save rendering load
      if (node.faq.id > relId) return null;
      return {
        id: `${node.faq.id}-${relId}`,
        points: [new THREE.Vector3(...start), new THREE.Vector3(...end)],
      };
    })
    .filter((line): line is { id: string; points: THREE.Vector3[] } => line !== null);
});

// Single Orb/Node component
interface NodeProps {
  faq: FAQItem;
  position: [number, number, number];
  onSelect: () => void;
}

const Node: React.FC<NodeProps> = ({ faq, position, onSelect }) => {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const elapsed = state.clock.getElapsedTime();
    // Subtle breathing animation
    const scale = hovered ? 1.4 : 1.0 + Math.sin(elapsed * 2 + faq.popularity) * 0.05;
    meshRef.current.scale.set(scale, scale, scale);
  });

  // Assign color based on category index
  const catIdx = CATEGORIES.indexOf(faq.category);
  const glowColor = catIdx % 3 === 0 ? '#7C3AED' : catIdx % 3 === 1 ? '#06B6D4' : '#F43F5E';

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[0.22, 24, 24]} />
        <meshStandardMaterial
          color={glowColor}
          emissive={glowColor}
          emissiveIntensity={hovered ? 2.5 : 0.8}
          roughness={0.1}
          metalness={0.8}
        />
      </mesh>

      {/* Floating tag showing category and question summary on hover */}
      {hovered && (
        <Html distanceFactor={8} position={[0, 0.4, 0]} center>
          <div className="bg-slate-950/95 border border-slate-800 text-white p-2.5 rounded-lg shadow-2xl backdrop-blur-md w-60 text-xs pointer-events-none select-none transition-all duration-300">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-widest bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-800/30">
                {faq.category}
              </span>
              <span className="text-[9px] text-slate-500 font-mono">Popularity: {faq.popularity}</span>
            </div>
            <p className="font-medium text-slate-100 font-sans leading-relaxed">{faq.question}</p>
            <div className="text-[9px] text-violet-400 mt-1 font-semibold flex items-center gap-1">
              <span>🖱️ Click node to expand details</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};

// Line connection drawing component
const ConnectionLine: React.FC<{ points: THREE.Vector3[] }> = ({ points }) => {
  const lineGeometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [points]);

  return (
    <line geometry={lineGeometry}>
      <lineBasicMaterial color="#475569" transparent opacity={0.35} linewidth={1} />
    </line>
  );
};

// Smooth camera controller component for node zooming
const CameraController: React.FC<{ focusFaqId: string | null }> = ({ focusFaqId }) => {
  const { camera, controls } = useThree();
  const lastFocusId = useRef<string | null>(null);
  const animProgress = useRef<number>(0);

  React.useEffect(() => {
    if (focusFaqId) {
      animProgress.current = 1.0; // Reset animation countdown
      lastFocusId.current = focusFaqId;
    }
  }, [focusFaqId]);

  useFrame(() => {
    if (animProgress.current > 0 && lastFocusId.current && positionMap[lastFocusId.current]) {
      const targetPos = positionMap[lastFocusId.current];
      const orbitControls = controls as any;
      
      if (orbitControls && orbitControls.target) {
        // Smoothly pan OrbitControls target to look at the node
        orbitControls.target.x = THREE.MathUtils.lerp(orbitControls.target.x, targetPos[0], 0.08);
        orbitControls.target.y = THREE.MathUtils.lerp(orbitControls.target.y, targetPos[1], 0.08);
        orbitControls.target.z = THREE.MathUtils.lerp(orbitControls.target.z, targetPos[2], 0.08);
        
        // Smoothly zoom camera closer to target node coordinates
        const targetCamX = targetPos[0];
        const targetCamY = targetPos[1];
        const targetCamZ = targetPos[2] + 2.0; // zoom close
        
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.08);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.08);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.08);
        
        orbitControls.update();
      }
      
      // Decrease animation countdown
      animProgress.current -= 0.015;
    }
  });

  return null;
};

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ onSelectFAQ, focusFaqId = null }) => {
  return (
    <div className="w-full h-[550px] relative border border-[#7C3AED]/20 rounded-2xl bg-slate-950/60 overflow-hidden shadow-2xl backdrop-blur-md group-hover:border-[#7C3AED]/40 transition-colors">
      
      {/* 3D Knowledge Graph instruction banner */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h3 className="font-display text-lg text-white font-bold tracking-wide flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
          3D Knowledge Graph
        </h3>
        <p className="text-xs text-slate-400 font-sans mt-0.5">Drag to rotate • Scroll to zoom • Hover/Click node</p>
      </div>

      <Canvas camera={{ position: [0, 0, 9.5], fov: 60 }}>
        <ambientLight intensity={0.45} />
        <pointLight position={[10, 10, 10]} intensity={1.5} color="#06B6D4" />
        <pointLight position={[-10, -10, -10]} intensity={1} color="#7C3AED" />

        {/* Orbit controls for rotation, zoom, pan */}
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          maxDistance={15}
          minDistance={3.5}
          makeDefault
        />

        {/* Focus Controller */}
        <CameraController focusFaqId={focusFaqId} />

        {/* Draw Connections */}
        {connectionLines.map((line) => (
          <ConnectionLine key={line.id} points={line.points} />
        ))}

        {/* Draw Nodes */}
        {nodePositions.map((node) => (
          <Node
            key={node.faq.id}
            faq={node.faq}
            position={node.position}
            onSelect={() => onSelectFAQ(node.faq)}
          />
        ))}
      </Canvas>
    </div>
  );
};

export default KnowledgeGraph;
