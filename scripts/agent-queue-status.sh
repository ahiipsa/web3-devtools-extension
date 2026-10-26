#!/usr/bin/env bash
# What the queue agent (`scripts/agent-queue.sh`) is doing right now: phase,
# the command in flight, time per command group, tokens, the agent's latest
# messages and actions. Only reads the log, never gets in the queue's way.
#
#   scripts/agent-queue-status.sh            # latest issue
#   scripts/agent-queue-status.sh 11         # a given issue
#   scripts/agent-queue-status.sh -w         # refresh every 10 s
#   N=20 scripts/agent-queue-status.sh       # more lines per list
#
# At the end: open `needs-triage` issues, including the ones queue agents
# filed for the human.
#
# The issue log is `issue-N.jsonl` in `$QUEUE_LOGS` (default
# `~/.local/state/evm-rpc-inspector-agent-queue`). Phases and command groups
# match the queue report (`docs/agents/agent-queue.md` → "Logs and costs").
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="${QUEUE_LOGS:-$HOME/.local/state/evm-rpc-inspector-agent-queue}"
N="${N:-8}"
WATCH=0
TASK=''
for arg in "$@"; do
  case "$arg" in
    -w) WATCH=1 ;;
    *) TASK="$arg" ;;
  esac
done

STATUS='
def ts: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
def dur: (if . < 0 then 0 else floor end) as $s
  | def two: tostring | if length < 2 then "0" + . else . end;
  if $s >= 3600 then "\($s / 3600 | floor):\($s % 3600 / 60 | floor | two):\($s % 60 | two)"
  else "\($s / 60 | floor):\($s % 60 | two)" end;
def clock: strflocaltime("%H:%M:%S");
def tok: if . >= 1e6 then "\(. / 1e5 | floor / 10)M"
  elif . >= 1e3 then "\(. / 1e3 | round)k" else tostring end;
def line: gsub("\\s+"; " ") | .[0:160];
def kind:
  if .name == "Bash" then
    (.input.command // "") as $c
    | if ($c | test("vitest|npm (run )?test")) then "test"
      elif ($c | test("eslint|prettier|npm run lint")) then "lint"
      elif ($c | test("vite build|npm run (build|release)")) then "build"
      elif ($c | test("typecheck|\\btsc\\b")) then "typecheck"
      else "other" end
  elif .name == "Agent" or .name == "Task" then "subagents"
  else "tool" end;
def union: sort_by(.[0])
  | reduce .[] as $i ([];
      if length > 0 and $i[0] <= .[-1][1] then .[-1][1] = ([.[-1][1], $i[1]] | max) else . + [$i] end)
  | map(.[1] - .[0]) | add // 0;
def what: .name + " " + ((.input.command // .input.file_path // .input.skill // .input.description // "") | tostring | line);

now as $now
| [.[] | select((.type == "assistant" or .type == "user") and .timestamp)] as $msgs
| (map(select(.type == "result")) | last) as $result
| ([$msgs[] | .timestamp | ts] | min // $now) as $start
| [$msgs[] | select(.type == "assistant" and .parent_tool_use_id == null)
   | (.timestamp | ts) as $t | .message.content[]? | select(type == "object")
   | . + {t: $t}] as $blocks
| [$blocks[] | select(.type == "tool_use")] as $uses
| ([$msgs[] | select(.type == "user") | (.timestamp | ts) as $t | .message.content[]?
    | select(type == "object" and .type == "tool_result") | {key: .tool_use_id, value: $t}] | from_entries) as $ends
| ([$uses[] | select(.name == "Skill" and ((.input.skill // "") | test("code-review"))) | .t] | min) as $review
| ([$uses[] | select($ends[.id] == null)] | last) as $running
| ([$msgs[] | select(.type == "assistant")
    | {id: (.message.id // .uuid), n: (.message.usage // {} | (.input_tokens // 0)
        + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0) + (.output_tokens // 0))}]
   | group_by(.id) | map(.[0])) as $calls
| [$uses[] | select(kind != "tool") | {k: kind, span: [.t, ($ends[.id] // $now)]}] as $spans
| def within($k): [$spans[] | select(.k == $k) | .span] | union;
  "Issue: \($task) · started \($start | clock) · "
    + (if $result then "finished, \($result.subtype // "?"), $\($result.total_cost_usd // 0 | . * 100 | round / 100)"
       else "running for \($now - $start | dur)" end),
  "Phase: " + (if $review then "review since \($review | clock) (implementation \($review - $start | dur))"
               else "implementation (review not started)" end),
  (if $result then empty
   elif $running then "Now: \($running | what) — running for \($now - $running.t | dur)"
   else "Now: model thinking" end),
  "Tokens: \([$calls[].n] | add // 0 | tok) · model replies \($calls | length)",
  "Commands: " + ([ "test", "lint", "build", "typecheck", "other", "subagents" ]
                  | map("\(.) \(within(.) | dur)") | join(" · ")),
  "",
  "Agent messages:",
  ([$blocks[] | select(.type == "text")] | .[-$n:][] | "  \(.t | clock) \(.text | line)"),
  "",
  "Latest actions:",
  ($uses | .[-$n:][] | "  \(.t | clock) \(what)" + (if $ends[.id] == null then "  ← running" else "" end)),
  (if $result then "", "Agent outcome: " + (($result.result // "") | split("\n") | map(select(test("^QUEUE-"))) | last // "no marker")
   else empty end)
'

show() {
  local file
  if [ -n "$TASK" ]; then
    file="$LOGS/issue-${TASK#issue-}.jsonl"
  else
    file="$(ls -t "$LOGS"/issue-*.jsonl 2>/dev/null | head -1 || true)"
  fi
  if [ -z "$file" ] || [ ! -e "$file" ]; then
    echo "No issue log in $LOGS"
    return
  fi
  jq -rs --arg task "#$(basename "$file" .jsonl | sed 's/^issue-//')" --argjson n "$N" "$STATUS" "$file"
}

# Issues waiting for the human.
triage() {
  local list
  list="$(cd "$ROOT" && gh issue list --state open --label needs-triage --json number,title \
    --jq '.[] | "  #\(.number) — \(.title)"' 2>/dev/null || true)"
  echo
  if [ -z "$list" ]; then
    echo "Needs triage: 0"
    return
  fi
  echo "Needs triage: $(printf '%s\n' "$list" | wc -l | tr -d ' ')"
  printf '%s\n' "$list"
}

if [ "$WATCH" = 1 ]; then
  while :; do
    out="$(show; triage)"
    clear
    printf '%s\n\n(refreshing every 10 s, Ctrl-C to quit)\n' "$out"
    sleep 10
  done
else
  show
  triage
fi
