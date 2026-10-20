# proposals

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that lets you pick how Claude presents its proposals: options, designs, plans or comparisons it offers you to choose from. No more asking "show me that in an artifact" every time.

## Formats

| Format | What Claude does |
|---|---|
| `visual` *(default)* | Anything visual (mockups, layouts, palettes, logos) goes in an artifact; text choices stay as questions in the terminal. |
| `artifact` | Every proposal with options goes in an artifact. |
| `terminal` | Everything stays in the terminal, ASCII mockups included. |
| `default` | The mod stays out of the way: Claude as usual. |

Each format keeps its own instructions, sent to Claude with the rule ("side by side, dark theme, 3 options max"). Left empty, Claude decides the layout and style itself.

## Use it

A row above the prompt shows the formats and the active one's instructions:

```
Proposals     ● visual  ○ artifact  ○ terminal  ○ default
Instructions  Claude decides  e: edit
```

- Click a format to pick it, or focus the row with `ctrl+x tab` and move with `tab`.
- `e` (or a click on `edit`) opens the instructions field; Enter saves, an empty field leaves the details to Claude.
- `Esc` goes back to the prompt.

Or from the prompt:

```
/proposals                           the format and its instructions
/proposals artifact side by side     pick a format and set its instructions
/proposals artifact -                clear that format's instructions
/proposals hide | show               hide or show the row
```

Your choice is kept across sessions and projects.

## How it works

- The active format's rule, with your instructions, is added to Claude's system prompt. Changing format starts the prompt cache over once.
- In `visual`, a question whose previews draw an interface mockup (box corners such as `┐ ╮`, or ASCII frames like `+----+`) is refused, and Claude is told to publish an artifact and ask again in text. In `artifact`, any question preview is refused. Directory trees and code snippets pass in `visual`.
- The row draws in the terminal and in the desktop app; in VS Code and under `claude -p` the rule still applies, without the row.

## Install

At the prompt of a terminal session:

```
/plugin install proposals --marketplace simoncdna/proposals
```

Answer `y` to add the marketplace, then pick a scope (user, to have it in every session).

From a shell:

```
claude plugin install proposals --marketplace simoncdna/proposals
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `simoncdna/proposals`, then Add plugin.

## Develop

```
claude --plugin-dir .          # run it from this folder
claude plugin validate .
claude plugin test .
```
