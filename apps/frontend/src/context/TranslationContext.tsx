import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'kn', name: 'Kannada', nativeName: 'कन्नड', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇮🇳' },
];

interface TranslationContextType {
  targetLang: string;
  setTargetLang: (lang: string) => void;
  translateText: (text: string, langOverride?: string) => Promise<string>;
  batchTranslate: (texts: string[], langOverride?: string) => Promise<string[]>;
  supportedLanguages: Language[];
  getLanguageInfo: (code: string) => Language;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

// Local in-memory cache for ultra-fast instant UI re-renders
const clientCache = new Map<string, string>();

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [targetLang, setTargetLangState] = useState<string>(() => {
    try {
      return localStorage.getItem('csfaq_target_lang') || 'en';
    } catch {
      return 'en';
    }
  });

  const setTargetLang = (lang: string) => {
    setTargetLangState(lang);
    try {
      localStorage.setItem('csfaq_target_lang', lang);
    } catch {
      void 0;
    }
  };

  const getLanguageInfo = (code: string): Language => {
    return SUPPORTED_LANGUAGES.find((l) => l.code === code) || SUPPORTED_LANGUAGES[0];
  };

  const translateText = async (text: string, langOverride?: string): Promise<string> => {
    const lang = langOverride || targetLang;
    if (!text || lang === 'en') return text;

    const cacheKey = `${lang}:${text}`;
    if (clientCache.has(cacheKey)) {
      return clientCache.get(cacheKey)!;
    }

    try {
      const response = await axios.post<{ translatedText: string }>('/csfaq/api/translate', {
        text,
        targetLang: lang,
        sourceLang: 'en',
      });
      const result = response.data?.translatedText || text;
      clientCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.warn('[TranslationContext] Translation request failed:', error);
      return text;
    }
  };

  const batchTranslate = async (texts: string[], langOverride?: string): Promise<string[]> => {
    const lang = langOverride || targetLang;
    if (!texts.length || lang === 'en') return texts;

    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];
    const results = new Array<string>(texts.length);

    texts.forEach((txt, idx) => {
      const key = `${lang}:${txt}`;
      if (clientCache.has(key)) {
        results[idx] = clientCache.get(key)!;
      } else {
        uncachedIndices.push(idx);
        uncachedTexts.push(txt);
      }
    });

    if (uncachedTexts.length === 0) {
      return results;
    }

    try {
      const response = await axios.post<{ translations: string[] }>('/csfaq/api/translate/batch', {
        texts: uncachedTexts,
        targetLang: lang,
        sourceLang: 'en',
      });
      const translations = response.data?.translations || uncachedTexts;
      uncachedIndices.forEach((origIdx, batchIdx) => {
        const trans = translations[batchIdx] || uncachedTexts[batchIdx];
        results[origIdx] = trans;
        clientCache.set(`${lang}:${texts[origIdx]}`, trans);
      });
      return results;
    } catch (error) {
      console.warn('[TranslationContext] Batch translation failed:', error);
      uncachedIndices.forEach((origIdx, batchIdx) => {
        results[origIdx] = uncachedTexts[batchIdx];
      });
      return results;
    }
  };

  return (
    <TranslationContext.Provider
      value={{
        targetLang,
        setTargetLang,
        translateText,
        batchTranslate,
        supportedLanguages: SUPPORTED_LANGUAGES,
        getLanguageInfo,
      }}
    >
      {children}
    </TranslationContext.Provider>
  );
};

export const useTranslation = (): TranslationContextType => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
};
