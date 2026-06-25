import { useEffect, RefObject } from "react";

interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
  dAlpha: number;
  color: string;
}

export function useParticles(canvasRef: RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let W: number, H: number, particles: Particle[], animId: number;

    function resize() {
      W = canvas!.width = window.innerWidth;
      H = canvas!.height = window.innerHeight;
    }

    function mk() {
      particles = Array.from({ length: 35 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.8 + 0.3,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18 - 0.15,
        alpha: Math.random() * 0.4 + 0.1,
        dAlpha: (Math.random() > 0.5 ? 1 : -1) * 0.003,
        color: Math.random() > 0.5 ? "rgba(74,144,196," : "rgba(200,146,42,",
      }));
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha += p.dAlpha;
        if (p.alpha <= 0.08 || p.alpha >= 0.62) p.dAlpha *= -1;
        if (p.y < -10) p.y = H + 10;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = p.color + p.alpha + ")";
        ctx!.fill();
      });
      animId = requestAnimationFrame(draw);
    }

    resize();
    mk();
    draw();

    const onResize = () => { resize(); mk(); };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, [canvasRef]);
}
