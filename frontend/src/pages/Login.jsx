import { useNavigate } from "react-router-dom";
import "../Login.css";

function Login() {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate("/dashboard");
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

          <input type="email" placeholder="you@example.com" />
        </div>

        <div className="form-group">
          <label>Password</label>

          <input type="password" placeholder="Enter your password" />
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
