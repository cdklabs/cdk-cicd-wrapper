#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: Apache-2.0

# start.sh - Start the mcp-server locally

set -e # Exit immediately if a command exits with a non-zero status

cd "$(dirname "$0")/.."
ROOT_DIR="$(pwd)"

# Check if there is a virtual environment
if [ ! -d ".venv" ]; then
    echo "Please run ./scripts/init.sh first"
    exit
fi

source .venv/bin/activate

# Launch MCP server
echo "Starting CDK CI/CD Wrapper Debugger MCP server..."
python -m debugger.server

# Note: The script will not reach this point unless the server is stopped
echo "MCP server has stopped."
