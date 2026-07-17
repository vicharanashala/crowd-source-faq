/**
 * TeeSharePage — public share page (v1.87)
 *
 * Renders the owner's 3D T-shirt (back side, showing name +
 * signatures), the owner's name, and three share actions:
 *
 *   - Copy Link
 *   - Share on WhatsApp
 *   - Share on LinkedIn
 *
 * The page is also the post-wizard landing — after `TeeDesignerPage`
 * POSTs the config it navigates here. The same route is used by the
 * public link a Summership participant shares externally.
 *
 * We do NOT require authentication for this page so the same URL
 * works for a non-logged-in visitor. The owner badge is rendered
 * based on whether `req.user._id === tee.ownerId` (handler-side);
 * here we just render whatever the BE sends.
 */

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toPng } from 'html-to-image';
import api from '../utils/api';
import PremiumTee, {
  type ShirtColorKey,
  type TextColorKey,
  type SignatureOverlay,
} from '../components/tee/PremiumTee';
import { buildTeeShareUrl, SHARE_INTENT } from '../utils/teeShareUrl';
import { useAuth } from '../hooks/useAuth';

interface TeeShareOwner {
  id: string;
  name: string;
  role?: string;
  avatar?: { url: string } | null;
}
interface TeeShareTee {
  _id: string;
  shareId: string;
  ownerId: string;
  shirtColor: ShirtColorKey | string;
  textColor: TextColorKey | string;
  /** v1.87.4 — optional explicit hex overrides returned by the
      share endpoint. Win over `shirtColor` / `textColor` when set
      (the wizard's custom-picker path); null/undefined for older
      tees that pre-date the hex-aware picker. */
  customShirtHex?: string | null;
  customTextHex?: string | null;
  nameOnBack: string;
  signatures: Array<{
    _id: string;
    signerName: string;
    signerUserId?: string | null;
    signerDataUrl: string;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    createdAt: string;
  }>;
  viewCount: number;
}

