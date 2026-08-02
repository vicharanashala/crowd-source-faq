import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../../context/TranslationContext';
import { dropdownRowHover, glassPanelStrong } from '../../styles/style_config';

export const LanguageSelector: React.FC<{ compact?: boolean; className?: string }> = ({
  compact = false,
  className = '',
}) => {
  const { targetLang, setTargetLang, supportedLanguages, getLanguageInfo } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = getLanguageInfo(targetLang);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-mist/80 hover:bg-mist border border-border/60 text-ink hover:text-accent-hover transition-all duration-200 shadow-sm cursor-pointer"
        title="Select Interface Language"
        aria-label="Language Selector"
      >
        <span className="text-sm leading-none">{currentLang.flag}</span>
        {!compact && (
          <span className="hidden sm:inline font-medium">
            {currentLang.nativeName}
          </span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-ink-soft transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 top-[2.4rem] w-48 max-h-64 overflow-y-auto ${glassPanelStrong} rounded-2xl py-1.5 shadow-xl z-50 animate-fade-in border border-border/80`}
        >
          <div className="px-3 py-1.5 border-b border-border/40">
            <p className="text-[10px] uppercase tracking-wider font-bold text-ink-faint">
              Choose Language
            </p>
          </div>
          {supportedLanguages.map((lang) => {
            const isSelected = lang.code === targetLang;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setTargetLang(lang.code);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${dropdownRowHover} ${
                  isSelected ? 'font-bold text-accent bg-accent/10' : 'text-ink-soft'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-base">{lang.flag}</span>
                  <span>{lang.nativeName}</span>
                </span>
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
