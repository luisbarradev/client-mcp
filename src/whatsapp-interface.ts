import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  ConnectionState,
  BaileysEventMap,
} from "baileys";
import qrcode from "qrcode-terminal";

import { MCPClient } from "./mcp-client.js";

export async function startWhatsAppInterface(mcp: MCPClient): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

  const sock: WASocket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("Escanea este código QR con tu WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log("Conexión cerrada. Reconectar?", shouldReconnect);
      if (shouldReconnect) startWhatsAppInterface(mcp);
    }

    if (connection === "open") {
      console.log("✅ Conectado a WhatsApp");
    }
  });

  sock.ev.on(
    "messages.upsert",
    async (msgUpdate: BaileysEventMap["messages.upsert"]) => {
      const { messages, type } = msgUpdate;

      if (type !== "notify") return;
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const from = msg.key.remoteJid!;
      const text =
        msg.message.conversation || msg.message.extendedTextMessage?.text || "";

      console.log(`Recibido de ${from}: ${text}`);

      try {
        const messageGenerator = mcp.processQueryStreaming(text, from);
        await sock.sendPresenceUpdate("composing", from);

        for await (const chunk of messageGenerator) {
          const content = chunk.content.slice(0, 4096);

          let messageText = content;
          if (chunk.type === "tool_start") {
          } else if (chunk.type === "tool_result") {
            messageText = `📊 Resultado: ${content}`;
          }

          await sock.sendMessage(from, { text: messageText });
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        await sock.sendPresenceUpdate("available", from);
        console.log(`Respuestas enviadas a ${from}`);
      } catch (e) {
        console.error("❌ Error al procesar la consulta:", e);
        await sock.sendMessage(from, { text: "Lo siento, ocurrió un error." });
      }
    }
  );
}
