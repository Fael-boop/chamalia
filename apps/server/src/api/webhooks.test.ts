import { describe, expect, it } from "vitest";
import { customerJid, messageText, quotedMessageId } from "./webhooks.js";

describe("Evolution webhook parsing", () => {
  it("uses the phone JID, also when WhatsApp addresses the chat by LID", () => {
    expect(customerJid({ remoteJid: "5511987654321@s.whatsapp.net" })).toBe("5511987654321@s.whatsapp.net");
    expect(customerJid({ remoteJid: "123456789012345@lid", remoteJidAlt: "5511987654321@s.whatsapp.net" })).toBe(
      "5511987654321@s.whatsapp.net",
    );
  });

  it("ignores groups and LID-only chats", () => {
    expect(customerJid({ remoteJid: "120363000000000000@g.us" })).toBeUndefined();
    expect(customerJid({ remoteJid: "123456789012345@lid" })).toBeUndefined();
  });

  it("reads plain and extended text, nothing for media", () => {
    expect(messageText({ message: { conversation: " oi " } })).toBe("oi");
    expect(messageText({ message: { extendedTextMessage: { text: "link aqui" } } })).toBe("link aqui");
    expect(messageText({ message: { audioMessage: {} }, messageType: "audioMessage" })).toBeUndefined();
  });

  it("reads which message a reply quotes", () => {
    expect(quotedMessageId({ message: { extendedTextMessage: { text: "resolvido", contextInfo: { stanzaId: "ABC" } } } })).toBe("ABC");
    expect(quotedMessageId({ message: { conversation: "resolvido" }, contextInfo: { stanzaId: "XYZ" } })).toBe("XYZ");
    expect(quotedMessageId({ message: { conversation: "resolvido" } })).toBeUndefined();
  });
});
