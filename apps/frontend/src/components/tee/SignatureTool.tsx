/**
 * SignatureTool — Sign My Tee v1.90
 *
 * Two-step composite for the public "sign this Tee" flow:
 *
 *   1. Capture  — Upload a photo/scan OR draw freehand on a <canvas>.
 *                 Both paths funnel through `removeSignatureBackground`
 *                 so the result is a transparent-bg PNG (data URL).
 *
 *   2. Place    — Render the BG-removed PNG into the back face of the
 *                 tee at default (x: 0.7, y: 0.55). The user can then
 *                 drag, resize and rotate the signature using the
 *                 handles inside <PremiumTee> when `editable={true}`.
 *
 *   3. Save     — POST `/tee/share/:shareId/sign` with the BG-removed
 *                 dataUrl + normalized (x, y, scale, rotation). On
 *                 success we append to the local signatures array
 *                 (optimistic) and let the parent navigate away.
 *
 * v1.90 changes:
 *   - Ink colour picker (12 premium presets + custom color input)
 *   - Fixed canvas pointer sync: setPointerCapture on canvas so strokes
 *     never drift even when the cursor leaves the canvas boundary
 *   - Smooth quadratic bezier curves for nicer hand-drawn feel
 *   - Draw tab shown first by default
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { removeSignatureBackground } from '../../utils/sigRemover';
import PremiumTee, {
  type ShirtColorKey,
  type TextColorKey,
  type SignatureOverlay,
} from './PremiumTee';

type Phase = 'capture' | 'place' | 'submitting';

interface Props {
  shareId: string;
  /** v1.87.4 — accepts a named palette key or a `#rrggbb` hex
      (custom-picker tees). `PremiumTee` does the actual resolution. */
  shirtColor: ShirtColorKey | string;
  textColor: TextColorKey | string;
  /** v1.87.4 — explicit hex overrides. Win over `shirtColor` /
      `textColor` when set. Null/undefined for pre-hex tees. */
  customShirtHex?: string | null;
  customTextHex?: string | null;
  nameOnBack: string;
  existingSignatures: SignatureOverlay[];
  defaultSignerName: string;
  onCancel: () => void;
  onSigned: (next: SignatureOverlay) => void;
}

/** Premium ink colour presets */
const INK_COLORS = [
  { hex: '#1f1b16', label: 'Ink Black' },
  { hex: '#1a1a6e', label: 'Royal Blue' },
  { hex: '#0a3d62', label: 'Navy' },
  { hex: '#1e5a2b', label: 'Forest Green' },
  { hex: '#7b241c', label: 'Burgundy' },
  { hex: '#6c3483', label: 'Plum' },
  { hex: '#b7410e', label: 'Rust' },
  { hex: '#8B6914', label: 'Gold' },
  { hex: '#2c3e50', label: 'Slate' },
  { hex: '#e74c3c', label: 'Crimson' },
  { hex: '#16a085', label: 'Teal' },
  { hex: '#e67e22', label: 'Amber' },
];


interface Stroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

function distanceToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const adx = p.x - a.x;
    const ady = p.y - a.y;
    return Math.sqrt(adx * adx + ady * ady);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;
  const diffX = p.x - closestX;
  const diffY = p.y - closestY;
  return Math.sqrt(diffX * diffX + diffY * diffY);
}

function distanceToStroke(p: { x: number; y: number }, stroke: Stroke): number {
  let minDistance = Infinity;
  for (let i = 0; i < stroke.points.length - 1; i++) {
    const dist = distanceToSegment(p, stroke.points[i], stroke.points[i + 1]);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }
  return minDistance;
}

