"use client";
import { useRef } from "react";
import FAQCard, { FAQItem } from "./FAQCard";
import { bgClass, orbColor } from "@/lib/utils";

const SCROLL_AMT = 320;

interface FAQRowProps {
  catLabel: string;
  faqs: FAQItem[];
  onOpen: (faq: FAQItem) => void;
}

export default function FAQRow({ catLabel, faqs, onOpen }: FAQRowProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  function scrollPrev() {
    trackRef.current?.scrollBy({ left: -SCROLL_AMT, behavior: "smooth" });
  }
  function scrollNext() {
    trackRef.current?.scrollBy({ left: SCROLL_AMT, behavior: "smooth" });
  }

  return (
    <>
      <div className="faq-row fade-up">
        <div className="row-header">
          <span className="row-title">{catLabel}</span>
          <span className="row-count">
            {faqs.length} question{faqs.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="row-outer">
          <button
            className="row-scroll-btn prev"
            aria-label="Scroll left"
            onClick={scrollPrev}
          >
            ←
          </button>
          <button
            className="row-scroll-btn next"
            aria-label="Scroll right"
            onClick={scrollNext}
          >
            →
          </button>

          <div className="cards-track" ref={trackRef}>
            {faqs.map((faq, i) => (
              <FAQCard
                key={faq._id}
                faq={faq}
                onOpen={onOpen}
                animDelay={Math.min(i * 40, 300)}
                bgCls={bgClass(i)}
                orb={orbColor(faq.category)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="section-divider" />
    </>
  );
}
