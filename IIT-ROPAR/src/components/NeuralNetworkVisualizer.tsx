import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Cpu, Activity, Database, Sparkles, AlertCircle, RefreshCw, Zap, Waypoints, Network, Info
} from "lucide-react";

interface NeuralNode {
  id: string;
  name: string;
  layer: number;
  x: number;
  y: number;
  status: "idle" | "firing" | "active" | "standby";
  activation: number;
  type: "input" | "hidden" | "output";
  desc: string;
}

interface Synapse {
  id: string;
  from: NeuralNode;
  to: NeuralNode;
  weight: number;
  speed: number;
  color: string;
}

export default function NeuralNetworkVisualizer() {
  const [selectedNode, setSelectedNode] = useState<NeuralNode | null>(null);
  const [pulseTrigger, setPulseTrigger] = useState(0);
  const [activeSynapseBursts, setActiveSynapseBursts] = useState<boolean>(true);
  const [temperature, setTemperature] = useState(38.4);
  const [load, setLoad] = useState(14);
  const [queryCount, setQueryCount] = useState(412);

  // Define Nodes layout coordinates in standard viewBox 600 x 280
  const nodes: NeuralNode[] = useMemo(() => [
    // INPUT LAYER (Layer 0) - X = 60
    { 
      id: "node-in-1", name: "NOC Document OCR", layer: 0, x: 70, y: 55, 
      status: "active", activation: 0.94, type: "input", 
      desc: "Extracts Dean seals, authorized signatures, and student IDs from uploaded NOCs." 
    },
    { 
      id: "node-in-2", name: "Rosetta Journal Feed", layer: 0, x: 70, y: 140, 
      status: "firing", activation: 0.88, type: "input", 
      desc: "Processes weekly text summaries, scholar tags, and effort journals." 
    },
    { 
      id: "node-in-3", name: "Stipend Inquiry Router", layer: 0, x: 70, y: 225, 
      status: "idle", activation: 0.72, type: "input", 
      desc: "Checks payment states, bank credentials, and attendance logs." 
    },

    // HIDDEN LAYER 1 (Layer 1) - X = 230
    { 
      id: "node-hd1-1", name: "Legal Policy Validator", layer: 1, x: 230, y: 40, 
      status: "active", activation: 0.97, type: "hidden", 
      desc: "Cross-checks document parameters against IIT Ropar guidelines." 
    },
    { 
      id: "node-hd1-2", name: "Vicharanashala Sentinel", layer: 1, x: 230, y: 105, 
      status: "active", activation: 0.92, type: "hidden", 
      desc: "Anomalous spam gate tracking commercial keywords and external redirects." 
    },
    { 
      id: "node-hd1-3", name: "Semantic Parser", layer: 1, x: 230, y: 175, 
      status: "firing", activation: 0.85, type: "hidden", 
      desc: "Performs intent breakdown and maps tokens to relevant FAQ documents." 
    },
    { 
      id: "node-hd1-4", name: "HP & SP Core Auditor", layer: 1, x: 230, y: 240, 
      status: "idle", activation: 0.65, type: "hidden", 
      desc: "Checks Spurti Point balances and rolling 5-day attendance percentages." 
    },

    // HIDDEN LAYER 2 (Layer 2) - X = 390
    { 
      id: "node-hd2-1", name: "Context Grounder", layer: 2, x: 390, y: 40, 
      status: "active", activation: 0.99, type: "hidden", 
      desc: "Prioritizes official site manuals over generic AI hallucinations." 
    },
    { 
      id: "node-hd2-2", name: "Confidence Ranker", layer: 2, x: 390, y: 105, 
      status: "active", activation: 0.96, type: "hidden", 
      desc: "Computes source confidence weights before formulating support responses." 
    },
    { 
      id: "node-hd2-3", name: "Cognitive Synthesizer", layer: 2, x: 390, y: 175, 
      status: "firing", activation: 0.91, type: "hidden", 
      desc: "Assembles scattered data segments into unified, clear responses." 
    },
    { 
      id: "node-hd2-4", name: "Incident Log Packager", layer: 2, x: 390, y: 240, 
      status: "standby", activation: 0.78, type: "hidden", 
      desc: "Encrypts conversation stats when escalation tickets are requested." 
    },

    // OUTPUT LAYER (Layer 3) - X = 530
    { 
      id: "node-out-1", name: "Compliance Cleared", layer: 3, x: 530, y: 55, 
      status: "active", activation: 0.98, type: "output", 
      desc: "Signals the web portal that a milestone is validated and verified." 
    },
    { 
      id: "node-out-2", name: "Yaksha Response Out", layer: 3, x: 530, y: 140, 
      status: "firing", activation: 0.95, type: "output", 
      desc: "Pipes answers back to the UI in readable markdown formatting." 
    },
    { 
      id: "node-out-3", name: "Scholar Dispatcher", layer: 3, x: 530, y: 225, 
      status: "idle", activation: 0.81, type: "output", 
      desc: "Alerts human IIT Ropar administrators and schedules live coordination." 
    }
  ], []);

  // Compute synapses (fully connected layers adjacent)
  const synapses: Synapse[] = useMemo(() => {
    const synArr: Synapse[] = [];
    nodes.forEach(fromNode => {
      nodes.forEach(toNode => {
        if (toNode.layer === fromNode.layer + 1) {
          const isHighlight = 
            (fromNode.status === "firing" || fromNode.status === "active") && 
            (toNode.status === "firing" || toNode.status === "active");
          
          synArr.push({
            id: `syn-${fromNode.id}-${toNode.id}`,
            from: fromNode,
            to: toNode,
            weight: isHighlight ? 0.85 + Math.random() * 0.15 : 0.2 + Math.random() * 0.3,
            speed: isHighlight ? 1.5 + Math.random() * 1.5 : 3.5 + Math.random() * 2.5,
            color: isHighlight 
              ? (Math.random() > 0.5 ? "stroke-purple-500/40 dark:stroke-purple-500/45" : "stroke-cyan-500/40 dark:stroke-cyan-400/45")
              : "stroke-slate-200/20 dark:stroke-white/[0.04]"
          });
        }
      });
    });
    return synArr;
  }, [nodes]);

  // Telemetry simulation timers
  useEffect(() => {
    const interval = setInterval(() => {
      setTemperature(t => +(t + (Math.random() * 0.4 - 0.2)).toFixed(1));
      setLoad(l => Math.max(8, Math.min(64, l + Math.floor(Math.random() * 7 - 3))));
      setQueryCount(q => q + (Math.random() > 0.6 ? 1 : 0));
      setPulseTrigger(p => p + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-[#0F0F12]/95 backdrop-blur-xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between h-[480px]">
      
      {/* Top Title Bar */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-150/60 dark:border-white/5 select-none shrink-0">
        <div className="flex items-center space-x-2">
          <div className="h-7 w-7 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/20 flex items-center justify-center">
            <Network className="h-4 w-4 text-purple-650 dark:text-purple-400" />
          </div>
          <div>
            <h4 className="font-display font-extrabold text-[12px] text-slate-800 dark:text-slate-100">
              Yaksha Synapse Visualizer
            </h4>
            <p className="text-[9px] font-mono text-purple-650 dark:text-purple-400 font-bold uppercase tracking-wider">
              Cognitive Path Flow Routing
            </p>
          </div>
        </div>

        <div className="flex space-x-2">
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded bg-slate-200/50 dark:bg-white/15 text-slate-500 dark:text-slate-400 font-mono text-[9px] font-bold">
            NETLOAD: {load}%
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-650 dark:text-purple-400 font-mono text-[9px] font-bold">
            THERMAL: {temperature}°C
          </span>
        </div>
      </div>

      {/* SVG Neural Visualization Frame */}
      <div className="flex-1 w-full relative flex items-center justify-center select-none overflow-hidden my-1 bg-stone-50/20 dark:bg-black/15 rounded-2xl border border-slate-100 dark:border-white/[0.02]">
        
        {/* Underlaid technology matrix grids */}
        <div className="absolute inset-0 bg-grid-light dark:bg-grid-dark opacity-[0.06] dark:opacity-[0.11] pointer-events-none" />

        <svg 
          viewBox="0 0 600 280" 
          className="w-full h-full max-h-[290px] relative z-10"
        >
          {/* SVG Glow Filter Definition */}
          <defs>
            <filter id="syn-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <filter id="node-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* SYNAPSE LINKS DRAW */}
          <g>
            {synapses.map((syn) => {
              const isFired = 
                (syn.from.status === "firing" || syn.from.status === "active") &&
                (syn.to.status === "firing" || syn.to.status === "active");

              return (
                <g key={syn.id}>
                  {/* Outer glow overlay line */}
                  <line
                    x1={syn.from.x}
                    y1={syn.from.y}
                    x2={syn.to.x}
                    y2={syn.to.y}
                    className={`${syn.color} stroke-[1] transition-all`}
                    style={{
                      opacity: isFired ? 0.6 : 0.15,
                      filter: isFired ? "url(#syn-glow)" : "none"
                    }}
                  />

                  {/* Tiny white-blue packet travel bubble */}
                  {isFired && activeSynapseBursts && (
                    <motion.circle
                      r={1.8}
                      fill={syn.id.includes("cyan") ? "#06b6d4" : "#a855f7"}
                      filter="url(#syn-glow)"
                      animate={{
                        cx: [syn.from.x, syn.to.x],
                        cy: [syn.from.y, syn.to.y]
                      }}
                      transition={{
                        duration: syn.speed,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: Math.random() * 1.5
                      }}
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* INDIVIDUAL NEURAL NODES DRAW */}
          <g>
            {nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const isFiring = node.status === "firing" || node.status === "active";
              
              // Styles based on layer types
              let colorCircle = "fill-slate-350 dark:fill-[#272732]";
              let colorRing = "stroke-slate-300 dark:stroke-white/10";
              if (node.type === "input") {
                colorCircle = isFiring ? "fill-cyan-500" : "fill-cyan-500/40";
                colorRing = isFiring ? "stroke-cyan-400" : "stroke-cyan-500/25";
              } else if (node.type === "hidden") {
                colorCircle = isFiring ? "fill-purple-500" : "fill-purple-500/30";
                colorRing = isFiring ? "stroke-purple-400" : "stroke-purple-500/25";
              } else {
                colorCircle = isFiring ? "fill-indigo-500" : "fill-indigo-500/45";
                colorRing = isFiring ? "stroke-indigo-400" : "stroke-indigo-500/25";
              }

              return (
                <g 
                  key={node.id} 
                  className="cursor-pointer group"
                  onClick={() => setSelectedNode(node)}
                >
                  {/* Outer Pulsating Halo */}
                  {isFiring && (
                    <motion.circle
                      cx={node.x}
                      cy={node.y}
                      r={isSelected ? 14 : 9.5}
                      className={`${colorRing} stroke-[1.2] fill-transparent opacity-50`}
                      style={{ filter: "url(#node-glow)" }}
                      animate={{
                        scale: isSelected ? [1, 1.25, 1] : [1, 1.35, 1],
                        opacity: [0.15, 0.45, 0.15]
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: node.type === "hidden" ? 2.5 : 3.8,
                        ease: "easeInOut"
                      }}
                    />
                  )}

                  {/* Core Node Circle */}
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={isSelected ? 6.5 : (isFiring ? 4.5 : 3.8)}
                    className={`${colorCircle} transition-all duration-300`}
                    animate={isFiring ? { scale: [1, 1.15, 1] } : undefined}
                    transition={{ repeat: Infinity, duration: 4 }}
                  />

                  {/* Invisible broad hitbox circle for easy touch inputs */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={22}
                    className="fill-transparent stroke-transparent cursor-pointer"
                  />

                  {/* Mini Node Label Text (Visible on desktop view hover/always) */}
                  <text
                    x={node.layer === 3 ? node.x - 12 : node.x + 12}
                    y={node.y + 3.5}
                    textAnchor={node.layer === 3 ? "end" : "start"}
                    className={`font-mono text-[6.5px] select-none font-bold uppercase ${
                      isSelected ? "fill-purple-650 dark:fill-purple-300" : "fill-slate-500 dark:fill-slate-450"
                    } tracking-wide group-hover:fill-slate-800 dark:group-hover:fill-white transition`}
                  >
                    {node.name.split(" ")[0]}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Real-time telemetry floating watermark */}
        <div className="absolute bottom-2.5 left-3 pointer-events-none font-mono text-[8px] text-slate-400 select-none flex flex-col uppercase">
          <span>grounding rate: 1.84 GHz</span>
          <span>total evaluations: {queryCount} syn</span>
        </div>
      </div>

      {/* Interactive Node Explorer Subpanel */}
      <div className="p-3 bg-stone-100/50 dark:bg-white/[0.015] border border-slate-150/60 dark:border-white/5 rounded-2xl min-h-[95px] shrink-0 text-left font-sans flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {selectedNode ? (
            <motion.div
              key={selectedNode.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="space-y-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className={`text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded-md text-white ${
                    selectedNode.type === "input" ? "bg-cyan-500" : selectedNode.type === "hidden" ? "bg-purple-650" : "bg-indigo-600"
                  }`}>
                    {selectedNode.type.toUpperCase()} LAYER
                  </span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-none">
                    {selectedNode.name}
                  </span>
                </div>

                <div className="flex items-center space-x-1 font-mono text-[10px]">
                  <span className="text-slate-400">ACTIVATION:</span>
                  <span className="text-purple-650 dark:text-purple-350 font-bold">{(selectedNode.activation * 100).toFixed(0)}%</span>
                </div>
              </div>

              <p className="text-[10.5px] text-slate-500 dark:text-slate-450 leading-relaxed font-normal">
                {selectedNode.desc}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.9 }}
              className="text-center space-y-1 py-1 text-slate-450 select-none"
            >
              <Waypoints className="h-4.5 w-4.5 text-slate-400 mx-auto animate-pulse" />
              <p className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Interactive Auditing Slices
              </p>
              <p className="text-[9.5px] text-slate-400 max-w-xs mx-auto">
                Hover or click any vector vertex in the neural flowchart grid to inspect active thread validations.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
