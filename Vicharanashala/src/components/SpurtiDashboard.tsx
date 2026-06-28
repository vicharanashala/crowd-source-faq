import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Shield, Award, Flame, Users, Trophy, Sparkles, HelpCircle, Eye, EyeOff } from 'lucide-react';

interface LeaderboardUser {
  id: string;
  name: string;
  spurtiPoints: number;
  streak: number;
  rank: string;
  badges: string[];
  isCurrentUser: boolean;
}

export const SpurtiDashboard: React.FC = () => {
  const { user, spurti, refreshSpurti } = useAuth();
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [showNames, setShowNames] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState<string | null>(null);
  
  // Track badges locally to trigger unlock popups
  const [knownBadges, setKnownBadges] = useState<string[]>([]);

  // Load leaderboard data
  const loadLeaderboard = async () => {
    try {
      const res = await fetch(`/api/leaderboard?showNames=${showNames}`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch (e) {
      console.error('Error fetching leaderboard:', e);
    }
  };

  useEffect(() => {
    loadLeaderboard();
  }, [showNames, user]);

  useEffect(() => {
    refreshSpurti();
  }, [user]);

  // Monitor badge changes to trigger the "Unlocked" popups
  useEffect(() => {
    if (spurti?.badges) {
      if (knownBadges.length > 0 && spurti.badges.length > knownBadges.length) {
        // Find which badge is new
        const newlyUnlocked = spurti.badges.find(b => !knownBadges.includes(b));
        if (newlyUnlocked) {
          setJustUnlocked(newlyUnlocked);
          // Auto close after 5 seconds
          setTimeout(() => setJustUnlocked(null), 5000);
        }
      }
      setKnownBadges(spurti.badges);
    }
  }, [spurti?.badges]);

  if (!user) {
    return (
      <div className="text-center py-16 bg-[#07071c] border border-slate-850 rounded-2xl p-8 max-w-xl mx-auto space-y-4">
        <Trophy className="mx-auto text-[#7C3AED]" size={48} />
        <h3 className="font-display text-lg font-bold text-white">Spurti Leaderboards & Profiles</h3>
        <p className="text-slate-450 text-xs font-sans">
          Authentication is required to track contributions, claim achievement badges, check daily streaks, and view ranks. Enter the portal via the top navbar.
        </p>
      </div>
    );
  }

  // Define details for the badges
  const BADGES_LIBRARY = [
    {
      name: 'First Question',
      description: 'Consulted the Yaksha AI portal registry for the first time.',
      requirement: 'Registration welcome award.',
      icon: '🌱'
    },
    {
      name: 'Bookworm',
      description: 'Curated a reference compendium by saving articles.',
      requirement: 'Save 10 bookmarks in the FAQ Explorer.',
      icon: '📚'
    },
    {
      name: 'Yaksha\'s Favorite',
      description: 'Maintained a deep, ongoing dialogue with Yaksha AI.',
      requirement: 'Send 50 messages to Yaksha AI.',
      icon: '🔮'
    },
    {
      name: 'FAQ Hunter',
      description: 'Acquired complete knowledge of all program specifications.',
      requirement: 'Read all 24 official FAQs.',
      icon: '🎯'
    }
  ];

  return (
    <div className="space-y-8 relative">
      
      {/* Badge Unlock Popup Modal */}
      {justUnlocked && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0a0a24] border-2 border-amber-500 rounded-xl p-5 shadow-2xl flex items-center gap-4 max-w-sm animate-in slide-in-from-bottom-10 duration-300">
          <div className="text-4xl">🏆</div>
          <div className="space-y-1">
            <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider block">Badge Unlocked!</span>
            <h4 className="text-sm font-display font-black text-white">{justUnlocked}</h4>
            <p className="text-[11px] text-slate-350 leading-snug">
              You earned the badge and received a Spurti Points bonus!
            </p>
          </div>
        </div>
      )}

      {/* Ranks Tier, Streaks, XP Progress Bar */}
      {spurti && (
        <div className="bg-gradient-to-r from-[#07071c] to-[#0b0b30] p-6 rounded-2xl border border-[#7C3AED]/25 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#7C3AED]/5 blur-[60px] rounded-full pointer-events-none" />
          
          <div className="flex flex-col md:flex-row gap-6 justify-between items-stretch">
            
            {/* Left: Rank Core */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-[#06B6D4]/30 flex items-center justify-center shadow-lg shadow-cyan-950/20">
                <Shield size={32} className={
                  spurti.rank === 'Seeker' ? 'text-slate-400' :
                  spurti.rank === 'Scholar' ? 'text-cyan-400' :
                  spurti.rank === 'Sage' ? 'text-violet-400' :
                  'text-amber-400 animate-pulse'
                } />
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-mono tracking-widest text-[#06B6D4] uppercase font-bold">Vicharanashala Tier</span>
                <h3 className="text-xl font-display font-black text-white">{spurti.rank}</h3>
                <p className="text-xs text-slate-400 font-sans">
                  Total Points: <span className="text-violet-300 font-mono font-bold">{spurti.spurtiPoints} SP</span>
                </p>
              </div>
            </div>

            {/* Middle: Progress Bar */}
            <div className="flex-1 flex flex-col justify-center space-y-2">
              <div className="flex justify-between items-end text-xs">
                <span className="text-slate-400 font-medium">Progress to Next Tier</span>
                <span className="text-cyan-400 font-mono font-bold">{Math.round(spurti.limits.percentage)}%</span>
              </div>
              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-900">
                <div 
                  className="bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] h-full rounded-full transition-all duration-700 shadow-inner"
                  style={{ width: `${spurti.limits.percentage}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>{spurti.limits.prevLimit} SP</span>
                <span>{spurti.limits.nextLimit} SP</span>
              </div>
            </div>

            {/* Right: Streaks */}
            <div className="flex flex-row md:flex-col justify-between md:justify-center items-center bg-slate-950/50 p-4 rounded-xl border border-slate-900 gap-3">
              <div className="flex items-center gap-2">
                <Flame size={20} className="text-orange-500 fill-orange-500 animate-bounce" />
                <div>
                  <span className="text-[10px] text-slate-500 block leading-none font-mono">Streak</span>
                  <span className="text-base font-bold text-white font-mono">{spurti.streak} Days</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Grid: Achievements Reliquary & Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Badges (size 7) */}
        <div className="lg:col-span-7 bg-[#07071c]/90 rounded-2xl border border-slate-800/80 p-5 space-y-6">
          <div>
            <h3 className="font-display font-extrabold text-white text-base tracking-wide flex items-center gap-2">
              <Award size={18} className="text-[#7C3AED]" />
              Achievement Reliquary
            </h3>
            <p className="text-xs text-slate-450 font-sans mt-0.5">Collect points on activities to unlock these trophies</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {BADGES_LIBRARY.map((badge) => {
              const isUnlocked = spurti?.badges.includes(badge.name);
              return (
                <div 
                  key={badge.name}
                  className={`p-4 rounded-xl border flex gap-3.5 transition-all duration-300 relative overflow-hidden ${
                    isUnlocked 
                      ? 'bg-slate-900/30 border-violet-900/40 shadow-inner' 
                      : 'bg-slate-950/20 border-slate-900 opacity-45 grayscale'
                  }`}
                >
                  <div className="text-3xl flex-shrink-0 flex items-center justify-center w-12 h-12 bg-slate-950 rounded-lg border border-slate-900">
                    {badge.icon}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-200">{badge.name}</h4>
                    <p className="text-[10px] text-slate-400 leading-snug">{badge.description}</p>
                    <span className="text-[9px] text-violet-400 font-mono block">Req: {badge.requirement}</span>
                  </div>
                  {isUnlocked && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold text-emerald-400 uppercase bg-emerald-950/40 border border-emerald-900/30 px-1 rounded">Unlocked</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Spurti logs details */}
          {spurti && spurti.logs.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-900">
              <span className="text-[10px] font-mono tracking-widest uppercase text-slate-500 font-bold block">Recent Activity Logs</span>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2 scrollbar-thin">
                {spurti.logs.map((log) => (
                  <div key={log.id} className="flex justify-between items-center bg-slate-950/50 px-3 py-2 rounded border border-slate-900 text-xs">
                    <span className="text-slate-300">{log.action}</span>
                    <span className="text-cyan-400 font-mono font-bold">+{log.xpEarned} SP</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Leaderboard (size 5) */}
        <div className="lg:col-span-5 bg-[#07071c]/90 rounded-2xl border border-slate-800/80 p-5 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-display font-extrabold text-white text-base tracking-wide flex items-center gap-2">
                <Trophy size={18} className="text-[#06B6D4]" />
                Leaderboard Standings
              </h3>
              <p className="text-xs text-slate-450 font-sans mt-0.5">Top contributors in Vicharanashala</p>
            </div>

            {/* Anonymity Toggle */}
            <button
              onClick={() => setShowNames(!showNames)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white border border-slate-850 hover:bg-slate-900 transition-colors"
              title={showNames ? "Mask usernames (Anonymize)" : "Reveal usernames"}
            >
              {showNames ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
            {leaderboard.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">No entries in the record.</div>
            ) : (
              leaderboard.map((item, idx) => (
                <div 
                  key={item.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors ${
                    item.isCurrentUser 
                      ? 'bg-violet-950/20 border-[#7C3AED]/50 shadow-md shadow-violet-950/30' 
                      : 'bg-slate-950/60 border-slate-900 hover:border-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Position Medal or number */}
                    <div className={`w-6 h-6 rounded-lg font-mono font-bold flex items-center justify-center border text-[10px] ${
                      idx === 0 ? 'bg-amber-950/30 border-amber-600 text-amber-400' :
                      idx === 1 ? 'bg-slate-900 border-slate-400 text-slate-300' :
                      idx === 2 ? 'bg-orange-950/30 border-orange-800 text-orange-400' :
                      'bg-slate-950 border-slate-900 text-slate-500'
                    }`}>
                      {idx + 1}
                    </div>

                    <div className="space-y-0.5">
                      <p className="font-bold text-slate-200 font-sans flex items-center gap-1.5">
                        {item.name}
                        {item.isCurrentUser && (
                          <span className="text-[8px] font-extrabold uppercase px-1 rounded bg-[#06B6D4]/25 text-[#06B6D4] border border-[#06B6D4]/30">You</span>
                        )}
                      </p>
                      <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">{item.rank}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Badges icons summary count */}
                    {item.badges.length > 0 && (
                      <div className="flex items-center text-[10px]" title={`${item.badges.length} Badges Unlocked`}>
                        👑 <span className="font-mono text-slate-400 ml-0.5">{item.badges.length}</span>
                      </div>
                    )}
                    
                    <span className="font-mono font-bold text-cyan-400 text-xs">{item.spurtiPoints} SP</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default SpurtiDashboard;
