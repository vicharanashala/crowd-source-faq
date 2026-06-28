import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

export const PageShell = ({ children, hideFooter }: any) => {
  return (
    <div className="min-h-screen bg-brand-paper flex flex-col" data-testid="page-shell">
      <Navbar />
      <main className="flex-1">{children}</main>
      {!hideFooter && <Footer />}
    </div>
  );
};
