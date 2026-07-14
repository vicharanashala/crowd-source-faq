import React, { useMemo } from 'react';
import type { TrendingQuery } from '../../types/ui';

interface WordCloudProps {
  words?: TrendingQuery[];
  onWordClick?: (query: string) => void;
  maxWords?: number;
}

interface ProcessedWord extends TrendingQuery {
  fontSize: string;
  opacity: number;
  color: string;
  rotation: number;
  weight: number;
}

export default function WordCloud({ words = [], onWordClick, maxWords = 40 }: WordCloudProps) {
  const processedWords = useMemo<ProcessedWord[]>(() => {
    if (!words.length) return [];

    const sorted = [...words]
      .sort((a, b) => b.count - a.count)
      .slice(0, maxWords);

    const maxCount = sorted[0]?.count || 1;
    const minCount = sorted[sorted.length - 1]?.count || 1;
    const range = maxCount - minCount || 1;

    const colors = [
      'var(--color-accent, #5A7A5A)',
      '#6B8F6B',
      '#8BA88B',
      '#4A6A4A',
      '#7C9A7C',
      '#3D5E3D',
      '#97B397',
      '#2F4F2F',
    ];

    const rotations = [0, 0, 0, -8, 8, -4, 4, -12, 12];

    return sorted.map((word, i) => {
      const normalized = (word.count - minCount) / range;
      const fontSize = 0.7 + normalized * 1.8;
      const opacity = 0.5 + normalized * 0.5;
      const color = colors[i % colors.length];
      const rotation = rotations[i % rotations.length];

      return {
        ...word,
        fontSize: `${fontSize}rem`,
        opacity,
        color,
        rotation,
        weight: normalized > 0.6 ? 700 : normalized > 0.3 ? 600 : 500,
      };
    });
  }, [words, maxWords]);

  if (!processedWords.length) {
    return (
      <div className="word-cloud-empty">
        <p className="text-xs text-ink-soft">No search data available yet.</p>
      </div>
    );
  }

  return (
    <div className="word-cloud" role="list" aria-label="Popular search queries word cloud">
      {processedWords.map((word, i) => (
        <button
          key={word.query + i}
          role="listitem"
          onClick={() => onWordClick?.(word.query)}
          className="word-cloud-item"
          style={{
            fontSize: word.fontSize,
            opacity: word.opacity,
            color: word.color,
            fontWeight: word.weight,
            '--rotation': `${word.rotation}deg`,
          } as React.CSSProperties & { '--rotation': string }}
          title={`"${word.query}" — ${word.count} searches`}
        >
          {word.query}
        </button>
      ))}
    </div>
  );
}