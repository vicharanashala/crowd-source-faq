import { useState } from "react";
import {
  FiSearch,
  FiChevronDown,
  FiChevronUp,
  FiPlus,
  FiCheck,
  FiMessageCircle,
} from "react-icons/fi";
import "./FaqSearch.css";
import Navbar from "../components/Navbar";

const FaqSearch = ({ darkMode, setDarkMode }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [expandedId, setExpandedId] = useState(1);

  const [newQuestion, setNewQuestion] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");

  const [activeAnswerInputId, setActiveAnswerInputId] = useState(null);
  const [customAnswerText, setCustomAnswerText] = useState("");

  const [faqData, setFaqData] = useState([
    {
      id: 1,
      question: "How to submit NOC document?",
      category: "NOC",
      searches: "2,400 searches",
      points: "+30 pts to answer",
      answers: [
        "Go to Documents section, click Upload NOC, attach your PDF signed by company HR. Coordinator will verify within 48 hours.",
      ],
    },
    {
      id: 2,
      question: "What is minimum attendance required?",
      category: "Attendance",
      searches: "1,600 searches",
      points: "+25 pts to answer",
      answers: [
        "Minimum 75% attendance is strictly mandatory across all core modules to qualify for semester examinations.",
      ],
    },
    {
      id: 3,
      question: "How to apply for internship?",
      category: "Internship",
      searches: "2,400 searches",
      points: "+25 pts to answer",
      answers: [
        "Apply via the centralized portal dashboard under resources. Submit your updated resume.",
      ],
    },
  ]);

  const categoriesList = [
    "All Categories",
    "Internship",
    "NOC",
    "Attendance",
    "Certificate",
    "Placement",
    "Projects",
    "Leave",
    "Others",
  ];

  const toggleAccordion = (id) => {
    setExpandedId(expandedId === id ? null : id);
    setActiveAnswerInputId(null);
    setCustomAnswerText("");
  };

  const handleAskQuestion = (e) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newCategory) return;

    const finalCategory =
      newCategory === "Others"
        ? customCategory.trim() || "General"
        : newCategory;

    const addedFaq = {
      id: Date.now(),
      question: newQuestion,
      category: finalCategory,
      searches: "1 search",
      points: "+20 pts to answer",
      answers: ["Awaiting coordination response review tracking."],
    };

    setFaqData([addedFaq, ...faqData]);
    setNewQuestion("");
    setNewCategory("");
    setCustomCategory("");
  };

  const handleUpdateAnswer = (id) => {
    if (!customAnswerText.trim()) return;

    setFaqData((prevData) =>
      prevData.map((item) => {
        if (item.id === id) {
          return {
            ...item,

            answers: [customAnswerText.trim(), ...item.answers],
          };
        }
        return item;
      }),
    );

    setActiveAnswerInputId(null);
    setCustomAnswerText("");
  };

  const filteredFaqs = faqData.filter((item) => {
    const matchKeyword = item.question
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchCategory =
      selectedCategory === "All Categories" ||
      item.category === selectedCategory;
    return matchKeyword && matchCategory;
  });

  return (
    <div
      className={`vicharanashala-container ${
        darkMode ? "dark-mode" : "light-mode"
      }`}
    >
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        backPath="/dashboard"
      />

      <div className="page-header">
        <h2>FAQ Search</h2>
      </div>

      <main className="main-content-compact">
        <div className="faq-search-card-pro">
          <div className="filter-label-pro">
            <FiSearch /> Search FAQs by Keyword
          </div>

          <div className="search-row-layout">
            <input
              type="text"
              className="search-field-pro"
              placeholder="Type NOC, attendance, certificate..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select
              className="dropdown-selector-pro"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categoriesList.map((cat, idx) => (
                <option key={idx} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="accordions-wrapper-pro">
            {filteredFaqs.map((faq) => {
              const isOpen = expandedId === faq.id;
              const isWritingAnswer = activeAnswerInputId === faq.id;

              return (
                <div
                  key={faq.id}
                  className={`accordion-box-pro ${isOpen ? "expanded" : ""}`}
                >
                  <div
                    className="accordion-header-pro"
                    onClick={() => toggleAccordion(faq.id)}
                  >
                    <div className="question-details-pro">
                      <h4>{faq.question}</h4>
                      <div className="badges-strip-pro">
                        <span className="tag-badge-pro">{faq.category}</span>
                        <span className="searches-badge-pro">
                          <FiSearch className="icon-inline" /> {faq.searches}
                        </span>
                        <span className="answers-count-badge-pro">
                          <FiMessageCircle className="icon-inline" />{" "}
                          {faq.answers.length}{" "}
                          {faq.answers.length === 1 ? "answer" : "answers"}
                        </span>
                        <span className="points-badge-pro">{faq.points}</span>
                      </div>
                    </div>
                    <div className="arrow-indicator-pro">
                      {isOpen ? <FiChevronUp /> : <FiChevronDown />}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="accordion-body-pro">
                      <div className="answers-stream-history-stack">
                        {faq.answers.map((ans, index) => (
                          <div
                            key={index}
                            className="individual-answer-row-wrapper"
                          >
                            {index === 0 && faq.answers.length > 1 && (
                              <span className="latest-answer-tag-pill">
                                Latest Contribution
                              </span>
                            )}
                            <p className="faq-current-answer">{ans}</p>
                          </div>
                        ))}
                      </div>

                      {!isWritingAnswer ? (
                        <button
                          className="add-answer-btn-pro"
                          onClick={() => setActiveAnswerInputId(faq.id)}
                        >
                          <FiPlus /> Add Better Answer (+30 pts)
                        </button>
                      ) : (
                        <div className="live-answer-input-container dynamic-input-animate">
                          <textarea
                            className="live-answer-textarea"
                            placeholder="Type your improved expert answer here..."
                            value={customAnswerText}
                            onChange={(e) =>
                              setCustomAnswerText(e.target.value)
                            }
                          />
                          <div className="live-answer-actions-row">
                            <button
                              className="submit-live-answer-btn"
                              onClick={() => handleUpdateAnswer(faq.id)}
                            >
                              <FiCheck /> Submit Answer
                            </button>
                            <button
                              className="cancel-live-answer-btn"
                              onClick={() => {
                                setActiveAnswerInputId(null);
                                setCustomAnswerText("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ASK QUESTION */}
        <div className="ask-card-pro">
          <h3>
            <FiPlus /> Ask a New Question
          </h3>

          <form onSubmit={handleAskQuestion} className="form-layout-pro">
            <div className="form-row-grid-pro">
              <div className="input-group-pro">
                <label>Question</label>
                <input
                  type="text"
                  placeholder="Type your question here..."
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  required
                />
              </div>

              <div className="input-group-pro select-box-width">
                <label>Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select...
                  </option>
                  {categoriesList
                    .filter((c) => c !== "All Categories")
                    .map((cat, idx) => (
                      <option key={idx} value={cat}>
                        {cat}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {newCategory === "Others" && (
              <div className="input-group-pro dynamic-input-animate">
                <label>Specify Custom Category Name</label>
                <input
                  type="text"
                  placeholder="e.g., Library, Exam Cell, Hostel"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  required
                />
              </div>
            )}

            <button type="submit" className="submit-btn-pro">
              Submit Question
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default FaqSearch;