export default function TeeSharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tee, setTee] = useState<TeeShareTee | null>(null);
  const [owner, setOwner] = useState<TeeShareOwner | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState<'copy' | 'whatsapp' | 'linkedin' | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New T-shirt states
  const [side, setSide] = useState<'front' | 'back'>('back');
  const [organizeMode, setOrganizeMode] = useState(false);
  const [showMagnified, setShowMagnified] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const teeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!shareId) return;
    (async () => {
      try {
        const r = await api.get(`/tee/share/${shareId}`);
        if (cancelled) return;
        setTee(r.data?.tee ?? null);
        setOwner(r.data?.owner ?? null);
      } catch (err: any) {
        if (!cancelled && err?.response?.status === 404) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shareId]);

  const isOwner = useMemo(() => {
    const currentUserId = user?.id || user?._id;
    return !!(currentUserId && tee && String(currentUserId) === String(tee.ownerId));
  }, [user, tee]);

  const shareUrl = useMemo(() => (shareId ? buildTeeShareUrl(shareId) : ''), [shareId]);
  const signatureOverlays: SignatureOverlay[] = useMemo(() => {
    return (tee?.signatures ?? []).map((s) => ({
      id: s._id,
      dataUrl: s.signerDataUrl,
      face: (s as any).face ?? 'back',
      x: s.x,
      y: s.y,
      scale: s.scale,
      rotation: s.rotation,
    }));
  }, [tee]);

  const handleUpdateSignature = async (sigId: string, next: { x: number; y: number; scale: number; rotation: number }) => {
    if (!tee) return;
    // Optimistic update
    setTee((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        signatures: prev.signatures.map((s) =>
          s._id === sigId ? { ...s, ...next } : s
        ),
      };
    });
    try {
      await api.patch(`/tee/share/${shareId}/sign/${sigId}`, next);
    } catch (err) {
      console.error('Failed to update signature position', err);
    }
  };

  const handleDeleteSignature = async (sigId: string) => {
    if (!tee) return;
    setDeletingId(sigId);
    try {
      await api.delete(`/tee/share/${shareId}/sign/${sigId}`);
      setTee((prev) => prev && {
        ...prev,
        signatures: prev.signatures.filter((s) => s._id !== sigId),
      });
    } catch (err) {
      console.error('Failed to delete signature', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async () => {
    if (!teeRef.current) return;
    setDownloading(true);
    try {
      // Small pause to let any animation settle
      await new Promise((r) => setTimeout(r, 100));
      const dataUrl = await toPng(teeRef.current, {
        quality: 1.0,
        pixelRatio: 2, // High resolution download
        backgroundColor: 'rgba(0,0,0,0)', // Keep background transparent
      });
      const link = document.createElement('a');
      link.download = `${owner?.name ?? 'Summership'}-tee-${side}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to download T-shirt image', err);
    } finally {
      setDownloading(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied('copy');
      setTimeout(() => setCopied((c) => (c === 'copy' ? null : c)), 1800);
    } catch {
      // Clipboard API can fail on insecure origins (http://). Fall back
      // to a manual prompt — better than nothing.
      window.prompt('Copy this link:', shareUrl);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="w-8 h-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  if (notFound || !tee) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-serif text-ink mb-2">Tee not found</h1>
          <p className="text-sm text-ink-soft mb-6">
            The link may be incorrect, or the owner may have removed their tee.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-lg bg-card border border-border text-sm text-ink hover:bg-mist transition-colors"
          >
            Go home
          </button>
        </div>
      </div>
    );
  }

  const messages = {
    whatsapp: `Check out my Summership T-shirt ✨`,
    linkedin: `My Summership T-shirt`,
    emailSubject: 'Sign my Summership T-shirt',
    emailBody: `Hey! Could you sign my T-shirt? ${shareUrl}`,
  };

  return (
    <main className="min-h-screen bg-bg text-ink">
      {/* pt-24 sm:pt-28 clears the fixed Navbar (h-14 on mobile,
          h-16 on sm+). Same offset the rest of the auth'd pages
          (AccountPage, TeeDesignerPage) use so headings never slip
          behind the navbar chrome. */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-10 sm:pb-14 relative z-10">
        <header className="text-center mb-6">
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-accent mb-2">
            Summership Memories
          </p>
          <h1 className="text-3xl sm:text-4xl font-serif text-ink leading-tight mb-1.5">
            {owner?.name ?? 'Someone'}'s T-shirt
          </h1>
          <p className="text-sm text-ink-soft">
            {tee.signatures.length === 0
              ? 'Be the first to sign.'
              : `${tee.signatures.length} ${tee.signatures.length === 1 ? 'signature' : 'signatures'} so far.`}
            {tee.viewCount > 1 && (
              <>
                {' · '}
                <span className="text-ink-faint">
                  {tee.viewCount} {tee.viewCount === 1 ? 'view' : 'views'}
                </span>
              </>
            )}
            .
          </p>
        </header>

        {/* Hero — T-shirt + CTA stack */}
        <div className="grid md:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="flex flex-col gap-4">
            <div className="relative bg-card border border-border rounded-2xl p-6 sm:p-8 grid place-items-center min-h-[420px] overflow-hidden">
              <div className="absolute inset-0 opacity-50 pointer-events-none" aria-hidden>
                <div className="absolute inset-0 bg-gradient-to-br from-accent/8 via-transparent to-accent/5" />
              </div>
              <div ref={teeRef} className="w-full max-w-[420px] relative">
                <PremiumTee
                  shirtColor={tee.shirtColor}
                  textColor={tee.textColor}
                  customShirtHex={tee.customShirtHex}
                  customTextHex={tee.customTextHex}
                  nameOnBack={tee.nameOnBack}
                  signatures={signatureOverlays}
                  side={side}
                  size={420}
                  editable={organizeMode}
                  onChangeSignature={handleUpdateSignature}
                  onDeleteSignature={handleDeleteSignature}
                />
              </div>
            </div>

            {/* View toggles & Organize mode trigger */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-2xl p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSide('front')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    side === 'front'
                      ? 'bg-accent text-accent-text border-transparent shadow-sm'
                      : 'bg-bg text-ink-soft border-border hover:bg-mist'
                  }`}
                >
                  👔 Front View
                </button>
                <button
                  type="button"
                  onClick={() => setSide('back')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    side === 'back'
                      ? 'bg-accent text-accent-text border-transparent shadow-sm'
                      : 'bg-bg text-ink-soft border-border hover:bg-mist'
                  }`}
                >
                  👕 Back View
                </button>
              </div>

              {isOwner && (
                <button
                  type="button"
                  onClick={() => setOrganizeMode(!organizeMode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                    organizeMode
                      ? 'bg-danger text-white border-transparent animate-pulse'
                      : 'bg-card text-ink border-border hover:bg-mist'
                  }`}
                >
                  <span>{organizeMode ? '🔒 Done Organizing' : '🎨 Organize Signatures'}</span>
                </button>
              )}
            </div>

            {organizeMode && (
              <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 text-xs text-danger text-center">
                👉 <strong>Organize Mode Active:</strong> Drag signatures to reposition. Drag the handles to scale/rotate. Hover a signature to delete it.
              </div>
            )}
          </div>

          {/* Actions */}
          <aside className="space-y-3">
            <ShareButton
              onClick={() => {
                if (!user) {
                  // Show auth modal or navigate to login
                  navigate(`/login?next=/tee/sign/${shareId}`);
                  return;
                }
                navigate(`/tee/sign/${shareId}`);
              }}
              variant="primary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Sign this Tee
            </ShareButton>
            <ShareButton onClick={copyLink}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied === 'copy' ? 'Copied!' : 'Copy link'}
            </ShareButton>
            {isOwner && (
              <ShareButton onClick={() => navigate('/tee')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit my Tee
              </ShareButton>
            )}
            <ShareButton
              as="a"
              href={SHARE_INTENT.whatsapp(messages.whatsapp, shareUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setCopied('whatsapp')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.2-.2.3-.7.9-.9 1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.5c-1.7 0-3.3-.4-4.7-1.3l-.3-.2-3.5.9.9-3.4-.2-.3c-1-1.5-1.5-3.3-1.5-5.1C2.7 7.4 7 3 12.2 3c2.6 0 5 1 6.8 2.8 1.8 1.8 2.8 4.2 2.8 6.8-.1 5.1-4.4 9-9.8 9zm0-19.6C6.4 1.9 1.6 6.7 1.6 12.3c0 2.1.6 4.2 1.7 6L2 23l4.8-1.3c1.7.9 3.6 1.4 5.5 1.4 5.6 0 10.4-4.8 10.4-10.6 0-2.8-1.1-5.4-3-7.4-2-2-4.6-3.1-7.4-3.1z" />
              </svg>
              Share on WhatsApp
            </ShareButton>
            <ShareButton
              as="a"
              href={SHARE_INTENT.linkedin(shareUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setCopied('linkedin')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 0H5C2.2 0 0 2.2 0 5v14c0 2.8 2.2 5 5 5h14c2.8 0 5-2.2 5-5V5c0-2.8-2.2-5-5-5zM7.5 19h-3V8.5h3V19zM6 7.3c-1 0-1.7-.7-1.7-1.7S5 3.9 6 3.9s1.7.7 1.7 1.7-.7 1.7-1.7 1.7zM20 19h-3v-5.5c0-1.3-.5-2-1.5-2s-1.5.6-1.5 2V19h-3V8.5h3v1.5c.5-.9 1.5-1.7 3-1.7 2.2 0 3 1.4 3 4V19z" />
              </svg>
              Share on LinkedIn
            </ShareButton>

            {/* Magnified & Download tools */}
            <div className="border-t border-border/60 pt-3 mt-3 space-y-2">
              <ShareButton onClick={() => setShowMagnified(true)}>
                🔍 Magnified View
              </ShareButton>
              <ShareButton onClick={handleDownload} disabled={downloading}>
                {downloading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" strokeOpacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round"/></svg>
                    Generating image...
                  </span>
                ) : (
                  '⬇ Download Tee'
                )}
              </ShareButton>
            </div>
          </aside>
        </div>

        {/* Magnified view lightbox modal */}
        {showMagnified && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/95 backdrop-blur-md overflow-y-auto">
            <div className="absolute top-4 right-4 z-[110]">
              <button
                type="button"
                onClick={() => setShowMagnified(false)}
                className="px-4 py-2.5 rounded-xl bg-card border border-border text-sm font-semibold text-ink hover:text-danger hover:bg-danger-light hover:border-danger/30 transition-all shadow-md"
              >
                ✕ Close Full View
              </button>
            </div>
            <div className="max-w-4xl w-full flex flex-col md:flex-row gap-8 items-center justify-center p-6 mt-16">
              <div className="w-full max-w-[360px] text-center space-y-3">
                <p className="text-xs tracking-widest font-mono text-ink-soft uppercase bg-mist/60 py-1.5 px-3 rounded-full inline-block">👔 Front Side</p>
                <div className="bg-card border border-border rounded-2xl p-4 grid place-items-center">
                  <PremiumTee
                    shirtColor={tee.shirtColor}
                    textColor={tee.textColor}
                    customShirtHex={tee.customShirtHex}
                    customTextHex={tee.customTextHex}
                    nameOnBack={tee.nameOnBack}
                    signatures={signatureOverlays}
                    side="front"
                    size={360}
                    float={false}
                    disableHoverTilt
                  />
                </div>
              </div>
              <div className="w-full max-w-[360px] text-center space-y-3">
                <p className="text-xs tracking-widest font-mono text-ink-soft uppercase bg-mist/60 py-1.5 px-3 rounded-full inline-block">👕 Back Side</p>
                <div className="bg-card border border-border rounded-2xl p-4 grid place-items-center">
                  <PremiumTee
                    shirtColor={tee.shirtColor}
                    textColor={tee.textColor}
                    customShirtHex={tee.customShirtHex}
                    customTextHex={tee.customTextHex}
                    nameOnBack={tee.nameOnBack}
                    signatures={signatureOverlays}
                    side="back"
                    size={360}
                    float={false}
                    disableHoverTilt
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Signatures carousel */}
        {tee.signatures.length > 0 && (
          <section className="mt-10 bg-card border border-border rounded-2xl p-5 sm:p-6">
            <h2 className="text-lg font-serif text-ink mb-3">Signatures</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {tee.signatures.map((s) => (
                <div key={s._id} className="space-y-1.5 group relative">
                  <div className="aspect-[4/3] bg-bg border border-border rounded-lg overflow-hidden grid place-items-center p-2 relative">
                    <img src={s.signerDataUrl} alt={`${s.signerName}'s signature`} className="max-h-full max-w-full object-contain" />
                    {/* Delete button — owner only, shown on hover */}
                    {isOwner && (
                      <button
                        type="button"
                        title="Delete this signature"
                        disabled={deletingId === s._id}
                        onClick={() => handleDeleteSignature(s._id)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-danger/90 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger shadow-sm disabled:opacity-50"
                      >
                        {deletingId === s._id ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-ink-soft truncate text-center">{s.signerName}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function ShareButton({
  children,
  onClick,
  as,
  href,
  target,
  rel,
  variant,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  as?: 'a' | 'button';
  href?: string;
  target?: string;
  rel?: string;
  variant?: 'primary';
  disabled?: boolean;
}) {
  const baseCls = 'w-full px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-2';
  const primaryCls = 'bg-accent text-accent-text border-transparent hover:bg-accent-hover';
  const secondaryCls = 'bg-card text-ink border-border hover:bg-mist';
  const cls = `${baseCls} ${variant === 'primary' ? primaryCls : secondaryCls} ${disabled ? 'opacity-60 cursor-not-allowed hover:bg-card' : ''}`;
  if (as === 'a') {
    return (
      <motion.a
        whileTap={{ scale: disabled ? 1 : 0.98 }}
        href={disabled ? undefined : href}
        target={target}
        rel={rel}
        className={cls}
        aria-disabled={disabled}
      >
        {children}
      </motion.a>
    );
  }
  return (
    <motion.button
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={disabled ? undefined : onClick}
      type="button"
      className={cls}
      disabled={disabled}
      aria-disabled={disabled}
    >
      {children}
    </motion.button>
  );
}
