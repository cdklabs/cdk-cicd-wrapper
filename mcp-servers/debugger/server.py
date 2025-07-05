#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import json
import logging
from typing import Dict
from dotenv import load_dotenv

from mcp.server.fastmcp import FastMCP, Context

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("cdk-cicd-wrapper-debugger")

# Initialize the MCP server
logger.info("Initializing CDK CI/CD Wrapper Debugger MCP server")
mcp = FastMCP("cdk-cicd-wrapper-debugger")

#########################################
# Helper Functions                      #
#########################################


def load_package_json(project_path: str = None) -> Dict:
    """Load package.json content from the project directory.

    Args:
        project_path: Path to the project directory

    Returns:
        Dict containing the parsed package.json content, or an empty dict if not found
    """
    package_data = {}

    if not project_path:
        return package_data

    package_json_path = os.path.join(project_path, "package.json")

    if os.path.exists(package_json_path):
        try:
            logger.info(f"Loading package.json from {package_json_path}")
            with open(package_json_path, "r") as f:
                package_data = json.load(f)
            return package_data
        except Exception as e:
            logger.warning(f"Error loading package.json: {str(e)}")

    return package_data


def load_env_variables(project_path: str = None) -> Dict[str, str]:
    """Load environment variables from .env files and system environment.

    Args:
        project_path: Path to the project directory to look for .env files

    Returns:
        Dict containing all environment variables
    """
    env_vars = dict(os.environ)

    # Look for .env files in project directory if provided
    if project_path and os.path.exists(project_path):
        env_files = [
            os.path.join(project_path, ".env"),
            os.path.join(project_path, ".env.local"),
            os.path.join(project_path, ".env.development"),
        ]

        for env_file in env_files:
            if os.path.exists(env_file):
                logger.info(f"Loading environment variables from {env_file}")
                # Load .env file without overriding existing environment variables
                load_dotenv(env_file, override=False)

                # Manually parse the .env file to get variables for our analysis
                try:
                    with open(env_file, "r") as f:
                        for line in f:
                            line = line.strip()
                            if line and not line.startswith("#") and "=" in line:
                                key, value = line.split("=", 1)
                                key = key.strip()
                                value = value.strip().strip('"').strip("'")
                                if (
                                    key not in env_vars
                                ):  # Don't override existing env vars
                                    env_vars[key] = value
                except Exception as e:
                    logger.warning(f"Error parsing {env_file}: {e}")

    return env_vars


# Make helper functions available to imported tools
Context.load_env_variables = load_env_variables
Context.load_package_json = load_package_json

#########################################
# Import and register tools     #
#########################################

# Import tools
from tools.config_checker import check_comprehensive_config
from tools.stage_checker import check_stage_definitions
from tools.git_checker import check_git_provider
from tools.ci_checker import check_ci_configuration
from tools.plugin_checker import check_plugins
from tools.vpc_checker import check_vpc_configuration

# Register all tools
mcp.add_tool(check_comprehensive_config)
mcp.add_tool(check_stage_definitions)
mcp.add_tool(check_git_provider)
mcp.add_tool(check_ci_configuration)
mcp.add_tool(check_plugins)
mcp.add_tool(check_vpc_configuration)

# Start the server
if __name__ == "__main__":
    mcp.run(transport="stdio")
