#!/bin/bash
# Ralph Loop runner for WhisperTUI
# Each iteration starts fresh - context passed via files (progress.txt, gameplan.md)

MAX_ITERATIONS=${1:-50}  # Default to 10 iterations, or pass as argument
ITERATION=0

echo "Starting Ralph Loop (max $MAX_ITERATIONS iterations)"

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))
  echo ""
  echo "=========================================="
  echo "  Ralph Loop - Iteration $ITERATION / $MAX_ITERATIONS"
  echo "=========================================="
  echo ""

  cat PROMPT.md | claude

  # Check exit status
  if [ $? -ne 0 ]; then
    echo "Claude exited with error, stopping loop"
    break
  fi
done

echo ""
echo "Ralph Loop completed after $ITERATION iterations"
