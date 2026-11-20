// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { PassThrough } from 'stream';
import {
  errorResult,
  McpServer,
  McpTool,
  SUPPORTED_PROTOCOL_VERSIONS,
  textResult,
  ToolAnnotations,
} from '../../src/mcp/server';

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const echo: McpTool = {
  name: 'echo',
  description: 'Echo the arguments',
  inputSchema: { type: 'object' },
  annotations: READ_ONLY,
  call: async (args) => textResult(args),
};
const broken: McpTool = {
  name: 'broken',
  description: 'Always throws',
  inputSchema: { type: 'object' },
  annotations: { ...READ_ONLY, readOnlyHint: false, openWorldHint: true },
  call: async () => {
    throw new Error('boom');
  },
};

function server(): McpServer {
  return new McpServer({ name: 'cdk-cicd', version: '1.2.3' }, [echo, broken], 'how to use it');
}

async function call(message: object): Promise<any> {
  const out = await server().handleLine(JSON.stringify(message));
  return out === undefined ? undefined : JSON.parse(out);
}

describe('MCP stdio server', () => {
  test('initialize echoes a supported protocol version and advertises tools', async () => {
    const response = await call({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    });
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'cdk-cicd', version: '1.2.3' },
        instructions: 'how to use it',
      },
    });
  });

  test('initialize answers an unknown protocol version with the newest one it speaks', async () => {
    const response = await call({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '1999-01-01' },
    });
    expect(response.result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  test('notifications get no response; ping gets an empty result', async () => {
    expect(await call({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeUndefined();
    expect(await call({ jsonrpc: '2.0', id: 'p', method: 'ping' })).toEqual({ jsonrpc: '2.0', id: 'p', result: {} });
  });

  test("tools/list carries each tool's own annotations", async () => {
    const { result } = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(result.tools.map((t: any) => t.name)).toEqual(['echo', 'broken']);
    expect(result.tools[0].annotations).toEqual(READ_ONLY);
    expect(result.tools[1].annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
  });

  test('tools/call returns the tool result, and a throwing tool becomes an isError result', async () => {
    const ok = await call({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'echo', arguments: { a: 1 } },
    });
    expect(ok.result).toEqual(textResult({ a: 1 }));
    const failed = await call({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'broken' } });
    expect(failed.result).toEqual(errorResult('boom'));
  });

  test.each([
    [{ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'missing' } }, -32602],
    [{ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'echo', arguments: [1] } }, -32602],
    [{ jsonrpc: '2.0', id: 7, method: 'resources/list' }, -32601],
    [{ id: 8, method: 'ping' }, -32600],
    [{ jsonrpc: '2.0', id: null, method: 'ping' }, -32600],
  ])('protocol errors: %j -> %d', async (message, code) => {
    expect((await call(message)).error.code).toBe(code);
  });

  test.each([
    ['a batch', [{ jsonrpc: '2.0', id: 1, method: 'ping' }]],
    ['null', null],
    ['a number', 42],
  ])('%s is answered with -32600 and a null id, never silently dropped', async (_what, message) => {
    expect(await call(message as object)).toMatchObject({ id: null, error: { code: -32600 } });
  });

  test('a cancelled call is aborted and gets no response', async () => {
    let aborted = false;
    const waits: McpTool = {
      name: 'waits',
      description: 'Waits until aborted',
      inputSchema: { type: 'object' },
      annotations: READ_ONLY,
      call: (_args, signal) =>
        new Promise((resolve) =>
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve(errorResult('stopped'));
          }),
        ),
    };
    const s = new McpServer({ name: 'x', version: '1' }, [waits]);
    const pending = s.handleLine(
      JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'waits' } }),
    );
    await s.handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 9 } }));
    expect(await pending).toBeUndefined();
    expect(aborted).toBe(true);
  });

  test('a slow tool call does not hold up a ping, and the end of input aborts it but still answers', async () => {
    const slow: McpTool = {
      name: 'slow',
      description: 'Resolves when aborted',
      inputSchema: { type: 'object' },
      annotations: READ_ONLY,
      call: (_args, signal) =>
        new Promise((resolve) => signal.addEventListener('abort', () => resolve(errorResult('stopped')))),
    };
    const input = new PassThrough();
    const lines: string[] = [];
    const done = new McpServer({ name: 'x', version: '1' }, [slow]).serve(input, (line) => lines.push(line));
    input.write('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"slow"}}\n');
    input.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    await new Promise((resolve) => setImmediate(resolve));
    expect(lines.map((line) => JSON.parse(line).id)).toEqual([2]);
    input.end();
    await done;
    expect(JSON.parse(lines[1])).toMatchObject({ id: 1, result: { isError: true } });
  });

  test('a line that is not JSON is a parse error', async () => {
    expect(JSON.parse((await server().handleLine('{nope'))!)).toMatchObject({ id: null, error: { code: -32700 } });
  });

  test('serve reads newline-delimited messages split across chunks and answers each on one line', async () => {
    const input = new PassThrough();
    const lines: string[] = [];
    const done = server().serve(input, (line) => lines.push(line));
    input.write('{"jsonrpc":"2.0","id":1,"me');
    input.write('thod":"ping"}\r\n\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    input.end('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    await done;
    expect(lines.map((line) => JSON.parse(line).id).sort()).toEqual([1, 2]);
    for (const line of lines) expect(line).not.toContain('\n');
  });
});
