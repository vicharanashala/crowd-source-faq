import { useEffect, useState } from "react";
import FAQSearch from "../components/FAQSearch";
import FAQCategory from "../components/FAQCategory";
import FAQCard from "../components/FAQCard";
import { getFAQs } from "../services/faqService";
import type { Faq } from "../types/faq";
import "../styles/faq.css";

const FAQPage = () => {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [filteredFaqs, setFilteredFaqs] = useState<Faq[]>([]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const categories = [...new Set(faqs.map((faq) => faq.category))].sort();

  const loadFaqs = async () => {
    try {
      const response = await getFAQs();

      // backend returns { success:true, data:[...] }
      setFaqs(response.data);
      setFilteredFaqs(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadFaqs();
  }, []);

  useEffect(() => {
    let result = [...faqs];

    if (category !== "All") {
      result = result.filter(
        (faq) =>
          faq.category.toLowerCase() === category.toLowerCase()
      );
    }

    if (search.trim()) {
      result = result.filter(
        (faq) =>
          faq.question.toLowerCase().includes(search.toLowerCase()) ||
          faq.answer.toLowerCase().includes(search.toLowerCase())
      );
    }

    setFilteredFaqs(result);
  }, [search, category, faqs]);

  return (
    <div className="faq-page">

      <div className="faq-header">
        <h1>Frequently Asked Questions</h1>

        <p>
          Find answers to common questions asked by interns.
        </p>

        <a
          className="faq-voice-agent-btn"
          href="/voice-agent"
          target="_blank"
          rel="noreferrer"
        >
          🎙️ Ask the Voice Agent
        </a>
      </div>

      <FAQSearch
        search={search}
        setSearch={setSearch}
      />

      <FAQCategory
        category={category}
        setCategory={setCategory}
        categories={categories}
      />

      <div className="faq-list">

        {filteredFaqs.length === 0 ? (
          <p className="faq-empty">
            No FAQs found.
          </p>
        ) : (
          filteredFaqs.map((faq) => (
            <FAQCard
              key={faq._id}
              faq={faq}
            />
          ))
        )}

      </div>

    </div>
  );
};

export default FAQPage;