import { describe, expect, it } from "vitest";
import { TranscriptionError, groqTranscriber } from "./transcribe.js";

describe("groqTranscriber", () => {
  it("sends the voice note as an .ogg file in Portuguese and returns the text", async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ text: " quero marcar um corte amanhã " }), { status: 200 });
    }) as unknown as typeof fetch;

    const text = await groqTranscriber("key", "whisper-large-v3-turbo", fakeFetch)(Buffer.from("ogg"), "audio/ogg; codecs=opus");

    expect(text).toBe("quero marcar um corte amanhã");
    expect(sent!.url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect((sent!.init.headers as Record<string, string>).authorization).toBe("Bearer key");
    const form = sent!.init.body as FormData;
    expect(form.get("language")).toBe("pt");
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect((form.get("file") as File).name).toBe("audio.ogg");
  });

  it("fails without leaking the response body", async () => {
    const fakeFetch = (async () => new Response("secret words", { status: 500 })) as unknown as typeof fetch;
    const promise = groqTranscriber("key", "m", fakeFetch)(Buffer.from("x"), "audio/ogg");
    await expect(promise).rejects.toBeInstanceOf(TranscriptionError);
    await expect(promise).rejects.not.toThrow(/secret/);
  });
});
