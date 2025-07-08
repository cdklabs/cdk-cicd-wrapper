# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import pytest
import tempfile
import os
import json
from unittest.mock import patch
from fastmcp import Client
from mcp.types import TextContent

# Configure pytest-asyncio
pytest_plugins = ("pytest_asyncio",)


@pytest.mark.asyncio
class TestMCPIntegration:
    """Integration tests using FastMCP client for in-memory testing

    These tests validate the actual MCP protocol interactions rather than just
    mocking individual functions, following best practices from:
    https://www.jlowin.dev/blog/stop-vibe-testing-mcp-servers
    """

    @pytest.fixture
    def mcp_server(self):
        """Fixture that provides a properly configured MCP server instance"""
        import debugger.server as server

        # Create a fresh server instance
        mcp_instance = server.create_server()
        server.register_tools(mcp_instance)

        return mcp_instance

    @pytest.fixture
    def temp_project_dir(self):
        """Create a temporary project directory with test files"""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create a sample package.json
            package_json = {
                "name": "test-cdk-project",
                "version": "1.0.0",
                "config": {"repositoryType": "github"},
            }
            with open(os.path.join(temp_dir, "package.json"), "w") as f:
                json.dump(package_json, f)

            # Create a sample .env file
            env_content = """
AWS_REGION=us-west-2
ACCOUNT_RES=123456789012
ACCOUNT_DEV=123456789013
ACCOUNT_INT=123456789014
GITHUB_REPOSITORY_OWNER=test-owner
GITHUB_REPOSITORY_NAME=test-repo
"""
            with open(os.path.join(temp_dir, ".env"), "w") as f:
                f.write(env_content)

            yield temp_dir

    async def test_server_initialization(self, mcp_server):
        """Test that the MCP server initializes correctly and responds to basic protocol calls"""
        async with Client(mcp_server) as client:
            # Test server ping
            is_alive = await client.ping()
            assert is_alive

            # Test tool listing
            tools = await client.list_tools()
            assert len(tools) == 6  # We expect 6 tools to be registered

            tool_names = [tool.name for tool in tools]
            expected_tools = [
                "check_comprehensive_config",
                "check_stage_definitions",
                "check_git_provider",
                "check_ci_configuration",
                "check_plugins",
                "check_vpc_configuration",
            ]

            for expected_tool in expected_tools:
                assert expected_tool in tool_names

    async def test_check_comprehensive_config_tool(self, mcp_server, temp_project_dir):
        """Test the comprehensive config checker tool through MCP protocol"""
        async with Client(mcp_server) as client:
            # Test with valid project path
            result = await client.call_tool(
                "check_comprehensive_config", {"project_path": temp_project_dir}
            )

            # With FastMCP, the result is a CallToolResult object
            assert result is not None
            assert hasattr(result, "content")
            assert len(result.content) > 0
            assert isinstance(result.content[0], TextContent)

            # Parse the JSON response from the text content
            response_data = json.loads(result.content[0].text)
            assert "status" in response_data
            assert "findings" in response_data
            assert "recommendations" in response_data

    async def test_check_stage_definitions_tool(self, mcp_server, temp_project_dir):
        """Test the stage definitions checker tool through MCP protocol"""
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "check_stage_definitions", {"project_path": temp_project_dir}
            )

            # With FastMCP, the result is a CallToolResult object
            assert result is not None
            assert hasattr(result, "content")
            assert len(result.content) > 0
            assert isinstance(result.content[0], TextContent)

            response_data = json.loads(result.content[0].text)
            assert "valid" in response_data
            assert "stages" in response_data

    async def test_check_git_provider_tool(self, mcp_server, temp_project_dir):
        """Test the git provider checker tool through MCP protocol"""
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "check_git_provider", {"project_path": temp_project_dir}
            )

            assert result is not None
            assert hasattr(result, "content")
            assert len(result.content) > 0
            assert isinstance(result.content[0], TextContent)

            response_data = json.loads(result.content[0].text)
            assert "provider" in response_data
            assert "valid" in response_data

    async def test_check_ci_configuration_tool(self, mcp_server, temp_project_dir):
        """Test the CI configuration checker tool through MCP protocol"""
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "check_ci_configuration", {"project_path": temp_project_dir}
            )

            assert result is not None
            assert hasattr(result, "content")
            assert len(result.content) > 0
            assert isinstance(result.content[0], TextContent)

            response_data = json.loads(result.content[0].text)
            assert "ci_system" in response_data
            assert "valid" in response_data

    async def test_check_plugins_tool(self, mcp_server, temp_project_dir):
        """Test the plugins checker tool through MCP protocol"""
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "check_plugins", {"project_path": temp_project_dir}
            )

            assert result is not None
            assert hasattr(result, "content")
            assert len(result.content) > 0
            assert isinstance(result.content[0], TextContent)

            response_data = json.loads(result.content[0].text)
            assert "plugins" in response_data
            assert "valid" in response_data

    async def test_check_vpc_configuration_tool(self, mcp_server, temp_project_dir):
        """Test the VPC configuration checker tool through MCP protocol"""
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "check_vpc_configuration", {"project_path": temp_project_dir}
            )

            assert result is not None
            assert hasattr(result, "content")
            assert len(result.content) > 0
            assert isinstance(result.content[0], TextContent)

            response_data = json.loads(result.content[0].text)
            assert "vpc_config" in response_data
            assert "valid" in response_data

    async def test_tool_error_handling(self, mcp_server):
        """Test that tools handle invalid inputs gracefully through MCP protocol"""
        async with Client(mcp_server) as client:
            # Test with invalid project path
            result = await client.call_tool(
                "check_comprehensive_config", {"project_path": "/nonexistent/path"}
            )

            assert result is not None
            assert hasattr(result, "content")
            assert len(result.content) > 0
            assert isinstance(result.content[0], TextContent)

            # Should still return valid JSON even for invalid paths
            response_data = json.loads(result.content[0].text)
            assert "status" in response_data

    async def test_all_tools_callable(self, mcp_server, temp_project_dir):
        """Test that all registered tools are callable through MCP protocol"""
        async with Client(mcp_server) as client:
            tools = await client.list_tools()

            for tool in tools:
                # Call each tool with the test project directory
                result = await client.call_tool(
                    tool.name, {"project_path": temp_project_dir}
                )

                # Verify we get a valid response
                assert result is not None
                assert hasattr(result, "content")
                assert len(result.content) > 0
                assert isinstance(result.content[0], TextContent)

                # Verify the response is valid JSON
                try:
                    json.loads(result.content[0].text)
                except json.JSONDecodeError:
                    pytest.fail(
                        f"Tool {tool.name} returned invalid JSON: {result.content[0].text}"
                    )

    async def test_concurrent_tool_calls(self, mcp_server, temp_project_dir):
        """Test that multiple tools can be called concurrently through MCP protocol"""
        import asyncio

        async with Client(mcp_server) as client:
            # Create concurrent calls to different tools
            tasks = [
                client.call_tool(
                    "check_comprehensive_config", {"project_path": temp_project_dir}
                ),
                client.call_tool(
                    "check_stage_definitions", {"project_path": temp_project_dir}
                ),
                client.call_tool(
                    "check_git_provider", {"project_path": temp_project_dir}
                ),
            ]

            results = await asyncio.gather(*tasks)

            # Verify all calls succeeded
            assert len(results) == 3
            for result in results:
                assert result is not None
                assert hasattr(result, "content")
                assert len(result.content) > 0
                assert isinstance(result.content[0], TextContent)
                # Verify valid JSON response
                json.loads(result.content[0].text)

    @patch.dict(
        os.environ,
        {
            "AWS_REGION": "us-east-1",
            "ACCOUNT_RES": "999999999999",
            "RES_ACCOUNT_AWS_REGION": "us-east-1",
        },
    )
    async def test_environment_variable_integration(self, mcp_server, temp_project_dir):
        """Test that tools properly utilize environment variables through MCP protocol"""
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "check_comprehensive_config", {"project_path": temp_project_dir}
            )

            assert result is not None
            assert hasattr(result, "content")
            assert len(result.content) > 0
            assert isinstance(result.content[0], TextContent)

            response_data = json.loads(result.content[0].text)

            # The tool should have access to environment variables
            # This tests the integration between the MCP protocol and our helper functions
            assert "findings" in response_data
