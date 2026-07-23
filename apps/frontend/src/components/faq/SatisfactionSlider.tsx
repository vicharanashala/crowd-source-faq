import React, { useEffect, useState } from 'react';
import { useFaqSatisfaction, submitFaqSatisfaction } from './useFaqSatisfaction';
import {
  emojiRatingBase,
  emojiRatingIdle,
  emojiRatingSelected,
  inlineSuccessBanner,
  flexRow,
  stackXs,
  textLabelXsBold,
} from '../../styles/style_config';

interface SatisfactionSliderProps {
  faqId: string;
}

// Fixed 1–5 mapping the backend expects. Order matters — index 0 is the
// lowest rating (1), index 4 is the highest (5).
const EMOJI_OPTIONS: { emoji: string; value: number; label: string }[] = [
  { emoji: '😕', value: 1, label: 'Poor' },
  { emoji: '😐', value: 2, label: 'Okay' },
  { emoji: '🙂', value: 3, label: 'Good' },
  { emoji: '😊', value: 4, label: 'Great' },
  { emoji: '🤩', value: 5, label: 'Excellent' },
];

export default function SatisfactionSlider({ faqId }: SatisfactionSliderProps) {
  const { data } = useFaqSatisfaction(faqId);
  const [yourRating, setYourRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showThanks, setShowThanks] = useState(false);

  // Sync the viewer's existing rating once the GET resolves.
  useEffect(() => {
    if (data?.yourRating != null) {
      setYourRating(data.yourRating);
    }
  }, [data?.yourRating]);

  const handleSelect = async (value: number) => {
    if (submitting) return;
    const previous = yourRating;

    // Optimistic update — highlight immediately, per requirements.
    setYourRating(value);
    setShowThanks(false);
    setSubmitting(true);

    try {
      const res = await submitFaqSatisfaction(faqId, value);
      setYourRating(res.yourRating);
      setShowThanks(true);
    } catch (e) {
      console.error('Satisfaction submit failed:', e);
      // Restore the previous rating on failure, per requirements.
      setYourRating(previous);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`mt-6 pt-5 border-t border-border ${stackXs}`}>
      <p className={textLabelXsBold}>Was this answer helpful?</p>
      <div className={`mt-2 ${flexRow} gap-2`}>
        {EMOJI_OPTIONS.map(({ emoji, value, label }) => (
          <button
            key={value}
            type="button"
            title={`${emoji} ${label}`}
            aria-label={label}
            disabled={submitting}
            onClick={() => handleSelect(value)}
            className={`${emojiRatingBase} ${yourRating === value ? emojiRatingSelected : emojiRatingIdle}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      {showThanks && (
        <p className={`mt-2 ${inlineSuccessBanner} inline-block`}>Thanks for your feedback!</p>
      )}
    </div>
  );
}