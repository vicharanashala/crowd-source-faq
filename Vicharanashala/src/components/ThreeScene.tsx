import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

function Particles() {
  const pointsRef = useRef<THREE.Points>(null);
  const { mouse } = useThree();

  const count = 1200;
  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Space out particles in coordinates
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;

      // Small velocity vector
      vel[i * 3] = (Math.random() - 0.5) * 0.006;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.006;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.006;
    }
    return [pos, vel];
  }, []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const geometry = pointsRef.current.geometry;
    const posArr = geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < count; i++) {
      // Apply velocity drift
      posArr[i * 3] += velocities[i * 3];
      posArr[i * 3 + 1] += velocities[i * 3 + 1];
      posArr[i * 3 + 2] += velocities[i * 3 + 2];

      // Keep particles inside bounding limits (bounce back)
      if (Math.abs(posArr[i * 3]) > 10) velocities[i * 3] *= -1;
      if (Math.abs(posArr[i * 3 + 1]) > 10) velocities[i * 3 + 1] *= -1;
      if (Math.abs(posArr[i * 3 + 2]) > 10) velocities[i * 3 + 2] *= -1;

      // Cursor repulsion: calculate distance between cursor position (projected) and particle
      const px = posArr[i * 3];
      const py = posArr[i * 3 + 1];
      
      const mx = mouse.x * 8; // Scale mouse to 3D dimensions
      const my = mouse.y * 8;

      const dx = px - mx;
      const dy = py - my;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2.5) {
        // Repel force
        posArr[i * 3] += dx * 0.03;
        posArr[i * 3 + 1] += dy * 0.03;
      }
    }
    geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.07}
        color="#06B6D4" // Cyan points
        transparent
        opacity={0.45}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

export function ThreeScene() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-[#050510]">
      {/* Background gradients */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#7C3AED]/10 blur-[150px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-[#06B6D4]/5 blur-[180px] rounded-full pointer-events-none"></div>

      <Canvas camera={{ position: [0, 0, 7], fov: 65 }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 10, 10]} intensity={1.5} color="#7C3AED" />
        <pointLight position={[-10, -10, -10]} intensity={1} color="#06B6D4" />
        <Particles />
      </Canvas>
    </div>
  );
}

export default ThreeScene;
