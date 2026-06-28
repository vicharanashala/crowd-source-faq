import "./Welcome.css";
import { FiSun, FiMoon } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

export default function Welcome({ darkMode, setDarkMode }) {
  const navigate = useNavigate();

  return (
    <div className={darkMode ? "welcome-page" : "welcome-page light"}>
      <div className="bg-circle circle1"></div>
      <div className="bg-circle circle2"></div>
      <div className="bg-circle circle3"></div>

      <nav className="navbar">
        <div className="brand">
          <div className="logo-circle">V</div>

          <div>
            <h2>Vicharanashala</h2>
          </div>
        </div>

        <div className="nav-right">
          <button className="toggle-btn" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? <FiSun /> : <FiMoon />}
          </button>

          <button className="register-btn" onClick={() => navigate("/signup")}>
            Register Now
          </button>
        </div>
      </nav>

      <div className="hero-section">
        <h1>
          Welcome to <span>Vicharanashala</span>
        </h1>

        <p>
          Empowering students through collaborative knowledge sharing, smart FAQ
          discovery and community discussions.
        </p>

        <h3>"Ask. Share. Learn. Grow Together."</h3>

        <div className="hero-buttons">
          <button
            className="get-started"
            onClick={() => navigate("/dashboard")}
          >
            Get Started
          </button>

          <button className="login-btn" onClick={() => navigate("/login")}>
            Login
          </button>
        </div>
      </div>
    </div>
  );
}
