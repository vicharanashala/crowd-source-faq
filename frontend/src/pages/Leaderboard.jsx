import { useState, useEffect } from "react";
import { FiAward as TrophyIcon } from "react-icons/fi";
import "./Leaderboard.css";
import Navbar from "../components/Navbar";

const Leaderboard = ({ darkMode, setDarkMode }) => {
  const [contributors, setContributors] = useState([
    {
      id: "u1",
      name: "Rahul K.",
      answers: 18,
      points: 450,
      avatar: "R",
      isYou: false,
    },
    {
      id: "u2",
      name: "Priya M.",
      answers: 15,
      points: 390,
      avatar: "P",
      isYou: false,
    },
    {
      id: "u3",
      name: "Gaurav S.",
      answers: 12,
      points: 320,
      avatar: "G",
      isYou: true,
    }, //
    {
      id: "u4",
      name: "Aman T.",
      answers: 10,
      points: 280,
      avatar: "A",
      isYou: false,
    },
    {
      id: "u5",
      name: "Sneha R.",
      answers: 9,
      points: 245,
      avatar: "S",
      isYou: false,
    },
    {
      id: "u6",
      name: "Vikash P.",
      answers: 8,
      points: 210,
      avatar: "V",
      isYou: false,
    },
    {
      id: "u7",
      name: "Divya N.",
      answers: 7,
      points: 185,
      avatar: "D",
      isYou: false,
    },
    {
      id: "u8",
      name: "Dai K.",
      answers: 5,
      points: 120,
      avatar: "D",
      isYou: false,
    },
  ]);

  useEffect(() => {
    const intervalRegistry = setInterval(() => {
      setContributors((prevList) => {
        const updatedList = prevList.map((user) => {
          if (Math.random() > 0.6) {
            const extraPts = Math.random() > 0.5 ? 15 : 30;
            const updatedPts = user.points + extraPts;

            if (user.isYou) {
              // setSpurtiPoints(updatedPts);
            }
            return {
              ...user,
              points: updatedPts,
              answers: user.answers + (extraPts === 30 ? 1 : 0),
            };
          }
          return user;
        });

        return [...updatedList].sort((a, b) => b.points - a.points);
      });
    }, 6000);

    return () => clearInterval(intervalRegistry);
  }, []);

  const maxScoreBoundary = Math.max(...contributors.map((c) => c.points), 1);

  const renderRankBadge = (index) => {
    if (index === 0) return <span className="rank-badge gold-medal">🥇</span>;
    if (index === 1) return <span className="rank-badge silver-medal">🥈</span>;
    if (index === 2) return <span className="rank-badge bronze-medal">🥉</span>;
    return <span className="rank-number-text">{index + 1}</span>;
  };

  return (
    <div className="vicharanashala-container">
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        backPath="/dashboard"
      />
      <main
        className={`leaderboard-page ${
          darkMode ? "leaderboard-dark" : "leaderboard-light"
        }`}
      >
        <div className="leaderboard-card-pro">
          <div className="leaderboard-header-row-label">
            <TrophyIcon className="trophy-gold-icon" /> Top 10 Contributors —
            Spurti Points
          </div>

          <div className="leaderboard-list-stack-wrapper">
            {contributors.map((user, idx) => {
              const calculatedWidthRatio =
                (user.points / maxScoreBoundary) * 100;

              return (
                <div
                  key={user.id}
                  className={`leaderboard-row-item-pro ${user.isYou ? "current-user-highlight" : ""}`}
                >
                  <div className="leaderboard-left-meta-block">
                    <div className="rank-position-box-container">
                      {renderRankBadge(idx)}
                    </div>

                    <div
                      className={`competitor-avatar-circle ${user.isYou ? "avatar-blue" : "avatar-gray"}`}
                    >
                      {user.avatar}
                    </div>

                    <div className="competitor-identity-text-block">
                      <h4>
                        {user.name}{" "}
                        {user.isYou && (
                          <span className="you-identity-tag">(You)</span>
                        )}
                      </h4>
                      <p>{user.answers} answers given</p>
                    </div>
                  </div>

                  <div className="leaderboard-center-progress-rail">
                    <div
                      className={`leaderboard-fill-bar-progress ${user.isYou ? "fill-blue" : "fill-purple"}`}
                      style={{ width: `${calculatedWidthRatio}%` }}
                    />
                  </div>

                  <div className="leaderboard-right-score-value">
                    <span>{user.points}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Leaderboard;
