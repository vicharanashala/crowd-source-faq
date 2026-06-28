import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export const Footer = () => {
  const { user } = useAuth();
  const isAdminOrModerator = user?.role === "admin" || user?.role === "moderator";

  return (
    <footer className="border-t border-brand-line bg-brand-paper mt-20" data-testid="site-footer">
      <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-brand-ink flex items-center justify-center">
                <span className="font-serif text-brand-paper text-lg leading-none italic">C</span>
              </div>
              <span className="font-serif text-2xl text-brand-ink">CrowdSource FAQ</span>
            </div>
            <p className="text-brand-body text-sm max-w-sm leading-relaxed">
              A curated, community-verified knowledge base. Built so the same question never has to be answered twice.
            </p>
            <p className="label-eyebrow mt-6">EST. 2026 — VOL. 01</p>
          </div>

          <div>
            <p className="label-eyebrow mb-4">Product</p>
            <ul className="space-y-2 text-sm text-brand-body">
              <li><Link to="/" className="hover:text-brand-ink">Feed</Link></li>
              <li><Link to="/categories" className="hover:text-brand-ink">Categories</Link></li>
              <li><Link to="/analytics" className="hover:text-brand-ink">Analytics</Link></li>
              <li><Link to="/ask" className="hover:text-brand-ink">Ask a question</Link></li>
            </ul>
          </div>

          <div>
            <p className="label-eyebrow mb-4">Account</p>
            <ul className="space-y-2 text-sm text-brand-body">
              {isAdminOrModerator && (
                <>
                  <li><Link to="/admin" className="hover:text-brand-ink">Dashboard</Link></li>
                  <li><Link to="/admin/moderation" className="hover:text-brand-ink">Moderation</Link></li>
                </>
              )}
              <li><Link to="/profile" className="hover:text-brand-ink">Profile</Link></li>
              <li><Link to="/notifications" className="hover:text-brand-ink">Notifications</Link></li>
            </ul>
          </div>

          <div>
            <p className="label-eyebrow mb-4">Company</p>
            <ul className="space-y-2 text-sm text-brand-body">
              <li><a href="#" className="hover:text-brand-ink">About</a></li>
              <li><a href="#" className="hover:text-brand-ink">Changelog</a></li>
              <li><a href="#" className="hover:text-brand-ink">Privacy</a></li>
              <li><a href="#" className="hover:text-brand-ink">Terms</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-brand-line mt-12 pt-6 flex flex-col md:flex-row justify-between gap-3 text-xs text-brand-mute uppercase tracking-widest">
          <span>© 2026 CrowdSource FAQ — All knowledge belongs to the contributors.</span>
          <span>Made for the curious / Edition №01</span>
        </div>
      </div>
    </footer>
  );
};
