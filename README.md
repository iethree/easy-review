# easy-review

Github's review UI is too slow for the volume of code review I'm doing every day.

This is a fast, multi-paned review UI that uses your local github CLI and claude code CLI for agent review assistance.

![screenshot](./preview.png)

- Keyboard shortcuts for fast navigation.
- Worktrees for multitasking.

## How to use

```bash
bun install
gh auth login    # if you aren't already signed in
bun run dev      # http://localhost:5175
```
