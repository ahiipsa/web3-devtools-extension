#!/usr/bin/env bash
# Agent task queue: picks a ready issue, implements it in a fresh Claude
# session, verifies the result, merges it into main and moves on to the next
# one, until no ready issues are left.
#
#   scripts/agent-queue.sh              # every ready issue
#   scripts/agent-queue.sh 11 12        # only these issues
#   MAX_TASKS=1 scripts/agent-queue.sh  # at most one issue
#
# How to run it and what to do when it stops: `docs/agents/agent-queue.md`.
# What the agent is doing right now: `scripts/agent-queue-status.sh`. This
# header is about how the queue works.
#
# Issues are GitHub Issues (`docs/agents/issue-tracker.md`). An issue is ready
# when it is open, labelled `ready-for-agent`, and every issue on its
# `Blocked by: #A, #B` line is done. Done means closed on GitHub, or closed by a
# `Closes #N` commit already in the local main (that matters with `PUSH=0`).
# A blocker number that does not exist stops the queue before any work: the
# reference is stale and guessing what was meant is not an option.
#
# Among ready issues the queue takes the one most other open issues wait for;
# on a tie, the lower number.
#
# The queue, not the agent, creates the issue branch: `issue-N` from main. A
# branch left by an earlier attempt is rebased onto main and the agent carries
# on from it: paid-for work is not thrown away.
#
# Each issue gets a new `claude -p` process: that is the `/clear` between
# issues, the context is empty and the work follows the issue text. The agent
# runs `/implement`, reviews with `/code-review`, commits with `Closes #N`,
# comments on the issue and prints a `QUEUE-READY` marker as its last line, or
# `QUEUE-STOP #K <reason>` when it cannot get to green.
#
# There are no PRs: history is linear and branches land on main by
# fast-forward. The script merges, not the agent, and it does not take the
# marker on trust: the agent is on the issue branch, the tree is clean, the
# branch has a commit closing the issue, and `npm ci`, lint, tests and build
# are green for the script itself (`VERIFY=0` skips that). Then
# `git merge --ff-only` and, with `PUSH=1` (the default), `git push`: here a
# push to main deploys nothing, it only closes the issue on GitHub. If GitHub
# does not close it, the queue closes it itself.
#
# A failed issue does not stop the queue. The queue files a blocker issue
# labelled `needs-triage` (or takes the one the agent named in
# `QUEUE-STOP #K`), appends it to the failed issue's `Blocked by:` line,
# commits any leftovers to the issue branch and goes on with issues that do
# not depend on the failed one. `MAX_FAILURES` failures in a row stop the
# queue: by then the cause is most likely not the issues.
#
# Environment failures stop the queue without filing anything: dirty working
# copy, `claude` exiting with an error, a failed push. They would repeat on
# every issue. A usage limit is the exception: the queue parks the branch,
# waits `LIMIT_WAIT_MIN` minutes and retries, at most `LIMIT_WAITS` times.
#
# Issues run strictly one at a time in this working copy: the queue switches
# branches under it.
#
# The agent never asks the human: it decides itself and collects the decisions
# it would have asked about into a decisions issue labelled `needs-triage`.
# The queue does not take those; the human triages them later.
#
# Logs live in `$QUEUE_LOGS` (default `~/.local/state/evm-rpc-inspector-agent-queue`):
# per issue `issue-N.jsonl` is the `claude --output-format stream-json`
# stream, `issue-N.json` its last line (the result: final reply, cost) and
# `issue-N.log` is `claude` stderr, verification and merge output. Every run
# appends to `report.tsv` (columns in `docs/agents/agent-queue.md`). Cost is at
# API prices: on a subscription it is an estimate, not a charge.
#
# After each issue and at the end the queue prints a report: time, cost,
# tokens, queue stages and what the agent did. The script times its own
# stages. Agent time is split from the stream: before the `/code-review` call
# is "implementation", after it "review"; Bash commands by pattern (test,
# lint, build, typecheck, other), subagent calls separately, the rest is
# "model". Only the agent's own calls count, not its subagents'; overlapping
# calls count once. Tokens per phase come from model replies in the stream;
# cost is only known in total.
#
# `QUEUE_BUDGET_USD` caps spending per issue. When it runs out `claude` stops,
# the issue is blocked and its branch is left half-done; a later run continues
# it. The cap is soft: it is checked after each model call, and one call can
# overshoot it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="${QUEUE_LOGS:-$HOME/.local/state/evm-rpc-inspector-agent-queue}"
MAX_TASKS="${MAX_TASKS:-0}" # 0: no limit
BUDGET="${QUEUE_BUDGET_USD:-20}"
VERIFY="${VERIFY:-1}"
PUSH="${PUSH:-1}"
MAX_FAILURES="${MAX_FAILURES:-3}"
LIMIT_WAIT_MIN="${LIMIT_WAIT_MIN:-30}"
LIMIT_WAITS="${LIMIT_WAITS:-16}"
ONLY="$*" # empty: every issue
OPEN="$(mktemp)"
trap 'rm -f "$OPEN"' EXIT

