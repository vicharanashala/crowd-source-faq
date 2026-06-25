"use client";
import { useRef } from "react";
import { useMouseGlow } from "@/lib/hooks/useMouseGlow";
import { useParticles } from "@/lib/hooks/useParticles";

export default function BackgroundEffects() {
  const glowRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useMouseGlow(glowRef);
  useParticles(canvasRef);

  return (
    <>
      <div className="noise" />
      <div className="mouse-glow" ref={glowRef} />
      <canvas className="particles-canvas" ref={canvasRef} />

      {/* Four blobs — exact sizes/positions/colors/durations from BackgroundEffects.jsx */}
      <div
        className="blob"
        style={{ width: 520, height: 520, top: -100, left: -160,
          background: "rgba(74,144,196,.09)", animationDuration: "24s" }}
      />
      <div
        className="blob"
        style={{ width: 400, height: 400, top: 340, right: -120,
          background: "rgba(200,146,42,.07)", animationDuration: "18s", animationDelay: "-8s" }}
      />
      <div
        className="blob"
        style={{ width: 360, height: 360, bottom: 200, left: "38%",
          background: "rgba(74,144,196,.06)", animationDuration: "22s", animationDelay: "-5s" }}
      />
      <div
        className="blob"
        style={{ width: 280, height: 280, top: "60%", right: "20%",
          background: "rgba(212,95,74,.05)", animationDuration: "28s", animationDelay: "-12s" }}
      />
    </>
  );
}
