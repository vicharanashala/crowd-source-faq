import { useEffect, RefObject } from "react";

export function useMouseGlow(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      el.style.left = e.clientX + "px";
      el.style.top = e.clientY + "px";
    };
    document.addEventListener("mousemove", handler);
    return () => document.removeEventListener("mousemove", handler);
  }, [ref]);
}
