import { useState } from "react";
import { FiSun, FiMoon, FiMenu, FiArrowLeft } from "react-icons/fi";
import { useNavigate, Link } from "react-router-dom";
import "./Navbar.css";

export default function Navbar({
  darkMode,
  setDarkMode,
  backPath = "/dashboard",
}) {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="common-navbar">
      <div className="nav-left">
        <button className="back-btn-common" onClick={() => navigate(backPath)}>
          <FiArrowLeft />
          <span>Back</span>
        </button>
      </div>

      <div className="nav-right">
        <button className="theme-btn" onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? <FiSun /> : <FiMoon />}
        </button>

        <div className="menu-wrapper">
          <button
            className="menu-btn-common"
            onClick={() => setShowMenu(!showMenu)}
          >
            <FiMenu />
          </button>

          {showMenu && (
            <div className="navbar-dropdown">
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/discussion" onClick={() => setShowMenu(false)}>
                Discussion
              </Link>
              <Link to="/documents" onClick={() => setShowMenu(false)}>
                Documents
              </Link>

              <Link to="/meetings" onClick={() => setShowMenu(false)}>
                Meetings
              </Link>

              <Link to="/faqsearch" onClick={() => setShowMenu(false)}>
                FAQ Search
              </Link>

              <Link to="/leaderboard" onClick={() => setShowMenu(false)}>
                Leaderboard
              </Link>

              <Link to="/spurtipoints" onClick={() => setShowMenu(false)}>
                Spurti Points
              </Link>

              <Link to="/attendance" onClick={() => setShowMenu(false)}>
                Attendance
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
