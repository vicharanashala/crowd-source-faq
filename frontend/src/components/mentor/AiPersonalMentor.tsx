import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../utils/api';
import { useBatch } from '../../context/BatchContext';

interface RecommendedFAQ {
  _id: string;
  question: string;
  questionHindi?: string;
  category: string;
}

interface RecommendedResource {
  _id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

interface MentorRecommendations {
  weakCategories: string[];
  focusTopics: string[];
  faqs: RecommendedFAQ[];
  resources: RecommendedResource[];
}

export default function AiPersonalMentor() {
  const { user, isAuthenticated } = useAuth();
  const { language } = useLanguage();
  const { currentBatch } = useBatch();
  const navigate = useNavigate();

  const [recommendations, setRecommendations] = useState<MentorRecommendations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const batchId = currentBatch?._id ?? null;

  useEffect(() => {
    if (!isAuthenticated) {
      setRecommendations(null);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    api.get<{ recommendations: MentorRecommendations }>('/mentor/recommendations', {
      params: { batchId: batchId || undefined }
    })
      .then((res) => {
        if (mounted) {
          setRecommendations(res.data.recommendations);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error('Failed to load mentor recommendations:', err);
          setError('Failed to fetch recommendations.');
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, batchId]);

  if (!isAuthenticated) {
    return (
      <div className="bg-card rounded-2xl border border-border p-6 shadow-subtle text-center">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
          <svg className="text-accent animate-pulse" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a10 10 0 0 1 7.54 16.59c-.4.45-.6.75-.6 1.16v1.25a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-.5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1.25c0-.4-.2-.7-.6-1.16A10 10 0 0 1 12 2z" />
          </svg>
        </div>
        <h3 className="font-serif text-base text-ink font-semibold">
          {language === 'hi' ? 'एआई पर्सनल मेंटर' : 'AI Personal Mentor'}
        </h3>
        <p className="text-xs text-ink-faint mt-2 leading-relaxed">
          {language === 'hi'
            ? 'अपनी पसंद और हाल ही के सर्च के आधार पर व्यक्तिगत अध्ययन सुझाव पाने के लिए कृपया साइन इन करें।'
            : 'Sign in to unlock personalized study recommendations based on your activity, searches, and doubts.'}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border p-6 shadow-subtle space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-mist" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-mist rounded w-2/3" />
            <div className="h-3 bg-mist rounded w-1/2" />
          </div>
        </div>
        <div className="space-y-2 pt-2">
          <div className="h-3 bg-mist rounded w-1/4" />
          <div className="flex gap-2">
            <div className="h-6 bg-mist rounded-full w-16" />
            <div className="h-6 bg-mist rounded-full w-20" />
          </div>
        </div>
        <div className="space-y-3 pt-3">
          <div className="h-3.5 bg-mist rounded w-1/2" />
          <div className="h-10 bg-mist rounded-xl w-full" />
          <div className="h-10 bg-mist rounded-xl w-full" />
        </div>
      </div>
    );
  }

  if (error || !recommendations) {
    return null; // Silent hide on error
  }

  const { weakCategories, focusTopics, faqs, resources } = recommendations;

  const showMentor = weakCategories.length > 0 || focusTopics.length > 0 || faqs.length > 0 || resources.length > 0;
  if (!showMentor) return null;

  return (
    <div className="bg-card rounded-2xl border border-border/80 p-5 sm:p-6 shadow-subtle relative overflow-hidden transition-all duration-300 hover:shadow-card-hover group">
      {/* Abstract decorative glow */}
      <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full bg-accent/5 blur-2xl group-hover:bg-accent/8 transition-all duration-350 pointer-events-none" />

      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0 shadow-sm">
          <svg className="text-accent" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            <path d="M12 6v6l4 2" />
            <path d="M16 16.01L16 16" />
            <path d="M8 8.01L8 8" />
            <path d="M8 12.01L8 12" />
            <path d="M16 12.01L16 12" />
          </svg>
        </div>
        <div>
          <h3 className="font-serif text-base text-ink font-semibold flex items-center gap-1.5 leading-none">
            {language === 'hi' ? 'एआई पर्सनल मेंटर' : 'AI Personal Mentor'}
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          </h3>
          <p className="text-[11px] text-ink-faint mt-1 leading-none">
            {language === 'hi' ? 'आपका व्यक्तिगत अध्ययन प्लान' : 'Your Personalized Study Plan'}
          </p>
        </div>
      </div>

      {/* Focus Topics / Weak Categories */}
      {(weakCategories.length > 0 || focusTopics.length > 0) && (
        <div className="mb-4">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-2">
            {language === 'hi' ? 'ध्यान केंद्रित करने वाले विषय' : 'Recommended Focus'}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {weakCategories.slice(0, 2).map((cat) => (
              <span
                key={cat}
                className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-accent/10 text-accent border border-accent/15 capitalize"
              >
                {cat}
              </span>
            ))}
            {focusTopics.slice(0, 2).map((topic) => (
              <span
                key={topic}
                className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-cream border border-border/70 text-ink-soft"
              >
                #{topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommended FAQs */}
      {faqs.length > 0 && (
        <div className="mb-4 space-y-2">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint">
            {language === 'hi' ? 'अनुशंसित FAQs' : 'Personalized FAQs'}
          </h4>
          <div className="space-y-1.5">
            {faqs.map((faq) => {
              const displayQuestion = language === 'hi' && faq.questionHindi ? faq.questionHindi : faq.question;
              return (
                <button
                  key={faq._id}
                  onClick={() => navigate(`/faq/${faq._id}`)}
                  className="w-full text-left p-2.5 rounded-xl bg-cream/30 hover:bg-cream/70 border border-border/40 hover:border-accent/25 transition-all text-xs text-ink font-medium flex items-start gap-2 group/item"
                >
                  <svg className="text-accent shrink-0 mt-0.5 group-hover/item:translate-x-0.5 transition-transform" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className="line-clamp-2 leading-relaxed">{displayQuestion}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommended Resources */}
      {resources.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint">
            {language === 'hi' ? 'अनुशंसित स्रोत' : 'Suggested Resources'}
          </h4>
          <div className="space-y-1.5">
            {resources.map((res) => (
              <div
                key={res._id}
                className="p-2.5 rounded-xl bg-cream/20 border border-border/30 text-xs flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-ink-soft">
                    {res.fileType === 'pdf' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" /><rect x="9" y="9" width="6" height="6" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate font-medium text-ink-soft" title={res.title || res.fileName}>
                    {res.title || res.fileName}
                  </span>
                </div>
                <span className="text-[10px] text-ink-faint shrink-0 uppercase">
                  {res.fileType}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
