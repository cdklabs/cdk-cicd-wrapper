#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: Apache-2.0

# test.sh - Test the python code

set -e  # Exit immediately if a command exits with a non-zero status

cd "$(dirname "$0")/.."
ROOT_DIR="$(pwd)"

# Check if there is a virtual environment
if [ ! -d ".venv" ]; then
    echo "Please run ./scripts/init.sh first"
    exit
fi

source .venv/bin/activate

# Print debugging info
echo "Running tests from: $(pwd)"
echo "PYTHONPATH: $PYTHONPATH"
echo "Python version: $(python --version)"

# Run pytest with configuration from pyproject.toml
cd $ROOT_DIR
#TODO: switch coverage from 50 to 80 once finished
python -m pytest tests/ -v \
  --cov=server \
  --cov=tools \
  --cov-fail-under=50 \
  --cov-report=term-missing
