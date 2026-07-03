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

Here's a situation you've probably been in. Your agent can't do something you need it to do, and you're staring at three options that all sound like the answer: write a tool, write a skill, or wire up an MCP server. The terms get used interchangeably, so it feels like a coin flip. But they name three different things. A tool is not a skill. A skill is not just a prompt. And MCP, despite how people talk about it, is not a capability at all.

So this post walks the three layers in order, from the bottom up, and by the end you'll have a short set of rules for picking one. Two things to hold onto along the way: there's a moment where all this structure disappears from the model's point of view, and there's a security bill for every layer you add, with one number attached that should change how you install things. We'll get to both.

## Start at the floor: tools are primitives

The place to start is the action itself. A tool is a function the model can call, and that's the whole definition: read a file, edit a file, run a bash command, search the codebase, fetch a URL. Strip away everything else and a tool is just code the model is allowed to invoke.

Now, "code the model can invoke" needs guardrails, so three properties define the layer:

- **A schema.** The model can't call a function it can't describe, so every tool declares a name, a description, and an input schema. The schema is the contract: the model fills in arguments, the harness validates them, the handler runs.
- **A registry.** With more than a handful of tools, the harness needs one table of everything callable: what is available, what permission each entry needs, and how calls get dispatched.
- **Permissions.** You don't want an agent running arbitrary actions unchecked, so each tool declares the minimum access it needs and the harness enforces that at dispatch time, before anything runs.

Notice what tools have in common: they're universal. Every coding agent needs read, edit, and bash, which is why every harness ships them as built-ins. They change rarely, and adding one means writing real code with error handling and tests. Tools are component three of the nine I covered in [the harness essay](/writing/what-is-an-agent-harness/). But universal is exactly the problem: tools know nothing about your team, your deploy process, or your conventions. Something has to carry that knowledge, and that's the next layer up.

## Skills: knowledge about the tools you already have

Say your agent has all the right tools but keeps deploying the wrong way. The missing piece isn't an action, it's know-how, and that's what a skill is. A skill sits on top of tools, adds no new actions, and encodes how and when to use the actions the agent already has. In its simplest form, a skill is a document.

Anthropic's agent skills are the most developed version of the idea. In their words: "Skills are folders that include instructions, scripts, and resources that Claude can load when needed." A folder, a SKILL.md file, optional scripts and references. The catch with any knowledge layer is context cost, so the format solves for that: the harness scans the available skills during a task and loads only the ones that match, which means a large library costs almost no context. Anthropic shipped the feature in October 2025 and published the format as an open standard that December.

In practice you'll meet two kinds:

- **Built-in.** Every harness ships a baseline: how to make a git commit, open a pull request, run the tests and read the results.
- **User-added.** These encode your team: the deploy procedure, the review checklist, the way your migrations work.

The economics are why the second kind matters. A new tool is a software project. A new skill is a document. If you can write a runbook, you can write a skill, and that's the fastest path from "the agent uses our stack wrong" to "the agent uses it our way."

