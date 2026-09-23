# Codex MCP setup

## Current state

The local Codex CLI supports MCP configuration through `codex mcp`. At the time this document was created, `codex mcp list` reported no configured servers. The local `~/.codex/config.toml` contains no MCP entries.

Neither a GitHub nor a Context7 server was added. Their server command/URL and authentication requirements are not present in this repository or local Codex configuration, so guessing them would be unsafe.

## Supported local CLI syntax

Inspect available commands:

```powershell
codex mcp --help
codex mcp add --help
codex mcp list
```

Codex supports adding either a stdio command or a streamable HTTP URL:

```powershell
codex mcp add <name> -- <server-command> <arguments>
codex mcp add <name> --url <server-url>
```

For streamable HTTP servers, the CLI can also use `--bearer-token-env-var <ENV_VAR>`; do not put tokens in configuration or source control.

## Manual actions required

1. Obtain the official GitHub MCP server command or URL and its required authorization method from the selected provider's current documentation.
2. Obtain the official Context7 MCP server command or URL from its current documentation.
3. Add each server with the applicable `codex mcp add` form. If login is required, use `codex mcp login <name>` and complete authorization interactively.
4. Verify the result with `codex mcp list` and, when needed, `codex mcp get <name>`.

Do not overwrite existing MCP entries when adding either service.
