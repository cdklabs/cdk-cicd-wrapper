# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import pytest
import os
from unittest.mock import Mock


# Mock the necessary classes and imports
class MockContext:
    """Shared mock Context class for testing"""

    def __init__(self):
        self.info = Mock()
        self.warning = Mock()
        self.error = Mock()

    def load_env_variables(self, project_path):
        # Mock implementation
        if not os.path.exists(project_path):
            return {}
        return {"AWS_REGION": "us-west-2", "ACCOUNT_RES": "123456789012"}

    def load_package_json(self, project_path):
        # Mock implementation
        if not os.path.exists(project_path):
            return {}
        return {"name": "test-project", "config": {"repositoryType": "github"}}


# Mock fixture for testing
@pytest.fixture
def mock_context():
    """Fixture that provides a mock Context object for testing"""
    return MockContext()


# Mock server class for testing tool registration
class MockServer:
    """Mock server class for testing tool registration"""

    def __init__(self):
        self.registered_tools = []

    def add_tool(self, tool):
        self.registered_tools.append(tool.__name__)


@pytest.fixture
def mock_server():
    """Fixture that provides a mock server for testing tool registration"""
    return MockServer()
