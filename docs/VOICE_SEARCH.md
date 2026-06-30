# Voice Search Pipeline Guide

What it does: Captures user speech input via the browser's native Speech Recognition API, updates the search query composer with zero render lag, and automatically submits search queries upon voice silence detection.

---

## Files
* **Frontend Component:** [frontend/src/components/askai/AskAIButton.tsx](file:///c:/CSFAQ2/crowd-source-faq/frontend/src/components/askai/AskAIButton.tsx)
* **Custom Hook:** [frontend/src/hooks/useVoiceTranscription.ts](file:///c:/CSFAQ2/crowd-source-faq/frontend/src/hooks/useVoiceTranscription.ts)

---

## Pipeline Flow

```
User Clicks Microphone Button
         │
         ▼
Warm Up Microphone (getUserMedia)
  - Explicit hardware check
  - Prevents latency during initialization
         │
         ▼
Instantiate SpeechRecognition
  - window.SpeechRecognition or webkitSpeechRecognition
  - Continuous = true (keeps listening between pauses)
  - InterimResults = true (live feedback)
         │
         ▼
Listening Stream Active
         │
         ├── [Speech Sound Captured] ──► onresult callback triggered
         │                                 │
         │                                 ▼
         │                               Write directly to textarea DOM node
         │                               (Bypasses React state cycle for zero lag)
         │                                 │
         │                                 ▼
         │                               Start 1200ms Silence Timer
         │
         └── [1200ms of Silence] ──────► stopRecording() triggered
                                           │
                                           ▼
                                         Commit final text to React state
                                           │
                                           ▼
                                         Auto-submit query to Search controller
```

---

## How to Use & Verify

Follow these steps to configure and verify voice transcription features:

### Step 1: Open Chrome or Edge
The HTML5 SpeechRecognition API relies on native operating system speech decoders, which are fully supported in Google Chrome and Microsoft Edge.

### Step 2: Activate the Assistant
1. Boot the application stack:
   ```bash
   npm run dev:local
   ```
2. Navigate to `http://localhost:5173` and click the FAQ Assistant icon (floating action button in the bottom right).

### Step 3: Grant Permissions & Speak
1. Click the microphone icon `🎙️` next to the search input text field.
2. Grant permission when the browser prompts for microphone access.
3. Speak a question, e.g., *"How do I submit my offer letter?"*
4. **Expected Behavior:** The spoken words should render in the text input box in real-time as you speak. After you pause speaking for more than 1.2 seconds, the recording stops automatically, and the search submits, triggering the RAG search.

---

## Error Handling & Troubleshooting

| Error Event | Cause | Resolution Instruction for Users |
| :--- | :--- | :--- |
| `not-allowed` | Microphone access blocked by browser settings. | Click the lock icon in the browser address bar and toggle Microphone to **Allow**. |
| `audio-capture` | No physical microphone device found. | Check system settings to verify audio input hardware is connected. |
| `network` | No internet connection. | Ensure network is online; Chrome/Edge delegate speech decoding to cloud-based speech servers. |
| `service-not-allowed` | Non-secure context. | Ensure you are running on `localhost` or an `https://` domain; browsers block Speech APIs on insecure HTTP sites. |
