import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources.js";
import { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { MessageChunk, ToolResult } from "./types/index.js";

export class MCPClient {
  private readonly mcp: Client;
  private readonly anthropic: Anthropic;
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];
  private readonly history: Map<string, MessageParam[]> = new Map();
  private readonly maxToolDepth = 3; // Máxima profundidad de recursión para llamadas a tools
  private readonly modelId = "claude-3-5-sonnet-20241022";
  private readonly defaultMaxTokens = 1000;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY no está configurada en las variables de entorno"
      );
    }

    this.anthropic = new Anthropic({ apiKey });
    this.mcp = new Client({
      name: "mcp-client-whatsapp",
      version: "1.0.0",
    });
  }

  async connect(serverScriptPath: string): Promise<void> {
    const isJs = serverScriptPath.endsWith(".js");
    const isPy = serverScriptPath.endsWith(".py");

    if (!isJs && !isPy) {
      throw new Error("El script del servidor debe tener extensión .js o .py");
    }

    const command = isPy
      ? process.platform === "win32"
        ? "python"
        : "python3"
      : process.execPath;

    try {
      this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });

      this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));

      console.log(
        "tools disponibles:",
        this.tools.map((t) => t.name)
      );
    } catch (error) {
      console.error("Error al conectar con el servidor MCP:", error);
      throw error;
    }
  }

  private getUserHistory(userId: string): MessageParam[] {
    if (!this.history.has(userId)) {
      this.history.set(userId, []);
    }
    return this.history.get(userId)!;
  }

  /**
   * Procesa respuestas de tools recursivamente con seguimiento de profundidad
   * @param toolHistory Historial específico para el procesamiento de tools
   * @param currentDepth Profundidad actual de la recursión
   * @returns Texto resultante del procesamiento
   */
  private async processToolResponse(
    toolHistory: MessageParam[],
    currentDepth: number = 0
  ): Promise<string> {
    if (currentDepth >= this.maxToolDepth) {
      return "Límite de llamadas a herramientas alcanzado.";
    }

    try {
      const next = await this.anthropic.messages.create({
        model: this.modelId,
        max_tokens: this.defaultMaxTokens,
        messages: toolHistory,
        tools: this.tools,
      });

      if (next.content.length === 0) {
        return "";
      }

      let result = "";

      for (const content of next.content) {
        if (content.type === "text") {
          toolHistory.push({
            content: content.text,
            role: "assistant",
          });
          result += content.text;
        } else if (
          content.type === "tool_use" &&
          currentDepth < this.maxToolDepth
        ) {
          try {
            const nestedToolResult = (await this.mcp.callTool({
              name: content.name,
              arguments: content.input as { [x: string]: unknown },
            })) as ToolResult;

            const textContent = nestedToolResult.content
              .filter((item) => item.type === "text")
              .map((item) => item.text);

            toolHistory.push({
              role: "user",
              content: textContent.join(", "),
            });

            const nestedResponse = await this.processToolResponse(
              toolHistory,
              currentDepth + 1
            );

            result += nestedResponse;
          } catch (toolError) {
            console.error(
              `Error al llamar herramienta ${content.name}:`,
              toolError
            );
            result += `\n[Error al usar herramienta: ${content.name}]\n`;
          }
        }
      }

      return result;
    } catch (error) {
      console.error("Error en processToolResponse:", error);
      return "Error al procesar la respuesta de la herramienta.";
    }
  }

  /**
   * Procesa una consulta y devuelve la respuesta en formato streaming
   * @param query Consulta del usuario
   * @param userId ID único del usuario
   * @yields Fragmentos de mensaje durante el procesamiento
   */
  async *processQueryStreaming(
    query: string,
    userId: string
  ): AsyncGenerator<MessageChunk> {
    if (!query || !userId) {
      throw new Error("La consulta y el ID de usuario son obligatorios");
    }

    try {
      const userHistory = this.getUserHistory(userId);

      const userMessage: MessageParam = {
        role: "user",
        content: query,
      };
      userHistory.push(userMessage);

      const response = await this.anthropic.messages.create({
        model: this.modelId,
        max_tokens: this.defaultMaxTokens,
        messages: userHistory,
        tools: this.tools,
      });

      for (const content of response.content) {
        if (content.type === "text") {
          userHistory.push({
            content: content.text,
            role: "assistant",
          });

          yield { type: "text", content: content.text };
        } else if (content.type === "tool_use") {
          yield {
            type: "tool_start",
            content: `[Usando herramienta: ${content.name}]`,
          };

          try {
            const result = (await this.mcp.callTool({
              name: content.name,
              arguments: content.input as { [x: string]: unknown },
            })) as ToolResult;

            const textContent = result.content
              .filter((item) => item.type === "text")
              .map((item) => item.text);

            const toolResultMessage: MessageParam = {
              role: "user",
              content: textContent.join(", "),
            };
            userHistory.push(toolResultMessage);

            const clonedHistory = [...userHistory]; // Clonar para evitar modificar el original
            const toolResponse = await this.processToolResponse(
              clonedHistory,
              0
            );

            while (userHistory.length < clonedHistory.length) {
              userHistory.push(clonedHistory[userHistory.length]);
            }

            // TODO: Agregar soporte a IMG
            yield {
              type: "tool_result",
              content: toolResponse,
            };
          } catch (toolError) {
            console.error(
              `Error al llamar a la herramienta ${content.name}:`,
              toolError
            );
            yield {
              type: "tool_result",
              content: `Error al utilizar la herramienta: ${content.name}`,
            };
          }
        }
      }
    } catch (error) {
      console.error("Error en processQueryStreaming:", error);
      yield {
        type: "text",
        content:
          "Error al procesar la consulta. Por favor, inténtelo de nuevo.",
      };
    }
  }

  clearHistory(userId: string): void {
    // TODO: persistir
    this.history.delete(userId);
  }

  getHistory(userId: string): MessageParam[] {
    // TODO: Filtrar
    return this.getUserHistory(userId);
  }

  async cleanup(): Promise<void> {
    try {
      if (this.mcp) {
        await this.mcp.close();
      }
    } catch (error) {
      console.error("Error al cerrar el cliente MCP:", error);
    }
  }
}
