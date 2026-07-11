import { useState, useEffect } from "react";
import {
  FiSearch,
  FiBell,
  FiSun,
  FiMoon,
  FiAward,
  FiCheckCircle,
  FiCompass,
  FiChevronDown,
  FiMessageSquare,
  FiThumbsUp,
  FiSend,
  FiMenu,
  FiMessageCircle,
  FiFolder,
  FiCalendar,
  FiStar,
  FiClock,
  FiLogOut,
  FiUser,
} from "react-icons/fi";
import "./Dashboard.css";

import { Link, useNavigate } from "react-router-dom";
export default function Dashboard({ darkMode, setDarkMode }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const [expandedFaq, setExpandedFaq] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formQuery, setFormQuery] = useState("");
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [showAskModal, setShowAskModal] = useState(false);

  const [newQuestion, setNewQuestion] = useState("");

  const [newCategory, setNewCategory] = useState("NOC");
  const [customCategory, setCustomCategory] = useState("");

  const defaultFaqs = [
    {
      id: 1,
      question:
        "What is the official timeline and process for college NOC verification?",
      answer:
        "The NOC verification cycle initiates during the 5th semester tracking portal. Students must upload their digital transcripts signed by the HOD, which undergoes admin approval within 4-5 working days.",
      points: 30,
      category: "NOC",
      upvoted: false,
    },
    {
      id: 2,
      question:
        "What happens if my monthly biometrics biometric synchronization fails?",
      answer:
        "In case of hardware latency or sync failure, immediately file an attendance regularization request via the support hub panel.",
      points: 25,
      category: "Attendance",
      upvoted: false,
    },
    {
      id: 3,
      question:
        "How do I update my institutional banking profile parameters for stipend routing?",
      answer:
        "Navigate to your profile settings console and upload a cancelled cheque.",
      points: 40,
      category: "Stipend",
      upvoted: false,
    },
  ];

  const [faqData, setFaqData] = useState(() => {
    return JSON.parse(localStorage.getItem("faqs")) || defaultFaqs;
  });

  const handleAddQuestion = () => {
    if (!newQuestion.trim()) {
      alert("Please enter your question");
      return;
    }

    const duplicate = faqData.find(
      (faq) =>
        faq.question.toLowerCase().trim() === newQuestion.toLowerCase().trim(),
    );

    if (duplicate) {
      alert("This question already exists.");
      return;
    }

    const finalCategory =
      newCategory === "Other" ? customCategory.trim() : newCategory;
    const newFaq = {
      id: Date.now(),
      question: newQuestion,
      answer: "Waiting for admin response...",
      category: finalCategory,
      status: "Pending",
      points: 0,
      upvoted: false,
    };
    setFaqData([newFaq, ...faqData]);

    const loggedUser = JSON.parse(localStorage.getItem("loggedInUser"));

    if (loggedUser) {
      loggedUser.points = (loggedUser.points || 0) + 10;

      localStorage.setItem("loggedInUser", JSON.stringify(loggedUser));
    }

    const oldNotifications =
      JSON.parse(localStorage.getItem("notifications")) || [];

    oldNotifications.unshift({
      id: Date.now(),
      title: "Your question has been submitted successfully.",
      time: "Just now",
      read: false,
    });

    localStorage.setItem("notifications", JSON.stringify(oldNotifications));

    if (loggedUser) {
      loggedUser.points = (loggedUser.points || 0) + 10;

      loggedUser.activity = loggedUser.activity || [];

      loggedUser.activity.unshift("Asked a new question");

      localStorage.setItem("loggedInUser", JSON.stringify(loggedUser));
    }

    localStorage.setItem("loggedInUser", JSON.stringify(loggedUser));

    setNewQuestion("");

    setNewCategory("NOC");
    setCustomCategory("");
    setShowAskModal(false);

    alert("Question Added Successfully 🎉");
  };

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      darkMode ? "dark" : "light",
    );
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("faqs", JSON.stringify(faqData));
  }, [faqData]);

  const handleUpvote = (id, e) => {
    e.stopPropagation(); // Stops accordion block from toggling open/close
    setFaqData((prev) =>
      prev.map((faq) => {
        if (faq.id === id) {
          if (!faq.upvoted) {
            return { ...faq, points: faq.points + 1, upvoted: true };
          } else {
            return { ...faq, points: faq.points - 1, upvoted: false };
          }
        }
        return faq;
      }),
    );
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (formName && formEmail && formQuery) {
      setFormSubmitted(true);

      setTimeout(() => {
        setFormName("");
        setFormEmail("");
        setFormQuery("");
        setFormSubmitted(false);
      }, 3000);
    }
  };

  const categories = ["All", "NOC", "Attendance", "Stipend"];

  const notifications = [
    {
      id: 1,
      title: "Welcome to Vicharanashala 🎉",
      time: "Just now",
    },
    {
      id: 2,
      title: "New FAQ has been added",
      time: "10 min ago",
    },
    {
      id: 3,
      title: "Meeting scheduled for tomorrow",
      time: "1 hour ago",
    },
  ];

  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("isLoggedIn");
    navigate("/");
  };

  return (
    <div className="hq-portal-container">
      {/* SECTION 1: Dynamic Top Navigation Bar */}
      <header className="hq-navbar-node">
        <div className="hq-brand-block">
          <div className="hq-logo-shield">V</div>
          <div className="hq-brand-titles">
            <h2>Vicharanashala</h2>
            <span>Knowledge Ecosystem</span>
          </div>
        </div>

        <div className="hq-actions-cluster">
          <div className="menu-wrapper">
            <button className="menu-btn" onClick={() => setShowMenu(!showMenu)}>
              <FiMenu />
            </button>

            {showMenu && (
              <div className="hq-dropdown-menu">
                <Link to="/discussion">
                  <FiMessageCircle />
                  <span>Discussions</span>
                </Link>

                <Link to="/documents">
                  <FiFolder />
                  <span>Documents</span>
                </Link>

                <Link to="/meetings">
                  <FiCalendar />
                  <span>Meetings</span>
                </Link>

                <Link to="/faqsearch">
                  <FiSearch />
                  <span>FAQ Search</span>
                </Link>

                <Link to="/leaderboard">
                  <FiAward />
                  <span>Leaderboard</span>
                </Link>

                <Link to="/spurtipoints">
                  <FiStar />
                  <span>Spurti Points</span>
                </Link>

                <Link to="/attendance">
                  <FiClock />
                  <span>Attendance</span>
                </Link>
              </div>
            )}
          </div>

          <button
            className="hq-theme-switch"
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? <FiSun /> : <FiMoon />}
          </button>

          <div className="notification-wrapper">
            <button
              className="hq-notification-bell"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <FiBell />
              <span className="bell-ping"></span>
            </button>

            {showNotifications && (
              <div className="notification-dropdown">
                <h4>Notifications</h4>

                {notifications.map((item) => (
                  <div key={item.id} className="notification-item">
                    <p>{item.title}</p>
                    <span>{item.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="hq-user-section">
            <button
              className="hq-profile-btn"
              onClick={() => navigate("/profile")}
            >
              <FiUser />
            </button>

            <button className="hq-logout-btn" onClick={handleLogout}>
              <FiLogOut />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <section className="hq-hero-canvas">
        <div className="hq-hero-inner">
          <span className="hq-micro-badge">🚀 Unified Cohort Directory</span>
          <h1>
            How can we help you <span>today?</span>
          </h1>

          <div className="hq-search-engine-box">
            <FiSearch className="hq-search-icon-vector" />
            <input
              type="text"
              placeholder="Search internship, attendance, NOC, certificates, meetings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            className="hq-add-question-btn"
            onClick={() => setShowAskModal(true)}
          >
            + Ask New Question
          </button>
        </div>
      </section>

      <div className="hq-split-workspace">
        <div className="hq-workspace-main-panel">
          <div className="hq-panel-header">
            <h3>
              <FiCompass className="hq-panel-icon" /> FAQ Directory Explorer
            </h3>
          </div>

          {/* Filtering Layout Chips Row */}
          <div className="hq-categories-filter-bar">
            {categories.map((cat) => (
              <button
                key={cat}
                className={`hq-filter-chip-item ${selectedCategory === cat ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Collapsible Accordion Engine List */}
          <div className="hq-accordion-stack-block">
            {faqData
              .filter(
                (faq) =>
                  selectedCategory === "All" ||
                  faq.category === selectedCategory,
              )
              .filter((faq) =>
                faq.question.toLowerCase().includes(searchQuery.toLowerCase()),
              )
              .map((faq) => {
                const isOpen = expandedFaq === faq.id;
                return (
                  <div
                    key={faq.id}
                    className={`hq-accordion-item-card ${isOpen ? "is-expanded" : ""}`}
                    onClick={() => setExpandedFaq(isOpen ? null : faq.id)}
                  >
                    {/* Top Active Header Line */}
                    <div className="hq-accordion-top-row">
                      <div className="hq-accordion-question-meta">
                        <span className="hq-category-indicator-tag">
                          {faq.category}
                        </span>
                        <h4>{faq.question}</h4>
                      </div>

                      <div className="hq-accordion-controls">
                        <button
                          className={`hq-boost-action-btn ${faq.upvoted ? "active" : ""}`}
                          onClick={(e) => handleUpvote(faq.id, e)}
                        >
                          <FiThumbsUp /> <span>{faq.points}</span>
                        </button>
                        <FiChevronDown
                          className={`hq-chevron-vector-arrow ${isOpen ? "rotate-active" : ""}`}
                        />
                      </div>
                    </div>

                    {/* Smooth Expanding Dropdown Container View */}
                    <div className="hq-accordion-dropdown-panel">
                      <div className="hq-dropdown-panel-inner">
                        <p>{faq.answer}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* COLUMN RIGHT: Sidebar Locked Support Desk Widget */}
        <aside className="hq-workspace-sidebar-panel">
          <div className="gradient-border-box">
            <div className="hq-widget-title-block">
              <FiMessageSquare className="hq-widget-icon" />
              <div>
                <h4>Direct Support Desk</h4>
                <p>
                  Can't find an answer? Submit your custom parameters directly
                  to administrative desks.
                </p>
              </div>
            </div>

            {formSubmitted ? (
              <div className="hq-form-success-state">
                <FiCheckCircle className="hq-success-icon" />
                <h5>Query Filed Safely</h5>
                <p>+10 Spurti Wallet Contribution Token granted.</p>
              </div>
            ) : (
              <form
                className="hq-inquiry-form-node"
                onSubmit={handleFormSubmit}
              >
                <div className="hq-form-input-group">
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />
                </div>
                <div className="hq-form-input-group">
                  <input
                    type="email"
                    placeholder="Institutional Email ID"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="hq-form-input-group">
                  <textarea
                    placeholder="Describe your custom issue parameters clearly..."
                    rows="4"
                    value={formQuery}
                    onChange={(e) => setFormQuery(e.target.value)}
                    required
                  ></textarea>
                </div>
                <button type="submit" className="hq-form-submit-cta">
                  <span>File Secure Query</span> <FiSend />
                </button>
              </form>
            )}
          </div>
        </aside>
      </div>

      {showAskModal && (
        <div className="ask-modal-overlay">
          <div className="ask-modal">
            <h2>Ask a New Question</h2>

            <input
              type="text"
              placeholder="Question"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
            />

            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            >
              <option value="NOC">NOC</option>
              <option value="Attendance">Attendance</option>
              <option value="Stipend">Stipend</option>
              <option value="Other">Other</option>
            </select>

            {newCategory === "Other" && (
              <input
                type="text"
                placeholder="Enter New Category"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
              />
            )}

            <div className="ask-buttons">
              <button
                className="cancel-btn"
                onClick={() => setShowAskModal(false)}
              >
                Cancel
              </button>

              <button className="submit-btn" onClick={handleAddQuestion}>
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
