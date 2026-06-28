import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState } from "react";

import Welcome from "./Pages/Welcome";
import Signup from "./Pages/Signup";
import ForgotPassword from "./Pages/ForgotPassword";
import Login from "./Pages/Login";
import FAQ from "./Pages/FAQ";
import Dashboard from "./Pages/Dashboard";
import Discussion from "./Pages/Discussion";

import Documents from "./Pages/Documents";
import Meetings from "./Pages/Meetings";
import FAQSearch from "./Pages/FAQSearch";
import Leaderboard from "./Pages/Leaderboard";
import SpurtiPoints from "./Pages/SpurtiPoints";
import Attendance from "./Pages/Attendance";

import "./App.css";

function App() {
  const [darkMode, setDarkMode] = useState(true);

  return (
    <div className={darkMode ? "app dark" : "app light"}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={<Welcome darkMode={darkMode} setDarkMode={setDarkMode} />}
          />

          <Route
            path="/login"
            element={<Login darkMode={darkMode} setDarkMode={setDarkMode} />}
          />

          <Route
            path="/signup"
            element={<Signup darkMode={darkMode} setDarkMode={setDarkMode} />}
          />

          <Route
            path="/forgotpassword"
            element={
              <ForgotPassword darkMode={darkMode} setDarkMode={setDarkMode} />
            }
          />

          <Route
            path="/dashboard"
            element={
              <Dashboard darkMode={darkMode} setDarkMode={setDarkMode} />
            }
          />
          <Route path="/faq" element={<FAQ />} />

          <Route
            path="/discussion"
            element={
              <Discussion darkMode={darkMode} setDarkMode={setDarkMode} />
            }
          />

          <Route
            path="/documents"
            element={
              <Documents darkMode={darkMode} setDarkMode={setDarkMode} />
            }
          />
          <Route
            path="/meetings"
            element={<Meetings darkMode={darkMode} setDarkMode={setDarkMode} />}
          />
          <Route
            path="/faqsearch"
            element={
              <FAQSearch darkMode={darkMode} setDarkMode={setDarkMode} />
            }
          />
          <Route
            path="/leaderboard"
            element={
              <Leaderboard darkMode={darkMode} setDarkMode={setDarkMode} />
            }
          />

          <Route
            path="/spurtipoints"
            element={
              <SpurtiPoints darkMode={darkMode} setDarkMode={setDarkMode} />
            }
          />

          <Route
            path="/attendance"
            element={
              <Attendance darkMode={darkMode} setDarkMode={setDarkMode} />
            }
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
