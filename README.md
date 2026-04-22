# Sequential Thinking MCP

Hosted bridge for the official Sequential Thinking MCP server.

## Purpose

Expose the stdio-based `@modelcontextprotocol/server-sequential-thinking` package as a public streamable HTTP MCP endpoint that ChatGPT developer mode can connect to.

## Local usage

```bash
npm install
npm run start:local
```

The local endpoints are:

- Health check: `http://127.0.0.1:8000/healthz`
- MCP endpoint: `http://127.0.0.1:8000/mcp`

## Deployment

This project is intended to run as a Render web service using the included `render.yaml` file.
