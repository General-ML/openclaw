import type { AvailableCommand } from "@agentclientprotocol/sdk";

export function getAvailableCommands(): AvailableCommand[] {
  return [
    { name: "help", description: "Show help and common commands." },
    { name: "commands", description: "List available commands." },
    { name: "status", description: "Show current status." },
    {
      name: "context",
      description: "Explain context usage (list|detail|json).",
      input: { hint: "list | detail | json" },
    },
    { name: "whoami", description: "Show sender id (alias: /id)." },
    { name: "id", description: "Alias for /whoami." },
    { name: "subagents", description: "List or manage sub-agents." },
    { name: "config", description: "Read or write config (owner-only)." },
    { name: "debug", description: "Set runtime-only overrides (owner-only)." },
    { name: "usage", description: "Toggle usage footer (off|tokens|full)." },
    { name: "stop", description: "Stop the current run." },
    { name: "restart", description: "Restart the gateway (if enabled)." },
    { name: "dock-telegram", description: "Route replies to Telegram." },
    { name: "dock-discord", description: "Route replies to Discord." },
    { name: "dock-slack", description: "Route replies to Slack." },
    { name: "activation", description: "Set group activation (mention|always)." },
    { name: "send", description: "Set send mode (on|off|inherit)." },
    // GML-75: /reset remains a pure reset (no name arg); /new is the one that gains name support
    { name: "reset", description: "Reset the current session (clears history)." },
    // GML-75: /new now accepts an optional name to switch or create a named conversation
    {
      name: "new",
      description: "Start a new session or switch to a named conversation (/new [name]).",
      input: { hint: "name (optional)" },
    },
    // GML-76: /sessions — list, open, or delete named conversations
    {
      name: "sessions",
      description: "Manage named conversations (list | open <name> | delete <name>).",
      input: { hint: "list | open <name> | delete <name>" },
    },
    {
      name: "think",
      description: "Set thinking level (off|minimal|low|medium|high|xhigh).",
    },
    { name: "verbose", description: "Set verbose mode (on|full|off)." },
    { name: "reasoning", description: "Toggle reasoning output (on|off|stream)." },
    { name: "elevated", description: "Toggle elevated mode (on|off)." },
    { name: "model", description: "Select a model (list|status|<name>)." },
    { name: "queue", description: "Adjust queue mode and options." },
    { name: "bash", description: "Run a host command (if enabled)." },
    { name: "compact", description: "Compact the session history." },
  ];
}
