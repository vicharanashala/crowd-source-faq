import { useState, useRef } from "react";
import { submitEscalation } from "../services/escalationService";
import "../styles/escalation.css";

const ACCEPTED_TYPES = "image/jpeg,image/jpg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm";
const MAX_FILES = 3;
const MAX_FILE_SIZE_MB = 25;

const CATEGORY_HINTS = {
  "VIBE Team": "Platform bugs, dashboard issues, general product feedback",
  "Samagama Team": "Program logistics, cohort queries, general coordination",
  "Offer Letter": "Offer letter delays, corrections, or download issues",
  "Zoom Meeting": "Meeting links, access, recordings, technical glitches",
  "Attendance & Polls": "Attendance not marked, poll not showing, badge mismatch",
  Other: "Anything that doesn't fit the categories above",
};

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const EscalationForm = ({ onSubmitted }) => {
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "VIBE Team",
    priority: "Medium",
  });
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const addFiles = (newFiles) => {
    setError("");
    const incoming = Array.from(newFiles);

    const oversized = incoming.find((f) => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (oversized) {
      setError(`"${oversized.name}" is over ${MAX_FILE_SIZE_MB}MB. Please attach a smaller file.`);
      return;
    }

    const combined = [...files, ...incoming].slice(0, MAX_FILES);
    if (files.length + incoming.length > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} files.`);
    }
    setFiles(combined);
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      setError("Please fill in both title and description.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const created = await submitEscalation(form, files);
      setForm({ title: "", description: "", category: "VIBE Team", priority: "Medium" });
      setFiles([]);
      if (onSubmitted) onSubmitted(created);
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="escalation-card">
      <h2 className="escalation-heading">Submit an Escalation</h2>
      <p className="escalation-subtext">
        Couldn't find an answer in the forum or FAQ? Raise it here and the right team will follow up.
      </p>

      <form onSubmit={handleSubmit} className="escalation-form">
        <label htmlFor="title">
          Title <span className="required-mark">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          placeholder="Short summary of your issue"
          value={form.title}
          onChange={handleChange}
          maxLength={120}
        />

        <div className="field-footer">
          <label htmlFor="description" style={{ marginTop: 0 }}>
            Description <span className="required-mark">*</span>
          </label>
          <span className={`char-count ${form.description.length > 900 ? "char-count-warning" : ""}`}>
            {form.description.length}/1000
          </span>
        </div>
        <textarea
          id="description"
          name="description"
          rows="4"
          placeholder="Describe your issue in detail — what happened, when, and what you expected instead"
          value={form.description}
          onChange={handleChange}
          maxLength={1000}
        />

        <div className="escalation-row">
          <div>
            <label htmlFor="category">Category</label>
            <select id="category" name="category" value={form.category} onChange={handleChange}>
              <option>VIBE Team</option>
              <option>Samagama Team</option>
              <option>Offer Letter</option>
              <option>Zoom Meeting</option>
              <option>Attendance &amp; Polls</option>
              <option>Other</option>
            </select>
            <span className="field-hint">{CATEGORY_HINTS[form.category]}</span>
          </div>

          <div>
            <label>Priority</label>
            <div className="priority-pills">
              {["Low", "Medium", "High"].map((level) => (
                <button
                  type="button"
                  key={level}
                  data-level={level}
                  className={`priority-pill ${form.priority === level ? "active" : ""}`}
                  onClick={() => setForm({ ...form, priority: level })}
                >
                  {level}
                </button>
              ))}
            </div>
            <span className="field-hint">How urgent this is for you right now</span>
          </div>
        </div>

        {/* Attachment upload */}
        <label style={{ marginTop: "14px" }}>Attachments (optional)</label>
        <div
          className={`upload-zone ${dragActive ? "drag-active" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 16V4M12 4L7 9M12 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="upload-zone-text">
            <span className="upload-zone-link">Click to upload</span> or drag and drop
          </p>
          <p className="upload-zone-hint">JPG, PNG, WEBP, GIF, or MP4 / MOV / WEBM — up to {MAX_FILE_SIZE_MB}MB, max {MAX_FILES} files</p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            hidden
            onChange={(e) => e.target.files?.length && addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div className="file-preview-list">
            {files.map((file, i) => (
              <div className="file-preview-item" key={`${file.name}-${i}`}>
                {file.type.startsWith("image/") ? (
                  <img src={URL.createObjectURL(file)} alt={file.name} className="file-preview-thumb" />
                ) : (
                  <div className="file-preview-thumb file-preview-video">▶</div>
                )}
                <div className="file-preview-meta">
                  <span className="file-preview-name">{file.name}</span>
                  <span className="file-preview-size">{formatBytes(file.size)}</span>
                </div>
                <button
                  type="button"
                  className="file-remove-btn"
                  onClick={() => removeFile(i)}
                  aria-label={`Remove ${file.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="escalation-error">{error}</p>}

        <button type="submit" className="escalation-btn" disabled={loading}>
          {loading ? "Submitting…" : "Submit Query"}
        </button>
      </form>
    </div>
  );
};

export default EscalationForm;