# To stderr: `next_task` answers on stdout, and messages must not leak there.
say() { printf '[queue %s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }

die() {
  say "STOP: $*"
  [ "$TASK_OPEN" = 0 ] || finish_task stopped
  spent
  exit 1
}

# Issue is closed on GitHub. A push closes it with a delay, so a few tries.
closed() {
  local try
  for try in 1 2 3 4 5; do
    [ "$(gh api "repos/{owner}/{repo}/issues/$1" --jq .state 2>/dev/null)" = closed ] && return 0
    [ "$try" = 5 ] || sleep 3
  done
  return 1
}

# Task metrics: a vector of numbers, printed as a report and written to `report.tsv`:
#  1 cost, $   2 input  3 cache write  4 cache read  5 output (tokens)
#  6 prepare  7 agent  8 queue verification  9 merge (seconds)
# 10 review, s  11 implementation tokens  12 review tokens
# 13 test  14 lint  15 build  16 typecheck  17 other commands  18 subagents
# 19 all agent time in commands and subagents, s
METRICS=19
V=()
TASK_OPEN=0 # the issue had a `claude` run and has not been reported yet
RUN_ROWS='' # vectors of this run's issues, one tab-separated line each

# Task stage: close the current one (add its time to its column) and start
# the next. Without an argument, only close.
STAGE=''
STAGE_AT=0
stage() {
  [ -z "$STAGE" ] || V[STAGE]=$((V[STAGE] + SECONDS - STAGE_AT))
  STAGE="${1:-}"
  STAGE_AT=$SECONDS
}

# Seconds → "4:05" or "1:02:05".
dur() {
  local s="${1%.*}"
  [ "$s" -ge 0 ] || s=0
  if [ "$s" -ge 3600 ]; then
    printf '%d:%02d:%02d' $((s / 3600)) $((s % 3600 / 60)) $((s % 60))
  else
    printf '%d:%02d' $((s / 60)) $((s % 60))
  fi
}

# Tokens → "950", "180k", "1.2M".
tok() {
  awk -v n="$1" 'BEGIN {
    if (n >= 1e6) printf "%.1fM\n", n / 1e6
    else if (n >= 1e3) printf "%dk\n", n / 1e3 + 0.5
    else printf "%d\n", n
  }'
}

# Report: a heading and a metrics vector.
report() {
  local head="$1" v=("" "${@:2}")
  local total=$((v[6] + v[7] + v[8] + v[9]))
  say "$head: $(dur "$total") · \$$(awk -v c="${v[1]}" 'BEGIN { printf "%.2f", c }')"
  say "  tokens: output $(tok "${v[5]}") · input $(tok "${v[2]}") · cache write $(tok "${v[3]}") · cache read $(tok "${v[4]}")"
  say "  stages: prepare $(dur "${v[6]}") · agent $(dur "${v[7]}") · queue verification $(dur "${v[8]}") · merge $(dur "${v[9]}")"
  say "  agent: implementation $(dur $((v[7] - v[10]))) ($(tok "${v[11]}") tokens) · review $(dur "${v[10]}") ($(tok "${v[12]}"))"
  say "  agent commands: test $(dur "${v[13]}") · lint $(dur "${v[14]}") · build $(dur "${v[15]}") · typecheck $(dur "${v[16]}") · other $(dur "${v[17]}") · subagents $(dur "${v[18]}") · model $(dur $((v[7] - v[19])))"
}

