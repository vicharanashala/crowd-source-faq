import { useNavigate } from "react-router-dom";
import "../Login.css";
import { useState, useEffect } from "react";
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem("admin")) {
      const admin = {
        id: 1,
        name: "Administrator",
        email: "admin@vicharanashala.com",
        password: "admin123",

        role: "admin",

        points: 0,

        badge: "Administrator",

        meetingsAttended: 0,

        pollsAttempted: 0,

        correctAnswers: 0,

        queriesResolved: 0,

        activity: [],
      };

      localStorage.setItem("admin", JSON.stringify(admin));
    }
  }, []);

  const handleLogin = () => {
    const user = JSON.parse(localStorage.getItem("user"));

    const admin = JSON.parse(localStorage.getItem("admin"));

    if (!user) {
      alert("Please create an account first.");
      navigate("/signup");
      return;
    }

    if (user && email === user.email && password === user.password) {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("loggedInUser", JSON.stringify(user));

      navigate("/dashboard");
    } else if (admin && email === admin.email && password === admin.password) {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("loggedInUser", JSON.stringify(admin));

      navigate("/dashboard");
    } else {
      alert("Invalid Email or Password");
    }
  };
  const handleSignup = () => {
    navigate("/signup");
  };

  const handleForgotPassword = () => {
    navigate("/forgotpassword");
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="window-header">
          <div className="dots">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>

          <p className="portal-link">faq://candidate-access</p>
        </div>

        <p className="top-text">Already applied? Sign in</p>

        <h1 className="login-title">Sign in to your account</h1>

        <div className="form-group">
          <label>Email Address</label>

          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Password</label>

          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="signin-btn" onClick={handleLogin}>
          Sign In
        </button>

        <div className="forgot-password">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleForgotPassword();
            }}
          >
            Forgot Password?
          </a>
        </div>

        <div className="divider">
          <span>OR</span>
        </div>

        <button className="signup-btn" onClick={handleSignup}>
          Create Account
        </button>
      </div>
    </div>
  );
}

export default Login;
