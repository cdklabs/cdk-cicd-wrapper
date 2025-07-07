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

# Create a .coveragerc file with specific settings
cat > .coveragerc << EOF
[run]
source = .
omit = 
    */tests/*
    */.venv/*

[report]
exclude_lines =
    pragma: no cover
    def __repr__
    raise NotImplementedError
    if __name__ == .__main__.:
    pass
    raise ImportError
    except ImportError
EOF

# Print debugging info
echo "Running tests from: $(pwd)"
echo "PYTHONPATH: $PYTHONPATH"
echo "Python version: $(python --version)"

# First, clean any old coverage data
rm -f .coverage

# Run pytest with full coverage parameters measuring server.py and tools/
cd $ROOT_DIR
#TODO: switch coverade from 50 to 80 once finished
python -m pytest tests/ -v \
  --cov=server \
  --cov=tools \
  --cov-config=.coveragerc \
  --cov-fail-under=50 \
  --cov-report=term-missing
