import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface AvatarMeshProps {
  isThinking?: boolean;
  isResponding?: boolean;
}

function AvatarMesh({ isThinking = false, isResponding = false }: AvatarMeshProps) {
  const outerMeshRef = useRef<THREE.Mesh>(null);
  const innerMeshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();

    // Rotate meshes in opposite directions
    if (outerMeshRef.current) {
      outerMeshRef.current.rotation.y = elapsed * 0.25;
      outerMeshRef.current.rotation.x = elapsed * 0.15;
    }
    if (innerMeshRef.current) {
      innerMeshRef.current.rotation.y = -elapsed * 0.4;
      innerMeshRef.current.rotation.z = elapsed * 0.2;
    }

    // Dynamic pulsation based on state
    let pulseScale = 1.0;
    if (isThinking) {
      // Rapid pulsation during thinking
      pulseScale = 1.0 + Math.sin(elapsed * 12) * 0.12;
    } else if (isResponding) {
      // Slower breathing animation when speaking
      pulseScale = 1.05 + Math.sin(elapsed * 4) * 0.06;
    } else {
      // Idle slow breathing
      pulseScale = 1.0 + Math.sin(elapsed * 2) * 0.03;
    }

    if (innerMeshRef.current) {
      innerMeshRef.current.scale.set(pulseScale * 0.8, pulseScale * 0.8, pulseScale * 0.8);
    }
    if (outerMeshRef.current) {
      outerMeshRef.current.scale.set(pulseScale * 1.25, pulseScale * 1.25, pulseScale * 1.25);
    }
  });

  return (
    <group>
      {/* Outer Wireframe Sacred Geometry Core */}
      <mesh ref={outerMeshRef}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#7C3AED" // Deep violet wireframe
          wireframe
          transparent
          opacity={isThinking ? 0.9 : 0.6}
        />
      </mesh>

      {/* Inner Solid Glowing Geometry Core */}
      <mesh ref={innerMeshRef}>
        <dodecahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial
          color={isThinking ? '#06B6D4' : '#8B5CF6'} // Cyan when thinking, violet normally
          emissive={isThinking ? '#06B6D4' : '#6D28D9'}
          emissiveIntensity={isThinking ? 2.5 : 1.2}
          roughness={0.1}
          metalness={0.9}
        />
      </mesh>

      {/* Dynamic light glowing inside the avatar */}
      <pointLight
        position={[0, 0, 0]}
        intensity={isThinking ? 4 : isResponding ? 3 : 1.5}
        color={isThinking ? '#06B6D4' : '#7C3AED'}
        distance={5}
      />
    </group>
  );
}

interface YakshaAvatarProps {
  isThinking?: boolean;
  isResponding?: boolean;
  className?: string;
}

export function YakshaAvatar({ isThinking = false, isResponding = false, className = 'w-64 h-64' }: YakshaAvatarProps) {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* Glow shadow overlays */}
      <div className={`absolute w-48 h-48 rounded-full blur-[60px] opacity-40 transition-colors duration-500 pointer-events-none ${
        isThinking ? 'bg-[#06B6D4]' : 'bg-[#7C3AED]'
      }`}></div>

      <Canvas camera={{ position: [0, 0, 3.2], fov: 50 }}>
        <ambientLight intensity={0.2} />
        <pointLight position={[5, 5, 5]} intensity={2} color="#06B6D4" />
        <pointLight position={[-5, -5, -5]} intensity={1.5} color="#7C3AED" />
        <AvatarMesh isThinking={isThinking} isResponding={isResponding} />
      </Canvas>
    </div>
  );
}

export default YakshaAvatar;
