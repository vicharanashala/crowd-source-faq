import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useBatch } from '../context/BatchContext';
import { HomeDoodles } from '../components/ui/PageDoodles';
import { getCategoryIcon, getCategoryTone } from '../components/faq/faqUtils';
import Footer from '../components/layout/Footer';

interface FAQItem {
  _id: string;
  question: string;
  answer: string;
  category: string;
  views?: number;
}

interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number;
  color: string;
  type: 'category' | 'faq';
  category?: string;
  faqId?: string;
  answer?: string;
}

interface Link {
  source: string;
  target: string;
}

export default function TopicMapPage() {
  const { currentBatch } = useBatch();
  const batchId = currentBatch?._id ?? null;
  const navigate = useNavigate();

  const [grouped, setGrouped] = useState<Record<string, FAQItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFaq, setSelectedFaq] = useState<Node | null>(null);

  // Graph interaction state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!batchId) return;
    setLoading(true);
    api.get('/faq', { params: { batchId } })
      .then((res) => {
        setGrouped(res.data.grouped || {});
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load FAQ nodes.');
      })
      .finally(() => setLoading(false));
  }, [batchId]);

  // Generate nodes and links deterministically in a circle layout
  const graphData = useMemo(() => {
    const nodes: Node[] = [];
    const links: Link[] = [];
    const categories = Object.keys(grouped);

    if (categories.length === 0) return { nodes, links };

    const centerX = 400;
    const centerY = 300;
    const categoryRadius = 180;

    categories.forEach((cat, index) => {
      const angle = (index / categories.length) * 2 * Math.PI;
      const catX = centerX + categoryRadius * Math.cos(angle);
      const catY = centerY + categoryRadius * Math.sin(angle);
      const catColor = getCategoryTone(cat).accent || '#3B82F6';

      nodes.push({
        id: cat,
        label: cat.toUpperCase(),
        x: catX,
        y: catY,
        size: 32,
        color: catColor,
        type: 'category',
      });

      const faqs = grouped[cat] || [];
      const faqRadius = 70;
      faqs.forEach((faq, faqIndex) => {
        const faqAngle = angle + ((faqIndex - (faqs.length - 1) / 2) * 0.25);
        const faqX = catX + faqRadius * Math.cos(faqAngle);
        const faqY = catY + faqRadius * Math.sin(faqAngle);

        nodes.push({
          id: faq._id,
          label: faq.question,
          x: faqX,
          y: faqY,
          size: 14,
          color: '#6B7280',
          type: 'faq',
          category: cat,
          faqId: faq._id,
          answer: faq.answer,
        });

        links.push({
          source: cat,
          target: faq._id,
        });
      });
    });

    return { nodes, links };
  }, [grouped]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click drag
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const zoomIn = () => setZoom(prev => Math.min(prev + 0.15, 2.5));
  const zoomOut = () => setZoom(prev => Math.max(prev - 0.15, 0.4));
  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-mist flex flex-col justify-center items-center">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-ink-faint">Mapping knowledge graph...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mist flex flex-col relative overflow-hidden">
      <HomeDoodles />
      
      <div className="max-w-7xl mx-auto px-4 py-8 flex-1 flex flex-col w-full z-10">
        <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-ink">Yaksha Knowledge Map</h1>
            <p className="text-ink-faint text-sm">Visually explore FAQ nodes and categories in real-time</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/faq')} className="btn-base btn-secondary">
              Back to List View
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 items-stretch">
          {/* Main Graph Viewer */}
          <div className="lg:col-span-3 card border border-border/80 bg-card/65 backdrop-blur-md rounded-3xl p-4 flex flex-col relative h-[550px] lg:h-auto select-none overflow-hidden">
            {/* Control Panel overlay */}
            <div className="absolute top-4 left-4 flex gap-1.5 z-25 bg-card/80 border border-border/40 p-1.5 rounded-xl shadow-sm">
              <button onClick={zoomIn} className="p-2 hover:bg-cream rounded-lg text-ink" title="Zoom In">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </button>
              <button onClick={zoomOut} className="p-2 hover:bg-cream rounded-lg text-ink" title="Zoom Out">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </button>
              <button onClick={resetZoom} className="p-2 hover:bg-cream rounded-lg text-ink" title="Reset View">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              </button>
            </div>

            <div 
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`flex-1 relative cursor-grab active:cursor-grabbing overflow-hidden rounded-2xl bg-cream/10`}
            >
              <svg className="w-full h-full" viewBox="0 0 800 600">
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  {/* Draw links */}
                  {graphData.links.map((link, i) => {
                    const sourceNode = graphData.nodes.find(n => n.id === link.source);
                    const targetNode = graphData.nodes.find(n => n.id === link.target);
                    if (!sourceNode || !targetNode) return null;
                    return (
                      <line
                        key={`link-${i}`}
                        x1={sourceNode.x}
                        y1={sourceNode.y}
                        x2={targetNode.x}
                        y2={targetNode.y}
                        stroke="#D1D5DB"
                        strokeWidth="1.5"
                        strokeDasharray={selectedFaq && (selectedFaq.id === targetNode.id || selectedFaq.id === sourceNode.id) ? "none" : "3,3"}
                        opacity={selectedFaq && !(selectedFaq.id === targetNode.id || selectedFaq.id === sourceNode.id) ? 0.3 : 0.8}
                      />
                    );
                  })}

                  {/* Draw nodes */}
                  {graphData.nodes.map((node) => {
                    const isSelected = selectedFaq?.id === node.id;
                    const isHovered = hoveredNode === node.id;
                    const scaleFactor = isSelected ? 1.3 : isHovered ? 1.15 : 1.0;

                    return (
                      <g 
                        key={node.id} 
                        transform={`translate(${node.x}, ${node.y})`}
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (node.type === 'faq') {
                            setSelectedFaq(node);
                          }
                        }}
                        onMouseEnter={() => setHoveredNode(node.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                      >
                        <circle
                          r={node.size * scaleFactor}
                          fill={node.color}
                          stroke={isSelected ? "#FFF" : "transparent"}
                          strokeWidth="2"
                          className="transition-transform duration-200 shadow-sm"
                          opacity={selectedFaq && selectedFaq.category !== node.category && node.id !== selectedFaq.id && node.id !== selectedFaq.category ? 0.3 : 1}
                        />
                        {node.type === 'category' ? (
                          <text
                            y="4"
                            textAnchor="middle"
                            fill="#FFFFFF"
                            fontSize="10"
                            fontWeight="bold"
                            className="pointer-events-none font-semibold select-none"
                            opacity={selectedFaq && selectedFaq.category !== node.id ? 0.3 : 1}
                          >
                            {node.label.slice(0, 3)}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          </div>

          {/* Node detail side panel */}
          <div className="lg:col-span-1 flex flex-col">
            <div className="card border border-border/80 bg-card/65 backdrop-blur-md rounded-3xl p-6 flex-1 flex flex-col justify-between">
              {selectedFaq ? (
                <div className="flex flex-col flex-1">
                  <span className="badge badge-accent uppercase text-[10px] w-fit mb-3">
                    {selectedFaq.category}
                  </span>
                  <h3 className="text-lg font-bold text-ink mb-4">{selectedFaq.label}</h3>
                  <div className="text-sm text-ink-faint flex-1 overflow-y-auto max-h-[300px] border border-border/30 rounded-xl p-3 bg-mist/30">
                    <p className="leading-relaxed whitespace-pre-line">{selectedFaq.answer}</p>
                  </div>
                  <button
                    onClick={() => navigate(`/faq/${selectedFaq.id}`)}
                    className="btn-base btn-primary w-full mt-6 flex justify-center items-center gap-1.5"
                  >
                    Open Full Page
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center items-center text-center p-6">
                  <div className="text-accent/40 w-16 h-16 mb-4 flex items-center justify-center bg-cream rounded-full">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                  </div>
                  <h3 className="text-base font-bold text-ink mb-1.5">No FAQ Node Selected</h3>
                  <p className="text-xs text-ink-faint">Click any small grey node in the knowledge graph to view its question, answer details, and options.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
