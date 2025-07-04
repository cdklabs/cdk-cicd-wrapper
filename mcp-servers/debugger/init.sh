#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: Apache-2.0

# init.sh - Initialize and run the CDK CI/CD Wrapper Debugger MCP server
# This script sets up a virtual environment, installs dependencies, and launches the server

set -e  # Exit immediately if a command exits with a non-zero status

# Navigate to script directory
cd "$(dirname "$0")"
SCRIPT_DIR="$(pwd)"
echo "Setting up CDK CI/CD Wrapper Debugger MCP server in $SCRIPT_DIR"

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    echo "Virtual environment created successfully."
else
    echo "Using existing virtual environment."
fi

# Activate virtual environment
echo "Activating virtual environment..."
source .venv/bin/activate

# Check if uv is installed, if not install it
if ! command -v uv &> /dev/null; then
    echo "uv not found, installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # Add uv to PATH for this session
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# Install requirements using uv
echo "Installing dependencies using uv..."
uv pip install -r requirements.txt

# Launch MCP server
echo "Starting CDK CI/CD Wrapper Debugger MCP server..."
python server.py

# Note: The script will not reach this point unless the server is stopped
echo "MCP server has stopped."
