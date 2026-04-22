# Sequential Thinking MCP

Hosted Streamable HTTP server for Sequential Thinking.

## Purpose

Expose Sequential Thinking as a public Streamable HTTP MCP endpoint that ChatGPT developer mode can connect to.

## Local usage

```bash
npm install
npm run start:local
```

The local endpoints are:

- Health check: `http://127.0.0.1:8000/healthz`
- MCP endpoint: `http://127.0.0.1:8000/mcp`

## Implementation notes

This project uses the official MCP SDK's native `StreamableHTTPServerTransport` instead of a stdio bridge.
Each MCP session gets its own in-memory Sequential Thinking state so thought history is preserved across tool calls within the same session.

## Deployment

This project is intended to run as a Render web service using the included `render.yaml` file.
