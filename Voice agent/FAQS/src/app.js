const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const questionForm = document.querySelector("#questionForm");
const questionInput = document.querySelector("#questionInput");
const voiceButton = document.querySelector("#voiceButton");
const stopButton = document.querySelector("#stopButton");
const muteButton = document.querySelector("#muteButton");
const voiceSelect = document.querySelector("#voiceSelect");
const faqBadge = document.querySelector("#faqBadge");
const agentStatus = document.querySelector("#agentStatus");
const heardText = document.querySelector("#heardText");
const matchedQuestion = document.querySelector("#matchedQuestion");
const answerText = document.querySelector("#answerText");
const suggestionList = document.querySelector("#suggestionList");
const confidenceText = document.querySelector("#confidenceText");

const stopWords = new Set([
  "a", "about", "am", "an", "and", "any", "are", "as", "at", "be", "been", "by",
  "can", "could", "do", "does", "for", "from", "get", "give", "have", "how", "i",
  "if", "in", "is", "it", "me", "my", "need", "of", "on", "or", "please", "should",
  "the", "this", "to", "want", "was", "what", "when", "where", "who", "why", "will",
  "with", "you", "your"
]);

const synonyms = new Map([
  ["absence", "leave"],
  ["ai", "artificial intelligence"],
  ["begin", "start"],
  ["certificate", "certification"],
  ["college", "institution"],
  ["course", "vibe"],
  ["deadline", "date"],
  ["exams", "exam"],
  ["fees", "free"],
  ["hod", "college official"],
  ["joining", "start"],
  ["lms", "vibe"],
  ["money", "stipend"],
  ["noc", "no objection certificate"],
  ["offline", "vise"],
  ["online", "vins"],
  ["paid", "stipend"],
  ["payment", "stipend"],
  ["salary", "stipend"],
  ["sign", "signature"],
  ["team", "formation"],
  ["training", "bronze"],
  ["zoom", "live session"]
]);

const minimumConfidence = 0.3;
const shortQueryMinimumConfidence = 0.42;
const minimumMargin = 0.1;

let recognition;
let muted = false;
let selectedVoice = null;
let searchableFaqs = [];
let faqReady = false;

const normalize = (text) => text
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const stem = (word) => word
  .replace(/(ing|tion|ions|ment|ments|ed|es|s)$/g, "")
  .replace(/internsh?p/, "internship");

const tokens = (text) => {
  const base = normalize(text)
    .split(" ")
    .filter((word) => word.length > 1 && !stopWords.has(word));

  return base.flatMap((word) => {
    const related = synonyms.get(word);
    return [stem(word), ...(related ? normalize(related).split(" ").map(stem) : [])];
  });
};

const uniqueTokens = (text) => [...new Set(tokens(text))];

const concise = (text) => {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]?/g) || [clean];
  const first = sentences.slice(0, 2).join(" ").trim();
  return first.length > 300 ? `${first.slice(0, 297)}...` : first;
};

const buildSearchableFaqs = (faqs) => faqs.map((faq) => ({
  ...faq,
  shortAnswer: faq.voiceAnswer || concise(faq.answer),
  questionNorm: normalize(faq.question),
  aliasNorms: Array.isArray(faq.aliases) ? faq.aliases.map(normalize) : [],
  questionTokens: uniqueTokens(faq.question),
  aliasTokens: uniqueTokens((faq.aliases || []).join(" ")),
  sectionTokens: uniqueTokens(faq.section || ""),
  answerTokens: uniqueTokens(faq.answer).slice(0, 140)
}));

const setFaqControlsDisabled = (disabled) => {
  questionInput.disabled = disabled;
  questionForm.querySelector("button[type='submit']").disabled = disabled;
  voiceButton.disabled = disabled;
  document.querySelectorAll(".example-button").forEach((button) => {
    button.disabled = disabled;
  });
};

const setStatus = (message) => {
  agentStatus.textContent = message;
};

