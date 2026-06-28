import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { categories } from "@/lib/mockData";
import { Paperclip, X, Lightbulb, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

export default function AskQuestion() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cat, setCat] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [similar, setSimilar] = useState<any[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const addTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim() && tags.length < 5) {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput("");
    }
  };

  // Debounced duplicate question check
  useEffect(() => {
    if (title.trim().length <= 6) {
      setSimilar([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setCheckingDuplicates(true);
      try {
        const res = await api.post("/ai/check-duplicates", { title: title.trim() });
        if (res.data.success && res.data.data.matches) {
          setSimilar(res.data.data.matches.slice(0, 3));
        }
      } catch (err) {
        console.error("Duplicate check failed:", err);
      } finally {
        setCheckingDuplicates(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [title]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Append category slug as a tag if it exists, to preserve organizational grouping
      const finalTags = [...tags];
      if (cat && !finalTags.includes(cat)) {
        finalTags.push(cat);
      }

      const res = await api.post("/questions", {
        title,
        body,
        tags: finalTags,
        category: cat,
      });

      if (res.data.success) {
        toast.success("Question posted to the community.");
        setTimeout(() => navigate("/"), 600);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to post question. Please make sure you are signed in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell>
      <section className="border-b border-brand-line">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-12 md:py-16">
          <p className="label-eyebrow mb-4">New entry / Volume 01</p>
          <h1 className="font-serif text-5xl md:text-6xl text-brand-ink leading-none tracking-tight">Ask a question.</h1>
          <p className="text-brand-body text-lg mt-4 leading-relaxed">A great question is a precise one. Imagine the future reader: what context do they need to answer in 60 seconds?</p>
        </div>
      </section>

      <form onSubmit={submit} className="max-w-3xl mx-auto px-4 md:px-8 py-12 space-y-10" data-testid="ask-form">
        <div>
          <label className="label-eyebrow block mb-3">01 — Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What do you need to know?"
            className="w-full border-b-2 border-brand-line bg-transparent font-serif text-3xl md:text-4xl py-3 outline-none focus:border-brand-ink placeholder:text-brand-mute"
            data-testid="ask-title-input"
            required
            disabled={submitting}
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-brand-mute">Be specific. Search-friendly. Avoid "URGENT" or "Hi all".</p>
            {checkingDuplicates && (
              <span className="text-[10px] text-brand-blue flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" /> Checking duplicates...
              </span>
            )}
          </div>
        </div>

        {similar.length > 0 && (
          <div className="border border-brand-blue/30 bg-[#F4F7FA] p-5" data-testid="similar-questions">
            <p className="label-eyebrow text-brand-blue mb-3 flex items-center gap-2"><Lightbulb size={11} /> {similar.length} similar questions exist</p>
            <ul className="space-y-2">
              {similar.map((s) => {
                const targetSlug = s.slug || s._id;
                return (
                  <li key={s._id || s.id}>
                    <Link to={`/q/${targetSlug}`} className="flex items-center justify-between gap-3 group hover:bg-white px-3 py-2 -mx-3">
                      <span className="text-sm text-brand-ink group-hover:text-brand-blue">{s.title}</span>
                      <ArrowRight size={13} className="text-brand-mute" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div>
          <label className="label-eyebrow block mb-3">02 — Description</label>
          <textarea
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Provide the context, what you tried, and the constraints. Markdown supported."
            className="w-full border border-brand-line bg-white p-4 text-base outline-none focus:border-brand-ink resize-y"
            data-testid="ask-body-input"
            required
            disabled={submitting}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="label-eyebrow block mb-3">03 — Category</label>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="w-full border border-brand-line bg-white px-4 py-3 text-base outline-none focus:border-brand-ink" data-testid="ask-category-select" required disabled={submitting}>
              <option value="">Choose a category…</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-eyebrow block mb-3">04 — Tags (max 5)</label>
            <div className="border border-brand-line bg-white px-3 py-2 flex flex-wrap gap-2 items-center">
              {tags.map((t) => (
                <span key={t} className="bg-brand-paper border border-brand-line text-xs uppercase tracking-widest px-2 py-1 flex items-center gap-1.5" data-testid={`tag-${t}`}>
                  #{t} <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} disabled={submitting}><X size={11} /></button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={addTag}
                placeholder={tags.length === 0 ? "Press Enter to add" : ""}
                className="flex-1 min-w-[100px] py-1 outline-none text-sm bg-transparent"
                data-testid="ask-tag-input"
                disabled={submitting || tags.length >= 5}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="label-eyebrow block mb-3">05 — Attachments (optional)</label>
          <label className={`border-2 border-dashed border-brand-line bg-white p-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-brand-ink transition-colors ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`} data-testid="ask-file-drop">
            <Paperclip size={20} strokeWidth={1.5} />
            <p className="text-sm text-brand-body">Drop files or <span className="underline">browse</span></p>
            <p className="text-xs text-brand-mute">PDF, PNG, JSON · 10MB max</p>
            <input type="file" multiple className="hidden" disabled={submitting} onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])} />
          </label>
          {files.length > 0 && (
            <ul className="mt-3 space-y-1">
              {files.map((f, i) => (
                <li key={i} className="text-xs text-brand-body flex items-center justify-between border border-brand-line px-3 py-2">
                  <span>{f.name}</span>
                  <button type="button" disabled={submitting} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-brand-mute hover:text-brand-vermilion"><X size={12} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-brand-line pt-6 flex flex-col sm:flex-row justify-between gap-4">
          <p className="text-xs text-brand-mute max-w-md">By posting you agree to the community standards. Questions are reviewed by moderators if flagged.</p>
          <div className="flex gap-3">
            <Link to="/" className="border border-brand-line px-6 py-3 text-sm hover:border-brand-ink" data-testid="ask-cancel-btn">Cancel</Link>
            <button type="submit" disabled={submitting} className="bg-brand-ink text-brand-paper px-8 py-3 text-sm tracking-wide hover:bg-brand-blue transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" data-testid="ask-submit-btn">
              {submitting ? 'Publishing...' : 'Publish question'} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </form>
    </PageShell>
  );
}