export default function SignatureTool({
  shareId,
  shirtColor,
  textColor,
  customShirtHex,
  customTextHex,
  nameOnBack,
  existingSignatures,
  defaultSignerName,
  onCancel,
  onSigned,
}: Props) {
  const [phase, setPhase] = useState<Phase>('capture');
  const [signerName, setSignerName] = useState<string>(defaultSignerName);
  const [pendingSig, setPendingSig] = useState<SignatureOverlay | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Draw shown first so users can immediately sign
  const [tab, setTab] = useState<'upload' | 'draw'>('draw');
  const [inkColor, setInkColor] = useState(INK_COLORS[0].hex);
  const [hasStrokes, setHasStrokes] = useState(false);
  /** Which face the user wants to sign — front or back */
  const [signingFace, setSigningFace] = useState<'front' | 'back'>('back');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalSize, setOriginalSize] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFile]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  
  const [drawTool, setDrawTool] = useState<'pencil' | 'eraser'>('pencil');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  // We accumulate ALL points of the current stroke here.
  const strokePointsRef = useRef<{ x: number; y: number }[]>([]);

  // ── Canvas helpers ─────────────────────────────────────────────────
  const getCtx = useCallback(() => canvasRef.current?.getContext('2d') ?? null, []);

  const initCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.max(window.devicePixelRatio ?? 1, 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const ctx = c.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    }
  }, []);

  const applyPenStyle = useCallback((ctx: CanvasRenderingContext2D, color: string) => {
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
  }, []);

  const drawAllStrokes = useCallback((ctx: CanvasRenderingContext2D, currentStrokes: Stroke[]) => {
    const c = canvasRef.current;
    if (!c) return;
    ctx.clearRect(0, 0, c.width / (window.devicePixelRatio || 1), c.height / (window.devicePixelRatio || 1));
    
    currentStrokes.forEach((stroke) => {
      applyPenStyle(ctx, stroke.color);
      const pts = stroke.points;
      if (pts.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 1) {
        ctx.lineTo(pts[0].x, pts[0].y);
      } else {
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2;
          const my = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      }
      ctx.stroke();
    });
  }, [applyPenStyle]);

  // Initialise canvas when draw tab mounts
  useEffect(() => {
    if (tab !== 'draw') return;
    const id = requestAnimationFrame(() => {
      initCanvas();
      const ctx = getCtx();
      if (ctx) {
        drawAllStrokes(ctx, strokesRef.current);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [tab, initCanvas, getCtx, drawAllStrokes]);

  // Redraw completed strokes when they change
  useEffect(() => {
    if (tab !== 'draw') return;
    const ctx = getCtx();
    if (ctx) {
      drawAllStrokes(ctx, strokes);
    }
  }, [tab, strokes, getCtx, drawAllStrokes]);

  // ── Canvas drawing ─────────────────────────────────────────────────
  const toCss = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const handleErase = (pt: { x: number; y: number }) => {
    const originalLength = strokesRef.current.length;
    const nextStrokes = strokesRef.current.filter((stroke) => {
      return distanceToStroke(pt, stroke) > 12;
    });
    if (nextStrokes.length !== originalLength) {
      strokesRef.current = nextStrokes;
      setStrokes(nextStrokes);
      setHasStrokes(nextStrokes.length > 0);
    }
  };

  const beginDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    
    const pt = toCss(e);
    if (drawTool === 'pencil') {
      strokePointsRef.current = [pt];
    } else {
      handleErase(pt);
    }
  };

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const pt = toCss(e);
    
    if (drawTool === 'pencil') {
      strokePointsRef.current.push(pt);
      
      const ctx = getCtx();
      if (ctx) {
        drawAllStrokes(ctx, strokesRef.current);
        applyPenStyle(ctx, inkColor);
        const pts = strokePointsRef.current;
        if (pts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i].x + pts[i + 1].x) / 2;
            const my = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
          }
          ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
          ctx.stroke();
        }
      }
      setHasStrokes(true);
    } else {
      handleErase(pt);
    }
  };

  const endDraw = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    
    if (drawTool === 'pencil' && strokePointsRef.current.length > 0) {
      const newStroke: Stroke = {
        id: `stroke-${Date.now()}-${Math.random()}`,
        points: [...strokePointsRef.current],
        color: inkColor,
        width: 3,
      };
      const nextStrokes = [...strokesRef.current, newStroke];
      strokesRef.current = nextStrokes;
      setStrokes(nextStrokes);
      setHasStrokes(true);
    }
    strokePointsRef.current = [];
  };

  const clearCanvas = () => {
    strokesRef.current = [];
    setStrokes([]);
    setHasStrokes(false);
    strokePointsRef.current = [];
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
      }
    }
  };

  const finishDraw = () => {
    const dataUrl = canvasRef.current!.toDataURL('image/png');
    const base64Str = dataUrl.split(',')[1];
    const originalBytesSize = base64Str ? Math.floor(base64Str.length * 0.75) : 0;
    setOriginalSize(originalBytesSize);

    const defaultX = signingFace === 'front' ? 0.3 : 0.7;
    setPendingSig({ id: `tmp-${Date.now()}`, dataUrl, face: signingFace, x: defaultX, y: 0.55, scale: 0.6, rotation: 0 });
    setPhase('place');
  };

  const validateFile = (file: File): boolean => {
    const maxSize = 500 * 1024; // 500 KB
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['png', 'jpg', 'jpeg'];
    
    const isValidType = validTypes.includes(file.type) || (ext && validExts.includes(ext));
    const isValidSize = file.size <= maxSize;
    
    if (!isValidType || !isValidSize) {
      setError('Signature image must be a PNG or JPG and smaller than 500 KB.');
      setSelectedFile(null);
      return false;
    }
    
    setError(null);
    setSelectedFile(file);
    setOriginalSize(file.size);
    return true;
  };

  // ── Upload ─────────────────────────────────────────────────────────
  const handleUpload = async (file: File) => {
    setError(null);
    try {
      const dataUrl = await removeSignatureBackground(file, { tolerance: 50 });
      const defaultX = signingFace === 'front' ? 0.3 : 0.7;
      setPendingSig({ id: `tmp-${Date.now()}`, dataUrl, face: signingFace, x: defaultX, y: 0.55, scale: 0.6, rotation: 0 });
      setPhase('place');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process the image.');
    }
  };

  // ── Place ──────────────────────────────────────────────────────────
  const updatePending = (next: Partial<SignatureOverlay>) =>
    setPendingSig((prev) => (prev ? { ...prev, ...next } : prev));

  // ── Save ───────────────────────────────────────────────────────────
  const save = async () => {
    if (!pendingSig) return;
    if (!signerName.trim()) { setError('Add your name so the owner knows who signed.'); return; }
    setError(null);
    setPhase('submitting');
    try {
      const signatureBlob = dataURLtoBlob(pendingSig.dataUrl);
      const payloadSize = signatureBlob.size;
      const contentType = 'multipart/form-data';

      console.log('Original file size:', originalSize);
      console.log('Payload size:', payloadSize);
      console.log('Content-Type:', contentType);
      console.log('Content-Length:', payloadSize);

      const formData = new FormData();
      formData.append('signerName', signerName.trim());
      formData.append('face', pendingSig.face ?? 'back');
      formData.append('x', String(pendingSig.x));
      formData.append('y', String(pendingSig.y));
      formData.append('scale', String(pendingSig.scale));
      formData.append('rotation', String(pendingSig.rotation));
      formData.append('signature', signatureBlob, 'signature.png');

      const api = (await import('../../utils/api')).default;
      const r = await api.post(`/tee/share/${shareId}/sign`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      const sig = r.data?.signature;
      if (!sig) throw new Error('Server did not return the saved signature.');
      onSigned({
        id: sig.id, dataUrl: sig.signerDataUrl,
        face: sig.face ?? pendingSig.face ?? 'back',
        x: sig.x ?? pendingSig.x, y: sig.y ?? pendingSig.y,
        scale: sig.scale ?? pendingSig.scale, rotation: sig.rotation ?? pendingSig.rotation,
      });
    } catch (err) {
      const { friendlyError } = await import('../../utils/api');
      setError(friendlyError(err, 'Could not save the signature.'));
      setPhase('place');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-bg/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20 }}
          className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-serif text-ink">Sign this T-shirt</h2>
              <p className="text-xs text-ink-soft">
                {phase === 'capture' && 'Draw your signature or upload a photo of it.'}
                {phase === 'place' && 'Drag, resize or rotate your signature. Then save.'}
                {phase === 'submitting' && 'Saving…'}
              </p>
            </div>
            <button type="button" onClick={onCancel}
              className="px-3 py-1 rounded-lg text-sm text-ink-soft hover:text-ink hover:bg-mist transition-colors">
              Cancel
            </button>
          </div>

          <AnimatePresence mode="wait">
            {phase === 'capture' && (
              <motion.div key="capture" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }} className="p-6 space-y-4">
                {/* Face selector */}
                <div>
                  <p className="text-xs font-medium text-ink-soft mb-2">Sign on which side?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setSigningFace('back')}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        signingFace === 'back'
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-card text-ink-soft hover:border-accent/50'
                      }`}>
                      <span className="text-lg">👕</span>
                      <span>Back <span className="text-xs opacity-60">(Name side)</span></span>
                    </button>
                    <button type="button" onClick={() => setSigningFace('front')}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        signingFace === 'front'
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-card text-ink-soft hover:border-accent/50'
                      }`}>
                      <span className="text-lg">👔</span>
                      <span>Front <span className="text-xs opacity-60">(Logo side)</span></span>
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2">
                  <Tab active={tab === 'draw'} onClick={() => setTab('draw')}>✏️ Draw</Tab>
                  <Tab active={tab === 'upload'} onClick={() => setTab('upload')}>📷 Upload</Tab>
                </div>

                {/* ── Draw tab ── */}
                {tab === 'draw' && (
                  <div className="space-y-3">
                    {/* Tool Selection (Draw vs Erase) */}
                    <div>
                      <p className="text-xs font-medium text-ink-soft mb-2">Drawing tool</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDrawTool('pencil')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                            drawTool === 'pencil'
                              ? 'border-accent bg-accent/10 text-accent shadow-sm'
                              : 'border-border bg-card text-ink-soft hover:border-accent/50'
                          }`}
                        >
                          ✏️ Draw
                        </button>
                        <button
                          type="button"
                          onClick={() => setDrawTool('eraser')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                            drawTool === 'eraser'
                              ? 'border-accent bg-accent/10 text-accent shadow-sm'
                              : 'border-border bg-card text-ink-soft hover:border-accent/50'
                          }`}
                        >
                          🧽 Stroke Eraser
                        </button>
                      </div>
                    </div>

                    {/* Ink colour picker */}
                    {drawTool === 'pencil' && (
                      <div>
                        <p className="text-xs font-medium text-ink-soft mb-2">Ink colour</p>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {INK_COLORS.map((c) => (
                            <button key={c.hex} type="button" title={c.label}
                              onClick={() => setInkColor(c.hex)}
                              className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110 focus:outline-none"
                              style={{
                                backgroundColor: c.hex,
                                borderColor: inkColor === c.hex ? '#ffffff' : 'transparent',
                                boxShadow: inkColor === c.hex ? `0 0 0 2px ${c.hex}, 0 0 0 3px rgba(255,255,255,0.6)` : 'inset 0 0 0 1px rgba(0,0,0,0.15)',
                              }}
                            />
                          ))}
                          {/* Custom colour */}
                          <label title="Custom colour"
                            className="relative w-6 h-6 rounded-full border-2 border-dashed border-border cursor-pointer grid place-items-center hover:border-accent transition-colors overflow-hidden"
                            style={{ borderColor: INK_COLORS.every(c => c.hex.toLowerCase() !== inkColor.toLowerCase()) ? '#a07040' : undefined }}>
                            <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              value={inkColor} onChange={(e) => setInkColor(e.target.value)} />
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-ink-soft pointer-events-none"><path d="M12 2v20M2 12h20" /></svg>
                          </label>
                          {/* Selected colour swatch preview */}
                          <div className="ml-1 flex items-center gap-1.5 text-xs text-ink-faint">
                            <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: inkColor }} />
                            <span className="font-mono">{inkColor}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Canvas */}
                    <div className="relative rounded-xl overflow-hidden border border-border">
                      <canvas
                        ref={canvasRef}
                        className="block w-full h-48 touch-none"
                        style={{ background: 'rgba(255,255,255,0.03)', cursor: drawTool === 'eraser' ? 'cell' : 'crosshair' }}
                        onPointerDown={beginDraw}
                        onPointerMove={moveDraw}
                        onPointerUp={endDraw}
                        onPointerCancel={endDraw}
                      />
                      {!hasStrokes && (
                        <div className="absolute inset-0 grid place-items-center pointer-events-none select-none">
                          <p className="text-sm text-ink-faint italic">
                            {drawTool === 'eraser' ? 'Tap/drag over a stroke to erase it' : 'Sign here…'}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 justify-between items-center">
                      <button type="button" onClick={clearCanvas} disabled={!hasStrokes}
                        className="px-3 py-1.5 rounded-lg text-xs text-ink-soft hover:text-ink hover:bg-mist transition-colors disabled:opacity-30">
                        Clear
                      </button>
                      <button type="button" onClick={finishDraw} disabled={!hasStrokes}
                        className="px-4 py-1.5 rounded-lg bg-accent text-accent-text text-xs font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40">
                        Use this signature →
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Upload tab ── */}
                {tab === 'upload' && (
                  <div className="space-y-4">
                    <label className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:bg-mist/60 transition-colors">
                      <input type="file" accept="image/png,image/jpeg" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) validateFile(f); }} />
                      <svg className="mx-auto mb-2 text-ink-faint" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      {selectedFile ? (
                        <div className="flex flex-col items-center gap-2">
                          {previewUrl && (
                            <img
                              src={previewUrl}
                              alt="Signature preview"
                              className="max-h-24 max-w-[200px] object-contain rounded-lg border border-border bg-white/5 p-1 mb-2 mx-auto shadow-sm"
                            />
                          )}
                          <div>
                            <p className="text-sm font-medium text-ink">✓ File selected</p>
                            <p className="text-xs text-ink-soft mt-1">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</p>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-ink-soft">Drop an image here or tap to choose.</p>
                          <p className="text-xs text-ink-faint mt-1">White paper works best. PNG/JPG. Max 500 KB.</p>
                        </div>
                      )}
                    </label>
                    <div className="flex gap-2 justify-end">
                      {selectedFile && (
                        <button type="button" onClick={() => setSelectedFile(null)}
                          className="px-3 py-1.5 rounded-lg text-xs text-ink-soft hover:text-ink hover:bg-mist transition-colors">
                          Clear File
                        </button>
                      )}
                      <button type="button" onClick={() => { if (selectedFile) handleUpload(selectedFile); }} disabled={!selectedFile}
                        className="px-4 py-1.5 rounded-lg bg-accent text-accent-text text-xs font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40">
                        Use this signature →
                      </button>
                    </div>
                  </div>
                )}

                {/* Signer name */}
                <div>
                  <label className="block text-xs font-medium text-ink-soft mb-1.5">Your name</label>
                  <input type="text" value={signerName} onChange={(e) => setSignerName(e.target.value)}
                    maxLength={60} placeholder="Your full name"
                    className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all" />
                </div>

                {error && (
                  <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>
                )}
              </motion.div>
            )}

            {phase === 'place' && pendingSig && (
              <motion.div key="place" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }} className="p-6 space-y-4">
                <div className="grid place-items-center min-h-[300px]">
                  <div className="w-full max-w-[320px]">
                    <PremiumTee shirtColor={shirtColor} textColor={textColor}
                      customShirtHex={customShirtHex} customTextHex={customTextHex}
                      nameOnBack={nameOnBack}
                      side={pendingSig.face ?? 'back'} signatures={[...existingSignatures, pendingSig]} editable
                      onChangeSignature={(id, next) => { if (id === pendingSig.id) updatePending(next); }} />
                  </div>
                </div>
                <p className="text-[11px] text-ink-faint text-center">
                  Drag to move · drag the bottom-right handle to resize · drag the top dot to rotate.
                </p>
                {error && (
                  <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>
                )}
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <button type="button"
                    onClick={() => { setPendingSig(null); setPhase('capture'); }}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-ink-soft hover:text-ink hover:bg-mist transition-colors">
                    ← Redo
                  </button>
                  <button type="button" onClick={save}
                    className="px-5 py-2.5 rounded-lg bg-accent text-accent-text font-semibold hover:bg-accent-hover transition-colors">
                    Save signature
                  </button>
                </div>
              </motion.div>
            )}

            {phase === 'submitting' && (
              <motion.div key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="p-12 grid place-items-center">
                <div className="w-10 h-10 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active ? 'bg-accent text-accent-text' : 'bg-mist text-ink-soft hover:text-ink hover:bg-mist/70'
      }`}>
      {children}
    </button>
  );
}

function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

void SignatureTool;
