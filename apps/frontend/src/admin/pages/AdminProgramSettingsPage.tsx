/**
 * v1.69 — Admin: per-program settings editor.
 *
 * Lets an admin change the theme colours, hero copy, section
 * visibility / order, and branding for a single program. The
 * shape of the payload mirrors `backend/models/ProgramSettings.ts`
 * — the public program page renders directly from this.
 *
 * The page is intentionally a plain form (no live preview) for
 * v1.69; a side-by-side preview pane is Phase 2 polish.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import adminApi from '../utils/adminApi';
import type { ProgramResponse, ProgramSettings, SectionKey } from '../../types/program';
import { getSectionCopy } from '../../utils/programTheme';
import { useBatch } from '../../context/BatchContext';

const ALL_SECTIONS: SectionKey[] = ['stats', 'faqs', 'community', 'zoom', 'kb'];

const BACKGROUNDS = [
  { value: 'cream', label: 'Cream', preview: '#fbf8f1' },
  { value: 'mist',  label: 'Mist',  preview: '#f3f1ec' },
  { value: 'ink',   label: 'Ink',   preview: '#0f1110' },
] as const;

const FONTS = [
  { value: 'serif', label: 'Serif (display)' },
  { value: 'sans',  label: 'Sans (modern)' },
] as const;

function isHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

export default function AdminProgramSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { refresh: refreshBatch } = useBatch();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProgramResponse | null>(null);
  const [form, setForm] = useState<ProgramSettings | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    (async () => {
      try {
        // The program data is in the public endpoint; the admin
        // endpoint will be added in Phase 2 polish (right now the
        // public read is fine because settings are public anyway).
        const programRes = await adminApi.get<{ program: ProgramResponse['program'] }>(`/batches/admin/all`);
        const programs = (programRes.data as any).batches as Array<{ _id: string; name: string; isDefault?: boolean }>;
        const thisProgram = programs.find((p) => p._id === id);
        if (!thisProgram) {
          setError('Program not found.');
        } else {
          // Fetch the full ProgramSettings-backed view for this batch.
          const slug = encodeURIComponent(thisProgram.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'program');
          const res = await adminApi.get<ProgramResponse>(`/programs/${slug}`, { signal: controller.signal });
          setData(res.data);
          setForm(res.data.settings);
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'CanceledError') return;
        setError('Could not load program settings.');
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [id]);

  const dirty = useMemo(() => {
    if (!form || !data) return false;
    return JSON.stringify(form) !== JSON.stringify(data.settings);
  }, [form, data]);

  const update = (patch: Partial<ProgramSettings>): void => {
    if (!form) return;
    setForm({ ...form, ...patch });
  };

  const updateSection = (patch: Partial<ProgramSettings['sections']>): void => {
    if (!form) return;
    update({ sections: { ...form.sections, ...patch } });
  };

  const moveSection = (key: SectionKey, dir: -1 | 1): void => {
    if (!form) return;
    const order = [...form.sections.sectionOrder];
    const idx = order.indexOf(key);
    const next = idx + dir;
    if (next < 0 || next >= order.length) return;
    [order[idx], order[next]] = [order[next], order[idx]];
    updateSection({ sectionOrder: order });
  };

  const save = async (): Promise<void> => {
    if (!form || !id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await adminApi.put<ProgramSettings>(`/admin/programs/${id}/settings`, form);
      setData((prev) => (prev ? { ...prev, settings: res.data } : prev));
      setForm(res.data);
      setSavedAt(new Date());
      void refreshBatch();
    } catch (e: unknown) {
      setError('Save failed. Check the form values and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-ink-soft">Loading program…</div>;
  }
  if (error && !form) {
    return <div className="p-8 text-ink-soft">{error}</div>;
  }
  if (!form || !data) return null;

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent mb-1">
            Program settings
          </p>
          <h1 className="text-2xl sm:text-3xl font-serif text-ink">
            {data.program.name}
          </h1>
          <p className="text-sm text-ink-soft mt-1">
            Theme, hero copy, and which sections show on the public program page.
          </p>
        </div>
        <Link
          to={`/program/${encodeURIComponent(
            data.program.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'program'
          )}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-ink-soft hover:text-ink underline"
        >
          Preview public page ↗
        </Link>
      </header>

      {savedAt && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-admin-green"
        >
          Saved at {savedAt.toLocaleTimeString()}.
        </motion.p>
      )}

      {/* ── Theme ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">Theme</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">Primary color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.theme.primaryColor}
                onChange={(e) => update({ theme: { ...form.theme, primaryColor: e.target.value } })}
                className="w-10 h-10 rounded-md border border-border cursor-pointer"
                aria-label="Primary color"
              />
              <input
                type="text"
                value={form.theme.primaryColor}
                onChange={(e) => isHex(e.target.value) && update({ theme: { ...form.theme, primaryColor: e.target.value } })}
                className="flex-1 px-3 py-2 rounded-md bg-card border border-border/60 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">Accent color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.theme.accentColor}
                onChange={(e) => update({ theme: { ...form.theme, accentColor: e.target.value } })}
                className="w-10 h-10 rounded-md border border-border cursor-pointer"
                aria-label="Accent color"
              />
              <input
                type="text"
                value={form.theme.accentColor}
                onChange={(e) => isHex(e.target.value) && update({ theme: { ...form.theme, accentColor: e.target.value } })}
                className="flex-1 px-3 py-2 rounded-md bg-card border border-border/60 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">Background</label>
            <div className="flex flex-wrap gap-2">
              {BACKGROUNDS.map((b) => (
                <button
                  type="button"
                  key={b.value}
                  onClick={() => update({ theme: { ...form.theme, background: b.value } })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                    form.theme.background === b.value ? 'border-accent bg-accent/10 text-ink' : 'border-border/60 text-ink-soft hover:border-ink/20'
                  }`}
                >
                  <span className="w-4 h-4 rounded border border-border/40" style={{ background: b.preview }} />
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">Font</label>
            <div className="flex gap-2">
              {FONTS.map((f) => (
                <button
                  type="button"
                  key={f.value}
                  onClick={() => update({ theme: { ...form.theme, fontFamily: f.value } })}
                  className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                    form.theme.fontFamily === f.value ? 'border-accent bg-accent/10 text-ink' : 'border-border/60 text-ink-soft hover:border-ink/20'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">Hero</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">Title</label>
            <input
              type="text"
              value={form.hero.title}
              onChange={(e) => update({ hero: { ...form.hero, title: e.target.value } })}
              className="w-full px-3 py-2 rounded-md bg-card border border-border/60 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">Subtitle</label>
            <textarea
              value={form.hero.subtitle}
              onChange={(e) => update({ hero: { ...form.hero, subtitle: e.target.value } })}
              rows={2}
              className="w-full px-3 py-2 rounded-md bg-card border border-border/60 text-sm resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1.5">Hero image URL <span className="text-ink-faint">(optional)</span></label>
              <input
                type="url"
                value={form.hero.imageUrl ?? ''}
                onChange={(e) => update({ hero: { ...form.hero, imageUrl: e.target.value || null } })}
                placeholder="https://…"
                className="w-full px-3 py-2 rounded-md bg-card border border-border/60 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1.5">CTA button label</label>
              <input
                type="text"
                value={form.hero.ctaText ?? ''}
                onChange={(e) => update({ hero: { ...form.hero, ctaText: e.target.value || null } })}
                placeholder="Read the FAQs"
                className="w-full px-3 py-2 rounded-md bg-card border border-border/60 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-soft mb-1.5">CTA link (anchor or URL)</label>
              <input
                type="text"
                value={form.hero.ctaLink ?? ''}
                onChange={(e) => update({ hero: { ...form.hero, ctaLink: e.target.value || null } })}
                placeholder="#faqs"
                className="w-full px-3 py-2 rounded-md bg-card border border-border/60 text-sm font-mono"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Sections ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">Sections</h2>
        <p className="text-xs text-ink-soft -mt-2">Toggle visibility and reorder. Order is top → bottom on the public page.</p>
        <div className="space-y-2">
          {ALL_SECTIONS.map((key, idx) => {
            const copy = getSectionCopy(key);
            const show = ((): boolean => {
              switch (key) {
                case 'stats':     return form.sections.showStats;
                case 'faqs':      return form.sections.showFAQs;
                case 'community': return form.sections.showCommunity;
                case 'zoom':      return form.sections.showZoom;
                case 'kb':        return form.sections.showKB;
              }
            })();
            const position = form.sections.sectionOrder.indexOf(key);
            return (
              <div key={key} className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card/40">
                <button
                  type="button"
                  onClick={() => updateSection(
                    key === 'stats'     ? { showStats: !show } :
                    key === 'faqs'      ? { showFAQs: !show } :
                    key === 'community' ? { showCommunity: !show } :
                    key === 'zoom'      ? { showZoom: !show } :
                                           { showKB: !show }
                  )}
                  className={`relative w-10 h-6 rounded-full transition-colors ${show ? 'bg-accent' : 'bg-mist'}`}
                  aria-pressed={show}
                  aria-label={`${copy.title} visibility`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${show ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{copy.title}</p>
                  <p className="text-[11px] text-ink-faint">{copy.eyebrow} · {copy.tagline}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-ink-faint">
                  <button
                    type="button"
                    onClick={() => moveSection(key, -1)}
                    disabled={idx === 0 || position <= 0}
                    className="w-6 h-6 rounded flex items-center justify-center hover:bg-mist disabled:opacity-30"
                    aria-label="Move up"
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => moveSection(key, 1)}
                    disabled={idx === ALL_SECTIONS.length - 1 || position === -1 || position === ALL_SECTIONS.length - 1}
                    className="w-6 h-6 rounded flex items-center justify-center hover:bg-mist disabled:opacity-30"
                    aria-label="Move down"
                  >↓</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Branding ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">Branding</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">Logo text</label>
            <input
              type="text"
              value={form.branding.logoText}
              onChange={(e) => update({ branding: { ...form.branding, logoText: e.target.value } })}
              className="w-full px-3 py-2 rounded-md bg-card border border-border/60 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">Footer text</label>
            <input
              type="text"
              value={form.branding.footerText}
              onChange={(e) => update({ branding: { ...form.branding, footerText: e.target.value } })}
              className="w-full px-3 py-2 rounded-md bg-card border border-border/60 text-sm"
            />
          </div>
        </div>
      </section>

      {error && <p className="text-xs text-admin-red">{error}</p>}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
        <button
          type="button"
          onClick={() => setForm(data.settings)}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded-md text-sm text-ink-soft hover:text-ink disabled:opacity-40"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="px-5 py-2 rounded-md text-sm font-semibold bg-accent text-accent-text disabled:opacity-40 hover:bg-accent/90"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
