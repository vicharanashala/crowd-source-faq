import { useState } from "react";
import {
  FiVideo,
  FiCheckSquare,
  FiAlertTriangle,
  FiCheck,
  FiInfo,
} from "react-icons/fi";
import "./Attendance.css";
import Navbar from "../components/Navbar";

const Attendance = ({ darkMode, setDarkMode }) => {
  // Interactive metrics state tracker for Zoom and Poll sessions
  const [zoomAttendance, setZoomAttendance] = useState(78); // Default state criteria above 75%
  const [pollAccuracy, setPollAccuracy] = useState(54); // Default state criteria above 50%

  // Calculations for dynamic radial gauge and statuses
  const overallAttendanceScore = Math.round(
    (zoomAttendance + pollAccuracy) / 2,
  );
  const isZoomShort = zoomAttendance < 75;
  const isPollShort = pollAccuracy < 50;
  const hasGlobalAlert =
    overallAttendanceScore < 75 || isZoomShort || isPollShort;

  // Custom function helpers to increment/decrement metrics to see functionality live
  const adjustMetric = (type, action) => {
    if (type === "zoom") {
      setZoomAttendance((prev) =>
        Math.max(0, Math.min(100, action === "up" ? prev + 2 : prev - 2)),
      );
    } else {
      setPollAccuracy((prev) =>
        Math.max(0, Math.min(100, action === "up" ? prev + 5 : prev - 5)),
      );
    }
  };

  return (
    <div className="page-layout">
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        backPath="/dashboard"
      />

      <main
        className={`attendance-page ${
          darkMode ? "attendance-dark" : "attendance-light"
        }`}
      >
        {/* --- ATTENDANCE MAIN CONTAINER PANEL --- */}
        <main
          className={`attendance-page main-content-compact ${
            darkMode ? "attendance-dark" : "attendance-light"
          }`}
        >
          {/* CORE SECTION GRID LAYOUT */}
          <div className="attendance-split-layout-grid">
            {/* LEFT SIDE PANEL: OVERALL RADIAL STATUS */}
            <div className="attendance-status-panel-card">
              <h3>📊 Overall Attendance Status</h3>

              <div className="radial-gauge-container-pro">
                {/* Added explicit semantic class to scope rotation adjustments to prevent navbar icons from glitching */}
                <svg
                  width="140"
                  height="140"
                  viewBox="0 0 140 140"
                  className="radial-svg-canvas"
                >
                  <circle
                    cx="70"
                    cy="70"
                    r="54"
                    className="gauge-track-trail"
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r="54"
                    className={`gauge-track-fill-stroke ${hasGlobalAlert ? "stroke-alert" : "stroke-success"}`}
                    strokeDasharray="339.29"
                    strokeDashoffset={
                      339.29 - (339.29 * overallAttendanceScore) / 100
                    }
                  />
                </svg>
                <div className="radial-score-labels">
                  <h2>{overallAttendanceScore}%</h2>
                  <p>Overall</p>
                </div>
              </div>

              {/* DYNAMIC ALERT BOX LOGIC BASED ON ZOOM + POLL METRIC CRITERIA STATUS */}
              {hasGlobalAlert ? (
                <div className="attendance-alert-container-box">
                  <FiAlertTriangle className="alert-inline-icon" />
                  <p>
                    {isZoomShort &&
                      "Alert: Zoom attendance is below mandatory 75% limit. "}
                    {isPollShort &&
                      "Warning: Poll accuracy is under the required 50% mark. "}
                    {!isZoomShort &&
                      !isPollShort &&
                      "Overall system average is close to registration warnings."}
                  </p>
                </div>
              ) : (
                <div className="attendance-success-container-box">
                  <FiCheck className="alert-inline-icon" />
                  <p>
                    Excellent! All your Zoom metrics and performance scores meet
                    university portal compliances perfectly.
                  </p>
                </div>
              )}

              <div className="attendance-tip-container-box">
                <FiInfo className="tip-inline-icon" />
                <p>
                  Tip: Attend all remaining classes and answer pop-up polls
                  instantly to avoid automatic portal de-registration flags.
                </p>
              </div>
            </div>

            {/* RIGHT SIDE PANEL: ZOOM METRICS MONITORING SYSTEM */}
            <div className="attendance-breakdown-panel-card">
              <h3>🔌 Zoom Engagement Breakdown</h3>
              <p className="section-description-meta">
                Attendance eligibility is computed based on your regular Zoom
                sessions engagement and quiz poll submissions.
              </p>

              <div className="metrics-track-rows-container">
                {/* METRIC ROW 1: ZOOM MINUTES METRIC */}
                <div className="metric-status-row-item">
                  <div className="metric-meta-details">
                    <div className="metric-title-group">
                      <FiVideo className="icon-metric-accent-blue" />
                      <div>
                        <h4>Zoom Session Duration</h4>
                        <p>Requires maintaining ≥ 75% attendance time</p>
                      </div>
                    </div>
                    <div className="metric-score-interactive-box">
                      <span
                        className={`badge-percentage-lbl ${isZoomShort ? "lbl-danger" : "lbl-success"}`}
                      >
                        {zoomAttendance}% {isZoomShort ? "⚠️" : "✓"}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar line component */}
                  <div className="metric-rail-bar-track">
                    <div
                      className={`metric-rail-bar-fill ${isZoomShort ? "bg-danger" : "bg-success"}`}
                      style={{ width: `${zoomAttendance}%` }}
                    />
                  </div>

                  {/* Functional interactive adjustments tool keys */}
                  <div className="interactive-simulation-row">
                    <button onClick={() => adjustMetric("zoom", "down")}>
                      - Reduce Sessions
                    </button>
                    <button onClick={() => adjustMetric("zoom", "up")}>
                      + Attend Classes
                    </button>
                  </div>
                </div>

                {/* METRIC ROW 2: POLL PERFORMANCE ACCURACY METRIC */}
                <div className="metric-status-row-item">
                  <div className="metric-meta-details">
                    <div className="metric-title-group">
                      <FiCheckSquare className="icon-metric-accent-purple" />
                      <div>
                        <h4>Live Session Poll Accuracy</h4>
                        <p>Requires maintaining ≥ 50% correct responses</p>
                      </div>
                    </div>
                    <div className="metric-score-interactive-box">
                      <span
                        className={`badge-percentage-lbl ${isPollShort ? "lbl-danger" : "lbl-success"}`}
                      >
                        {pollAccuracy}% {isPollShort ? "⚠️" : "✓"}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar line component */}
                  <div className="metric-rail-bar-track">
                    <div
                      className={`metric-rail-bar-fill ${isPollShort ? "bg-danger" : "bg-success"}`}
                      style={{ width: `${pollAccuracy}%` }}
                    />
                  </div>

                  {/* Functional interactive adjustments tool keys */}
                  <div className="interactive-simulation-row">
                    <button onClick={() => adjustMetric("poll", "down")}>
                      - Wrong Answers
                    </button>
                    <button onClick={() => adjustMetric("poll", "up")}>
                      + Correct Answers
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </main>
    </div>
  );
};

export default Attendance;
