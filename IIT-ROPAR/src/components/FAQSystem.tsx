import { fetchWithAuth } from "../utils/api.js";
import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ChevronDown, ThumbsUp, ThumbsDown, Bookmark, Share2, 
  ExternalLink, Sparkles, CheckCircle2, Copy, Search, HelpCircle, Calendar, Flame, Eye,
  FoldHorizontal, ListCollapse, ListPlus, Send, AlertTriangle, Languages, BookMarked, History, MessageSquare, BookOpen
} from "lucide-react";
import { CATEGORIES, FAQItem } from "../data/faqs.js";

interface FAQSystemProps {
  onAskAI: (questionText: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  faqs: FAQItem[];
  bookmarkedIds: string[];
  onBookmarkFAQ: (id: string) => void;
  onVoteFAQ: (id: string, type: "up" | "down") => void;
  faqHistory: string[];
  onRecordHistory: (id: string) => void;
  onSubmitDiscussion: (questionText: string) => { success: boolean; isSpam: boolean };
}

type LangCode = "en" | "hi" | "pa" | "es";

// Pre-defined high-quality translations for core IIT Ropar FAQ segments
const TRANSLATION_DICTIONARY: Record<string, Record<LangCode, string>> = {
  // Broad phrase mappings
  "Can I submit my NOC after the deadline?": {
    en: "Can I submit my NOC after the deadline?",
    hi: "क्या मैं समय सीमा के बाद एनओसी (NOC) जमा कर सकता हूँ?",
    pa: "ਕੀ ਮੈਂ ਨਿਯਤ ਮਿਤੀ ਤੋਂ ਬਾਅਦ ਐਨਓਸੀ (NOC) ਜਮ੍ਹਾਂ ਕਰਵਾ ਸਕਦਾ ਹਾਂ?",
    es: "¿Puedo presentar mi NOC después de la fecha límite?"
  },
  "Strictly no. NOC clearances form the legal authorization boundary of Vicharanashala. The portal automatically locks electronic NOC submissions on June 10, 2026 at 11:59 PM. Late uploads trigger automatic dismissal from teammate assignments.": {
    en: "Strictly no. NOC clearances form the legal authorization boundary of Vicharanashala. The portal automatically locks electronic NOC submissions on June 10, 2026 at 11:59 PM. Late uploads trigger automatic dismissal from teammate assignments.",
    hi: "बिल्कुल नहीं। एनओसी (NOC) मंजूरी विचरणशाला की कानूनी प्राधिकरण सीमा बनाती है। पोर्टल 10 जून, 2026 को रात 11:59 बजे एनओसी जमा को स्वतः लॉक कर देता है। देरी से अपलोड करने पर टीम असाइनमेंट से स्वतः बाहर कर दिया जाएगा।",
    pa: "ਬਿਲਕੁਲ ਨਹੀਂ। ਐਨਓਸੀ (NOC) ਮਨਜ਼ੂਰੀਆਂ ਵਿਚਰਨਸ਼ਾਲਾ ਦੀ ਕਾਨੂੰਨੀ ਸੀਮਾ ਨੂੰ ਤੈਅ ਕਰਦੀਆਂ ਹਨ। ਪੋਰਟਲ 10 ਜੂਨ, 2026 ਨੂੰ ਰਾਤ 11:59 ਵਜੇ ਐਨਓਸੀ ਜਮ੍ਹਾਂ ਕਰਵਾਉਣ ਦੀ ਪ੍ਰਕਿਰਿਆ ਨੂੰ ਸਵੈ-ਚਾਲਤ ਤਰੀਕੇ ਨਾਲ ਬੰਦ ਕਰ ਦੇਵੇਗਾ। ਦੇਰੀ ਨਾਲ ਜਮ੍ਹਾਂ ਕਰਵਾਉਣ 'ਤੇ ਟੀਮ ਅਸਾਈਨਮੈਂਟ ਤੋਂ ਬਾਹਰ ਕਰ ਦਿੱਤਾ ਜਾਵੇਗਾ।",
    es: "Estrictamente no. Las autorizaciones de NOC forman el límite legal de Vicharanashala. El portal bloquea automáticamente las presentaciones el 10 de junio de 2026 a las 11:59 PM. Las cargas tardías causan la exclusión automática de los equipos."
  },
  "When will stipends be credited to our bank accounts?": {
    en: "When will stipends be credited to our bank accounts?",
    hi: "हमारे बैंक खातों में वजीफा (Stipend) कब जमा किया जाएगा?",
    pa: "ਸਾਡੇ ਬੈਂਕ ਖਾਤਿਆਂ ਵਿੱਚ ਵਜ਼ੀਫ਼ਾ (Stipend) ਕਦੋਂ ਜਮ੍ਹਾਂ ਹੋਵੇਗਾ?",
    es: "¿Cuándo se acreditarán los estipendios en nuestras cuentas bancarias?"
  },
  "Stipends are cleared in bi-weekly slots. The accounts dispatch cycle opens on the 1st and 15th of each month. Ensure all bank details are logged in the ViBe application tab by May 30, 2026.": {
    en: "Stipends are cleared in bi-weekly slots. The accounts dispatch cycle opens on the 1st and 15th of each month. Ensure all bank details are logged in the ViBe application tab by May 30, 2026.",
    hi: "वजीफा पाक्षिक (15 दिनों में) किश्तों में दिया जाता है। भुगतान चक्र प्रत्येक महीने की 1 और 15 तारीख को शुरू होता है। कृपया सुनिश्चित करें कि बँक विवरण 30 मई, 2026 तक ViBe में दर्ज हों।",
    pa: "ਵਜ਼ੀਫ਼ਾ ਹਰ ਦੋ ਹਫ਼ਤਿਆਂ ਬਾਅਦ ਜਾਰੀ ਕੀਤਾ ਜਾਂਦਾ ਹੈ। ਖਾਤੇ ਦਾ ਭੁਗਤਾਨ ਚੱਕਰ ਹਰ ਮਹੀਨੇ ਦੀ 1 ਅਤੇ 15 ਤਾਰੀਖ ਨੂੰ ਖੁੱਲ੍ਹਦਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਯਕੀਨੀ ਬਣਾਓ ਕਿ ਬੈਂਕ ਵੇਰਵੇ 30 ਮਈ, 2026 ਤੱਕ ViBe ਵਿੱਚ ਦਰਸਾਏ ਦਿੱਤੇ ਗਏ ਹੋਣ।",
    es: "Los estipendios se liquidan quincenalmente. El ciclo de envío de cuentas se abre el 1 y el 15 de cada mes. Asegúrese de registrar sus datos bancarios en ViBe antes del 30 de mayo de 2026."
  },
  "Can on-campus interns request hostel accommodation?": {
    en: "Can on-campus interns request hostel accommodation?",
    hi: "क्या ऑन-कैंपस इंटर्न हॉस्टल आवास का अनुरोध कर सकते हैं?",
    pa: "ਕੀ ਆਨ-ਕੈਂਪਸ ਇੰਟਰਨ ਹੋਸਟਲ ਰਿਹਾਇਸ਼ ਦੀ ਬੇਨਤੀ ਕਰ ਸਕਦੇ ਹਨ?",
    es: "¿Pueden los pasantes en el campus solicitar alojamiento en el albergue?"
  },
  "Yes. Accommodation is subject to availability inside Ropar blocks. You can submit requests in the academic utilities dashboard. Requests are reviewed and certified by the warden or department head.": {
    en: "Yes. Accommodation is subject to availability inside Ropar blocks. You can submit requests in the academic utilities dashboard. Requests are reviewed and certified by the warden or department head.",
    hi: "हाँ। आवास रोपड़ ब्लॉक में खाली कमरों की उपलब्धता पर निर्भर है। आप अकादमिक डैशबोर्ड में अनुरोध जमा कर सकते हैं जिसे वार्डन द्वारा स्वीकृत किया जाता है।",
    pa: "ਹਾਂ। ਰਿਹਾਇਸ਼ ਰੋਪੜ ਬਲਾਕ ਵਿੱਚ ਖਾਲੀ ਕਮਰਿਆਂ ਤੇ ਨਿਰਭਰ ਕਰਦੀ ਹੈ। ਤੁਸੀਂ ਅਕਾਦਮਿਕ ਡੈਸ਼ਬੋਰਡ ਵਿੱਚ ਅਪਲਾਈ ਕਰ ਸਕਦੇ ਹੋ, ਜਿਸਨੂੰ ਹੋਸਟਲ ਵਾਰਡਨ ਦੁਆਰਾ ਪ੍ਰਮਾਣਿਤ ਕੀਤਾ ਜਾਂਦਾ ਹੈ।",
    es: "Sí. El alojamiento está sujeto a disponibilidad en los bloques de Ropar. Puede enviar solicitudes en el panel de servicios académicos, las cuales son revisadas y certificadas por el director."
  }
};

const UI_TRANSLATIONS: Record<string, Record<LangCode, string>> = {
  "LANGUAGE TRANSLATOR:": {
    en: "LANGUAGE TRANSLATOR:",
    hi: "भाषा अनुवादक:",
    pa: "ਭਾਸ਼ਾ ਅਨੁਵਾਦਕ:",
    es: "TRADUCTOR DE IDIOMAS:"
  },
  "ASK AI ABOUT THIS": {
    en: "ASK AI ABOUT THIS",
    hi: "इसके बारे में एआई से पूछें",
    pa: "ਇਸ ਬਾਰੇ ਏਆਈ ਨੂੰ ਪੁੱਛੋ",
    es: "PREGUNTAR A LA IA"
  },
  "LINK": {
    en: "LINK",
    hi: "लिंक",
    pa: "ਲਿੰਕ",
    es: "ENLACE"
  },
  "COPIED": {
    en: "COPIED",
    hi: "कॉपी किया गया",
    pa: "ਕਾਪੀ ਕੀਤਾ",
    es: "COPIADO"
  },
  "SAVE": {
    en: "SAVE",
    hi: "सहेजें",
    pa: "ਸੁਰੱਖਿਅਤ ਕਰੋ",
    es: "GUARDAR"
  },
  "SAVED": {
    en: "SAVED",
    hi: "सहेजा गया",
    pa: "ਸੁਰੱਖਿਅਤ",
    es: "GUARDADO"
  },
  "Updated:": {
    en: "Updated:",
    hi: "अद्यतित:",
    pa: "ਅੱਪਡੇਟ ਕੀਤਾ:",
    es: "Actualizado:"
  },
  "Views Count:": {
    en: "Views Count:",
    hi: "देखा गया:",
    pa: "ਵੇਖਿਆ ਗਿਆ:",
    es: "Vistas:"
  },
  "RELATED KNOWLEDGE LINKS (Click to inspect)": {
    en: "RELATED KNOWLEDGE LINKS (Click to inspect)",
    hi: "संबंधित ज्ञान लिंक (निरीक्षण करने के लिए क्लिक करें)",
    pa: "ਸੰਬੰਧਿਤ ਜਾਣਕਾਰੀ ਕੜੀਆਂ (ਦੇਖਣ ਲਈ ਕਲਿੱਕ ਕਰੋ)",
    es: "ENLACES DE CONOCIMIENTO RELACIONADOS (Click para inspeccionar)"
  }
};

export default function FAQSystem({ 
  onAskAI, 
  searchTerm, 
  setSearchTerm, 
  faqs, 
  bookmarkedIds, 
  onBookmarkFAQ, 
  onVoteFAQ, 
  faqHistory, 
  onRecordHistory,
  onSubmitDiscussion
}: FAQSystemProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [expandedFAQId, setExpandedFAQId] = useState<string | null>(null);
  const [copyFeedbackId, setCopyFeedbackId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"index" | "popularity">("index");
  
  // Translator states
  const [activeLanguages, setActiveLanguages] = useState<Record<string, LangCode>>({});
  const [activeLanguage, setActiveLanguage] = useState<LangCode>(() => {
    try {
      const stored = localStorage.getItem("iit_ropar_faq_lang");
      return (stored as LangCode) || "en";
    } catch {
      return "en";
    }
  });

  const [translatedFAQs, setTranslatedFAQs] = useState<Record<string, Record<LangCode, any>>>({});
  const [loadingTranslations, setLoadingTranslations] = useState<Record<string, Record<LangCode, boolean>>>({});
  const [translationErrors, setTranslationErrors] = useState<Record<string, string | null>>({});

  const getFAQQuestion = (faq: FAQItem, lang: LangCode): string => {
    if (lang === "en") return faq.question;
    const dynamicValue = translatedFAQs[faq.id]?.[lang]?.question;
    if (dynamicValue) return dynamicValue;

    const dictionaryMatch = TRANSLATION_DICTIONARY[faq.question];
    if (dictionaryMatch && dictionaryMatch[lang]) {
      return dictionaryMatch[lang];
    }
    return faq.question;
  };

  const getFAQAnswer = (faq: FAQItem, lang: LangCode): string => {
    if (lang === "en") return faq.answer;
    const dynamicValue = translatedFAQs[faq.id]?.[lang]?.answer;
    if (dynamicValue) return dynamicValue;

    const dictionaryMatch = TRANSLATION_DICTIONARY[faq.answer];
    if (dictionaryMatch && dictionaryMatch[lang]) {
      return dictionaryMatch[lang];
    }
    return faq.answer;
  };

  const getFAQTags = (faq: FAQItem, lang: LangCode): string[] => {
    if (lang === "en") return faq.tags;
    const dynamicValue = translatedFAQs[faq.id]?.[lang]?.tags;
    if (dynamicValue && Array.isArray(dynamicValue)) return dynamicValue;
    return faq.tags;
  };

  const getUiLabel = (key: string): string => {
    return UI_TRANSLATIONS[key]?.[activeLanguage] || key;
  };

  const changeLanguage = async (faqId: string, lang: LangCode) => {
    setActiveLanguages((prev) => ({ ...prev, [faqId]: lang }));
    setActiveLanguage(lang);
    try {
      localStorage.setItem("iit_ropar_faq_lang", lang);
    } catch (e) {
      console.warn(e);
    }

    if (lang === "en") return;
    if (translatedFAQs[faqId]?.[lang]) return;

    setLoadingTranslations((prev) => ({
      ...prev,
      [faqId]: { ...prev[faqId], [lang]: true }
    }));
    setTranslationErrors((prev) => ({ ...prev, [faqId]: null }));

    try {
      const res = await fetchWithAuth("/api/faqs/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faqId, targetLang: lang })
      });
      const data = await res.json();
      if (data.success && data.translated) {
        setTranslatedFAQs((prev) => ({
          ...prev,
          [faqId]: {
            ...prev[faqId],
            [lang]: data.translated
          }
        }));
      } else {
        throw new Error(data.error || "Translation API failed");
      }
    } catch (err: any) {
      console.error(err);
      setTranslationErrors((prev) => ({
        ...prev,
        [faqId]: `Translation to ${lang.toUpperCase()} failed. Keeping original English view.`
      }));
    } finally {
      setLoadingTranslations((prev) => ({
        ...prev,
        [faqId]: { ...prev[faqId], [lang]: false }
      }));
    }
  };

  // Automatically restore or fetch translation if accordion expanded and language is non-English
  React.useEffect(() => {
    if (expandedFAQId) {
      const faqLang = activeLanguages[expandedFAQId] || activeLanguage;
      if (faqLang !== "en") {
        changeLanguage(expandedFAQId, faqLang);
      }
    }
  }, [expandedFAQId, activeLanguage]);

  // Discussion input states
  const [discussionInput, setDiscussionInput] = useState("");
  const [discussionSubmittedMsg, setDiscussionSubmittedMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const toggleBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onBookmarkFAQ(id);
  };

  const handleFAQAccordionClick = (id: string) => {
    if (expandedFAQId === id) {
      setExpandedFAQId(null);
    } else {
      setExpandedFAQId(id);
      onRecordHistory(id);
    }
  };

  const handleUpvote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onVoteFAQ(id, "up");
  };

