---
name: Tulip
---

Explain this pull request with Tulip (github.com/VirtusLab/tulip), then summarize what it found. Tulip sorts the changes into groups by concern, rates how closely each needs reading, and explains each group top-down, with diagrams, on a page of its own. Start from .easy-review/pr.md.

This needs to run commands. If you only have read-only tools, say so in one line (Read-only is a switch in easy-review's Settings › Claude review) and review the code instead.

1. Tulip needs Node.js 24 or later: check node --version. If it's missing or older, say so in one line and review the code instead.
2. Start it in the background on the pull request's URL, which is in .easy-review/pr.md:
   nohup npx --yes @virtuslab/tulip@0.9.0 <url> --no-open > .easy-review/tulip.log 2>&1 & echo $! > .easy-review/tulip.pid
   Tulip fetches the pull request itself and drives Claude sessions of its own, so it takes several minutes, and longer for a large pull request.
3. Wait for it with this loop, giving the command a 10-minute timeout, and run the loop again until the log says the explanation page is ready or Tulip has stopped:
   for i in $(seq 36); do grep -q "page ready" .easy-review/tulip.log && break; kill -0 "$(cat .easy-review/tulip.pid)" 2>/dev/null || break; sleep 15; done; tail -5 .easy-review/tulip.log
4. The log names the page: file://<folder>/index.html. Copy that folder, the page with its assets, into the review: mkdir -p .easy-review/report && cp -R <folder>/. .easy-review/report/ — then delete <folder>.
5. Read .easy-review/report/index.html for what Tulip found.

In the review:
- First, in a paragraph, what the pull request does, from Tulip's overview.
- Then the page itself, as a fenced block tagged report holding its title:

```report
Tulip's explanation of #<number>
```

- Then a ### heading for each of Tulip's groups, in its order, naming the group and its attention rating (Read closely, Read through or Skim), and two or three sentences on what is in it and what to look at. Point to the page rather than repeating it.

Tulip explains; it doesn't judge. Where its explanation or the code shows a problem, that is a finding, as usual: finish with the verdict and findings.

If Tulip fails, say what the log shows, and review the code instead.
