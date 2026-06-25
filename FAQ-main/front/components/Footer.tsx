import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer">
      <span className="footer-copy">© 2025 Vicharanashala · IIT Ropar</span>
      <div className="footer-links">
        <Link className="footer-link" href="/faqs">FAQs</Link>
        <Link className="footer-link" href="/posts">Discuss</Link>
        <Link className="footer-link" href="/ask">Ask</Link>
        <Link className="footer-link" href="/ai-chat">AI Chat</Link>
        <a className="footer-link" href="https://www.iitrpr.ac.in" target="_blank" rel="noopener noreferrer">IIT Ropar ↗</a>
      </div>
      <div className="footer-badge">
        <div className="stat-dot" />
        Community · AI · Open Knowledge
      </div>
    </footer>
  );
}
