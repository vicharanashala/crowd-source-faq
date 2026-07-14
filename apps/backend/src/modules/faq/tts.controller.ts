import { Request, Response } from 'express';
import FAQ from './faq.model.js';
import { resolveProviderAsync } from '../../utils/ai/aiProvider.js';

/**
 * GET /api/faq/:id/tts
 * Generates an audio version of the FAQ question and answer.
 * If OpenAI TTS is configured, it streams the MP3 audio.
 * Otherwise, returns 204 No Content, signaling the frontend to use local Web Speech API.
 */
export const getFaqTts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const faq = await FAQ.findById(id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }

    // Strip markdown characters for a cleaner spoken text
    const cleanText = `${faq.question}. ${faq.answer.replace(/[*#`_\-]/g, '')}`;

    try {
      const config = await resolveProviderAsync('openai');
      if (!config.apiKey) {
        res.status(204).end(); // No Content — signal frontend to use browser speech synthesis
        return;
      }

      const response = await fetch(`${config.baseURL}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: cleanText.slice(0, 4000), // TTS-1 character cap
          voice: 'alloy',
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI TTS responded with status ${response.status}`);
      }

      res.setHeader('Content-Type', 'audio/mpeg');
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (apiErr) {
      // API error or timeout — fallback to client-side speech
      res.status(204).end();
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate speech' });
  }
};
