#!/bin/bash
# Ralph Loop runner for WhisperTUI
# Each iteration starts fresh - context passed via files (progress.txt, gameplan.md)

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

echo "Starting Ralph Loop (max $1 iterations)"

for ((i=1; i<=$1; i++)); do
  echo ""
  echo "=========================================="
  echo "  Ralph Loop - Iteration $i / $1"
  echo "=========================================="
  echo ""

  result=$(claude --dangerously-skip-permissions -p \
"@gameplan.md @progress.txt
1. Decide which task to work on next. \
This should be the one YOU decide has the highest priority, \
not necessarily the first in the list.
2. Check any feedback loops, such as types and tests.
3. Append your progress to the progress.txt file.
4. Make a git commit of that feature.
ONLY WORK ON A SINGLE FEATURE.
If ALL tasks in gameplan.md are marked [x] complete (not just the current one), \
output <promise>COMPLETE</promise>. Otherwise, continue to the next uncompleted task.
")

  echo "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo ""
    echo "All tasks complete, exiting Ralph Loop."
    exit 0
  fi
done

echo ""
echo "Ralph Loop completed after $1 iterations"
