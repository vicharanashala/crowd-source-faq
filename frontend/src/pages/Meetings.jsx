import { useState, useEffect } from "react";
import {} from "react-icons/fi";
import Navbar from "../components/Navbar";
import "./Meetings.css";

const Meetings = ({ darkMode, setDarkMode }) => {
  const [meetingsData, setMeetingsData] = useState([
    {
      id: 1,
      title: "Project Review Meeting",
      targetDate: "2026-06-23T00:09:00",
      displayDate: "Tuesday, 23 June 2026 at 12:09 am",
      badge: "Soon!",
      badgeClass: "badge-soon",
      countdown: { days: 0, hours: 0, mins: 0, secs: 0 },
    },
    {
      id: 2,
      title: "Internship Completion Seminar",
      targetDate: "2026-06-27T12:09:00",
      displayDate: "Saturday, 27 June 2026 at 12:09 pm",
      badge: "Upcoming",
      badgeClass: "badge-upcoming",
      countdown: { days: 0, hours: 0, mins: 0, secs: 0 },
    },
    {
      id: 3,
      title: "NOC Submission Deadline Briefing",
      targetDate: "2026-07-04T19:09:00",
      displayDate: "Saturday, 4 July 2026 at 07:09 pm",
      badge: "Upcoming",
      badgeClass: "badge-upcoming",
      countdown: { days: 0, hours: 0, mins: 0, secs: 0 },
    },
  ]);

  useEffect(() => {
    const calculateTimeLeft = () => {
      setMeetingsData((prevMeetings) =>
        prevMeetings.map((meeting) => {
          const difference = +new Date(meeting.targetDate) - +new Date();
          let countdown = { days: 0, hours: 0, mins: 0, secs: 0 };

          if (difference > 0) {
            countdown = {
              days: Math.floor(difference / (1000 * 60 * 60 * 24)),
              hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
              mins: Math.floor((difference / 1000 / 60) % 60),
              secs: Math.floor((difference / 1000) % 60),
            };
          }
          return { ...meeting, countdown };
        }),
      );
    };

    calculateTimeLeft();
    const intervalTimer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(intervalTimer);
  }, []);

  const formatTimeNum = (num) => String(num).padStart(2, "0");

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
        <div className="section-divider-title">
          SCHEDULED MEETINGS WITH LIVE COUNTDOWN
        </div>

        <div className="meetings-stack-container-full">
          {meetingsData.map((meeting) => (
            <div key={meeting.id} className="meeting-card-blueprint-full">
              <div className="meeting-card-top">
                <div className="meeting-meta-details">
                  <h4>{meeting.title}</h4>
                  <p>{meeting.displayDate}</p>
                </div>
                <span className={`status-badge-pill ${meeting.badgeClass}`}>
                  {meeting.badge}
                </span>
              </div>

              <div className="countdown-grid-dashboard-full">
                <div className="countdown-time-block">
                  <h2>{formatTimeNum(meeting.countdown.days)}</h2>
                  <span>DAYS</span>
                </div>
                <div className="countdown-time-block">
                  <h2>{formatTimeNum(meeting.countdown.hours)}</h2>
                  <span>HOURS</span>
                </div>
                <div className="countdown-time-block">
                  <h2>{formatTimeNum(meeting.countdown.mins)}</h2>
                  <span>MINS</span>
                </div>
                <div className="countdown-time-block">
                  <h2>{formatTimeNum(meeting.countdown.secs)}</h2>
                  <span>SECS</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Meetings;
