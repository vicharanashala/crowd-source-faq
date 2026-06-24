import React, { useState, useMemo } from 'react';
import { faqData } from '../data/faqData';
import * as faqService from '../services/faqService';

const urgencyBubbleColors = {
  critical: { fill: 'rgba(239,68,68,0.25)', stroke: 'rgba(239,68,68,0.6)', text: '#b91c1c' },
  high: { fill: 'rgba(249,115,22,0.2)', stroke: 'rgba(249,115,22,0.5)', text: '#c2410c' },
  medium: { fill: 'rgba(234,179,8,0.15)', stroke: 'rgba(234,179,8,0.4)', text: '#a16207' },
  low: { fill: 'rgba(34,197,94,0.12)', stroke: 'rgba(34,197,94,0.35)', text: '#15803d' },
};

const positions = {
  noc: { x: 28, y: 35 },
  internship: { x: 68, y: 25 },
  dates: { x: 50, y: 65 },
  certificate: { x: 20, y: 72 },
  vibe: { x: 78, y: 65 },
  rosetta: { x: 82, y: 40 },
};

export default function BubbleChart({ onCategoryClick }) {
  const [hovered, setHovered] = useState(null);

  // Build category data from real FAQ analytics + static data
  const categoryData = useMemo(() => {
    const allAnalytics = faqService.getAllFAQAnalytics();

    return faqData.map(cat => {
      const pos = positions[cat.id] || { x: 50, y: 50 };
      const qCount = cat.questions.length;
      
      // Sum views across all questions in this category
      const totalViews = cat.questions.reduce((acc, q) => {
        const analytics = allAnalytics[q.id] || { views: 0 };
        return acc + (q.clicks || 0) + analytics.views;
      }, 0);

      // Determine urgency from worst question in category
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const worstUrgency = cat.questions.reduce((worst, q) => {
        return (urgencyOrder[q.urgency] || 3) < (urgencyOrder[worst] || 3) ? q.urgency : worst;
      }, 'low');

      // Scale bubble size: base 44 + proportional to views (capped)
      const baseSize = 44 + qCount * 6;
      const viewBoost = Math.min(totalViews / 50, 30);
      const size = baseSize + viewBoost;

      return {
        id: cat.id,
        label: cat.category,
        questions: qCount,
        urgency: worstUrgency,
        x: pos.x,
        y: pos.y,
        size,
        totalViews,
      };
    });
  }, []);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Doubt Cluster Map</h3>
        <span className="text-xs text-slate-500">bubble size = volume</span>
      </div>

      <div className="relative w-full" style={{ paddingBottom: '62%' }}>
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 400 250"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Grid lines */}
          {[50, 100, 150, 200].map(y => (
            <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="rgba(30,41,59,0.08)" strokeWidth="1" />
          ))}
          {[100, 200, 300].map(x => (
            <line key={x} x1={x} y1="0" x2={x} y2="250" stroke="rgba(30,41,59,0.08)" strokeWidth="1" />
          ))}

          {/* Bubbles */}
          {categoryData.map(cat => {
            const cx = (cat.x / 100) * 400;
            const cy = (cat.y / 100) * 250;
            const r = cat.size * 0.38;
            const colors = urgencyBubbleColors[cat.urgency];
            const isHov = hovered === cat.id;

            return (
              <g
                key={cat.id}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(cat.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onCategoryClick(cat.id)}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHov ? r * 1.08 : r}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth={isHov ? 2 : 1.5}
                  style={{ transition: 'all 0.2s ease' }}
                />
                <text
                  x={cx}
                  y={cy - 4}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="600"
                  fill={colors.text}
                  fontFamily="Inter, sans-serif"
                >
                  {cat.label}
                </text>
                <text
                  x={cx}
                  y={cy + 8}
                  textAnchor="middle"
                  fontSize="8"
                  fill="rgba(30,41,59,0.55)"
                  fontFamily="Inter, sans-serif"
                >
                  {cat.questions} Q
                </text>

                {/* Pulse ring for critical */}
                {cat.urgency === 'critical' && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r + 6}
                    fill="none"
                    stroke="rgba(239,68,68,0.3)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {Object.entries(urgencyBubbleColors).map(([level, colors]) => (
          <div key={level} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: colors.fill, borderColor: colors.stroke }} />
            <span className="text-xs text-slate-500 capitalize">{level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
