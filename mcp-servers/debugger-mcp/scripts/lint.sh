#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: Apache-2.0

# lint.sh - Lint the python code

set -e  # Exit immediately if a command exits with a non-zero status

cd "$(dirname "$0")/.."
ROOT_DIR="$(pwd)"

# Check if there is a virtual environment
if [ ! -d ".venv" ]; then
    echo "Please run ./scripts/init.sh first"
    exit
fi

source .venv/bin/activate

# Run black formatter on all Python code
black debugger
