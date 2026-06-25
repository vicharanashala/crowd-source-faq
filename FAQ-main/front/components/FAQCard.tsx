"use client";

export interface FAQItem {
  _id: string;
  question: string;
  answer: string;
  category: string;
  tags: string[];
  source: string;
}

interface FAQCardProps {
  faq: FAQItem;
  onOpen: (faq: FAQItem) => void;
  animDelay?: number;
  bgCls: string;   // "card-bg-1" … "card-bg-6"
  orb: string;     // rgba(...)
}

export default function FAQCard({ faq, onOpen, animDelay = 0, bgCls, orb }: FAQCardProps) {
  const chipLabel =
    faq.category.charAt(0).toUpperCase() + faq.category.slice(1).toLowerCase();

  function handleCardClick() {
    onOpen(faq);
  }

  function handleBtnClick(e: React.MouseEvent) {
    e.stopPropagation();
    onOpen(faq);
  }

  return (
    <div
      className={`faq-card ${bgCls}`}
      style={{ animationDelay: `${animDelay}ms` }}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleCardClick()}
      aria-label={`Open FAQ: ${faq.question}`}
    >
      {/* Colored glow orb */}
      <div className="card-glow-orb" style={{ background: orb }} />
      {/* Shine overlay */}
      <div className="card-shine" />

      {/* Top row: category chip + tag count (real data — no fake match%) */}
      <div className="card-top-row">
        <span className="card-chip">{chipLabel}</span>
        {faq.tags?.length > 0 && (
          <span
            className="card-match"
            style={{ color: "rgba(180,215,245,0.7)" }}
          >
            <div className="match-bar">
              <div
                className="match-fill"
                style={{
                  width: `${Math.min(faq.tags.length * 25, 100)}%`,
                  background: "rgba(74,144,196,0.8)",
                }}
              />
            </div>
            {faq.tags.length} tag{faq.tags.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Bottom content block */}
      <div className="card-inner">
        {/* Meta tags — revealed on hover */}
        <div className="card-meta-row">
          {faq.tags.slice(0, 3).map((t) => (
            <span key={t} className="card-meta-tag">{t}</span>
          ))}
        </div>

        {/* Question */}
        <div className="card-q">{faq.question}</div>

        {/* Answer preview — 2-line clamp */}
        <div className="card-preview">{faq.answer}</div>

        {/* Actions — revealed on hover */}
        <div className="card-actions">
          <button className="btn-play" onClick={handleBtnClick}>▶ Read</button>
          <button className="btn-more" onClick={handleBtnClick} aria-label="More">+</button>
        </div>
      </div>
    </div>
  );
}
