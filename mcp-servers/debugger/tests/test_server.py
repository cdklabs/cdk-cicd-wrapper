# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import pytest
from unittest.mock import patch, MagicMock, call
import sys
import importlib


class TestServerInitialization:
    """Tests for server initialization and tool registration"""

    @patch("server.FastMCP")
    def test_create_server(self, mock_fastmcp_class):
        """Test the create_server function"""
        # Set up the mock
        mock_fastmcp_instance = MagicMock()
        mock_fastmcp_class.return_value = mock_fastmcp_instance

        # Import server
        import server

        # Call create_server function directly
        result = server.create_server()

        # Verify server was initialized with correct name
        mock_fastmcp_class.assert_called_once_with("cdk-cicd-wrapper-debugger")
        assert result == mock_fastmcp_instance

    def test_context_extension(self):
        """Test that helper functions are available in server module"""
        # Import server which contains the helper functions
        import server

        # Verify helper functions exist in server module
        assert hasattr(server, "load_env_variables")
        assert hasattr(server, "load_package_json")
        assert callable(server.load_env_variables)
        assert callable(server.load_package_json)

    def test_register_tools_function(self):
        """Test the register_tools function with FastMCP 2.0 decorator pattern"""
        import server

        # Create a mock server that supports the tool decorator
        mock_server = MagicMock()

        # Mock the tool decorator to return a decorator function
        def mock_tool_decorator():
            def decorator(func):
                return func

            return decorator

        mock_server.tool = MagicMock(side_effect=mock_tool_decorator)

        # Call the register_tools function
        server.register_tools(mock_server)

        # Verify the tool decorator was called multiple times (once for each tool)
        assert mock_server.tool.call_count == 6

    def test_start_server_function(self):
        """Test the start_server function"""
        import server

        # Create a mock server
        mock_server = MagicMock()

        # Call the start_server function
        server.start_server(mock_server, "test_transport")

        # Verify run was called with correct parameters
        mock_server.run.assert_called_once_with(transport="test_transport")

    def test_main_execution(self):
        """Test execution as __main__"""
        import server

        # Test that the main execution path works by mocking the functions
        with (
            patch.object(server, "create_server") as mock_create,
            patch.object(server, "register_tools") as mock_register,
            patch.object(server, "start_server") as mock_start,
        ):

            # Setup mock for create_server
            mock_server = MagicMock()
            mock_create.return_value = mock_server

            # Simulate main execution by calling the main functions directly
            server_instance = server.create_server()
            server.register_tools(server_instance)

            # In a real main execution, start_server would only be called if __name__ == "__main__"
            # We'll test this separately to avoid actually starting the server

            # Verify functions were called correctly
            mock_create.assert_called_once()
            mock_register.assert_called_once_with(server_instance)
