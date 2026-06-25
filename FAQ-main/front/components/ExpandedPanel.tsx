"use client";
import { useEffect } from "react";
import { FAQItem } from "./FAQCard";

interface ExpandedPanelProps {
  faq: FAQItem | null;
  onClose: () => void;
}

export default function ExpandedPanel({ faq, onClose }: ExpandedPanelProps) {
  const isOpen = Boolean(faq);

  // Body scroll lock — exact from ExpandedPanel.jsx
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Escape to close — exact from ExpandedPanel.jsx
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className={`card-expanded-panel${isOpen ? " open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="FAQ detail"
    >
      <div className="panel-backdrop" onClick={onClose} />
      <div className="panel-box">
        <button className="panel-close" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
        {faq && (
          <>
            {/* Mono tag line with leading dash — exact from ExpandedPanel.jsx */}
            <div className="panel-tag">
              <span className="panel-tag-line" />
              <span>{faq.category.toUpperCase()}</span>
            </div>

            {/* Serif question */}
            <div className="panel-q">{faq.question}</div>

            {/* Body answer */}
            <div className="panel-a">{faq.answer}</div>

            {/* Wrapped meta tags */}
            <div className="panel-meta">
              {faq.tags?.map((t) => (
                <span key={t} className="card-meta-tag">{t}</span>
              ))}
            </div>

            {/* Source */}
            {faq.source && (
              <p
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  color: "var(--muted)",
                  marginTop: 4,
                }}
              >
                Source: {faq.source}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
