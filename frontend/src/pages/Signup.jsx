import "../Login.css";
import { Link } from "react-router-dom";

export default function Signup() {
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
          <input type="text" placeholder="Enter your name" />
        </div>

        <div className="form-group">
          <label>Email Address</label>
          <input type="email" placeholder="Enter your email" />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input type="password" placeholder="Create password" />
        </div>

        <div className="form-group">
          <label>Confirm Password</label>
          <input type="password" placeholder="Confirm password" />
        </div>

        <button className="signin-btn">Create Account</button>

        <div className="forgot-password">
          Already have an account?
          <Link to="/login"> Sign In</Link>
        </div>
      </div>
    </div>
  );
}