const scoreFaq = (query, faq) => {
  const queryNorm = normalize(query);
  const queryTokens = uniqueTokens(query);
  if (!queryTokens.length) return 0;

  const questionSet = new Set(faq.questionTokens);
  const aliasSet = new Set(faq.aliasTokens);
  const sectionSet = new Set(faq.sectionTokens);
  const answerSet = new Set(faq.answerTokens);

  const matchedTokenCount = queryTokens.filter((word) => (
    questionSet.has(word) || aliasSet.has(word) || sectionSet.has(word) || answerSet.has(word)
  )).length;

  const weightedHits = queryTokens.reduce((total, word) => {
    if (questionSet.has(word)) return total + 2.6;
    if (aliasSet.has(word)) return total + 3.1;
    if (sectionSet.has(word)) return total + 1.2;
    if (answerSet.has(word)) return total + 0.45;
    return total;
  }, 0);

  const phraseBoost = faq.questionNorm.includes(queryNorm) || queryNorm.includes(faq.questionNorm) ? 0.4 : 0;
  const aliasBoost = faq.aliasNorms.some((alias) => alias.includes(queryNorm) || queryNorm.includes(alias)) ? 0.5 : 0;
  const idBoost = queryNorm.includes(faq.id) ? 0.35 : 0;
  const requiredMatches = queryTokens.length <= 1 ? 1 : 2;
  const baseScore = weightedHits / (queryTokens.length * 2.6);

  if (!phraseBoost && !aliasBoost && !idBoost && matchedTokenCount < requiredMatches) {
    return baseScore * 0.18;
  }

  return baseScore + phraseBoost + aliasBoost + idBoost;
};

const rankAnswers = (query) => searchableFaqs
  .map((faq) => ({ faq, score: scoreFaq(query, faq) }))
  .sort((a, b) => b.score - a.score);

const isConfidentMatch = (ranked, query) => {
  const [best, second] = ranked;
  if (!best) return false;

  const queryLength = uniqueTokens(query).length;
  const threshold = queryLength <= 2 ? shortQueryMinimumConfidence : minimumConfidence;
  const margin = best.score - (second?.score || 0);

  if (best.score < threshold) return false;
  if (queryLength > 2 && second && margin < minimumMargin && best.score < 0.78) return false;
  return true;
};

const chooseVoice = () => {
  if (!window.speechSynthesis) return null;
  const target = voiceSelect.value;
  const voices = window.speechSynthesis.getVoices();
  selectedVoice = voices.find((voice) => voice.lang === target)
    || voices.find((voice) => voice.lang.startsWith(target.split("-")[0]))
    || voices.find((voice) => voice.lang.startsWith("en"))
    || voices[0]
    || null;
  return selectedVoice;
};

