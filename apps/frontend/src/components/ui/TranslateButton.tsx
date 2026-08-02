import React, { useState } from 'react';
import { useTranslation } from '../../context/TranslationContext';

interface TranslateButtonProps {
  originalText: string;
  onTranslate: (translated: string | null) => void;
  className?: string;
}

export const TranslateButton: React.FC<TranslateButtonProps> = ({
  originalText,
  onTranslate,
  className = '',
}) => {
  const { targetLang, translateText, getLanguageInfo } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [isTranslated, setIsTranslated] = useState(false);

  if (targetLang === 'en') return null;

  const currentLang = getLanguageInfo(targetLang);

  const handleToggle = async () => {
    if (isTranslated) {
      setIsTranslated(false);
      onTranslate(null); // Revert to original
      return;
    }

    setLoading(true);
    try {
      const result = await translateText(originalText);
      setIsTranslated(true);
      onTranslate(result);
    } catch {
      setIsTranslated(false);
      onTranslate(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
        isTranslated
          ? 'bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20'
          : 'bg-mist text-ink-soft hover:text-ink hover:bg-mist/80 border border-border/50'
      } ${className}`}
    >
      {loading ? (
        <>
          <svg className="animate-spin h-3 w-3 text-accent" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Translating...</span>
        </>
      ) : isTranslated ? (
        <>
          <span>{currentLang.flag}</span>
          <span>Original English</span>
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span>Translate to {currentLang.nativeName}</span>
        </>
      )}
    </button>
  );
};
