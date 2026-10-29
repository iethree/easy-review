---
name: Diagrams
---

Explain this pull request in two diagrams, drawn in reladraw, and review it. Start from .easy-review/pr.md and .easy-review/pr.diff, and read the surrounding code wherever you need it.

## What changes for people who use it

One diagram of the practical change: what someone using the product sees or does differently — a screen, a flow, a setting, an API response, an error message — before and after. Draw the path they take, with the steps that changed marked. If nothing changes for them (a refactor, a test, a build change), say so in one sentence and draw nothing here.

## What changes in the code

One diagram of the engineering change: the modules, functions, services or data it touches, and how they connect now — the call path, the data flow, the new boundary. Mark what is new, what changed and what was removed. Draw only what the reader needs: about ten boxes at most.

Under each diagram, two or three sentences on what it shows and what to notice. Then review the change as usual: every problem is a finding.

Mark the parts of a diagram with these styles, declared at its top:

style new      border: #1a7f37  line: #1a7f37  text: (color: #1a7f37)
style changed  border: #bf8700  line: #bf8700  text: (color: #bf8700)
style removed  border: #8c959f  line: #8c959f  text: (color: #8c959f)
style problem  border: #d1242f  line: #d1242f  text: (color: #d1242f)

Use problem only on a box or line where one of your findings sits.

## Writing reladraw

Each diagram is a fenced code block tagged reladraw. In reladraw you say where each box goes relative to another, and it works out the distances. The essentials:

- `node <name> "<text>"` makes a box. A name is one word (use underscores); the text is what it shows, and ` / ` (a slash with a space either side) breaks it onto a new line.
- Exactly one node says nothing about where it goes. Every other node is placed against one written before it: `right of a`, `left of a`, `below a`, `above a`, or a diagonal such as `below-right of a`. A gap goes in a bracket after the placement, `right of a (gap: wide)`: none, tight, normal (the default) or wide.
- Two nodes placed the same way against the same node land on the same spot. Chain them instead (`b right of a`, `c right of b`), or put them in a container with a layout.
- A container is a node whose children are named with a dot: `node api "API"`, then `node api.auth "auth"`. With `layout: column` or `layout: row` on the container, its children line up in the order written, and must not place themselves.
- `edge a -> b "calls"` draws an arrow from a to b; `a -- b` is a plain line and `a <-> b` has an arrow at each end. A line's label sits on the line, between the boxes: keep it to a word or two over a wide gap, or widen the gap to fit it (`right of a (gap: 12)`), or it covers the boxes.
- `style: new` on a node or an edge wears a style declared with `style`.
- `//` starts a comment. `#` doesn't: it starts a colour.
- There are no coordinates and no negative distances, and `box`, `link` and `arrow` are not keywords.

For example:

```reladraw
style new      border: #1a7f37  line: #1a7f37  text: (color: #1a7f37)
style changed  border: #bf8700  line: #bf8700  text: (color: #bf8700)

node page   "Settings page"
node api    "PUT /api/setting"  right of page (gap: wide)
node cache  "settings cache"  right of api (gap: wide)  style: new
node db     "app DB"  below api (gap: wide)  style: changed

edge page -> api   "saves"
edge api -> cache  "clears"  style: new
edge api -> db     "writes"
```

If you can run commands, check each diagram before you finish: write it to a file outside .easy-review, run `npx --yes reladraw@0.19.1 check <file>`, and fix every error and every warning that something covers something else. Delete the file afterwards.