  const handleDownvote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onVoteFAQ(id, "down");
  };

  const copyFAQLink = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/#faq-${id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopyFeedbackId(id);
      setTimeout(() => setCopyFeedbackId(null), 2000);
    });
  };

  // Handle Discussion posting
  const handleDiscussionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!discussionInput.trim()) return;

    const res = onSubmitDiscussion(discussionInput.trim());
    if (res.isSpam) {
      setDiscussionSubmittedMsg({
        text: "⚠️ Form Blocked: Your submission contains keywords flagged by the security Spam Controller.",
        isError: true
      });
    } else if (res.success) {
      setDiscussionSubmittedMsg({
        text: "🚀 Discussion posted! Your query has been logged to the coordinator panel for verification.",
        isError: false
      });
      setDiscussionInput("");
    } else {
      setDiscussionSubmittedMsg({
        text: "Something went wrong. Please try again.",
        isError: true
      });
    }

    setTimeout(() => {
      setDiscussionSubmittedMsg(null);
    }, 7000);
  };

  // Filters & sorting logic, with support for bookmarked list view!
  const filteredFAQs = faqs.filter((item) => {
    const categoryMatches = 
      activeCategory === "all" || 
      (activeCategory === "bookmarked" && bookmarkedIds.includes(item.id)) ||
      item.category === activeCategory;

    const searchMatches = 
      item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return categoryMatches && searchMatches;
  });

  const sortedFAQs = [...filteredFAQs].sort((a, b) => {
    if (sortBy === "popularity") {
      return b.popularity - a.popularity;
    }
    return 0; // maintain default position indices
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      
      {/* Category Sidebar Navigation Block */}
      <div className="lg:col-span-1 space-y-5">
        
        {/* Main Category Selector Sidebar */}
        <div className="glass p-4 rounded-xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
            <span className="font-mono text-[10px] text-violet-400 font-bold uppercase tracking-wider block">
              CATALOG INDEX
            </span>
            <button 
              onClick={() => setExpandedFAQId(null)}
              title="Collapse All Accordions"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              <ListCollapse className="h-3 w-3" />
            </button>
          </div>

          {/* Sorter */}
          <div className="flex items-center justify-between mb-3.5 text-xs bg-[#0F0F12] p-1.5 rounded-lg border border-white/5">
            <span className="text-slate-400 font-mono text-[10px]">SORT BY:</span>
            <div className="flex space-x-1">
              <button
                onClick={() => setSortBy("index")}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                  sortBy === "index" ? "bg-white/10 text-slate-100" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                INDEX
              </button>
              <button
                onClick={() => setSortBy("popularity")}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                  sortBy === "popularity" ? "bg-white/10 text-slate-100" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                POPULAR
              </button>
            </div>
          </div>

          {/* Sorter and category navigation buttons */}
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            <button
              onClick={() => { setActiveCategory("all"); setExpandedFAQId(null); }}
              className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-between cursor-pointer ${
                activeCategory === "all"
                  ? "bg-white/10 text-purple-300 border border-white/10 shadow-sm"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <span className="flex items-center">
                <BookOpen className="h-3.5 w-3.5 mr-2 text-slate-500" />
                <span>All Fields</span>
              </span>
              <span className="bg-[#050505] text-slate-400 text-[10px] px-1.5 py-0.5 rounded font-mono border border-white/5">
                {faqs.length}
              </span>
            </button>

            {/* Quick Bookmark virtual category */}
            <button
              onClick={() => { setActiveCategory("bookmarked"); setExpandedFAQId(null); }}
              className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-between cursor-pointer ${
                activeCategory === "bookmarked"
                  ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <span className="flex items-center">
                <Bookmark className="h-3.5 w-3.5 mr-2 text-amber-400/80" />
                <span>My Saved FAQs</span>
              </span>
              <span className="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                {bookmarkedIds.length}
              </span>
            </button>

            <div className="border-t border-white/5 my-1.5" />

            {CATEGORIES.map((cat, idx) => {
              const count = faqs.filter(item => item.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => { setActiveCategory(cat); setExpandedFAQId(null); }}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-between cursor-pointer ${
                    activeCategory === cat
                      ? "bg-white/10 text-purple-300 border border-white/10 shadow-sm"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  <span className="truncate">{idx + 1}. {cat}</span>
                  <span className="bg-[#050505] text-slate-400 text-[10px] px-1.5 py-0.5 rounded font-mono border border-white/5 shrink-0 ml-2">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Navigation History widget */}
        {faqHistory.length > 0 && (
          <div className="glass p-4 rounded-xl backdrop-blur-md">
            <span className="font-mono text-[9px] text-slate-400 tracking-wider font-bold block mb-2.5 flex items-center">
              <History className="h-3 w-3 mr-1 text-slate-500 animate-spin" />
              RECENTLY VIEWED
            </span>
            <div className="space-y-1 max-h-[180px] overflow-y-auto">
              {faqHistory.map((hId) => {
                const targetFaq = faqs.find((f) => f.id === hId);
                if (!targetFaq) return null;
                return (
                  <button
                    key={hId}
                    onClick={() => { setActiveCategory("all"); setExpandedFAQId(hId); }}
                    className="w-full text-left p-2 rounded bg-white/[0.01] hover:bg-white/[0.04] text-[11px] text-slate-350 truncate block focus:outline-none transition cursor-pointer"
                  >
                    <span className="text-purple-400 font-mono mr-1.5">[{targetFaq.id}]</span>
                    {targetFaq.question}
                  </button>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* Accordion Cards Portal block */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* Results Counter / Title */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400 font-mono">
            Catalog index displays <strong className="text-violet-400">{sortedFAQs.length}</strong> fields in <strong className="text-slate-200 uppercase">{activeCategory === "all" ? "Whole Catalog" : activeCategory === "bookmarked" ? "My Bookmarks Only" : activeCategory}</strong>
          </p>
          {sortBy === "popularity" && (
            <span className="flex items-center space-x-1 text-amber-400 text-[10px] font-mono">
              <Flame className="h-3.5 w-3.5" />
              <span>SORTED BY LIVE INTERACTION SCORES</span>
            </span>
          )}
        </div>

        {sortedFAQs.length === 0 ? (
          <div className="text-center py-12 p-8 border border-white/5 rounded-2xl bg-white/[0.01] backdrop-blur-sm">
            <HelpCircle className="h-10 w-10 text-slate-600 mx-auto mb-3 animate-bounce" />
            <p className="text-slate-350 font-display font-medium text-sm">No Matching FAQs Found</p>
            <p className="text-slate-500 text-xs mt-1">Try resetting search filters or review categories in your Saved list.</p>
            <button 
              onClick={() => { setSearchTerm(""); setActiveCategory("all"); }}
              className="mt-4 px-4 py-1.5 accent-gradient hover:opacity-90 text-white font-semibold text-xs rounded-xl transition cursor-pointer shadow-md"
            >
              Reset Search Parameters
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedFAQs.map((faq) => {
              const idExpanded = expandedFAQId === faq.id;
              const isBookmarked = bookmarkedIds.includes(faq.id);
              const langCode = activeLanguages[faq.id] || activeLanguage || "en";

              return (
                <div
                  key={faq.id}
                  id={`faq-${faq.id}`}
                  className={`border rounded-2xl overflow-hidden transition-all duration-300 backdrop-blur-md ${
                    idExpanded 
                      ? "border-purple-500/30 bg-purple-950/5 shadow-[0_4px_30px_rgba(139,92,246,0.06)]" 
                      : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
                  }`}
                >
                  {/* Card Header clickable */}
                  <div
                    onClick={() => handleFAQAccordionClick(faq.id)}
                    className="p-5 flex items-start justify-between cursor-pointer group"
                  >
                    <div className="flex items-start space-x-3.5 pr-4">
                      {/* Numeric ID Stamp */}
                      <span className="font-mono text-[10px] text-purple-300 font-bold bg-purple-950/40 border border-purple-500/20 px-1.5 py-0.5 rounded mt-0.5 shrink-0">
                        {faq.id}
                      </span>
                      
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-500 font-mono tracking-wide uppercase">
                          {faq.category}
                        </span>
                        <h4 className="font-display font-bold text-slate-100 text-sm group-hover:text-purple-400 transition-colors">
                          {getFAQQuestion(faq, langCode)}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2.5 shrink-0">
                      {isBookmarked && (
                        <span className="text-amber-400">
                          <Bookmark className="h-3.5 w-3.5 fill-current" />
                        </span>
                      )}
                      
                      <ChevronDown className={`h-4.5 w-4.5 text-slate-500 transition-transform duration-300 ${
                        idExpanded ? "transform rotate-180 text-purple-400" : "group-hover:text-slate-300"
                      }`} />
                    </div>
                  </div>

                  {/* Collapsible Content */}
                  <AnimatePresence initial={false}>
                    {idExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                      >
                        <div className="px-5 pb-5 pt-1 border-t border-white/5 bg-white/[0.01] space-y-4">
                          
                          {/* Language Translator selector */}
                          <div className="flex items-center justify-between border-b border-white/5 pb-2.5 pt-1.5">
                            <span className="text-[10px] text-slate-500 font-mono font-bold flex items-center">
                              <Languages className="h-3 w-3 mr-1 text-purple-400" />
                              {getUiLabel("LANGUAGE TRANSLATOR:")}
                            </span>

                            <div className="flex items-center space-x-1.5">
                              {([
                                { code: "en", label: "EN" },
                                { code: "hi", label: "हिंदी" },
                                { code: "pa", label: "ਪੰਜਾਬੀ" },
                                { code: "es", label: "ES" }
                              ] as const).map((lang) => (
                                <button
                                  key={lang.code}
                                  onClick={() => changeLanguage(faq.id, lang.code)}
                                  className={`px-2 py-0.5 rounded text-[9px] font-mono tracking-wider transition cursor-pointer ${
                                    langCode === lang.code 
                                      ? "bg-purple-600 font-bold text-white shadow-sm shadow-purple-500/20" 
                                      : "bg-white/5 hover:bg-white/10 text-slate-400"
                                  }`}
                                >
                                  {lang.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Loading and Error Indicators */}
                          {loadingTranslations[faq.id]?.[langCode] && (
                            <div className="flex items-center space-x-2 text-[10px] text-purple-400 bg-purple-950/20 px-3 py-1.5 rounded-lg border border-purple-500/10 animate-pulse">
                              <div className="h-2 w-2 rounded-full bg-purple-400 animate-ping" />
                              <span>Translating dynamically to {langCode === "hi" ? "Hindi (हिन्दी)" : langCode === "pa" ? "Punjabi (ਪੰਜਾਬੀ)" : "Spanish (ES)"}...</span>
                            </div>
                          )}

                          {translationErrors[faq.id] && (
                            <div className="text-[10px] text-amber-400 bg-amber-500/5 px-3 py-1.5 rounded-lg border border-amber-500/10 flex items-center space-x-1.5">
                              <span>⚠️ {translationErrors[faq.id]}</span>
                            </div>
                          )}

                          {/* Markdown formatted styled Answer block */}
                          <div className="text-slate-200 text-xs md:text-sm leading-relaxed font-sans prose prose-invert">
                            {getFAQAnswer(faq, langCode)}
                          </div>

                          {/* Category tags */}
                          <div className="flex flex-wrap gap-1.5">
                            {getFAQTags(faq, langCode).map((tag) => (
                              <span 
                                key={tag} 
                                onClick={(e) => { e.stopPropagation(); setSearchTerm(tag); }}
                                className="bg-white/5 border border-white/10 text-slate-400 text-[10px] font-mono px-2 py-0.5 rounded hover:text-purple-300 hover:border-purple-500/20 transition cursor-pointer"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>

                          {/* Related FAQs anchor points */}
                          {faq.related && faq.related.length > 0 && (
                            <div className="border-t border-white/5 pt-3">
                              <span className="font-mono text-[10px] text-slate-500 tracking-wider block mb-2">
                                {getUiLabel("RELATED KNOWLEDGE LINKS (Click to inspect)")}
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {faq.related.map((relId) => {
                                  const linkedFAQ = faqs.find(f => f.id === relId);
                                  if (!linkedFAQ) return null;
                                  return (
                                    <button
                                      key={relId}
                                      onClick={() => handleFAQAccordionClick(relId)}
                                      className="text-left p-2 rounded-lg bg-[#050505] border border-white/5 hover:bg-purple-950/15 hover:border-purple-500/15 text-xs text-slate-400 hover:text-purple-300 transition flex items-center justify-between cursor-pointer animate-fade-in"
                                    >
                                      <span className="truncate pr-1.5">[{linkedFAQ.id}] {getFAQQuestion(linkedFAQ, langCode)}</span>
                                      <ExternalLink className="h-3 w-3 shrink-0 text-slate-600" />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Action toolbar block */}
                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-900 pt-4 text-xs font-mono text-slate-500">
                            
                            {/* Static updated date & Popularity counters */}
                            <div className="flex items-center space-x-3.5 text-[10px]">
                              <span className="flex items-center space-x-1">
                                <Calendar className="h-3.5 w-3.5 text-slate-600" />
                                <span>{getUiLabel("Updated:")} {faq.lastUpdated}</span>
                              </span>
                              <span className="flex items-center space-x-1">
                                <Eye className="h-3.5 w-3.5 text-slate-600" />
                                <span>{getUiLabel("Views Count:")} {faq.popularity}</span>
                              </span>
                            </div>

                            {/* Utility actions */}
                            <div className="flex flex-wrap items-center gap-2">
                              
                              {/* Direct AI Prompter */}
                              <button
                                onClick={() => onAskAI(getFAQQuestion(faq, langCode))}
                                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-violet-600/10 border border-violet-500/20 text-violet-400 hover:bg-violet-600 hover:text-white transition cursor-pointer font-bold text-[10px]"
                              >
                                <Sparkles className="h-3 w-3" />
                                <span>{getUiLabel("ASK AI ABOUT THIS")}</span>
                              </button>

                              {/* Copy Link */}
                              <button
                                onClick={(e) => copyFAQLink(faq.id, e)}
                                className={`p-1.5 rounded border transition flex items-center space-x-1 cursor-pointer ${
                                  copyFeedbackId === faq.id 
                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                                }`}
                                title="Copy permanent link to system clipboard"
                              >
                                {copyFeedbackId === faq.id ? (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    <span className="text-[10px]">{getUiLabel("COPIED")}</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3.5 w-3.5" />
                                    <span className="text-[10px]">{getUiLabel("LINK")}</span>
                                  </>
                                )}
                              </button>

                              {/* Save Bookmark */}
                              <button
                                onClick={(e) => toggleBookmark(faq.id, e)}
                                className={`p-1.5 rounded border transition flex items-center space-x-1 cursor-pointer ${
                                  isBookmarked 
                                    ? "bg-amber-500/15 border-amber-500/30 text-amber-400" 
                                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                                }`}
                                title="Save to local bookmark index"
                              >
                                <Bookmark className={`h-3.5 w-3.5 ${isBookmarked ? "fill-current" : ""}`} />
                                <span className="text-[10px]">{isBookmarked ? getUiLabel("SAVED") : getUiLabel("SAVE")}</span>
                              </button>

                              {/* Voting System */}
                              <div className="flex items-center space-x-1 border border-slate-800 bg-slate-900 rounded overflow-hidden">
                                <button
                                  onClick={(e) => handleUpvote(faq.id, e)}
                                  className="p-1.5 transition text-slate-400 hover:text-emerald-400 focus:outline-none cursor-pointer"
                                  title="Approve / Upvote"
                                >
                                  <ThumbsUp className="h-3.5 w-3.5" />
                                </button>
                                <span className="text-[10px] text-slate-400 px-1 border-r border-l border-slate-950 font-bold">
                                  {faq.upvotes}
                                </span>
                                <button
                                  onClick={(e) => handleDownvote(faq.id, e)}
                                  className="p-1.5 transition text-slate-400 hover:text-red-400 focus:outline-none cursor-pointer"
                                  title="Disapprove / Downvote"
                                >
                                  <ThumbsDown className="h-3.5 w-3.5" />
                                </button>
                              </div>

                            </div>
                            
                          </div>

                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}

        {/* REVOLUTIONARY PUBLIC DISCUSSION FORUM */}
        <div className="glass rounded-2xl p-6 backdrop-blur-xl mt-8">
          <div className="flex items-center space-x-3.5 mb-2">
            <div className="h-9 w-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-white font-display font-bold text-sm">Cannot find your answer? Open a Discussion</h3>
              <p className="text-slate-400 text-xs">Post a question to start a thread. Co-ordinators answer and verify threads as official FAQs!</p>
            </div>
          </div>

          <form onSubmit={handleDiscussionSubmit} className="space-y-3.5 mt-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={discussionInput}
                onChange={(e) => setDiscussionInput(e.target.value)}
                placeholder="Type your question (e.g., Can on-campus teams book research cabins on Saturdays?)..."
                className="flex-1 bg-[#050505] border border-white/10 text-xs text-white rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500/40"
              />
              <button
                type="submit"
                className="px-5 py-3 accent-gradient text-white font-bold text-xs rounded-xl transition shrink-0 cursor-pointer flex items-center space-x-1.5 shadow-md hover:scale-[1.02]"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Submit Query</span>
              </button>
            </div>

            {discussionSubmittedMsg && (
              <div className={`p-3 rounded-xl text-xs flex items-center space-x-2 border ${
                discussionSubmittedMsg.isError 
                  ? "bg-red-500/10 border-red-500/20 text-red-400" 
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              }`}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p className="leading-relaxed font-sans">{discussionSubmittedMsg.text}</p>
              </div>
            )}
          </form>
        </div>

      </div>
      
    </div>
  );
}
