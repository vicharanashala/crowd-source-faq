import React from 'react';
import { FAQItem, getQuestionTitle, getAnswerText, formatDate, getCategoryIcon, formatCategoryName, TrustBadge } from './faqUtils';
import ReportFAQButton from './ReportFAQButton';
import FreshnessBadge from '../faq/FreshnessBadge';
import CodeSandbox from './CodeSandbox';

import api from '../../utils/api';

interface QuestionDetailProps {
  item: FAQItem;
  relatedItems: FAQItem[];
  onBack: () => void;
  onSelectRelated: (item: FAQItem) => void;
  backLabel?: string;
}

export default function QuestionDetail({ item, relatedItems, onBack, onSelectRelated, backLabel }: QuestionDetailProps) {
  const title = getQuestionTitle(item);
  const prefix = item.questionNumber ? `${item.questionNumber}. ` : '';
  const answer = getAnswerText(item);
  const metaDate = formatDate(item?.updatedAt || item?.createdAt);
  const sourceLabel = item?.source ? (item.source === 'faq' ? 'FAQ' : 'Community') : '';
  const trustLevel = item?.trustLevel;
  const highlight = answer ? answer.split('. ').slice(0, 1).join('. ') : '';

  const [isPlaying, setIsPlaying] = React.useState(false);
  const [selectedLanguage, setSelectedLanguage] = React.useState('English');
  const [translating, setTranslating] = React.useState(false);
  const [displayTitle, setDisplayTitle] = React.useState(title);
  const [displayAnswer, setDisplayAnswer] = React.useState(answer);

  const sandboxCode = React.useMemo(() => {
    if (!displayAnswer) return '';
    const match = displayAnswer.match(/```(?:html|javascript|js)?([\s\S]+?)```/);
    return match ? match[1].trim() : '';
  }, [displayAnswer]);

  React.useEffect(() => {
    setDisplayTitle(title);
    setDisplayAnswer(answer);
    setSelectedLanguage('English');
  }, [item, title, answer]);

  const handleLanguageChange = async (lang: string) => {
    if (lang === 'English') {
      setDisplayTitle(title);
      setDisplayAnswer(answer);
      setSelectedLanguage('English');
      return;
    }
    setTranslating(true);
    try {
      const res = await api.post<{ question: string; answer: string }>(`/faq/${item._id}/translate`, {
        targetLanguage: lang
      });
      setDisplayTitle(res.data.question);
      setDisplayAnswer(res.data.answer);
      setSelectedLanguage(lang);
    } catch {
      // Ignore fallback
    } finally {
      setTranslating(false);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      window.speechSynthesis.cancel();
      const textToSpeak = `${displayTitle}. ${displayAnswer}`;
      const utterance = new SpeechSynthesisUtterance(textToSpeak);

      // Select best matching voice for the target language
      const voices = window.speechSynthesis.getVoices();
      let langCode = 'en-US';
      if (selectedLanguage === 'Hindi') langCode = 'hi-IN';
      else if (selectedLanguage === 'Spanish') langCode = 'es-ES';
      else if (selectedLanguage === 'French') langCode = 'fr-FR';
      else if (selectedLanguage === 'Telugu') langCode = 'te-IN';

      const matchedVoice = voices.find(v => v.lang.startsWith(langCode));
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }
      utterance.lang = langCode;

      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    }
  };

  React.useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6">
      <aside className="hidden lg:flex flex-col gap-4">
        <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Category</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-ink">
            <span className="w-8 h-8 rounded-xl bg-mist flex items-center justify-center text-ink-faint">
              {getCategoryIcon(item?.category || '')}
            </span>
            <span>{item?.categoryNumber ? `${item.categoryNumber}. ` : ''}{formatCategoryName(item?.category || 'General')}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Related questions</p>
          <div className="mt-3 space-y-2">
            {relatedItems.length === 0 && (
              <p className="text-xs text-ink-soft">No related questions yet.</p>
            )}
            {relatedItems.map((rel) => (
              <button
                key={rel._id}
                onClick={() => onSelectRelated(rel)}
                className="w-full text-left text-xs text-ink hover:text-accent transition-colors line-clamp-2"
              >
                {rel.questionNumber ? `${rel.questionNumber}. ` : ''}{getQuestionTitle(rel)}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="bg-card rounded-2xl border border-border shadow-subtle p-6">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {backLabel || 'Back'}
          </button>

          <div className="flex items-center gap-2">
            <select
              value={selectedLanguage}
              disabled={translating}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-mist border border-border text-xs text-ink-soft focus:outline-none focus:ring-1 focus:ring-accent/40 font-semibold cursor-pointer"
            >
              <option value="English">🇺🇸 English</option>
              <option value="Hindi">🇮🇳 Hindi</option>
              <option value="Spanish">🇪🇸 Spanish</option>
              <option value="French">🇫🇷 French</option>
              <option value="Telugu">🇮🇳 Telugu</option>
            </select>

            <button
              type="button"
              onClick={togglePlay}
              disabled={translating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold transition-all disabled:opacity-55"
            >
              {translating ? (
                <>
                  <span className="shrink-0 w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /> Translating...
                </>
              ) : isPlaying ? (
                <>
                  <span>⏹️</span> Stop Listening
                </>
              ) : (
                <>
                  <span>🔊</span> Listen to Answer
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {sourceLabel && (
            <span className="px-2.5 py-1 rounded-full bg-mist text-[11px] font-semibold text-ink-soft">
              {sourceLabel}
            </span>
          )}
          {metaDate && (
            <span className="text-[11px] text-ink-faint">Updated {metaDate}</span>
          )}
          {item?.source === 'faq' && (
            <FreshnessBadge
              reviewStatus={item.reviewStatus}
              lastVerifiedDate={item.lastVerifiedDate}
              reviewIntervalDays={item.reviewIntervalDays ?? 0}
              freshnessTier={item.freshnessTier}
            />
          )}
        </div>

        <h2 className="mt-4 text-xl font-semibold text-ink leading-snug">
          <span className="text-ink-faint mr-2 tabular-nums">{prefix}</span>
          {displayTitle}
          {trustLevel && <TrustBadge level={trustLevel} />}
        </h2>

        {displayAnswer ? (
          <div className="mt-4 space-y-4 text-sm text-ink-soft leading-relaxed whitespace-pre-wrap">
            {displayAnswer}
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">No answer available yet.</p>
        )}

        {sandboxCode && (
          <div className="mt-6">
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide mb-2.5">Interactive Playground</p>
            <CodeSandbox initialCode={sandboxCode} />
          </div>
        )}

        {highlight && (
          <div className="mt-5 rounded-xl border border-accent/15 bg-accent-light p-4">
            <p className="text-[11px] font-semibold text-accent uppercase tracking-wide">Key takeaway</p>
            <p className="mt-2 text-sm text-ink/70">{highlight}.</p>
          </div>
        )}

        {relatedItems.length > 0 && (
          <div className="mt-6">
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">Related questions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {relatedItems.map((rel) => (
                <button
                  key={rel._id}
                  onClick={() => onSelectRelated(rel)}
                  className="px-3 py-1.5 rounded-full border border-border/70 bg-card text-xs text-ink hover:border-accent/50 hover:text-accent transition-colors"
                >
                  {rel.questionNumber ? `${rel.questionNumber}. ` : ''}{getQuestionTitle(rel)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Report FAQ */}
        <ReportFAQButton item={item} />
      </div>
    </div>
  );
}
