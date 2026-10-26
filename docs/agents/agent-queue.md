# Agent task queue

`scripts/agent-queue.sh` works through issues unattended: it takes a ready GitHub issue, runs Claude with `/implement` on it in a fresh session, checks the result itself, merges the branch into `main`, pushes, and moves on to the next one until no ready issues are left.

How the script works inside, and why, is in its header. This page is about using it.

## Before you start

- **The main working copy, on `main`, with no uncommitted changes.** The queue works in it directly and switches branches. It will not start on a dirty tree.
- **`claude` is logged in** (`claude -p "ok"`), **`gh` is logged in** (`gh auth status`), **`jq` is installed.**
- **Issues follow `docs/agents/issue-tracker.md`:** label `ready-for-agent`, blockers on a line `Blocked by: #11, #12`.

While the queue runs, do not edit files in this folder or switch branches.

## Running

```sh
scripts/agent-queue.sh                         # every ready issue
scripts/agent-queue.sh 9 10                    # only these issues
MAX_TASKS=1 scripts/agent-queue.sh             # one issue, as a trial
QUEUE_BUDGET_USD=30 scripts/agent-queue.sh     # spending cap per issue (default $20)
PUSH=0 scripts/agent-queue.sh                  # merge into main locally, do not push
VERIFY=0 scripts/agent-queue.sh                # skip the queue's own checks
```

Unattended, overnight (survives closing the terminal, keeps the Mac awake):

```sh
nohup caffeinate -i scripts/agent-queue.sh >~/.local/state/evm-rpc-inspector-agent-queue/run.log 2>&1 &
tail -f ~/.local/state/evm-rpc-inspector-agent-queue/run.log
```

An issue is ready when it is open, labelled `ready-for-agent`, and every issue on its `Blocked by:` line is closed (or closed by a `Closes #N` commit already in the local `main`). The queue takes first the ready issue that most open issues wait for; on a tie, the lower number. Issues run strictly one at a time and take tens of minutes each.

## What happens to each issue

1. The queue creates branch `issue-N` from `main`, or switches to the one left by an earlier attempt and rebases it onto `main`.
2. It runs `claude -p` in `auto` permission mode: a new process with an empty context. The agent runs `/implement` (TDD, typecheck, tests, `/code-review`), commits with `Closes #N`, and comments on the issue with its decisions and the review outcome.
3. The queue checks the branch itself: the agent is on it, the tree is clean, there are commits, one of them closes the issue, and `npm ci`, `npm run lint`, `npm test`, `npm run build` are green.
4. It fast-forwards `main` to the branch and deletes the branch.
5. With `PUSH=1` (the default) it pushes `main`. GitHub closes the issue from `Closes #N`; if it does not, the queue closes it. Pushing here deploys nothing.

After a run, read the agents' comments on the closed issues and the decisions issues (below).

## Decisions issues

The agent never asks the human; it decides. The decisions it would have asked about go into one issue per task, `Agent decisions for #N: <title>`, labelled `needs-triage`:

- product, UI or domain behaviour that neither the issue nor `GLOSSARY.md` nor `docs/adr/` settles;
- deliberate deviations from the issue;
- proposed `GLOSSARY.md` changes (the agent does not edit it);
- acceptance criteria it could not verify, such as anything that needs the extension loaded in Chrome.

Each item lists the options, what was chosen and why, where in the code, and what to change if you decide otherwise. Technical decisions go only into the comment on the issue. Decisions issues block nothing and the queue does not take them. Triage them with `/triage` or by hand: agree and close; disagree and turn the item into a `ready-for-agent` issue.

## When an issue fails

A failed issue does not stop the queue. The queue:

1. files a blocker issue labelled `needs-triage` with the reason and the agent's last reply (or uses the one the agent filed and named in `QUEUE-STOP #K`);
2. appends it to the failed issue's `Blocked by:` line;
3. commits any leftovers to the issue branch as a `WIP:` commit and returns to `main`;
4. carries on with issues that do not depend on the failed one.

Three failures in a row (`MAX_FAILURES`) stop the queue. To retry a failed issue, fix the cause and close the blocker issue: the next run takes the issue again and continues its branch. To throw the attempt away instead: `git branch -D issue-N`.

