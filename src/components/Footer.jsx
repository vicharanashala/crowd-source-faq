import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, ExternalLink } from 'lucide-react';
import { ScrollReveal } from './ui/Interactions';

const links = [
  { label: 'Home', href: '/' },
  { label: 'FAQs', href: '/faq' },
  { label: 'Programme Guide', href: '/' },
];

const socials = [
  { label: 'Website', href: 'https://samagama.in/' },
  { label: 'Contact', href: 'mailto:info@vicharanashala.org' },
];

export default function Footer() {
  return (
    <ScrollReveal>
      <footer className="premium-footer mt-auto border-t border-[#e2dccb]">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <p className="text-sm font-bold text-[#1c2333] tracking-widest uppercase">Vicharanashala</p>
              <p className="text-xs text-[#7c7260] mt-1">Lab for Education Design · IIT Ropar</p>
            </div>

            <nav className="flex flex-wrap gap-x-6 gap-y-2">
              {links.map(link => (
                <Link
                  key={link.label}
                  to={link.href}
                  className="footer-link text-xs text-[#5b5447] hover:text-[#1c2333] transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              {socials.map(s => (
                <a
                  key={s.label}
                  href={s.href}
                  target={s.href.startsWith('mailto') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  className="footer-social w-9 h-9 rounded-lg border border-[#e2dccb] bg-white flex items-center justify-center text-[#7c7260] hover:text-[#c9a13b] hover:border-[#c9a13b]/40 transition-all"
                  title={s.label}
                >
                  {s.label === 'Contact' ? <Mail size={15} /> : <ExternalLink size={15} />}
                </a>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-[#e2dccb]/60 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-[11px] text-[#9a9077]">© 2026 Vicharanashala Internship Programme</p>
            <p className="text-[11px] text-[#9a9077]">Built for students, by students</p>
          </div>
        </div>
      </footer>
    </ScrollReveal>
  );
}
