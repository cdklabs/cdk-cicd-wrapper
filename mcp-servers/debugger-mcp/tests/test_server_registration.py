# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Import all mock tools
from tests.test_comprehensive_config import mock_check_comprehensive_config
from tests.test_vpc_configuration import mock_check_vpc_configuration
from tests.test_stage_definitions import mock_check_stage_definitions
from tests.test_git_provider import mock_check_git_provider
from tests.test_ci_configuration import mock_check_ci_configuration
from tests.test_plugins import mock_check_plugins


# Test server registration of all tools
def test_server_registration(mock_server):
    """Test that all tools can be registered with the server"""
    # Register all tools
    mock_server.add_tool(mock_check_comprehensive_config)
    mock_server.add_tool(mock_check_stage_definitions)
    mock_server.add_tool(mock_check_git_provider)
    mock_server.add_tool(mock_check_ci_configuration)
    mock_server.add_tool(mock_check_plugins)
    mock_server.add_tool(mock_check_vpc_configuration)

    # Verify tools were registered
    assert "mock_check_comprehensive_config" in mock_server.registered_tools
    assert "mock_check_stage_definitions" in mock_server.registered_tools
    assert "mock_check_git_provider" in mock_server.registered_tools
    assert "mock_check_ci_configuration" in mock_server.registered_tools
    assert "mock_check_plugins" in mock_server.registered_tools
    assert "mock_check_vpc_configuration" in mock_server.registered_tools
    assert len(mock_server.registered_tools) == 6


# Test the server tool registration with a subset of tools
def test_server_partial_registration(mock_server):
    """Test that a subset of tools can be registered with the server"""
    # Register only a subset of tools
    mock_server.add_tool(mock_check_comprehensive_config)
    mock_server.add_tool(mock_check_vpc_configuration)

    # Verify only those tools were registered
    assert "mock_check_comprehensive_config" in mock_server.registered_tools
    assert "mock_check_vpc_configuration" in mock_server.registered_tools
    assert len(mock_server.registered_tools) == 2
