#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import json
import logging
from typing import Dict
from dotenv import load_dotenv

from fastmcp import FastMCP

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("cdk-cicd-wrapper-debugger")


# Function to initialize the server
def create_server() -> FastMCP:
    """Create and initialize the MCP server

    Returns:
        FastMCP: The initialized server instance
    """
    logger.info("Initializing CDK CI/CD Wrapper Debugger MCP server")
    return FastMCP("cdk-cicd-wrapper-debugger")


# Initialize the MCP server
mcp = create_server()

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


# Helper functions will be available to tools through direct import
# FastMCP 2.0 handles context differently than the legacy MCP SDK

#########################################
# Tool Registration Functions           #
#########################################


def register_tools(mcp_server: FastMCP) -> None:
    """Register all tools with the MCP server using FastMCP 2.0 decorator pattern

    Args:
        mcp_server: The MCP server instance to register tools with
    """

    @mcp_server.tool()
    async def check_comprehensive_config(project_path: str) -> str:
        """Comprehensive configuration file checker for CDK CI/CD Wrapper.

        Checks if the most important parameters are present in .env files or
        exported as environment variables. This is a comprehensive check that
        covers all critical configuration parameters.

        Args:
            project_path: Path to the CDK project directory

        Returns:
            JSON string with comprehensive configuration analysis and recommendations
        """
        import json
        from debugger.tools.config_checker import check_comprehensive_config

        result = check_comprehensive_config(
            project_path, load_env_variables, load_package_json
        )
        return json.dumps(result, indent=2)

    @mcp_server.tool()
    async def check_stage_definitions(project_path: str) -> str:
        """Verify stage definitions in CDK CI/CD Wrapper project.

        Checks if stages are correctly defined through environment variables or code.
        Environment variables (ACCOUNT_*) are the preferred method for defining stages.

        Args:
            project_path: Path to the CDK project directory

        Returns:
            JSON string with analysis results including issues found and recommendations
        """
        import json
        from debugger.tools.stage_checker import (
            check_stage_definitions as check_stage_definitions_async,
        )

        # Create a context-like object with helper methods
        class Context:
            def info(self, message):
                logger.info(message)

            def load_env_variables(self, path):
                return load_env_variables(path)

            def load_package_json(self, path):
                return load_package_json(path)

        ctx = Context()

        # Await the async function instead of using asyncio.run()
        result = await check_stage_definitions_async(project_path, ctx)
        return json.dumps(result, indent=2)

    @mcp_server.tool()
    async def check_git_provider(project_path: str) -> str:
        """Check Git provider configuration (GitHub/CodeCommit) and validate connectivity.

        Analyzes which Git provider is configured and validates that it's properly
        set up. For CodeCommit, performs a connectivity test using the RES account
        credentials to ensure repositories can be accessed.

        Args:
            project_path: Path to the CDK project directory

        Returns:
            JSON string with Git provider analysis and connectivity test results
        """
        import json
        from debugger.tools.git_checker import (
            check_git_provider as check_git_provider_async,
        )

        # Create a context-like object with helper methods
        class Context:
            def info(self, message):
                logger.info(message)

            def load_env_variables(self, path):
                return load_env_variables(path)

            def load_package_json(self, path):
                return load_package_json(path)

        ctx = Context()

        # Await the async function instead of using asyncio.run()
        result = await check_git_provider_async(project_path, ctx)
        return json.dumps(result, indent=2)

    @mcp_server.tool()
    async def check_ci_configuration(project_path: str) -> str:
        """Check CI system configuration (CodePipeline or GitHub Actions).

        Determines which CI system is being used and validates its configuration.
        If CodePipeline is in use, analyzes the version, Docker base image, and
        CodeBuild environment settings.

        Args:
            project_path: Path to the CDK project directory

        Returns:
            JSON string with CI system analysis and configuration details
        """
        import json
        from debugger.tools.ci_checker import (
            check_ci_configuration as check_ci_configuration_async,
        )

        # Create a context-like object with helper methods
        class Context:
            def info(self, message):
                logger.info(message)

            def load_env_variables(self, path):
                return load_env_variables(path)

            def load_package_json(self, path):
                return load_package_json(path)

        ctx = Context()

        # Await the async function instead of using asyncio.run()
        result = await check_ci_configuration_async(project_path, ctx)
        return json.dumps(result, indent=2)

    @mcp_server.tool()
    async def check_plugins(project_path: str) -> str:
        """Check for custom plugins in a CDK CI/CD Wrapper project.

        Identifies and analyzes any custom plugins used in the project,
        including potential security implications. Specifically highlights
        plugins that enable public access or other security-sensitive configurations.

        Args:
            project_path: Path to the CDK project directory

        Returns:
            JSON string with plugin analysis and security recommendations
        """
        import json
        from debugger.tools.plugin_checker import check_plugins as check_plugins_async

        # Create a context-like object with helper methods
        class Context:
            def info(self, message):
                logger.info(message)

            def load_env_variables(self, path):
                return load_env_variables(path)

            def load_package_json(self, path):
                return load_package_json(path)

        ctx = Context()

        # Await the async function instead of using asyncio.run()
        result = await check_plugins_async(project_path, ctx)
        return json.dumps(result, indent=2)

    @mcp_server.tool()
    async def check_vpc_configuration(project_path: str) -> str:
        """Check VPC configuration and CodeBuild environment variables.

        Validates VPC configuration in CDK CI/CD Wrapper project and ensures
        all necessary proxy configurations are present when VPC proxy is enabled.

        Args:
            project_path: Path to the CDK project directory

        Returns:
            JSON string with analysis results including VPC config and proxy settings
        """
        import json
        from debugger.tools.vpc_checker import (
            check_vpc_configuration as check_vpc_configuration_async,
        )

        # Create a context-like object with helper methods
        class Context:
            def info(self, message):
                logger.info(message)

            def load_env_variables(self, path):
                return load_env_variables(path)

            def load_package_json(self, path):
                return load_package_json(path)

        ctx = Context()

        # Await the async function instead of using asyncio.run()
        result = await check_vpc_configuration_async(project_path, ctx)
        return json.dumps(result, indent=2)


def start_server(mcp_server: FastMCP, transport: str = "stdio") -> None:
    """Start the MCP server with the specified transport

    Args:
        mcp_server: The MCP server instance to start
        transport: The transport method to use (default: stdio)
    """
    mcp_server.run(transport=transport)


# Register the tools
register_tools(mcp)


def main():
    """Main entry point for the debugger MCP server"""
    start_server(mcp)


# Start the server
if __name__ == "__main__":
    main()
