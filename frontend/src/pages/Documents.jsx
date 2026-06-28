import { useState, useRef } from "react";
import {
  FiFolder,
  FiUploadCloud,
  FiFileText,
  FiCheckCircle,
} from "react-icons/fi";
import "./Documents.css";
import Navbar from "../components/Navbar";

const Documents = ({ darkMode, setDarkMode }) => {
  const [selectedCategory, setSelectedCategory] = useState("Upload NOC");

  const fileInputRef = useRef(null);

  const [uploadedDocs, setUploadedDocs] = useState([
    {
      id: 1,
      name: "NOC_Gaurav_2024.pdf",
      time: "Uploaded 3 days ago",
      status: "Verified",
      points: "+10 pts",
    },
    {
      id: 2,
      name: "OfferLetter_TCS.pdf",
      time: "Uploaded 1 week ago",
      status: "Verified",
      points: "+10 pts",
    },
  ]);

  const categoryMetaData = {
    "Upload NOC": "No Objection Certificate",
    "Offer Letter": "Internship offer document",
    "Intern Report": "Completion report",
    Certificate: "Course certificate",
  };

  const onZoneClick = () => {
    fileInputRef.current.click();
  };

  const handleFileUpload = (e) => {
    const files = e.target.files || e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];

    const newDoc = {
      id: Date.now(),
      name: file.name,
      time: "Uploaded just now",
      status: "Verified",
      points: "+10 pts",
    };

    setUploadedDocs([newDoc, ...uploadedDocs]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFileUpload(e);
  };

  return (
    <div
      className={`vicharanashala-container ${
        darkMode ? "dark-mode" : "light-mode"
      }`}
    >
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        backPath="/dashboard"
      />

      <main className="main-content">
        <div className="documents-grid">
          <section className="upload-section card-layout">
            <h3>
              <FiFolder /> Document Upload Center
            </h3>

            <div
              className="drag-drop-zone"
              onClick={onZoneClick}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileUpload}
                accept=".pdf,.doc,.docx,.jpg,.jpeg"
              />
              <FiUploadCloud className="upload-cloud-icon" />
              <h4>Drop files here or click to upload</h4>
              <p>
                Uploading as: <strong>{selectedCategory}</strong> (
                {categoryMetaData[selectedCategory]})
              </p>
              <p className="formats-label">PDF, DOC, JPG up to 10MB</p>
            </div>

            {/* Document Types Selector Matrix Grid */}
            <div className="doc-category-matrix">
              <button
                className={`category-tile ${selectedCategory === "Upload NOC" ? "active" : ""}`}
                onClick={() => setSelectedCategory("Upload NOC")}
              >
                <FiFileText className="tile-icon" />
                <div className="tile-text">
                  <h5>Upload NOC</h5>
                  <p>No Objection Certificate</p>
                </div>
              </button>

              <button
                className={`category-tile ${selectedCategory === "Offer Letter" ? "active" : ""}`}
                onClick={() => setSelectedCategory("Offer Letter")}
              >
                <FiFileText className="tile-icon" />
                <div className="tile-text">
                  <h5>Offer Letter</h5>
                  <p>Internship offer document</p>
                </div>
              </button>

              <button
                className={`category-tile ${selectedCategory === "Intern Report" ? "active" : ""}`}
                onClick={() => setSelectedCategory("Intern Report")}
              >
                <FiFileText className="tile-icon" />
                <div className="tile-text">
                  <h5>Intern Report</h5>
                  <p>Completion report</p>
                </div>
              </button>

              <button
                className={`category-tile ${selectedCategory === "Certificate" ? "active" : ""}`}
                onClick={() => setSelectedCategory("Certificate")}
              >
                <FiFileText className="tile-icon" />
                <div className="tile-text">
                  <h5>Certificate</h5>
                  <p>Course certificate</p>
                </div>
              </button>
            </div>
          </section>

          {/* Right Panel: Verified Checklist Registry Stream */}
          <section className="history-section card-layout">
            <h3>
              <FiFileText /> Uploaded Documents ({uploadedDocs.length})
            </h3>
            <div className="docs-list">
              {uploadedDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="uploaded-doc-item animation-pop-in"
                >
                  <div className="doc-item-left">
                    <FiFileText className="doc-file-icon" />
                    <div className="doc-metadata">
                      <h4>{doc.name}</h4>
                      <p>{doc.time}</p>
                    </div>
                  </div>
                  <div className="doc-item-right">
                    <span className="status-badge">
                      <FiCheckCircle /> {doc.status}
                    </span>
                    <span className="points-award">{doc.points}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Documents;
