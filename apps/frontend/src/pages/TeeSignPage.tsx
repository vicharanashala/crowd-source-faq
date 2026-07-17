/**
 * TeeSignPage — public "sign this T-shirt" viewer.
 *
 * Renders the owner's 3D tee (existing signatures overlaid) and a
 * floating "Sign This Tee" button that opens the SignatureTool
 * modal. Successfully saved signatures are appended optimistically
 * so the user sees their signature appear on the tee immediately.
 *
 * No auth required. A guest signer only needs to type a name; a
 * logged-in signer can fall back to that too (we always also send
 * signerName so the owner has something readable).
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import PremiumTee, {
  type ShirtColorKey,
  type TextColorKey,
  type SignatureOverlay,
} from '../components/tee/PremiumTee';
import SignatureTool from '../components/tee/SignatureTool';
import { useAuth } from '../hooks/useAuth';

interface ApiTee {
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
}
interface ApiResp {
  tee: ApiTee;
  owner: { id: string; name: string; avatar?: { url: string } | null } | null;
}

export default function TeeSignPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [toolOpen, setToolOpen] = useState(false);

  // Re-fetch the tee whenever the shareId changes.
  useEffect(() => {
    let cancelled = false;
    if (!shareId) return;
    setLoading(true);
    api.get(`/tee/share/${shareId}`)
      .then((r) => { if (!cancelled) setData(r.data ?? null); })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 404) setNotFound(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [shareId]);

  const overlays: SignatureOverlay[] = useMemo(() => {
    return (data?.tee?.signatures ?? []).map((s) => ({
      id: s._id,
      dataUrl: s.signerDataUrl,
      x: s.x,
      y: s.y,
      scale: s.scale,
      rotation: s.rotation,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="w-8 h-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  // Auth guard — only signed-in users may sign a tee
  if (!user) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-6">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">✍️</div>
          <h1 className="text-2xl font-serif text-ink mb-2">Sign in to sign this tee</h1>
          <p className="text-sm text-ink-soft mb-6">
            You need to be signed in to leave your signature on someone's T-shirt.
          </p>
          <button
            onClick={() => navigate(`/login?next=/tee/sign/${shareId}`)}
            className="px-5 py-2.5 rounded-xl bg-accent text-accent-text font-semibold hover:bg-accent-hover transition-colors"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-serif text-ink mb-2">Tee not found</h1>
          <p className="text-sm text-ink-soft mb-6">
            This T-shirt link may be incorrect, or the owner may have removed their tee.
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

  const { tee, owner } = data;
  return (
    <div className="min-h-screen bg-bg pt-24 sm:pt-28 pb-10 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-6">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-accent mb-1">
            VLED Labs · Summership Portal
          </p>
          <h1 className="text-3xl sm:text-4xl font-serif text-ink mb-1.5">
            Sign {owner?.name?.split(' ')[0] ?? "someone"}'s T-shirt
          </h1>
          <p className="text-sm text-ink-soft">
            Drop your signature on the back. Once you save, it's permanent.
          </p>
        </header>

        <div className="relative bg-card border border-border rounded-2xl p-6 sm:p-10 grid place-items-center min-h-[460px] overflow-hidden">
          <div className="w-full max-w-[420px]">
            <PremiumTee
              shirtColor={tee.shirtColor}
              textColor={tee.textColor}
              customShirtHex={tee.customShirtHex}
              customTextHex={tee.customTextHex}
              nameOnBack={tee.nameOnBack}
              signatures={overlays}
              side="back"
              size={420}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setToolOpen(true)}
            className="px-6 py-3 rounded-xl bg-accent text-accent-text font-semibold hover:bg-accent-hover transition-colors flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Sign This Tee
          </button>
          <button
            type="button"
            onClick={() => navigate(`/tee/share/${shareId}`)}
            className="px-5 py-3 rounded-xl bg-card border border-border text-sm text-ink hover:bg-mist transition-colors"
          >
            Back to share page
          </button>
        </div>

        {toolOpen && (
          <SignatureTool
            shareId={shareId!}
            shirtColor={tee.shirtColor}
            textColor={tee.textColor}
            customShirtHex={tee.customShirtHex}
            customTextHex={tee.customTextHex}
            nameOnBack={tee.nameOnBack}
            existingSignatures={overlays}
            defaultSignerName={user?.name ?? ''}
            onCancel={() => setToolOpen(false)}
            onSigned={(newSig) => {
              setData((prev) => prev && {
                ...prev,
                tee: {
                  ...prev.tee,
                  signatures: [
                    ...prev.tee.signatures,
                    {
                      _id: newSig.id,
                      signerUserId: user?._id ?? null,
                      signerName: '',
                      signerDataUrl: newSig.dataUrl,
                      x: newSig.x,
                      y: newSig.y,
                      scale: newSig.scale,
                      rotation: newSig.rotation,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                },
              });
              setToolOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
