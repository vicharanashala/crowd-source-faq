import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize,
  X,
  BookOpen,
  ArrowLeft,
  Info,
  Tag,
  Bookmark,
  Award
} from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import api from '../utils/api';
import { useBatch } from '../context/BatchContext';
import { slugifyProgramName } from '../utils/programSlug';
import type { ProgramResponse } from '../types/program';
import { programThemeStyles } from '../utils/programTheme';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  type: 'faq' | 'category';
  category?: string;
  tags?: string[];
  answer?: string;
  // Physics properties
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  radius: number;
  // Hover & selection visual state
  isHighlighted?: boolean;
  isSecondaryHighlighted?: boolean;
  isFaded?: boolean;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'category_link' | 'semantic_link';
  similarity?: number;
}

interface KnowledgeMapData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  batchId: string | null;
}

export default function KnowledgeMapPage() {
  const { slug } = useParams<{ slug: string }>();
  const { currentBatch, setCurrentBatch } = useBatch();
  const navigate = useNavigate();

  // ─── API States ────────────────────────────────────────────────────────────
  const [programData, setProgramData] = useState<ProgramResponse | null>(null);
  const [mapData, setMapData] = useState<KnowledgeMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── UI Interactions ───────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  // Canvas ref & transform state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transformRef = useRef({ x: 0, y: 0, zoom: 1 });
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const requestRef = useRef<number | null>(null);

  // Drag states
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const transformStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggedNodeRef = useRef<GraphNode | null>(null);

  // Resolve the program slug
  const effectiveSlug = useMemo<string | null>(() => {
    if (slug) return slug;
    if (currentBatch?.name) return slugifyProgramName(currentBatch.name);
    return null;
  }, [slug, currentBatch?.name]);

  // ─── Fetch Program Data ────────────────────────────────────────────────────
  useEffect(() => {
    if (!effectiveSlug) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await api.get<ProgramResponse>(`/programs/${encodeURIComponent(effectiveSlug)}`);
        setProgramData(res.data);
        setCurrentBatch(res.data.program._id);
      } catch (e: unknown) {
        setError('This program is unavailable or has been archived.');
      }
    })();
  }, [effectiveSlug, setCurrentBatch]);

  // ─── Fetch Map Data ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!programData) return;
    (async () => {
      try {
        const res = await api.get<KnowledgeMapData>('/public/knowledge-map', {
          params: { batchId: programData.program._id }
        });
        
        // Add physics attributes to raw nodes
        const rawNodes = res.data.nodes || [];
        const rawEdges = res.data.edges || [];
        
        // Category arrangement: place categories in a circle around (0,0)
        const categories = rawNodes.filter(n => n.type === 'category');
        const numCats = categories.length;
        const circleRadius = 150; // spread radius

        const catCoords: Record<string, { x: number; y: number }> = {};

        categories.forEach((cat, idx) => {
          const angle = (idx * 2 * Math.PI) / numCats;
          cat.x = circleRadius * Math.cos(angle);
          cat.y = circleRadius * Math.sin(angle);
          cat.vx = 0;
          cat.vy = 0;
          cat.radius = 18;
          catCoords[cat.label] = { x: cat.x, y: cat.y };
        });

        // FAQ nodes: place them close to their category node
        const faqs = rawNodes.filter(n => n.type === 'faq');
        faqs.forEach(faq => {
          const cat = faq.category || 'Other';
          const coords = catCoords[cat] || { x: 0, y: 0 };
          faq.x = coords.x + (Math.random() - 0.5) * 60;
          faq.y = coords.y + (Math.random() - 0.5) * 60;
          faq.vx = 0;
          faq.vy = 0;
          faq.radius = 8;
        });

        nodesRef.current = rawNodes;
        edgesRef.current = rawEdges;
        setMapData(res.data);
      } catch (e) {
        console.error('Failed to load visual map data:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [programData]);

  // Center Graph / Fit view
  const fitGraphToScreen = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodesRef.current.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Calculate bounding box of nodes
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    nodesRef.current.forEach(n => {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });

    const graphWidth = maxX - minX || 100;
    const graphHeight = maxY - minY || 100;
    const graphCenterX = minX + graphWidth / 2;
    const graphCenterY = minY + graphHeight / 2;

    const padding = 100;
    const scaleX = (width - padding * 2) / graphWidth;
    const scaleY = (height - padding * 2) / graphHeight;
    const zoom = Math.max(0.3, Math.min(1.2, Math.min(scaleX, scaleY)));

    transformRef.current = {
      x: width / 2 - graphCenterX * zoom,
      y: height / 2 - graphCenterY * zoom,
      zoom
    };
  }, []);

  // Trigger fit view once map is loaded and canvas dimensions are set
  useEffect(() => {
    if (mapData) {
      setTimeout(() => fitGraphToScreen(), 100);
    }
  }, [mapData, fitGraphToScreen]);

  // ─── Physics Simulation & Drawing loop ──────────────────────────────────────
  useEffect(() => {
    if (!mapData) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Setup canvas resolution based on device pixel ratio
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Physics parameters
    const kRepel = 240;
    const kAttract = 0.04;
    const kGravity = 0.005;
    const friction = 0.85;

    const tick = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const canvasRect = canvas.getBoundingClientRect();
      const width = canvasRect.width;
      const height = canvasRect.height;

      // 1. Repulsive forces (charge repulsion)
      for (let i = 0; i < nodes.length; i++) {
        const nodeA = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeB = nodes[j];
          let dx = nodeB.x - nodeA.x;
          let dy = nodeB.y - nodeA.y;
          // Avoid division by zero
          if (dx === 0 && dy === 0) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
          }
          const distance = Math.sqrt(dx * dx + dy * dy);
          const distClamped = Math.max(distance, 1.0);
          
          // Repulsion force uses linear decay for a stable and dispersed layout
          const force = kRepel / distClamped;

          const ax = (dx / distClamped) * force;
          const ay = (dy / distClamped) * force;

          nodeA.vx -= ax;
          nodeA.vy -= ay;
          nodeB.vx += ax;
          nodeB.vy += ay;

          // Direct collision prevention to prevent label overlaps
          const minSeparation = nodeA.radius + nodeB.radius + 35; // extra spacing for text tags
          if (distance < minSeparation) {
            const overlap = minSeparation - distance;
            const pushX = (dx / distClamped) * overlap * 0.35;
            const pushY = (dy / distClamped) * overlap * 0.35;
            nodeA.x -= pushX;
            nodeA.y -= pushY;
            nodeB.x += pushX;
            nodeB.y += pushY;
          }
        }
      }

      // 2. Attractive forces (spring connections)
      edges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        if (!sourceNode || !targetNode) return;

        const dx = targetNode.x - sourceNode.x;
        const dy = targetNode.y - sourceNode.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.1;

        // Ideal length for spring
        const targetLen = edge.type === 'category_link' ? 60 : 110;
        const force = kAttract * (distance - targetLen);

        const ax = (dx / distance) * force;
        const ay = (dy / distance) * force;

        sourceNode.vx += ax;
        sourceNode.vy += ay;
        targetNode.vx -= ax;
        targetNode.vy -= ay;
      });

      // 3. Central Force (pulls towards physical center (0,0) of layout origin)
      nodes.forEach(node => {
        const dx = 0 - node.x;
        const dy = 0 - node.y;
        node.vx += dx * kGravity;
        node.vy += dy * kGravity;
      });

      // 4. Update Node Positions & Velocities
      nodes.forEach(node => {
        if (node.fx !== undefined && node.fx !== null && node.fy !== undefined && node.fy !== null) {
          node.x = node.fx;
          node.y = node.fy;
          node.vx = 0;
          node.vy = 0;
        } else {
          node.vx *= friction;
          node.vy *= friction;
          node.x += node.vx;
          node.y += node.vy;
        }
      });

      // ─── Dynamic Highlighting & Fading logic ───
      const hasSearch = searchQuery.trim().length > 0;
      const query = searchQuery.toLowerCase().trim();

      const highlightedNodeIds = new Set<string>();
      const secondaryNodeIds = new Set<string>();

      if (selectedNode) {
        highlightedNodeIds.add(selectedNode.id);
        // Direct connections
        edges.forEach(e => {
          if (e.source === selectedNode.id) secondaryNodeIds.add(e.target);
          if (e.target === selectedNode.id) secondaryNodeIds.add(e.source);
        });
      } else if (hasSearch) {
        nodes.forEach(node => {
          const matchLabel = node.label.toLowerCase().includes(query);
          const matchAnswer = node.answer?.toLowerCase().includes(query) || false;
          const matchTags = node.tags?.some(t => t.toLowerCase().includes(query)) || false;
          if (matchLabel || matchAnswer || matchTags) {
            highlightedNodeIds.add(node.id);
          }
        });
      }

      nodes.forEach(node => {
        node.isHighlighted = highlightedNodeIds.has(node.id);
        node.isSecondaryHighlighted = secondaryNodeIds.has(node.id);
        node.isFaded = (selectedNode || hasSearch) && !node.isHighlighted && !node.isSecondaryHighlighted;
      });

      // ─── Drawing ───
      ctx.clearRect(0, 0, width, height);

      // Apply zoom & pan translation
      ctx.save();
      const transform = transformRef.current;
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.zoom, transform.zoom);

      // Check current theme colors
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const edgeColorCategory = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(60, 42, 30, 0.08)';
      const edgeColorSemantic = isDark ? 'rgba(255, 107, 74, 0.3)' : 'rgba(184, 133, 102, 0.4)';
      const edgeColorSemanticHighlight = isDark ? 'rgba(255, 107, 74, 0.85)' : 'rgba(184, 133, 102, 0.85)';

      // 1. Draw Edges
      edges.forEach(edge => {
        const s = nodes.find(n => n.id === edge.source);
        const t = nodes.find(n => n.id === edge.target);
        if (!s || !t) return;

        const isHighlightedEdge =
          (selectedNode && (s.id === selectedNode.id || t.id === selectedNode.id)) ||
          (!selectedNode && hasSearch && s.isHighlighted && t.isHighlighted);

        const isFadedEdge = (selectedNode || hasSearch) && !isHighlightedEdge;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);

        if (edge.type === 'category_link') {
          ctx.strokeStyle = edgeColorCategory;
          ctx.lineWidth = isHighlightedEdge ? 2 : 1;
          ctx.setLineDash([]);
        } else {
          // Semantic link: dashed neon line
          ctx.strokeStyle = isHighlightedEdge ? edgeColorSemanticHighlight : edgeColorSemantic;
          ctx.lineWidth = isHighlightedEdge ? 2.5 : 1.5;
          ctx.setLineDash([4, 4]);
        }

        if (isFadedEdge) {
          ctx.globalAlpha = 0.15;
        } else {
          ctx.globalAlpha = 1;
        }

        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]); // Reset dash
      });

      // 2. Draw Nodes
      nodes.forEach(node => {
        const isHovered = hoveredNode?.id === node.id;
        let radius = node.radius;

        // Animate radius slightly on hover/highlight
        if (isHovered || node.isHighlighted) radius += 3;

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);

        if (node.isFaded) {
          ctx.globalAlpha = 0.25;
        } else {
          ctx.globalAlpha = 1;
        }

        // Color nodes
        if (node.type === 'category') {
          // Category node: large and solid
          ctx.fillStyle = isDark ? 'rgba(255, 107, 74, 0.15)' : 'rgba(184, 133, 102, 0.15)';
          ctx.strokeStyle = isDark ? '#FF6B4A' : '#B88566';
          ctx.lineWidth = node.isHighlighted ? 3 : 2;
          ctx.fill();
          ctx.stroke();

          // Draw small inner circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius * 0.4, 0, 2 * Math.PI);
          ctx.fillStyle = isDark ? '#FF6B4A' : '#B88566';
          ctx.fill();
        } else {
          // FAQ node: smaller, distinct color
          ctx.fillStyle = isDark ? '#191C21' : '#FFF2E6';
          ctx.strokeStyle = isDark ? '#9CA3AF' : '#8C7D70';
          ctx.lineWidth = 1.5;

          if (node.isHighlighted) {
            ctx.strokeStyle = isDark ? '#FF6B4A' : '#B88566';
            ctx.lineWidth = 2.5;
          } else if (node.isSecondaryHighlighted) {
            ctx.strokeStyle = isDark ? '#FF856B' : '#C49882';
            ctx.lineWidth = 2;
          }

          ctx.fill();
          ctx.stroke();
        }

        // 3. Draw Text Labels
        const drawLabel =
          node.type === 'category' ||
          isHovered ||
          node.isHighlighted ||
          node.isSecondaryHighlighted ||
          transform.zoom >= 0.8;

        if (drawLabel) {
          ctx.font = node.type === 'category' ? 'bold 11px sans-serif' : '9px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          // Set text fill color
          if (node.type === 'category') {
            ctx.fillStyle = isDark ? '#EDEDED' : '#3C2A1E';
          } else {
            ctx.fillStyle = isDark ? '#A0AEC0' : '#6A5445';
          }

          // Truncate long question texts
          let text = node.label;
          if (node.type === 'faq' && text.length > 30) {
            text = text.substring(0, 28) + '...';
          }

          // Draw text backdrop for legibility
          const textWidth = ctx.measureText(text).width;
          ctx.fillStyle = isDark ? 'rgba(10, 11, 14, 0.85)' : 'rgba(251, 237, 224, 0.85)';
          ctx.fillRect(node.x - textWidth / 2 - 4, node.y + radius + 3, textWidth + 8, 14);

          // Fill actual text
          ctx.fillStyle = isDark ? (node.isHighlighted ? '#FF6B4A' : '#EDEDED') : (node.isHighlighted ? '#B88566' : '#3C2A1E');
          ctx.fillText(text, node.x, node.y + radius + 5);
        }

        ctx.globalAlpha = 1;
      });

      ctx.restore();

      requestRef.current = requestAnimationFrame(tick);
    };

    requestRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [mapData, searchQuery, selectedNode, hoveredNode]);

  // ─── Mouse event coordinates helper ─────────────────────────────────────────
  const getCanvasMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    // Local mouse coordinates on client rect
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // Translate back through zoom and pan
    const transform = transformRef.current;
    return {
      x: (clientX - transform.x) / transform.zoom,
      y: (clientY - transform.y) / transform.zoom
    };
  };

  const getClientMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  // Find node under mouse coordinates
  const findNodeAtPos = (x: number, y: number) => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const dx = node.x - x;
      const dy = node.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= node.radius + 6) {
        return node;
      }
    }
    return null;
  };

  // ─── Canvas Interaction Handlers ───────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvasMouse = getCanvasMousePos(e);
    const clientMouse = getClientMousePos(e);
    const clickedNode = findNodeAtPos(canvasMouse.x, canvasMouse.y);

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      clickedNode.fx = canvasMouse.x;
      clickedNode.fy = canvasMouse.y;
    } else {
      // Pan start
      dragStartRef.current = { x: clientMouse.x, y: clientMouse.y };
      transformStartRef.current = { x: transformRef.current.x, y: transformRef.current.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvasMouse = getCanvasMousePos(e);
    const clientMouse = getClientMousePos(e);

    // Node Dragging
    if (draggedNodeRef.current) {
      const node = draggedNodeRef.current;
      node.fx = canvasMouse.x;
      node.fy = canvasMouse.y;
      return;
    }

    // Panning
    if (dragStartRef.current && transformStartRef.current) {
      const dx = clientMouse.x - dragStartRef.current.x;
      const dy = clientMouse.y - dragStartRef.current.y;
      transformRef.current = {
        ...transformRef.current,
        x: transformStartRef.current.x + dx,
        y: transformStartRef.current.y + dy
      };
      return;
    }

    // Update Hover state
    const nodeUnderMouse = findNodeAtPos(canvasMouse.x, canvasMouse.y);
    setHoveredNode(nodeUnderMouse);
    
    // Change cursor
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = nodeUnderMouse ? 'pointer' : 'grab';
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedNodeRef.current) {
      // Release node
      draggedNodeRef.current.fx = null;
      draggedNodeRef.current.fy = null;
      draggedNodeRef.current = null;
    }

    // Reset panning
    dragStartRef.current = null;
    transformStartRef.current = null;
  };

  const handleMouseClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvasMouse = getCanvasMousePos(e);
    const clickedNode = findNodeAtPos(canvasMouse.x, canvasMouse.y);

    if (clickedNode) {
      if (clickedNode.type === 'faq') {
        setSelectedNode(clickedNode);
      }
    } else {
      setSelectedNode(null);
    }
  };

  // Zoom on scroll wheel
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const transform = transformRef.current;
    const mouseCanvasX = (clientX - transform.x) / transform.zoom;
    const mouseCanvasY = (clientY - transform.y) / transform.zoom;

    // Zoom speed
    const zoomFactor = 1.05;
    let nextZoom = e.deltaY < 0 ? transform.zoom * zoomFactor : transform.zoom / zoomFactor;
    nextZoom = Math.max(0.15, Math.min(4, nextZoom));

    transformRef.current = {
      zoom: nextZoom,
      x: clientX - mouseCanvasX * nextZoom,
      y: clientY - mouseCanvasY * nextZoom
    };
  };

  // Button Zoom Helpers
  const zoomIn = () => {
    const transform = transformRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const canvasCenterX = (centerX - transform.x) / transform.zoom;
    const canvasCenterY = (centerY - transform.y) / transform.zoom;

    const nextZoom = Math.min(4, transform.zoom * 1.25);
    transformRef.current = {
      zoom: nextZoom,
      x: centerX - canvasCenterX * nextZoom,
      y: centerY - canvasCenterY * nextZoom
    };
  };

  const zoomOut = () => {
    const transform = transformRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const canvasCenterX = (centerX - transform.x) / transform.zoom;
    const canvasCenterY = (centerY - transform.y) / transform.zoom;

    const nextZoom = Math.max(0.15, transform.zoom / 1.25);
    transformRef.current = {
      zoom: nextZoom,
      x: centerX - canvasCenterX * nextZoom,
      y: centerY - canvasCenterY * nextZoom
    };
  };

  // ─── Render States ─────────────────────────────────────────────────────────

  if (loading && !programData) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-ink-soft">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          <p className="text-sm">Loading Visual Topic Map…</p>
        </div>
      </div>
    );
  }

  if (error || !programData) {
    return (
      <div className="bg-bg text-ink min-h-screen">
        <div className="max-w-md mx-auto pt-32 px-4 text-center">
          <h1 className="font-serif text-3xl text-ink mb-3">Topic Map Unavailable</h1>
          <p className="text-sm text-ink-soft mb-6">{error ?? 'This program does not exist.'}</p>
          <Link to="/programs" className="px-5 py-2.5 rounded-full bg-accent text-accent-text text-sm font-semibold">Browse programs</Link>
        </div>
      </div>
    );
  }

  const { program, settings } = programData;
  const theme = programThemeStyles(settings.theme);

  return (
    <div
      className="min-h-screen text-ink flex flex-col relative z-0 overflow-hidden"
      style={{
        background: theme.backgroundCss,
        fontFamily: theme.fontCss,
      }}
    >
      <Navbar />

      {/* ─── Map Workspace ───────────────────────────────────────────────── */}
      <div className="flex-1 relative flex mt-16 sm:mt-20">
        
        {/* HTML5 Canvas */}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleMouseClick}
          onWheel={handleWheel}
          className="absolute inset-0 w-full h-full block touch-none z-0"
        />

        {/* ─── Left Rail Navigation & Header Overlay ───────────────────────── */}
        <div className="absolute top-4 left-4 z-10 max-w-sm flex flex-col gap-3 pointer-events-none">
          
          {/* Header Card */}
          <div className="bg-card/90 backdrop-blur border border-border/40 rounded-2xl p-4 shadow-float pointer-events-auto">
            <Link
              to={slug ? `/program/${slug}` : '/faq'}
              className="inline-flex items-center gap-1.5 text-xs text-accent font-semibold hover:underline mb-2.5"
            >
              <ArrowLeft size={13} />
              Back to FAQ Board
            </Link>
            <h1 className="text-lg font-serif font-bold text-ink leading-tight">
              Topic Explorer
            </h1>
            <p className="text-[11px] text-ink-soft mt-1 leading-relaxed">
              Drag nodes to interact. Hover to read titles. Dotted lines represent AI-analyzed semantic links.
            </p>
            <div className="mt-3 flex items-center gap-4 text-[10px] text-ink-faint border-t border-border/20 pt-2.5">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border bg-accent/15" style={{ borderColor: settings.theme.accentColor }} />
                Categories
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full border border-ink-soft bg-card" />
                FAQs
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 border-t border-dashed" style={{ borderColor: settings.theme.accentColor }} />
                Semantic Links
              </span>
            </div>
          </div>

          {/* Search Panel */}
          <div className="bg-card/90 backdrop-blur border border-border/40 rounded-2xl p-3 shadow-float flex items-center gap-2 pointer-events-auto">
            <Search size={16} className="text-ink-faint shrink-0 ml-1" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics & keywords..."
              className="w-full bg-transparent border-none text-xs text-ink placeholder:text-ink-faint focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-ink-faint hover:text-ink shrink-0"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* ─── Zoom & Pan Controls Float ───────────────────────────────────── */}
        <div className="absolute bottom-6 left-6 z-10 flex flex-col gap-2 pointer-events-auto">
          <button
            onClick={zoomIn}
            className="w-9 h-9 rounded-xl bg-card border border-border/40 hover:bg-card-hover flex items-center justify-center text-ink shadow-subtle transition-all duration-150"
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={zoomOut}
            className="w-9 h-9 rounded-xl bg-card border border-border/40 hover:bg-card-hover flex items-center justify-center text-ink shadow-subtle transition-all duration-150"
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={fitGraphToScreen}
            className="w-9 h-9 rounded-xl bg-card border border-border/40 hover:bg-card-hover flex items-center justify-center text-ink shadow-subtle transition-all duration-150"
            title="Fit view"
          >
            <Maximize size={16} />
          </button>
        </div>

        {/* ─── Right-side Slide-over Drawer (FAQ Details) ───────────────────── */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="absolute right-0 top-0 bottom-0 w-full sm:w-[450px] bg-card border-l border-border/40 shadow-float z-20 flex flex-col overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-border/30 flex items-center justify-between shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
                  <BookOpen size={12} className="text-accent" />
                  FAQ Detail Card
                </span>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="w-7 h-7 rounded-full bg-mist hover:bg-mist/80 flex items-center justify-center text-ink-soft hover:text-ink transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
                
                {/* Question */}
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-accent mb-1.5 block">Question</span>
                  <h2 className="text-lg font-serif font-bold text-ink leading-snug">
                    {selectedNode.label}
                  </h2>
                </div>

                {/* Answer */}
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-faint mb-2 block">Answer</span>
                  <div className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed bg-mist/30 border border-border/20 rounded-2xl p-4">
                    {selectedNode.answer || 'No answer available.'}
                  </div>
                </div>

                {/* Categories & Tags */}
                <div className="flex flex-col gap-4 border-t border-border/20 pt-5">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-ink-faint mb-1.5 block">Category</span>
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-xs text-accent font-medium">
                      <Tag size={11} />
                      {selectedNode.category}
                    </span>
                  </div>

                  {selectedNode.tags && selectedNode.tags.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-ink-faint mb-1.5 block">Tags</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedNode.tags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 rounded bg-mist border border-border/30 text-[10px] text-ink-soft">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer Actions */}
              <div className="px-6 py-5 border-t border-border/20 bg-mist/20 shrink-0 flex gap-3">
                <Link
                  to={slug ? `/program/${slug}` : '/faq'}
                  onClick={() => {
                    // Set highlight signal for FAQPage to pre-open
                    sessionStorage.setItem('yaksha_faq_highlight', JSON.stringify({ _id: selectedNode.id.replace('faq_', ''), category: selectedNode.category }));
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-accent text-accent-text text-xs font-semibold hover:-translate-y-0.5 transition-transform duration-200"
                >
                  <Award size={13} />
                  Open on FAQ Board
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      <Footer branding={settings.branding} />
    </div>
  );
}
