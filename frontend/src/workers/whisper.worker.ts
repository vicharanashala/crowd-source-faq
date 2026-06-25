import { pipeline, env } from '@xenova/transformers';

// Tell Xenova to fetch models from HF CDN rather than searching locally
env.allowLocalModels = false;

let transcriber: any = null;

// Initialize the free, multilingual Whisper model
const getTranscriber = async () => {
    if (!transcriber) {
        // This downloads the model from Hugging Face ONLY on the first click, then caches it forever
        transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
    }
    return transcriber;
};

// Listen for microphone audio data sent from the React UI hook
self.addEventListener('message', async (event: MessageEvent) => {
    const { audioData } = event.data;
    try {
        const pipe = await getTranscriber();
        const output = await pipe(audioData, {
            chunk_length_s: 30,
            stride_length_s: 5,
            task: 'translate', // <-- Translates spoken Hindi/Gujarati directly into English text for your RAG database!
        });
        
        // Send the clean English text back to the frontend input box
        self.postMessage({ status: 'completed', text: output.text });
    } catch (error: any) {
        self.postMessage({ status: 'error', error: error.message });
    }
});