# Totals for this run: the sum of the issue vectors.
spent() {
  if [ -z "$RUN_ROWS" ]; then
    say "spent this run: \$0"
    return
  fi
  local sums
  sums="$(printf '%s' "$RUN_ROWS" | awk -F'\t' -v n="$METRICS" '
    { for (i = 1; i <= n; i++) s[i] += $i; rows++ }
    END { printf "%d", rows; for (i = 1; i <= n; i++) printf "\t%s", s[i]; print "" }')"
  local rows="${sums%%$'\t'*}"
  local fields
  IFS=$'\t' read -r -a fields <<<"${sums#*$'\t'}"
  report "total this run, issues $rows" "${fields[@]}"
}

# Open issues with labels and blockers (numbers from the `Blocked by:` line).
load_open() {
  gh issue list --state open --limit 500 --json number,labels,body --jq '
    map({number, labels: [.labels[].name],
         blockers: ((.body // "") | [match("(?m)^Blocked by:(.*)$"; "g").captures[0].string]
                    | join(" ") | [scan("#([0-9]+)")[0] | tonumber])})' >"$OPEN"
}

# Issues closed by commits in the local main that origin does not have yet.
closed_locally() {
  git log origin/main..main --format=%B |
    { grep -oiE '(closes|fixes|resolves) #[0-9]+' || true; } | { grep -oE '[0-9]+' || true; } |
    jq -sc 'unique'
}

# `Blocked by:` references of open issues point at existing issues. Open ones
# are in the list, the rest are checked one by one. Runs in the main shell:
# `die` inside `$(…)` or `<(…)` would only stop a subshell.
check_blockers() {
  local number owner
  while read -r number owner; do
    gh api "repos/{owner}/{repo}/issues/$number" --jq .number >/dev/null 2>&1 ||
      die "#$owner: blocker #$number does not exist"
  done < <(jq -r '(map(.number)) as $open
    | [.[] | .number as $o | .blockers[] as $b | select(($open | index($b)) | not) | "\($b) \($o)"]
    | unique | .[]' "$OPEN")
}

# The ready issue to take first. A blocker that is not open is closed:
# `check_blockers` has weeded out the missing ones. Sort key: how many open
# issues wait for it (more first), then its number.
next_task() {
  jq -r --arg only "$ONLY" --argjson local "$(closed_locally)" '
    ($only | split(" ") | map(select(length > 0) | tonumber)) as $wanted
    | ([.[] | .number] - $local) as $open
    | [.[] | select(.number as $n | $open | index($n))] as $all
    | [$all[] | select(.labels | index("ready-for-agent"))
       | select(($wanted | length == 0) or (.number as $n | $wanted | index($n)))
       | select(all(.blockers[]; . as $b | ($open | index($b)) | not))
       | .number as $n
       | {number, waiting: ([$all[] | select(.blockers | index($n))] | length)}]
    | sort_by([-.waiting, .number]) | first | .number // empty' "$OPEN"
}

# Blocker number onto the issue's `Blocked by:` line; no such line, a new one
# at the end of the body.
add_blocker() {
  local number="$1" blocker="$2" body
  body="$(gh issue view "$number" --json body --jq .body)"
  if grep -q '^Blocked by:' <<<"$body"; then
    body="$(awk -v b="#$blocker" '/^Blocked by:/ && !done { sub(/[[:space:]]*$/, ""); $0 = $0 ", " b; done = 1 } { print }' <<<"$body")"
  else
    body="$body"$'\n\n'"Blocked by: #$blocker"
  fi
  gh issue edit "$number" --body "$body" >/dev/null
}

# Leave the issue branch for main. Uncommitted leftovers are committed to the
# current branch first: they stay with the attempt and the next issue starts
# from a clean tree.
park() {
  local number="$1" log="$2"
  if [ -n "$(git status --porcelain)" ]; then
    [ "$(git branch --show-current)" != main ] ||
      die "#$number: the agent left uncommitted changes on main — sort them out by hand"
    say "committing leftovers to $(git branch --show-current)"
    { git add -A && git commit -q --no-verify -m "WIP: leftovers of an unfinished agent queue run (#$number)"; } >>"$log" 2>&1 ||
      die "#$number: could not commit leftovers on $(git branch --show-current) ($log)"
  fi
  git checkout -q main 2>>"$log" || die "#$number: could not switch back to main ($log)"
}

# A failed issue: a blocker issue (named by the agent, or a new one) goes on
# its `Blocked by:` line, the branch is parked, and the queue moves on.
# Too many failures in a row stop it.
FAILURES=0
block() {
  local number="$1" reason="$2" blocker="${3:-}" last log="$LOGS/issue-$1.log" branch
  branch="$(git branch --show-current)"
  say "#$number failed: $reason"
  if [ -z "$blocker" ]; then
    last="$(jq -r '(.result // "") | .[-1500:]' "$LOGS/issue-$number.json" 2>/dev/null || true)"
    blocker="$(gh issue create --label needs-triage \
      --title "Agent queue stopped on #$number: $reason" \
      --body "$(printf 'The agent queue failed on #%s: %s.\n\nFind and remove the cause, then close this issue: the queue will take #%s again.\n\n- Branch: `%s`\n- Logs: `%s/issue-%s.{jsonl,json,log}`\n\n## Last agent reply\n\n%s\n' \
        "$number" "$reason" "$number" "$branch" "$LOGS" "$number" "${last:-—}")" 2>>"$log" |
      sed -nE 's#.*/issues/([0-9]+)$#\1#p' || true)"
  fi
  [ -n "$blocker" ] || die "#$number: $reason (could not file a blocker issue)"
  add_blocker "$number" "$blocker" 2>>"$log" ||
    die "#$number: $reason — blocker #$blocker filed, but not added to Blocked by"
  park "$number" "$log"
  finish_task "blocked by #$blocker"
  FAILURES=$((FAILURES + 1))
  [ "$FAILURES" -lt "$MAX_FAILURES" ] || die "$FAILURES issues failed in a row"
}

# Agent stream breakdown (jq -s): which phase and what the agent's time went to.
# Answers vector columns 10 and 12–19, and 11, implementation tokens.
AGENT_STAGES='
def ts: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
def kind:
  if .name == "Bash" then
    (.input.command // "") as $c
    | if ($c | test("vitest|npm (run )?test")) then "test"
      elif ($c | test("eslint|prettier|npm run lint")) then "lint"
      elif ($c | test("vite build|npm run (build|release)")) then "build"
      elif ($c | test("typecheck|\\btsc\\b")) then "typecheck"
      else "other" end
  elif .name == "Agent" or .name == "Task" then "agents"
  else "tool" end;
def union:
  sort_by(.[0])
  | reduce .[] as $i ([];
      if length > 0 and $i[0] <= .[-1][1] then .[-1][1] = ([.[-1][1], $i[1]] | max) else . + [$i] end)
  | map(.[1] - .[0]) | add // 0;
[.[] | select((.type == "assistant" or .type == "user") and .timestamp)] as $msgs
| ([$msgs[] | .timestamp | ts] | max // 0) as $last
| [$msgs[] | select(.type == "assistant" and .parent_tool_use_id == null)
   | (.timestamp | ts) as $t | .message.content[]? | select(type == "object" and .type == "tool_use")
   | {id, kind: kind, review: (.name == "Skill" and ((.input.skill // "") | test("code-review"))), start: $t}] as $uses
| ([$uses[] | select(.review) | .start] | min) as $review
| ([$msgs[] | select(.type == "user") | (.timestamp | ts) as $t | .message.content[]?
    | select(type == "object" and .type == "tool_result") | {key: .tool_use_id, value: $t}] | from_entries) as $ends
| [$uses[] | select(.kind != "tool" and $ends[.id] != null) | {kind, span: [.start, $ends[.id]]}] as $spans
| ([$msgs[] | select(.type == "assistant")
    | {id: (.message.id // .uuid), t: (.timestamp | ts),
       n: (.message.usage // {} | (.input_tokens // 0) + (.cache_creation_input_tokens // 0)
           + (.cache_read_input_tokens // 0) + (.output_tokens // 0))}]
   | group_by(.id) | map(.[0])) as $calls
| def within(k): [$spans[] | select(.kind == k) | .span] | union;
  [ (if $review then $last - $review else 0 end),
    ([$calls[] | select($review == null or .t < $review) | .n] | add // 0),
    ([$calls[] | select($review != null and .t >= $review) | .n] | add // 0),
    within("test"), within("lint"), within("build"), within("typecheck"), within("other"), within("agents"),
    ([$spans[] | .span] | union) ]
| @tsv
'

prompt_for() {
  local number="$1" branch="$2" title="$3"
  cat <<EOF
/mattpocock-skills:implement $number

You are running in an unattended queue: do not ask the human anything.
Decide yourself from issue #$number, GLOSSARY.md, docs/adr/ and CLAUDE.md.

The human will review later the decisions you would have asked them about,
had they been here: collect those into one decisions issue. That covers
product, UI or domain behaviour that neither the issue nor GLOSSARY.md nor
docs/adr/ settles; deliberate deviations from the issue; changes you would
make to GLOSSARY.md (do not edit GLOSSARY.md yourself); and acceptance
criteria you could not verify yourself, such as anything that needs the
extension loaded in Chrome — list those as "not verified". Technical
decisions (names, files, code structure) go only into the issue comment
below, not into the decisions issue. If there is nothing to decide, there is
no decisions issue.
- One decisions issue per issue: \`gh issue create --label needs-triage\`.
  If an earlier attempt already filed it (same title), extend it instead of
  filing a second one. Shape:

  Title: Agent decisions for #$number: $title

  Review the decisions the agent made on its own while implementing #$number.

  ## 1. <the question in one line>
  - **Options:** …
  - **Chosen:** … — why
  - **Where:** files, commit
  - **If you decide otherwise:** what to change

You are already on branch $branch; the queue created it. If it has commits
beyond main, they are an earlier attempt at this issue that was cut short:
carry on from what is done instead of starting over. Do not switch branches
or create new ones.

The session ends with your reply: no background command or monitor will wake
you up afterwards. So run long commands in the foreground only, and reply
only once everything has finished: replying "I will wait for it to finish"
here means abandoning the issue.

Steps on top of /implement:
1. Before finishing: \`npm run lint\`, \`npm test\` and \`npm run build\` are green.
2. Review with the /code-review skill (Skill tool) against main, not with a
   reviewer subagent of your own: the queue uses that call to tell review
   from implementation in its report.
3. Commit everything to $branch; commit messages in English, in the style of
   \`git log\`; one commit message contains \`Closes #$number\`. The working
   tree is clean at the end.
4. Comment on #$number (\`gh issue comment\`): what was done, decisions that
   are not in the issue, the review outcome (how many findings, what was
   accepted, what was rejected and why) and a link to the decisions issue,
   if any.
5. Do NOT merge into main and do NOT push: the queue does that.
6. Print exactly one of these as the last line of your reply:
   QUEUE-READY                    — all green, issue done, committed;
   QUEUE-STOP #<number> <reason>  — a blocker, with an issue filed for it.

A blocker is something without which the issue cannot get to green: a broken
environment, a contradiction in the issue you cannot resolve yourself, missing
access. File an issue for it: \`gh issue create --label needs-triage\`, saying
what is in the way, what you tried and what is needed from the human, and put
its number in the \`QUEUE-STOP #<number> <reason>\` marker. A question you can
get past by deciding is not a blocker: it is an item in the decisions issue,
and the work goes on.
EOF
}

# The queue's own check of the branch before merging: the agent's marker is
# no proof.
verify() {
  local log="$1"
  say "verifying: npm ci, lint, test, build; output in $log"
  {
    npm ci --no-audit --no-fund &&
      npm run lint &&
      npm test &&
      npm run build
  } >>"$log" 2>&1
}

# Issue report and a `report.tsv` row: date, issue, outcome, how `claude`
# ended, turns, then vector columns 1–19.
REPORT_HEADER=$'date\tissue\toutcome\tclaude_ending\tturns\tcost\tinput\tcache_write\tcache_read\toutput\tprepare\tagent\tverify\tmerge\treview\timplementation_tokens\treview_tokens\ttest\tlint\tbuild\ttypecheck\tother\tsubagents\tcommands_and_subagents'
TASK=''
ENDING='?'
TURNS=0
finish_task() {
  local outcome="$1" row
  stage
  TASK_OPEN=0
  row="$(printf '%s\t' "${V[@]:1}")"
  row="${row%$'\t'}"
  RUN_ROWS+="$row"$'\n'
  [ -s "$LOGS/report.tsv" ] || echo "$REPORT_HEADER" >"$LOGS/report.tsv"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$TASK" "$outcome" "$ENDING" "$TURNS" "$row" >>"$LOGS/report.tsv"
  report "#$TASK $outcome" "${V[@]:1}"
}

# Runs one issue. Returns 0 when it is merged or blocked, 2 when a usage
# limit cut it short and it should be retried later.
run_task() {
  local number="$1" branch="issue-$1" out stream log title
  local marker status=0 i totals stages
  stream="$LOGS/issue-$number.jsonl"
  out="$LOGS/issue-$number.json"
  log="$LOGS/issue-$number.log"

  TASK="$number"
  V=("")
  for ((i = 1; i <= METRICS; i++)); do V[i]=0; done
  stage 6

  if git rev-parse -q --verify "refs/heads/$branch" >/dev/null; then
    say "branch $branch exists — continuing it"
    git checkout -q "$branch"
    git rebase -q main >>"$log" 2>&1 || {
      git rebase --abort || true
      TASK_OPEN=1
      block "$number" "branch $branch does not rebase onto main without conflicts"
      return 0
    }
  else
    git checkout -q -b "$branch" main
  fi

  title="$(gh issue view "$number" --json title --jq .title)"
  say "taking #$number \"$title\", stream: $stream"
  local args=(-p "$(prompt_for "$number" "$branch" "$title")" --permission-mode auto --output-format stream-json --verbose)
  [ -z "$BUDGET" ] || args+=(--max-budget-usd "$BUDGET")
  stage 7
  claude "${args[@]}" >"$stream" 2>>"$log" || status=$?
  stage 8

  # Metrics are recorded whatever the outcome: an aborted run cost money too.
  # A crashed `claude` may leave no result at all: then zeros and "?".
  jq -c 'select(.type == "result")' "$stream" 2>/dev/null | tail -1 >"$out" || true
  totals="$(jq -r '[.total_cost_usd // 0,
      ([.modelUsage[]?.inputTokens] | add // 0), ([.modelUsage[]?.cacheCreationInputTokens] | add // 0),
      ([.modelUsage[]?.cacheReadInputTokens] | add // 0), ([.modelUsage[]?.outputTokens] | add // 0),
      .subtype // "?", .num_turns // 0] | @tsv' "$out" 2>/dev/null || true)"
  [ -n "$totals" ] || totals=$'0\t0\t0\t0\t0\t?\t0'
  IFS=$'\t' read -r 'V[1]' 'V[2]' 'V[3]' 'V[4]' 'V[5]' ENDING TURNS <<<"$totals"
  stages="$(jq -rs "$AGENT_STAGES" "$stream" 2>>"$log" || true)"
  if [ -n "$stages" ]; then
    IFS=$'\t' read -r 'V[10]' 'V[11]' 'V[12]' 'V[13]' 'V[14]' 'V[15]' 'V[16]' 'V[17]' 'V[18]' 'V[19]' <<<"$stages"
  fi
  TASK_OPEN=1

  marker="$(jq -r '.result // ""' "$out" 2>/dev/null | grep -E '^QUEUE-(READY|STOP)' | tail -1 || true)"

  # A usage limit is not the issue's fault: park the branch and retry later.
  # Only without a marker: a finished agent may well mention RPC rate limits.
  if [ -z "$marker" ] && { jq -r '.result // ""' "$out"; tail -5 "$log"; } 2>/dev/null |
    grep -qiE 'usage limit|limit reached|resets at|rate_limit'; then
    park "$number" "$log"
    finish_task "usage limit"
    return 2
  fi

  if [ "$ENDING" = error_max_budget_usd ]; then
    block "$number" "spending cap of \$$BUDGET per issue reached"
    return 0
  fi
  if [ "$status" -ne 0 ]; then
    park "$number" "$log"
    die "#$number: claude exited with an error ($ENDING, $log)"
  fi
  case "$marker" in
    QUEUE-READY*) ;;
    QUEUE-STOP\ *)
      local reason="${marker#QUEUE-STOP }" named=''
      if [[ "$reason" =~ ^#([0-9]+)\ *(.*)$ ]]; then
        named="${BASH_REMATCH[1]}"
        reason="${BASH_REMATCH[2]}"
      fi
      block "$number" "agent stopped — ${reason:-no reason given}" "$named"
      return 0
      ;;
    *)
      block "$number" "agent did not say how it ended"
      return 0
      ;;
  esac

  # The marker is trusted only to mean the agent is done: the rest is checked here.
  local problem=''
  if [ "$(git branch --show-current)" != "$branch" ]; then
    problem="agent left branch $branch"
  elif [ -n "$(git status --porcelain)" ]; then
    problem="agent left uncommitted changes in $branch"
  elif [ "$(git rev-list --count "main..$branch")" -eq 0 ]; then
    problem="no commits in $branch"
  elif ! git log "main..$branch" --format=%B | grep -qiE "(closes|fixes|resolves) #$number([^0-9]|\$)"; then
    problem="no commit in $branch closes #$number"
  elif [ "$VERIFY" = 1 ] && ! verify "$log"; then
    problem="queue verification failed on $branch"
  fi
  if [ -n "$problem" ]; then
    block "$number" "$problem"
    return 0
  fi

  stage 9
  git checkout -q main
  git merge -q --ff-only "$branch" >>"$log" 2>&1 || die "$branch does not fast-forward onto main ($log)"
  git branch -q -d "$branch"
  if [ "$PUSH" = 1 ]; then
    git push -q origin main >>"$log" 2>&1 || die "#$number merged, but the push failed ($log)"
    if ! closed "$number"; then
      # The closing commit was checked before the merge, so the issue is done
      # even if GitHub did not link it.
      say "#$number is pushed but still open — closing it"
      gh issue close "$number" --reason completed \
        --comment "Done in $(git rev-parse --short HEAD) on main. GitHub did not close it from \`Closes #$number\`, so the agent queue did." >>"$log" 2>&1 || true
      closed "$number" || say "#$number is still open — close it by hand"
    fi
    say "#$number done: merged and pushed"
  else
    say "#$number done: merged into main (not pushed)"
  fi
  FAILURES=0
  finish_task done
}

# The whole run lives in a function: bash reads the file as it executes, and
# the queue switches branches, which could swap this file under it. A
# function is parsed whole before its first step.
main() {
  local number
  for number in $ONLY; do
    [[ "$number" =~ ^[0-9]+$ ]] || die "issues are given by number, not \"$number\""
  done
  cd "$ROOT"
  command -v jq >/dev/null || die "jq is required"
  command -v claude >/dev/null || die "claude is required"
  gh auth status >/dev/null 2>&1 || die "gh is not logged in: gh auth login"
  [ "$(git branch --show-current)" = main ] || die "start on main"
  mkdir -p "$LOGS"

  # The working copy is the human's too: without a clean tree someone else's
  # changes would end up on the issue branch. Checked at the start of every round.
  local done_count=0 waits=0
  while :; do
    [ -z "$(git status --porcelain)" ] || die "uncommitted changes in the working copy"
    git checkout -q main
    git fetch -q origin main

    load_open
    check_blockers
    number="$(next_task)"
    if [ -z "$number" ]; then
      say "no ready issues — the queue is empty"
      spent
      break
    fi

    local result=0
    run_task "$number" || result=$?
    if [ "$result" = 2 ]; then
      waits=$((waits + 1))
      [ "$waits" -le "$LIMIT_WAITS" ] || die "usage limit still reached after $LIMIT_WAITS waits"
      say "usage limit reached — waiting $LIMIT_WAIT_MIN min ($waits/$LIMIT_WAITS)"
      sleep $((LIMIT_WAIT_MIN * 60))
      continue
    fi
    [ "$result" = 0 ] || die "#$number: unexpected exit $result"
    waits=0

    done_count=$((done_count + 1))
    if [ "$MAX_TASKS" -gt 0 ] && [ "$done_count" -ge "$MAX_TASKS" ]; then
      say "issues taken: $done_count — MAX_TASKS reached"
      spent
      break
    fi
  done
  [ "$PUSH" = 1 ] || say "main is ahead of origin — review and push it yourself: git push"
}

main "$@"
exit
