import "../Login.css";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  return (
    <div className="login-page">
      <div className="login-container">
        <p className="top-text">Reset your password</p>

        <h1 className="login-title">Forgot Password</h1>

        <div className="form-group">
          <label>Email Address</label>

          <input type="email" placeholder="Enter your email" />
        </div>

        <button className="signin-btn">Send Reset Link</button>

        <div className="forgot-password">
          <Link to="/login">Back to Login</Link>
        </div>
      </div>
    </div>
  );
}
