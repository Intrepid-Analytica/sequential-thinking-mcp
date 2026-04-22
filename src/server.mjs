import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createSequentialThinkingState, registerSequentialThinkingTool } from './sequentialThinkingTool.mjs';

const HEALTH_RESPONSE = 'ok';
const HTTP_HOST = '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT ?? '8000', 10);

const app = createMcpExpressApp({ host: HTTP_HOST });
const sessions = new Map();

const buildBadRequestError = (message) => {
  return {
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message
    },
    id: null
  };
};

const buildInternalError = () => {
  return {
    jsonrpc: '2.0',
    error: {
      code: -32603,
      message: 'Internal server error'
    },
    id: null
  };
};

const normalizeSessionId = (sessionHeader) => {
  if (Array.isArray(sessionHeader)) {
    return sessionHeader[0];
  }

  return sessionHeader;
};

const createSessionServer = () => {
  const server = new McpServer({
    name: 'sequential-thinking-server',
    version: '0.2.0'
  });
  const thinkingServer = createSequentialThinkingState();

  registerSequentialThinkingTool(server, thinkingServer);

  return server;
};

const cleanupClosedSession = async (sessionId) => {
  const session = sessions.get(sessionId);

  if (session === undefined) {
    return;
  }

  sessions.delete(sessionId);

  try {
    await session.server.close();
  } catch (error) {
    console.error('Failed to close session server after transport shutdown.', {
      error,
      sessionId
    });
  }
};

const closeSession = async (sessionId) => {
  const session = sessions.get(sessionId);

  if (session === undefined) {
    return;
  }

  sessions.delete(sessionId);

  try {
    await session.transport.close();
  } catch (error) {
    console.error('Failed to close session transport.', {
      error,
      sessionId
    });
  }

  try {
    await session.server.close();
  } catch (error) {
    console.error('Failed to close session server.', {
      error,
      sessionId
    });
  }
};

const getSession = (sessionId) => {
  return sessions.get(sessionId);
};

const respondWithInvalidSession = (res) => {
  res.status(404).json(buildBadRequestError('Session not found.'));
};

const respondWithMissingSession = (res) => {
  res.status(400).json(buildBadRequestError('No valid session ID provided.'));
};

const createTransportSession = async (req, res) => {
  const server = createSessionServer();
  let transport;

  try {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, {
          server,
          transport
        });
      }
    });

    transport.onclose = () => {
      const sessionId = transport.sessionId;

      if (typeof sessionId !== 'string') {
        return;
      }

      void cleanupClosedSession(sessionId);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Failed to create MCP session.', {
      error
    });

    try {
      await server.close();
    } catch (closeError) {
      console.error('Failed to close partially initialized MCP server.', {
        closeError
      });
    }

    if (!res.headersSent) {
      res.status(500).json(buildInternalError());
    }
  }
};

const handlePost = async (req, res) => {
  const sessionId = normalizeSessionId(req.headers['mcp-session-id']);

  if (typeof sessionId === 'string') {
    const session = getSession(sessionId);

    if (session === undefined) {
      respondWithInvalidSession(res);
      return;
    }

    try {
      await session.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Failed to handle MCP POST request for an existing session.', {
        error,
        sessionId
      });

      if (!res.headersSent) {
        res.status(500).json(buildInternalError());
      }
    }

    return;
  }

  if (!isInitializeRequest(req.body)) {
    respondWithMissingSession(res);
    return;
  }

  await createTransportSession(req, res);
};

const handleGet = async (req, res) => {
  const sessionId = normalizeSessionId(req.headers['mcp-session-id']);

  if (typeof sessionId !== 'string') {
    respondWithMissingSession(res);
    return;
  }

  const session = getSession(sessionId);

  if (session === undefined) {
    respondWithInvalidSession(res);
    return;
  }

  try {
    await session.transport.handleRequest(req, res);
  } catch (error) {
    console.error('Failed to handle MCP GET request.', {
      error,
      sessionId
    });

    if (!res.headersSent) {
      res.status(500).json(buildInternalError());
    }
  }
};

const handleDelete = async (req, res) => {
  const sessionId = normalizeSessionId(req.headers['mcp-session-id']);

  if (typeof sessionId !== 'string') {
    respondWithMissingSession(res);
    return;
  }

  const session = getSession(sessionId);

  if (session === undefined) {
    respondWithInvalidSession(res);
    return;
  }

  try {
    await session.transport.handleRequest(req, res);
  } catch (error) {
    console.error('Failed to handle MCP DELETE request.', {
      error,
      sessionId
    });

    if (!res.headersSent) {
      res.status(500).json(buildInternalError());
    }
  }
};

const shutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down the MCP server.`);

  const sessionIds = Array.from(sessions.keys());

  for (const sessionId of sessionIds) {
    await closeSession(sessionId);
  }

  process.exit(0);
};

app.get('/healthz', (_req, res) => {
  res.status(200).send(HEALTH_RESPONSE);
});

app.post('/mcp', handlePost);
app.get('/mcp', handleGet);
app.delete('/mcp', handleDelete);

app.listen(PORT, HTTP_HOST, (error) => {
  if (error) {
    console.error('Failed to start the HTTP MCP server.', {
      error,
      port: PORT
    });
    process.exit(1);
  }

  console.log(`Sequential Thinking MCP server listening on http://${HTTP_HOST}:${PORT}`);
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
