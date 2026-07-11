// Renders thumbnails for a ticket's attachments. Images show a preview;
// videos show a play icon. Clicking either opens the file in a new tab.
const TicketAttachments = ({ attachments }) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="ticket-attachments">
      {attachments.map((file, i) => {
        const isImage = file.mimeType?.startsWith("image/");
        return isImage ? (
          <img
            key={i}
            src={file.url}
            alt={file.filename}
            title={file.filename}
            className="ticket-attachment-thumb"
            onClick={() => window.open(file.url, "_blank")}
          />
        ) : (
          <div
            key={i}
            className="ticket-attachment-video"
            title={file.filename}
            onClick={() => window.open(file.url, "_blank")}
          >
            ▶
          </div>
        );
      })}
    </div>
  );
};

export default TicketAttachments;
