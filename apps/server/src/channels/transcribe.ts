/**
 * Voice messages become text before they reach the assistant: Claude reads text, images and
 * PDFs, not audio. Groq runs Whisper behind an OpenAI-style endpoint.
 */
export type Transcriber = (audio: Buffer, mime: string) => Promise<string>;

/** Longest voice message we transcribe; longer ones get a polite "please shorten it". */
export const MAX_AUDIO_SECONDS = 120;

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export class TranscriptionError extends Error {}

/** WhatsApp voice notes are "audio/ogg; codecs=opus"; the file name tells Whisper the format. */
function fileNameFor(mime: string): string {
  const type = mime.split(";")[0]!.trim();
  const extension = { "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "m4a", "audio/wav": "wav", "audio/webm": "webm" }[type];
  return `audio.${extension ?? "ogg"}`;
}

export function groqTranscriber(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): Transcriber {
  return async (audio, mime) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime.split(";")[0] }), fileNameFor(mime));
    form.append("model", model);
    form.append("language", "pt");
    form.append("response_format", "json");
    const response = await fetchImpl(GROQ_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    // The body may echo what was said, so it stays out of the error (and of the log).
    if (!response.ok) throw new TranscriptionError(`Groq transcription failed: ${response.status}`);
    const { text } = (await response.json()) as { text?: string };
    return (text ?? "").trim();
  };
}