A close cousin is [AGENTS.md](https://agents.md), "a README for agents," now in over 60,000 open-source repositories. Same idea, knowledge as markdown, but different scope: AGENTS.md is project context the harness loads every session, while a skill is a procedure pulled in on demand. So far everything we've covered lives inside one harness. The obvious next question is what happens when the capability you need lives somewhere else.

## MCP: a connector, not a capability

This is where MCP comes in, and it's the most misfiled of the three. It is not a tool and it is not a skill. The Model Context Protocol describes itself as "an open-source standard for connecting AI applications to external systems," and its own analogy is the right one: MCP is like a USB-C port. A standardized connector, not a device. Reduced to its floor, MCP is a wire format for tools that live in another process.

The mechanics, briefly:

- The harness acts as an MCP host and opens one client connection per server.
- A server exposes tools, plus resources (data) and prompts (templates), over JSON-RPC.
- The harness calls `tools/list` to discover what a server offers and `tools/call` to execute.
- Servers run locally over stdio or remotely over HTTP.

Why bother with a protocol at all? Without a standard, every harness needs its own GitHub integration, its own database integration, its own browser integration: N harnesses times M systems, and that multiplication is the pain MCP removes. With it, someone writes one GitHub server and it works in Claude Code, VS Code, Cursor, ChatGPT, and anything else that speaks the protocol. Build once, connect everywhere. Which leaves one question standing: when a session is running, how do these three layers actually behave together?

## How the three fit together

<figure>
  <img src="/writing/tools-skills-mcp/capability-stack.svg" alt="Layer diagram: inside a dashed harness boundary, a skills layer (procedures and conventions in markdown) sits above a tools layer (read, edit, bash, search primitives defined by schema and gated by permissions), bound by a registry; outside the boundary, external tool servers for GitHub, databases, and the browser connect in through MCP, an open protocol whose arrow crosses the harness boundary into the tool layer" width="1200" height="620" />
  <figcaption>Tools inside, knowledge on top, MCP crossing the boundary.</figcaption>
</figure>

In a real session the layers compose, and the picture above is the whole story:

1. **An MCP server exposes tools.** The harness discovers them at connection time and merges them into the same registry as the built-ins, so a remote tool ends up sitting next to `read` and `bash` in one table.
2. **Skills say when and how.** A database skill might tell the agent to query the read replica, never production, and to check the schema resource before writing SQL. The skill steers; the tools act.
3. **The registry and permissions govern everything.** A tool that arrived over MCP passes the same permission checks, the same hooks, and the same approval prompts as a tool the harness shipped.

And here's the first payoff I promised: to the model, none of this structure is visible. It sees one flat list of callable things. The taxonomy exists for the people building and securing the system, not for the agent using it. That's also why the terms blur so easily in conversation, which brings us to the confusions worth untangling.

## Common confusions

- **"MCP replaces tools."** No. MCP transports tools. The tool is still a schema-defined function; the protocol just moved its definition and execution to another process. Every MCP tool ends its journey as an ordinary entry in the harness registry.
- **"Skills are just prompts."** Partly. The model does read them as text. But a skill is a versioned artifact with conventions: a folder, a manifest, a trigger description, optional scripts. It lives in a repo, gets diffed and reviewed, and loads on demand instead of sitting in every context window.
- **"An MCP server is an agent."** No. A server has no loop and no model. It sits and waits for `tools/call`. The agency stays in the harness.
- **"Skills and AGENTS.md are the same thing."** Cousins, not twins. AGENTS.md is always-on project context. A skill is an on-demand procedure. You want both, for different jobs.

With the confusions cleared, the coin flip from the opening turns into a short decision list.

## So which one do you need?

- The agent cannot perform an action at all: write a **tool**.
- The capability lives in an external system, or you want it in more than one harness: stand up or install an **MCP server**.
- The agent has the right tools but uses them wrong, or does not know your conventions: write a **skill**.
- Every session in this repo needs the same context: put it in **AGENTS.md**.
- You need to enforce a rule rather than suggest it: that is **permissions and hooks**, not any of the three.

Before you go apply that list, though, there's the bill I mentioned at the start.

## More capability means more attack surface

Each mechanism widens what the agent can do, which widens what an attacker can do through the agent.

Tools are the most contained: code you wrote or vetted, behind schema validation and permission checks. Skills are instructions the model will follow, so a malicious or sloppy skill is prompt injection with a version number. And here's the number I promised: one audit found that one in four community-contributed agent skills contains a vulnerability. I covered that finding in [the harness engineering essay](/writing/harness-engineering/). MCP imports both risks at once: you are running someone else's code or trusting someone else's server, and its tool descriptions flow straight into your context.

The defenses live in the harness, not in the capability layers themselves: one registry, permission checks at dispatch, hooks that can deny a call before it runs. And treat third-party skills and servers the way you treat dependencies. Read them before you install them, pin what you can, and grant the least access that still does the job.

## Sources

- [Model Context Protocol](https://modelcontextprotocol.io), the official site, and its [architecture overview](https://modelcontextprotocol.io/docs/learn/architecture)
- [Agent skills](https://claude.com/blog/skills), Anthropic's announcement, later published as an open standard
- [AGENTS.md](https://agents.md), the README-for-agents convention
- [What is an agent harness? The nine components of a great one](/writing/what-is-an-agent-harness/), the companion essay on this site
- [Harness engineering: why agent performance now lives outside the model](/writing/harness-engineering/), where the one-in-four skills audit appears
