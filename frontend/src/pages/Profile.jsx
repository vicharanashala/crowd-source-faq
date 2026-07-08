import { useState } from "react";
import "./Profile.css";

export default function Profile() {
  // Load user from localStorage only once
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem("loggedInUser");
    return storedUser
      ? JSON.parse(storedUser)
      : {
          name: "Guest User",
          email: "guest@example.com",
          role: "Student",
          level: 1,
          points: 150,
          meetingsAttended: 0,
          queriesResolved: 0,
          pollsAttempted: 0,
        };
  });

  const [isEditing, setIsEditing] = useState(false);

  const [editData, setEditData] = useState({
    name: user.name,
    email: user.email,
    role: user.role,
  });

  // Progress
  const currentLevel = user.level || 1;
  const points = user.points || 0;
  const pointsNeeded = currentLevel * 500;

  const progressPercent = Math.min((points / pointsNeeded) * 100, 100);

  // Handle Input
  const handleChange = (e) => {
    const { name, value } = e.target;

    setEditData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Save Profile
  const handleSave = () => {
    const updatedUser = {
      ...user,
      ...editData,
    };

    setUser(updatedUser);

    localStorage.setItem("loggedInUser", JSON.stringify(updatedUser));

    setIsEditing(false);

    alert("Profile Updated Successfully!");
  };

  // Cancel
  const handleCancel = () => {
    setEditData({
      name: user.name,
      email: user.email,
      role: user.role,
    });

    setIsEditing(false);
  };

  // Logout
  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/login";
  };

  return (
    <div className="profile-container">
      {/* Header */}

      <div className="profile-header">
        <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>

        <div className="user-info">
          {isEditing ? (
            <div className="edit-form">
              <input
                className="input-field"
                type="text"
                name="name"
                value={editData.name}
                onChange={handleChange}
                placeholder="Full Name"
              />

              <input
                className="input-field"
                type="email"
                name="email"
                value={editData.email}
                onChange={handleChange}
                placeholder="Email"
              />

              <select
                className="input-field"
                name="role"
                value={editData.role}
                onChange={handleChange}
              >
                <option>Student</option>
                <option>Mentor</option>
                <option>Admin</option>
              </select>
            </div>
          ) : (
            <>
              <h1>{user.name}</h1>

              <p>{user.email}</p>

              <p className="role-badge">
                {user.role.toUpperCase()} | Level {currentLevel}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Main Grid */}

      <div className="main-grid">
        {/* Left */}

        <div className="left-panel">
          <div className="progress-card">
            <h3>Progress to Level {currentLevel + 1}</h3>

            <div className="progress-bar-bg">
              <div
                className="progress-fill"
                style={{
                  width: `${progressPercent}%`,
                }}
              ></div>
            </div>

            <p>
              {points} / {pointsNeeded} Spurti Points
            </p>

            <small>
              Need {Math.max(pointsNeeded - points, 0)} more points to level up
            </small>
          </div>

          {/* Stats */}

          <div className="stats-container">
            <div className="stat-box">
              <h4>{user.meetingsAttended || 0}</h4>
              <p>Meetings</p>
            </div>

            <div className="stat-box">
              <h4>{user.queriesResolved || 0}</h4>
              <p>Queries Solved</p>
            </div>

            <div className="stat-box">
              <h4>{user.pollsAttempted || 0}</h4>
              <p>Polls</p>
            </div>
          </div>
        </div>

        {/* Right */}

        <div className="right-panel">
          <h3>Internship Journey</h3>

          <div className="journey-steps">
            <div className="step completed">✓ Application Submitted</div>

            <div className="step completed">✓ Documents Verified</div>

            <div className="step active">○ Internship In Progress</div>

            <div className="step">○ Submit Weekly Report</div>

            <div className="step">○ Final Evaluation</div>

            <div className="step">○ Certificate Received</div>
          </div>
        </div>
      </div>

      {/* Buttons */}

      <div className="actions">
        {!isEditing ? (
          <button className="btn-edit" onClick={() => setIsEditing(true)}>
            Edit Profile
          </button>
        ) : (
          <>
            <button className="btn-save" onClick={handleSave}>
              Save Changes
            </button>

            <button className="btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
          </>
        )}

        <button className="btn-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}
