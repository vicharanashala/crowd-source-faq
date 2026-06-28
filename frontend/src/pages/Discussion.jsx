import { useState } from "react";

import { FiMessageSquare, FiX } from "react-icons/fi";

import "./Discussion.css";
import Navbar from "../components/Navbar";

export default function Discussion({ darkMode, setDarkMode }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState({
    title: "",
    category: "NOC",
  });

  const [discussions, setDiscussions] = useState([
    {
      id: 1,
      author: "Rahul K.",
      time: "2 hours ago",
      initial: "R",
      title: "How to upload NOC document — step by step?",
      category: "NOC",
      replies: 4,
      pts: 30,
    },
    {
      id: 2,
      author: "Priya M.",
      time: "5 hours ago",
      initial: "P",
      title: "My attendance is below 75%, what options do I have?",
      category: "Attendance",
      replies: 7,
      pts: 25,
    },
  ]);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!newQuestion.title.trim()) return;

    const newThread = {
      id: discussions.length + 1,
      author: "You (Active User)",
      time: "Just now",
      initial: "Y",
      title: newQuestion.title,
      category: newQuestion.category,
      replies: 0,
      pts: newQuestion.category === "NOC" ? 30 : 25,
    };

    setDiscussions([newThread, ...discussions]);
    setNewQuestion({ title: "", category: "NOC" });
    setIsModalOpen(false);
  };

  return (
    <div className={`disc-portal-shell ${darkMode ? "dark" : "light"}`}>
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        backPath="/dashboard"
      />

      <main className="disc-content-viewport">
        <h3 className="disc-section-title">
          ALL DISCUSSIONS ({discussions.length})
        </h3>

        <div className="disc-threads-stack">
          {discussions.map((post) => (
            <div key={post.id} className="disc-thread-card">
              <div className="disc-card-profile-header">
                <div className="disc-user-avatar-circle">{post.initial}</div>
                <div className="disc-user-identity-block">
                  <h4>{post.author}</h4>
                  <span>{post.time}</span>
                </div>
              </div>

              <h2 className="disc-post-main-headline">{post.title}</h2>

              <div className="disc-card-meta-footer">
                <span className="disc-badge-pill-category">
                  {post.category}
                </span>
                <div className="disc-replies-counter-node">
                  <FiMessageSquare /> <span>{post.replies} replies</span>
                </div>
                <span className="disc-badge-points-reward">
                  +{post.pts} pts to answer
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {isModalOpen && (
        <div
          className="disc-modal-overlay-backdrop"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="disc-modal-card-window"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="disc-modal-header-row">
              <h3>Post a New Core Query</h3>
              <button
                className="disc-modal-close-cross"
                onClick={() => setIsModalOpen(false)}
              >
                <FiX />
              </button>
            </div>

            <form
              onSubmit={handleFormSubmit}
              className="disc-modal-interactive-form"
            >
              <div className="disc-form-input-group">
                <label>Question Title / Parameter Description</label>
                <textarea
                  rows="4"
                  placeholder="e.g., What documents are required for internal NOC registration process?"
                  value={newQuestion.title}
                  onChange={(e) =>
                    setNewQuestion({ ...newQuestion, title: e.target.value })
                  }
                  required
                />
              </div>

              <div className="disc-form-input-group">
                <label>Target Category Segment</label>
                <select
                  value={newQuestion.category}
                  onChange={(e) =>
                    setNewQuestion({ ...newQuestion, category: e.target.value })
                  }
                >
                  <option value="NOC">NOC Grid</option>
                  <option value="Attendance">Attendance Hub</option>
                  <option value="Stipend">Stipend Portal</option>
                </select>
              </div>

              <div className="disc-modal-actions-wrapper">
                <button
                  type="button"
                  className="disc-btn-cancel-node"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="disc-btn-submit-node">
                  Publish Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
