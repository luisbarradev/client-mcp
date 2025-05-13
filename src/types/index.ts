export interface MessageChunk {
  type: "text" | "tool_start" | "tool_result";
  content: string;
}

export interface ToolResultContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface ToolResult {
  content: ToolResultContent[];
}
