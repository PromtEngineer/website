---
title: 'Tools vs skills vs MCP: how agents acquire capabilities'
description: 'Tools are primitives. Skills are knowledge. MCP is neither: a protocol that connects external tool servers to any harness. How the three fit together.'
date: 2026-06-11
tags: ['agents', 'harness engineering']
---

<aside class="tldr">
  <p>TL;DR</p>
  <ul>
    <li>Tools are the primitives a harness ships or registers: read, edit, bash, search. Each is defined by a schema and gated by permissions.</li>
    <li>Skills are knowledge layered on top of tools: procedures and conventions, usually markdown. Cheap to write, specific to your team.</li>
    <li>MCP is neither a tool nor a skill. It is an open protocol that connects external tool servers to any harness, so capabilities become portable.</li>
    <li>Every capability you add is attack surface. One audit found one in four community-contributed agent skills contains a vulnerability.</li>
  </ul>
</aside>

Agents acquire capabilities through three mechanisms: tools, skills, and MCP. The terms get used interchangeably, and they name three different things. A tool is not a skill. A skill is not just a prompt. And MCP is not a capability at all.

This post is a taxonomy: what each layer actually is, how the three interact inside a harness, the confusions worth untangling, and a short list for deciding which one you need.

## Tools are primitives

A tool is a function the model can call. Read a file. Edit a file. Run a bash command. Search the codebase. Fetch a URL.

Three properties define the tool layer:

- **A schema.** Every tool declares a name, a description, and an input schema. The schema is the contract: the model fills in arguments, the harness validates them, the handler runs.
- **A registry.** The harness keeps one table of everything callable: what is available, what permission each entry needs, and how calls get dispatched.
- **Permissions.** Each tool declares the minimum access it needs, and the harness enforces that at dispatch time, before anything runs.

Tools are universal. Every coding agent needs read, edit, and bash, which is why every harness ships them as built-ins. They change rarely, and adding one means writing real code with error handling and tests. Tools are component three of the nine I covered in [the harness essay](/writing/what-is-an-agent-harness/).

## Skills are knowledge

Skills sit on top of tools. A skill adds no new actions. It encodes how and when to use the actions the agent already has, and it is usually markdown.

Anthropic's agent skills are the most developed version of the idea. In their words: "Skills are folders that include instructions, scripts, and resources that Claude can load when needed." A folder, a SKILL.md file, optional scripts and references. The harness scans the available skills during a task and loads only the ones that match, so a large library costs almost no context. Anthropic shipped the feature in October 2025 and published the format as an open standard that December.

Skills come in two kinds:

- **Built-in.** Every harness ships a baseline: how to make a git commit, open a pull request, run the tests and read the results.
- **User-added.** These encode your team: the deploy procedure, the review checklist, the way your migrations work.

The economics are the appeal. A new tool is a software project. A new skill is a document. If you can write a runbook, you can write a skill. Tools are universal; skills are specific to you.

A close cousin is [AGENTS.md](https://agents.md), "a README for agents," now in over 60,000 open-source repositories. Same idea, knowledge as markdown, but different scope: AGENTS.md is project context the harness loads every session, while a skill is a procedure pulled in on demand.

## MCP is a protocol, not a capability

MCP is the most misfiled of the three. It is not a tool and it is not a skill. The Model Context Protocol describes itself as "an open-source standard for connecting AI applications to external systems," and its own analogy is the right one: MCP is like a USB-C port. A standardized connector, not a device.

The mechanics, briefly:

- The harness acts as an MCP host and opens one client connection per server.
- A server exposes tools, plus resources (data) and prompts (templates), over JSON-RPC.
- The harness calls `tools/list` to discover what a server offers and `tools/call` to execute.
- Servers run locally over stdio or remotely over HTTP.

What the protocol buys you is portability. Without a standard, every harness needs its own GitHub integration, its own database integration, its own browser integration: N harnesses times M systems. With MCP, someone writes one GitHub server and it works in Claude Code, VS Code, Cursor, ChatGPT, and anything else that speaks the protocol. Build once, connect everywhere.

## How the three fit together

<figure>
  <img src="/writing/tools-skills-mcp/capability-stack.svg" alt="Layer diagram: inside a dashed harness boundary, a skills layer (procedures and conventions in markdown) sits above a tools layer (read, edit, bash, search primitives defined by schema and gated by permissions), bound by a registry; outside the boundary, external tool servers for GitHub, databases, and the browser connect in through MCP, an open protocol whose arrow crosses the harness boundary into the tool layer" width="1200" height="620" />
  <figcaption>Tools inside, knowledge on top, MCP crossing the boundary.</figcaption>
</figure>

In a real session the layers compose:

1. **An MCP server exposes tools.** The harness discovers them at connection time and merges them into the same registry as the built-ins.
2. **Skills say when and how.** A database skill might tell the agent to query the read replica, never production, and to check the schema resource before writing SQL.
3. **The registry and permissions govern everything.** A tool that arrived over MCP passes the same permission checks, the same hooks, and the same approval prompts as a tool the harness shipped.

To the model, none of this structure is visible. It sees one flat list of callable things. The taxonomy exists for the people building and securing the system.

## Common confusions

- **"MCP replaces tools."** No. MCP transports tools. The tool is still a schema-defined function; the protocol just moved its definition and execution to another process. Every MCP tool ends its journey as an ordinary entry in the harness registry.
- **"Skills are just prompts."** Partly. The model does read them as text. But a skill is a versioned artifact with conventions: a folder, a manifest, a trigger description, optional scripts. It lives in a repo, gets diffed and reviewed, and loads on demand instead of sitting in every context window.
- **"An MCP server is an agent."** No. A server has no loop and no model. It sits and waits for `tools/call`. The agency stays in the harness.
- **"Skills and AGENTS.md are the same thing."** Cousins, not twins. AGENTS.md is always-on project context. A skill is an on-demand procedure. You want both, for different jobs.

## Which one do you need

- The agent cannot perform an action at all: write a **tool**.
- The capability lives in an external system, or you want it in more than one harness: stand up or install an **MCP server**.
- The agent has the right tools but uses them wrong, or does not know your conventions: write a **skill**.
- Every session in this repo needs the same context: put it in **AGENTS.md**.
- You need to enforce a rule rather than suggest it: that is **permissions and hooks**, not any of the three.

## More capability means more attack surface

Each mechanism widens what the agent can do, which widens what an attacker can do through the agent.

Tools are the most contained: code you wrote or vetted, behind schema validation and permission checks. Skills are instructions the model will follow, so a malicious or sloppy skill is prompt injection with a version number. One audit found that one in four community-contributed agent skills contains a vulnerability; I covered that finding in [the harness engineering essay](/writing/harness-engineering/). MCP imports both risks at once: you are running someone else's code or trusting someone else's server, and its tool descriptions flow straight into your context.

The defenses live in the harness, not in the capability layers themselves: one registry, permission checks at dispatch, hooks that can deny a call before it runs. And treat third-party skills and servers the way you treat dependencies. Read them before you install them, pin what you can, and grant the least access that still does the job.

## Sources

- [Model Context Protocol](https://modelcontextprotocol.io), the official site, and its [architecture overview](https://modelcontextprotocol.io/docs/learn/architecture)
- [Agent skills](https://claude.com/blog/skills), Anthropic's announcement, later published as an open standard
- [AGENTS.md](https://agents.md), the README-for-agents convention
- [What is an agent harness? The nine components of a great one](/writing/what-is-an-agent-harness/), the companion essay on this site
- [Harness engineering: why agent performance now lives outside the model](/writing/harness-engineering/), where the one-in-four skills audit appears