| Reason                                                                                    | What to do                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `spending cap … reached`                                                                  | the branch is half-done: raise `QUEUE_BUDGET_USD` and close the blocker, or finish by hand                                   |
| `agent stopped — …`                                                                       | read the blocker issue the agent filed; `jq -r .result issue-N.json`                                                         |
| `agent did not say how it ended`                                                          | usually the agent ended its turn early, e.g. waiting for a background command; close the blocker and it continues the branch |
| `agent left branch` / `left uncommitted changes` / `no commits` / `no commit … closes #N` | look at the branch, finish it by hand or throw it away                                                                       |
| `queue verification failed`                                                               | the agent said green, the checks are red; output in `issue-N.log`                                                            |
| `does not rebase onto main without conflicts`                                             | rebase the branch by hand                                                                                                    |

## When the queue stops

Environment failures stop the whole queue without filing issues, because they would repeat on every issue. The last lines of the output name the cause.

| Reason                                    | What to do                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `uncommitted changes in the working copy` | `git status`: commit or stash your changes                               |
| `claude exited with an error`             | network, auth: see `issue-N.log`, then start again; the branch continues |
| `… the push failed`                       | the issue is in the local `main`: sort it out and push by hand           |
| `N issues failed in a row`                | look at the blocker issues: the cause is probably shared                 |
| `blocker #N does not exist`               | fix the stale `Blocked by:` reference                                    |
| `no ready issues — the queue is empty`    | not an error                                                             |

A usage limit is not a failure: the queue parks the branch, waits `LIMIT_WAIT_MIN` minutes (default 30) and retries, up to `LIMIT_WAITS` times (default 16).

**Stopping it yourself:** `Ctrl-C` (or `kill` the `nohup` process). The interrupted issue stays on its branch; commit or stash the leftovers before the next run.

## What the agent is doing now

```sh
scripts/agent-queue-status.sh       # latest issue
scripts/agent-queue-status.sh -w    # refresh every 10 s
scripts/agent-queue-status.sh 11    # a given issue
N=20 scripts/agent-queue-status.sh  # more lines per list
```

Phase (implementation or review), the command in flight, time per command group, tokens, the latest messages and actions, and after the end the outcome and marker. Then the open `needs-triage` issues.

## Logs and costs

Everything is in `~/.local/state/evm-rpc-inspector-agent-queue/` (`QUEUE_LOGS` overrides it):

| File            | Contents                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| `issue-N.jsonl` | the whole Claude stream (`stream-json`): model replies, tool calls, timestamps |
| `issue-N.json`  | the stream's last line, the result: final reply, cost, tokens, turns           |
| `issue-N.log`   | Claude's stderr, the queue's verification and merge                            |
| `report.tsv`    | every run, one row per issue, with a header                                    |

After each issue and at the end the queue prints a report:

```
[queue 03:12:10] #11 done: 44:02 · $6.10
[queue 03:12:10]   tokens: output 180k · input 95k · cache write 1.2M · cache read 12.4M
[queue 03:12:10]   stages: prepare 0:05 · agent 38:10 · queue verification 1:40 · merge 0:04
[queue 03:12:10]   agent: implementation 27:30 (4.1M tokens) · review 10:40 (1.5M)
[queue 03:12:10]   agent commands: test 3:20 · lint 0:40 · build 1:10 · typecheck 0:30 · other 2:00 · subagents 6:30 · model 23:00
```

- **Stages** are timed by the queue itself: branch preparation, the agent, its own verification, merge and push.
- **Implementation and review**: before the `/code-review` call and after it.
- **Agent commands** are grouped by command text: `vitest`, `npm test` are test; `eslint`, `prettier`, `npm run lint` are lint; `vite build`, `npm run build` are build; `tsc` is typecheck. Anything else is "other". "Subagents" is time the agent waited for its subagents; "model" is the rest. Only the agent's own calls count; overlapping calls count once.
- **Tokens** in total come from Claude's result; tokens per phase are summed from model replies in the stream, subagents included. Cost is only known in total and is at API prices: on a subscription it is an estimate.

```sh
cd ~/.local/state/evm-rpc-inspector-agent-queue
jq -r .result issue-11.json                                       # what the agent said at the end
column -t -s$'\t' report.tsv                                      # every run as a table
awk -F'\t' 'NR > 1 { s += $6 } END { printf "$%.2f\n", s }' report.tsv   # total spent
```

## What the queue does not do

- Run issues in parallel: it switches branches in the one working copy.
- Take issues without `ready-for-agent`: `ready-for-human` (accounts, force-pushes) and `needs-triage` are left alone.
- Guess stale references: a blocker that does not exist stops the queue before the first issue.
- Ask the human: the agent decides and records disputed decisions in a decisions issue.
