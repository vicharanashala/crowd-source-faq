import { useState } from "react";
import { ChevronDown, ChevronUp, Tag } from "lucide-react";

const FAQCard = ({ faq }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="faq-card">

      <button
        className="faq-question"
        onClick={() => setOpen(!open)}
      >
        <span>{faq.question}</span>

        {open ? (
          <ChevronUp size={20} />
        ) : (
          <ChevronDown size={20} />
        )}
      </button>

      {open && (
        <div className="faq-answer">

          <p>{faq.answer}</p>

          <div className="faq-meta">

            <span className="faq-category">
              {faq.category}
            </span>

            {faq.tags?.length > 0 && (
              <div className="faq-tags">

                {faq.tags.map((tag) => (
                  <span
                    key={tag}
                    className="faq-tag"
                  >
                    <Tag size={12} />
                    {tag}
                  </span>
                ))}

              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
};

export default FAQCard;