const speak = (text) => {
  if (muted || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = selectedVoice || chooseVoice();
  utterance.lang = utterance.voice?.lang || voiceSelect.value;
  utterance.rate = 0.88;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.onstart = () => setStatus("Speaking");
  utterance.onend = () => setStatus("Ready");
  utterance.onerror = () => setStatus("Ready");
  window.speechSynthesis.speak(utterance);
};

const clearSuggestions = () => {
  suggestionList.innerHTML = "";
};

const answerWith = (match) => {
  faqBadge.textContent = `FAQ ${match.faq.id}`;
  matchedQuestion.textContent = match.faq.question;
  answerText.textContent = match.faq.shortAnswer;
  confidenceText.textContent = `${Math.round(Math.min(match.score, 1) * 100)}% match. Check FAQ ${match.faq.id} on the official page for the full wording.`;
  clearSuggestions();
  setStatus("Answered");
  speak(`FAQ ${match.faq.id}. ${match.faq.shortAnswer}`);
};

const renderSuggestions = (ranked) => {
  clearSuggestions();
  ranked.slice(0, 4).forEach((match) => {
    const button = document.createElement("button");
    button.className = "suggestion-button";
    button.type = "button";
    button.textContent = `FAQ ${match.faq.id}: ${match.faq.question}`;
    button.addEventListener("click", () => {
      heardText.textContent = button.textContent;
      answerWith({ ...match, score: Math.max(match.score, 0.8) });
    });
    suggestionList.appendChild(button);
  });
};

const showFallback = (query, ranked) => {
  faqBadge.textContent = "FAQ";
  heardText.textContent = query;
  matchedQuestion.textContent = "Please choose the closest FAQ";
  answerText.textContent = "I am not confident enough to answer automatically.";
  confidenceText.textContent = "No answer was spoken to avoid a false match.";
  renderSuggestions(ranked.filter((item) => item.score > 0.08));
  setStatus("Needs detail");
};

const answerQuestion = (query) => {
  if (!faqReady) {
    setStatus("Loading FAQ");
    answerText.textContent = "Fetching the latest FAQ from the official page.";
    return;
  }

  const cleanQuery = query.trim();
  if (!cleanQuery) return;

  heardText.textContent = cleanQuery;
  setStatus("Searching");
  clearSuggestions();

  const ranked = rankAnswers(cleanQuery);
  if (!isConfidentMatch(ranked, cleanQuery)) {
    showFallback(cleanQuery, ranked);
    return;
  }

  answerWith(ranked[0]);
};

const setupRecognition = () => {
  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    voiceButton.querySelector("span:last-child").textContent = "Voice unavailable";
    setStatus("Text only");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    voiceButton.classList.add("is-listening");
    setStatus("Listening");
  };

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results).map((result) => result[0].transcript).join(" ");
    questionInput.value = transcript;
    heardText.textContent = transcript;

    if (event.results[event.results.length - 1].isFinal) {
      answerQuestion(transcript);
    }
  };

  recognition.onerror = () => setStatus("Text only");
  recognition.onend = () => {
    voiceButton.classList.remove("is-listening");
    if (agentStatus.textContent === "Listening") setStatus("Ready");
  };
};

questionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  answerQuestion(questionInput.value);
});

voiceButton.addEventListener("click", () => {
  if (recognition) recognition.start();
});

stopButton.addEventListener("click", () => {
  if (recognition) recognition.stop();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  setStatus("Stopped");
});

muteButton.addEventListener("click", () => {
  muted = !muted;
  muteButton.setAttribute("aria-pressed", String(muted));
  muteButton.textContent = muted ? "Voice off" : "Voice on";
  if (muted && window.speechSynthesis) window.speechSynthesis.cancel();
});

voiceSelect.addEventListener("change", () => {
  chooseVoice();
  if (recognition) recognition.lang = voiceSelect.value === "en-IN" ? "en-IN" : "en-US";
});

document.querySelectorAll(".example-button").forEach((button) => {
  button.addEventListener("click", () => {
    questionInput.value = button.textContent;
    answerQuestion(button.textContent);
  });
});

const loadFaqs = async () => {
  setFaqControlsDisabled(true);
  setStatus("Loading FAQ");
  matchedQuestion.textContent = "Loading latest FAQ";
  answerText.textContent = "Loading answers from the local FAQ data.";

  const response = await fetch("/api/faqs");
  if (!response.ok) {
    throw new Error("FAQ request failed");
  }

  const payload = await response.json();
  if (!Array.isArray(payload.faqs) || !payload.faqs.length) {
    throw new Error("No FAQ entries returned");
  }

  searchableFaqs = buildSearchableFaqs(payload.faqs);
  faqReady = true;
  setFaqControlsDisabled(false);
  setStatus(payload.stale ? "Ready (cached)" : "Ready");
  matchedQuestion.textContent = "No answer yet";
  answerText.textContent = "The agent is using the local FAQ data bundled with this project.";
  confidenceText.textContent = `Loaded ${payload.faqs.length} FAQs from the official page.`;
};

const init = async () => {
  setupRecognition();
  chooseVoice();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = chooseVoice;
  }

  try {
    await loadFaqs();
  } catch (error) {
    setFaqControlsDisabled(true);
    faqReady = false;
    setStatus("FAQ unavailable");
    matchedQuestion.textContent = "Live FAQ could not be loaded";
    answerText.textContent = "Please restart the server and confirm data/faq-seed.json exists.";
    confidenceText.textContent = error.message;
  }
};

init();
