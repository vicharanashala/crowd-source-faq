import { useState } from "react";
import {
  FiTrendingUp,
  FiTarget,
  FiFileText,
  FiMessageCircle,
} from "react-icons/fi";
import "./SpurtiPoints.css";
import Navbar from "../components/Navbar";

const SpurtiPoints = ({ darkMode, setDarkMode }) => {
  const [currentPoints] = useState(350);

  const categoryPointsRules = [
    {
      category: "Placement",
      answerPts: "35 pts",
      askPts: "5 pts",
      variant: "purple",
    },
    { category: "NOC", answerPts: "30 pts", askPts: "5 pts", variant: "red" },
    {
      category: "Internship",
      answerPts: "25 pts",
      askPts: "5 pts",
      variant: "green",
    },
    {
      category: "Attendance",
      answerPts: "25 pts",
      askPts: "5 pts",
      variant: "blue",
    },
    {
      category: "Certificate",
      answerPts: "20 pts",
      askPts: "5 pts",
      variant: "yellow",
    },
    {
      category: "Projects",
      answerPts: "20 pts",
      askPts: "5 pts",
      variant: "orange",
    },
    {
      category: "Leave",
      answerPts: "15 pts",
      askPts: "5 pts",
      variant: "navy",
    },
    {
      category: "Doc Upload",
      answerPts: "10 pts",
      askPts: "—",
      variant: "teal",
    },
  ];

  const userBadges = [
    {
      id: "b1",
      title: "First Answer",
      meta: "Answered 1 question",
      locked: false,
      icon: <FiMessageCircle />,
    },
    {
      id: "b2",
      title: "Doc Hero",
      meta: "Uploaded 3 docs",
      locked: false,
      icon: <FiFileText />,
    },
    {
      id: "b3",
      title: "Rising Star",
      meta: "Top 10 this month",
      locked: false,
      icon: <FiTrendingUp />,
    },
    {
      id: "b4",
      title: "Expert",
      meta: "Reach 500 pts",
      locked: true,
      icon: <FiTarget />,
    },
  ];

  const recentEarnings = [
    {
      id: 1,
      type: "answer",
      label: "Answered: NOC submission steps",
      reward: "+30 pts",
      icon: "🎯",
    },
    {
      id: 2,
      type: "upload",
      label: "Uploaded NOC document",
      reward: "+10 pts",
      icon: "📄",
    },
    {
      id: 3,
      type: "answer",
      label: "Answered: Attendance calculation",
      reward: "+25 pts",
      icon: "💬",
    },
  ];

  return (
    <div className="page-layout">
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        backPath="/dashboard"
      />

      <main
        className={`spurti-page ${darkMode ? "spurti-dark" : "spurti-light"}`}
      >
        <div className="points-hero-card-pro">
          <div className="points-score-huge-value">{currentPoints}</div>
          <div className="points-sub-title-meta">Your Spurti Points</div>

          <div className="user-level-status-pill-badge">
            ⭐ Level 4 — Contributor
          </div>

          <div className="progress-engine-rail-wrapper">
            <span className="level-indicator-bounds">Level 4</span>
            <div className="pro-linear-progress-track">
              <div
                className="pro-linear-progress-fill"
                style={{ width: "65%" }}
              ></div>
            </div>
            <span className="level-indicator-bounds text-right">
              Level 5 (500 pts)
            </span>
          </div>
          <p className="remaining-points-micro-text">
            180 more points to reach Expert level
          </p>
        </div>

        <div className="gamification-split-layout-grid">
          <div className="points-rules-panel-card">
            <h3>🪙 Points per Category</h3>

            <div className="rules-matrix-table-header">
              <span className="col-lbl-category">CATEGORY</span>
              <span className="col-lbl-values">FOR ANSWERING</span>
              <span className="col-lbl-values text-right">FOR ASKING</span>
            </div>

            <div className="rules-matrix-table-rows-stack">
              {categoryPointsRules.map((item, index) => (
                <div key={index} className="matrix-data-row-item">
                  <div className="col-lbl-category">
                    <span
                      className={`category-pill-micro variance-${item.variant}`}
                    >
                      {item.category}
                    </span>
                  </div>
                  <span className="col-lbl-values weight-highlight-amber">
                    {item.answerPts}
                  </span>
                  <span className="col-lbl-values text-right text-muted-slate">
                    {item.askPts}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="achievements-right-column-stack">
            <div className="badges-showcase-panel-card">
              <h3>🏅 Your Badges</h3>

              <div className="badges-showcase-flex-grid">
                {userBadges.map((badge) => (
                  <div
                    key={badge.id}
                    className={`badge-square-item-pro ${badge.locked ? "badge-state-locked" : "badge-state-unlocked"}`}
                  >
                    <div className="badge-graphics-icon-wrapper">
                      {badge.icon}
                    </div>
                    <h4>{badge.title}</h4>
                    <p>{badge.meta}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="earnings-history-panel-card">
              <h3>🎯 Recent Earnings</h3>

              <div className="earnings-history-list-rows">
                {recentEarnings.map((log) => (
                  <div key={log.id} className="earning-log-row-item-pro">
                    <div className="earning-log-left-block">
                      <span className="earning-log-emoji-icon">{log.icon}</span>
                      <span className="earning-log-action-text">
                        {log.label}
                      </span>
                    </div>
                    <div className="earning-log-right-pts-tag">
                      {log.reward}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SpurtiPoints;
