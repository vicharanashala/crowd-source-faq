import "../Login.css";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Signup() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSignup = () => {
    if (!name || !email || !password || !confirmPassword) {
      alert("Please fill all fields");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    const newUser = {
      id: Date.now(),
      name,
      email,
      password,

      role: "student",

      points: 0,

      badge: "🌱 Beginner",

      meetingsAttended: 0,

      pollsAttempted: 0,

      correctAnswers: 0,

      queriesResolved: 0,

      activity: [],
    };

    localStorage.setItem("user", JSON.stringify(newUser));

    alert("Account Created Successfully");
    navigate("/login");
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
        </div>

        <p className="top-text">Create your account</p>

        <h1 className="login-title">Sign Up</h1>

        <div className="form-group">
          <label>Full Name</label>
          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Email Address</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            placeholder="Create password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Confirm Password</label>
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <button className="signin-btn" onClick={handleSignup}>
          Create Account
        </button>

        <div className="forgot-password">
          Already have an account?
          <Link to="/login"> Sign In</Link>
        </div>
      </div>
    </div>
  );
}
