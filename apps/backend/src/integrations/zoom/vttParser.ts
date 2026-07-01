/**
 * Parses Zoom VTT (WebVTT) transcript files into clean plain text.
 *
 * Zoom VTT format example:
 *   WEBVTT
 *
 *   00:00:00.000 --> 00:00:03.500
 *   Speaker Name
 *   This is the transcript text.
 *
 *   00:00:04.000 --> 00:00:07.500
 *   Another Speaker
 *   Another line.
 *
 * We strip:
 *   - WEBVTT header
 *   - Timestamp lines
 *   - Speaker labels (short capitalized lines before transcript text)
 *   - Empty lines
 *
 * Returns an array of { speaker, text, startSec } segments for downstream LLM use.
 */

export interface TranscriptSegment {
  speaker: string;
  text: string;
  /** Wall-clock seconds from the VTT timestamp */
  startSec: number;
}

/**
 * Convert VTT timestamp (HH:MM:SS.mmm) to seconds.
 */
function timestampToSeconds(ts: string): number {
  const parts = ts.trim().split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
  }
  return 0;
}

/**
 * Returns true if `line` looks like a Zoom speaker label rather than transcript text.
 * Heuristic: ≤4 words, starts with a capital letter, no internal periods/comma,
 * and the next non-blank line is longer (i.e. actual transcript content).
 * Fallback: if there is any non-empty next line, the shorter one wins.
 */
function isSpeakerLabel(line: string, nextNonBlank: string | null): boolean {
  if (!line || line.length > 60) return false;
  // Must start with capital letter
  if (!/^[A-Z]/.test(line)) return false;
  // No periods or commas inside (those indicate sentences = transcript text)
  if (/[.,]/.test(line)) return false;
  const wordCount = line.trim().split(/\s+/).length;
  if (wordCount > 4) return false;
  // If we have a next line, it should be longer to confirm this is a label
  if (nextNonBlank !== null) {
    return nextNonBlank.length > line.length;
  }
  return true;
}

/**
 * Main parse function. Returns clean plain-text string (no timestamps/speakers).
 */
export function parseVTT(vttContent: string): string {
  const segments = parseVTTWithSpeakers(vttContent);
  return segments
    .map((s) => `${s.speaker ? s.speaker + ': ' : ''}${s.text}`)
    .join('\n');
}

/**
 * Parse VTT returning speaker + text + startSec segments.
 *
 * State machine:
 *   LINE_TYPE.BLANK  → skip
 *   LINE_TYPE.TIME   → snapshot startSec, enter timestamp block
 *   LINE_TYPE.SPEAKER→ set currentSpeaker (if heuristic passes)
 *   LINE_TYPE.TEXT   → append to currentText
 */
enum LineType { BLANK, TIME, SPEAKER, TEXT }

function classifyLine(line: string): LineType {
  if (!line) return LineType.BLANK;
  if (line.includes('-->')) return LineType.TIME;
  if (line === 'WEBVTT' || line.startsWith('NOTE ') || /^\s*<\/?[a-z]/.test(line)) return LineType.BLANK;
  return LineType.TEXT;
}

export function parseVTTWithSpeakers(vttContent: string): TranscriptSegment[] {
  const rawLines = vttContent.split(/\r?\n/);

  // Build a preview of non-blank lines for the heuristic
  const nonBlank: string[] = rawLines.filter(l => l.trim().length > 0);

  const segments: TranscriptSegment[] = [];
  let currentSpeaker = '';
  let currentText = '';
  let currentStartSec = 0;
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i].trim();
    const type = classifyLine(line);

    if (type === LineType.BLANK) {
      // Flush accumulated segment
      if (currentText) {
        segments.push({ speaker: currentSpeaker.trim(), text: currentText.trim(), startSec: currentStartSec });
        currentSpeaker = '';
        currentText = '';
      }
      i++;
      continue;
    }

    if (type === LineType.TIME) {
      // Extract start timestamp from "00:00:00.000 --> ..."
      const start = line.split('-->')[0].trim();
      currentStartSec = timestampToSeconds(start);
      currentText = '';
      currentSpeaker = '';

      // Look ahead at the next non-blank line to classify it
      const nextIdx = i + 1;
      const nextNonBlank = nextIdx < rawLines.length
        ? (rawLines.slice(nextIdx).find(l => l.trim().length > 0) ?? null)
        : null;

      // Check the line immediately after the timestamp (potential speaker)
      const afterTimeIdx = i + 1;
      if (afterTimeIdx < rawLines.length) {
        const afterTime = rawLines[afterTimeIdx].trim();
        const afterType = classifyLine(afterTime);
        if (afterType === LineType.TEXT && isSpeakerLabel(afterTime, nextNonBlank)) {
          currentSpeaker = afterTime;
          // Everything after the speaker line is text until blank
          let j = afterTimeIdx + 1;
          while (j < rawLines.length) {
            const l = rawLines[j].trim();
            if (!l) break;
            currentText += (currentText ? ' ' : '') + l;
            j++;
          }
          i = j;
          continue;
        }
      }
      i++;
      continue;
    }

    // Plain text line (within a timestamp block that had no speaker line)
    currentText += (currentText ? ' ' : '') + line;
    i++;
  }

  // Flush final segment
  if (currentText) {
    segments.push({ speaker: currentSpeaker.trim(), text: currentText.trim(), startSec: currentStartSec });
  }

  return segments;
}

/**
 * Returns a concise excerpt for a time range.
 * Uses per-segment startSec (when available) to select the right window.
 */
export function extractSnippet(segments: TranscriptSegment[], startSeconds = 0, maxSeconds = 60): string {
  const endSeconds = startSeconds + maxSeconds;
  return segments
    .filter((s) => s.startSec >= startSeconds && s.startSec < endSeconds)
    .slice(0, 5)
    .map((s) => `${s.speaker ? s.speaker + ': ' : ''}${s.text}`)
    .join(' ')
    .slice(0, 400);
}

/**
 * Checks if the transcript is effectively empty or too short to process.
 * Logs a warning for transcripts below 50 chars (but still allows them through).
 */
export function isEmptyTranscript(vttContent: string): { empty: boolean; warning: boolean } {
  const text = parseVTT(vttContent);
  const chars = text.replace(/\s/g, '').length;
  return { empty: chars < 30, warning: chars < 50 };
}

/**
 * v1.70 — fix #10: same empty-detection logic, but takes the
 * already-parsed segments instead of the raw VTT content. Lets callers
 * parse once and reuse the result for both the empty-check and
 * downstream processing — previously the empty check internally called
 * parseVTT (which itself calls parseVTTWithSpeakers), so callers that
 * also needed the segments were parsing the same transcript twice.
 *
 * Thresholds match isEmptyTranscript (empty <30 chars, warning <50).
 */
export function isEmptyFromSegments(segments: TranscriptSegment[]): { empty: boolean; warning: boolean } {
  const chars = segments
    .map((s) => `${s.speaker ? s.speaker + ' ' : ''}${s.text}`)
    .join('')
    .replace(/\s/g, '').length;
  return { empty: chars < 30, warning: chars < 50 };
}