import dotenv from "dotenv";

import { MCPClient } from "./mcp-client.js";
import { startWhatsAppInterface } from "./whatsapp-interface.js";

dotenv.config();

async function main() {
  const script = process.argv[2];
  if (!script) {
    console.log("Uso: node index.js <ruta_servidor_mcp>");
    return;
  }

  const mcp = new MCPClient();
  try {
    await mcp.connect(script);
    await startWhatsAppInterface(mcp);
  } catch (e) {
    console.error("Error en el sistema:", e);
    await mcp.cleanup();
    process.exit(1);
  }
}

main();
