const STAGES = ["Pending", "In Progress", "Resolved"];

/**
 * Renders the ticket's real lifecycle position as a stepper,
 * rather than a flat colored label. "Closed" renders as a
 * completed "Resolved" stage; "Reopened" flags stage 2 (In
 * Progress) as active again with a distinct reopened marker.
 */
const StatusStepper = ({ status }) => {
  const isClosed = status === "Closed";
  const isReopened = status === "Reopened";

  let activeIndex = 0;
  if (status === "Pending") activeIndex = 0;
  else if (status === "In Progress" || isReopened) activeIndex = 1;
  else activeIndex = 2; // Resolved or Closed

  return (
    <div className="status-stepper">
      {STAGES.map((stage, i) => {
        const isActive = i <= activeIndex;
        const isReopenedStage = isReopened && i === 1;
        const label = stage === "Resolved" && isClosed ? "Closed" : stage;

        return (
          <div key={stage} style={{ display: "flex", alignItems: "center" }}>
            <div className={`stepper-stage ${isActive ? "active" : ""} ${isReopenedStage ? "reopened" : ""}`}>
              <span className="stepper-dot" />
              <span className="stepper-stage-label">{label}</span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`stepper-connector ${i < activeIndex ? "active" : ""}`} />
            )}
          </div>
        );
      })}
      {isReopened && <span className="reopened-flag">Reopened</span>}
    </div>
  );
};

export default StatusStepper;
