## Conventions

All code, comments, docs, tests and issues are written in English.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (ahiipsa/web3-devtools-extension) via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Agent queue

`scripts/agent-queue.sh` implements `ready-for-agent` issues unattended, one fresh Claude session per issue. See `docs/agents/agent-queue.md`.
