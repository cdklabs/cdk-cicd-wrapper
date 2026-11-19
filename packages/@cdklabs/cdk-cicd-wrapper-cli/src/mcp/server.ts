// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The part of the Model Context Protocol that `cdk-cicd mcp` needs: a stdio server exposing tools.
// That is `initialize`, `ping`, `tools/list`, `tools/call` and `notifications/cancelled` over
// newline-delimited JSON-RPC 2.0 (https://modelcontextprotocol.io/specification, "Transports" -> stdio).
// Written out rather than taken from @modelcontextprotocol/sdk: its subpath exports need a
// module-resolution mode this CommonJS package does not use, and it would add ~60 transitive packages
// (an HTTP server among them) to a published CLI that only ever speaks stdio.
//
// stdio only, on purpose: the server never opens a socket, so nothing is reachable from the network.

/** MCP protocol revisions this server speaks, newest first (the set @modelcontextprotocol/sdk 1.32 accepts). */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export interface ToolResult {
  readonly content: Array<{ readonly type: 'text'; readonly text: string }>;
  readonly isError?: boolean;
}

/** MCP tool annotations: hints a client shows the user before it lets a model call the tool. */
export interface ToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

export interface McpTool {
  readonly name: string;
  readonly description: string;
  /** JSON Schema of the tool's arguments object. */
  readonly inputSchema: object;
  readonly annotations: ToolAnnotations;
  /** `signal` aborts when the client cancels the request or the server shuts down. */
  call(args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult>;
}

type RequestId = string | number;

interface JsonRpcMessage {
  readonly jsonrpc?: string;
  readonly id?: RequestId | null;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
}

type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: RequestId | null; result: unknown }
  | { jsonrpc: '2.0'; id: RequestId | null; error: { code: number; message: string } };

// JSON-RPC 2.0 error codes.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

/** Text result helpers, so every tool answers in the same shape. */
export function textResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}
export function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class McpServer {
  private readonly tools: Map<string, McpTool>;
  /** Tool calls still running, by request id, so a cancellation or a shutdown can abort them. */
  private readonly inFlight = new Map<RequestId, AbortController>();
  /** Requests the client cancelled: per the spec, those get no response. A shutdown is not a cancellation. */
  private readonly cancelled = new Set<RequestId>();
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly info: { readonly name: string; readonly version: string },
    tools: McpTool[],
    private readonly instructions?: string,
  ) {
    this.tools = new Map(tools.map((tool) => [tool.name, tool]));
  }

  /** Handle one parsed message; resolves to the response, or undefined when none is due. */
  public async handle(message: unknown): Promise<JsonRpcResponse | undefined> {
    if (!isPlainObject(message)) {
      // A batch (array) or a bare value. Batches left the protocol in 2025-06-18; answer, never hang.
      return failure(
        null,
        INVALID_REQUEST,
        Array.isArray(message) ? 'Batch requests are not supported' : 'Invalid request',
      );
    }
    const { id, method, params } = message as JsonRpcMessage;
    const isNotification = id === undefined;
    if (message.jsonrpc !== '2.0' || typeof method !== 'string') {
      return isNotification ? undefined : failure(id ?? null, INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request');
    }
    if (isNotification) {
      if (method === 'notifications/cancelled') {
        const requestId = params?.requestId;
        const controller =
          typeof requestId === 'string' || typeof requestId === 'number' ? this.inFlight.get(requestId) : undefined;
        if (controller !== undefined) {
          this.cancelled.add(requestId as RequestId);
          controller.abort();
        }
      }
      return undefined; // notifications/initialized and the rest need nothing
    }
    if (id === null) return failure(null, INVALID_REQUEST, 'Request id must be a string or a number');
    switch (method) {
      case 'initialize': {
        const requested = params?.protocolVersion;
        const protocolVersion =
          typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
            ? requested
            : SUPPORTED_PROTOCOL_VERSIONS[0];
        return success(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: this.info,
          ...(this.instructions ? { instructions: this.instructions } : {}),
        });
      }
      case 'ping':
        return success(id, {});
      case 'tools/list':
        return success(id, {
          tools: [...this.tools.values()].map(({ name, description, inputSchema, annotations }) => ({
            name,
            description,
            inputSchema,
            annotations,
          })),
        });
      case 'tools/call':
        return this.callTool(id, params);
      default:
        return failure(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  }

  private async callTool(
    id: RequestId,
    params: Record<string, unknown> | undefined,
  ): Promise<JsonRpcResponse | undefined> {
    const name = params?.name;
    const tool = typeof name === 'string' ? this.tools.get(name) : undefined;
    if (tool === undefined) return failure(id, INVALID_PARAMS, `Unknown tool: ${String(name)}`);
    const args = params?.arguments;
    if (args !== undefined && !isPlainObject(args)) {
      return failure(id, INVALID_PARAMS, 'Tool arguments must be an object');
    }
    const controller = new AbortController();
    this.inFlight.set(id, controller);
    try {
      const result = await tool.call(args ?? {}, controller.signal);
      // The spec: a request the client cancelled gets no response at all.
      return this.cancelled.has(id) ? undefined : success(id, result);
    } catch (error) {
      if (this.cancelled.has(id)) return undefined;
      // A failing tool is a tool result the model can read, not a protocol error.
      return success(id, errorResult(error instanceof Error ? error.message : String(error)));
    } finally {
      this.inFlight.delete(id);
      this.cancelled.delete(id);
    }
  }

  /** Handle one raw line of the stdio stream; resolves to the serialized response, if any. */
  public async handleLine(line: string): Promise<string | undefined> {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return JSON.stringify(failure(null, PARSE_ERROR, 'Parse error'));
    }
    const response = await this.handle(message);
    return response === undefined ? undefined : JSON.stringify(response);
  }

  /** Abort every running tool call and wait until all of them have settled. */
  public async shutdown(): Promise<void> {
    for (const controller of this.inFlight.values()) controller.abort();
    await Promise.all([...this.pending]);
  }

  /**
   * Serve on a byte stream until it ends. `write` receives one serialized message per call and must put
   * it on the protocol channel (stdout) followed by a newline. Requests are answered as they complete,
   * so a slow tool call does not hold up a `ping`. When the stream ends -- the client went away -- the
   * running tool calls are aborted.
   */
  public serve(input: NodeJS.ReadableStream, write: (line: string) => void): Promise<void> {
    return new Promise((resolve) => {
      let buffered = '';
      input.setEncoding('utf-8');
      input.on('data', (chunk: string) => {
        buffered += chunk;
        let newline = buffered.indexOf('\n');
        while (newline !== -1) {
          const line = buffered.slice(0, newline).replace(/\r$/, '');
          buffered = buffered.slice(newline + 1);
          if (line.trim().length > 0) {
            const done: Promise<void> = this.handleLine(line).then((out) => {
              if (out !== undefined) write(out);
            });
            this.pending.add(done);
            void done.finally(() => this.pending.delete(done));
          }
          newline = buffered.indexOf('\n');
        }
      });
      input.on('end', () => {
        void this.shutdown().then(() => resolve());
      });
    });
  }
}

function success(id: RequestId | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function failure(id: RequestId | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
