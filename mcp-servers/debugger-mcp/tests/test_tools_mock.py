# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""Mock tests for tools modules to increase coverage"""

import pytest
from unittest.mock import MagicMock

# Import all tools
from debugger.tools.config_checker import check_comprehensive_config
from debugger.tools.stage_checker import check_stage_definitions
from debugger.tools.git_checker import check_git_provider
from debugger.tools.ci_checker import check_ci_configuration
from debugger.tools.plugin_checker import check_plugins
from debugger.tools.vpc_checker import check_vpc_configuration


class TestToolsCoverage:
    """Test class to increase coverage of all tools"""

    @pytest.fixture
    def mock_context(self):
        """Create a mock context for testing"""
        context = MagicMock()
        context.info = MagicMock()
        context.warning = MagicMock()
        context.error = MagicMock()

        # Mock the load_env_variables and load_package_json methods
        context.load_env_variables = MagicMock(
            return_value={
                "AWS_REGION": "us-east-1",
                "ACCOUNT_RES": "123456789012",
                "CODESTAR_CONNECTION_ARN": "arn:aws:codestar-connections:region:account:connection/id",
                "CICD_VPC_TYPE": "VPC",
                "CICD_VPC_ID": "vpc-12345",
                "PROXY_SECRET_ARN": "arn:aws:secretsmanager:region:account:secret:proxy-secret",
            }
        )

        context.load_package_json = MagicMock(
            return_value={
                "name": "test-project",
                "version": "1.0.0",
                "config": {
                    "repositoryType": "github",
                    "applicationName": "test-app",
                    "cdkQualifier": "test",
                    "repositoryName": "test-repo",
                    "cicdVpcType": "VPC",
                },
            }
        )

        return context

    def test_check_comprehensive_config(self, mock_context):
        """Test check_comprehensive_config function"""

        # Set up mock context with load functions
        mock_context.load_env_variables.return_value = {
            "AWS_REGION": "us-east-1",
            "ACCOUNT_RES": "123456789012",
        }
        mock_context.load_package_json.return_value = {
            "name": "test-project",
            "config": {"repositoryType": "github"},
        }

        # Call the function with two parameters
        result = check_comprehensive_config(
            "/project", mock_context.load_env_variables, mock_context.load_package_json
        )

        # Verify basic structure of result
        assert isinstance(result, dict)
        assert "status" in result
        assert "findings" in result
        assert "recommendations" in result

    @pytest.mark.asyncio
    async def test_check_stage_definitions(self, mock_context):
        """Test check_stage_definitions function"""

        # Set up mock context with load functions
        mock_context.load_env_variables.return_value = {
            "ACCOUNT_RES": "123456789012",
            "ACCOUNT_DEV": "123456789013",
        }
        mock_context.load_package_json.return_value = {"name": "test-project"}

        # Call the async function with two parameters
        result = await check_stage_definitions("/project", mock_context)

        # Verify basic structure of result
        assert isinstance(result, dict)
        assert "valid" in result
        assert "stages" in result

    @pytest.mark.asyncio
    async def test_check_git_provider(self, mock_context):
        """Test check_git_provider function"""

        # Set up mock context with load functions
        mock_context.load_env_variables.return_value = {
            "GITHUB_REPOSITORY_OWNER": "test-owner",
            "CODESTAR_CONNECTION_ARN": "arn:aws:codestar-connections:myarn",
        }
        mock_context.load_package_json.return_value = {
            "name": "test-project",
            "config": {"repositoryType": "github"},
        }

        # Call the async function with two parameters
        result = await check_git_provider("/project", mock_context)

        # Verify basic structure of result
        assert isinstance(result, dict)
        assert "provider" in result
        assert "valid" in result

    @pytest.mark.asyncio
    async def test_check_ci_configuration(self, mock_context):
        """Test check_ci_configuration function"""

        # Set up mock context with load functions
        mock_context.load_env_variables.return_value = {
            "AWS_REGION": "us-east-1",
            "CODEBUILD_IMAGE": "aws/codebuild/amazonlinux2-x86_64-standard:3.0",
        }
        mock_context.load_package_json.return_value = {"name": "test-project"}

        # Call the async function with two parameters
        result = await check_ci_configuration("/project", mock_context)

        # Verify basic structure of result
        assert isinstance(result, dict)
        assert "ci_system" in result
        assert "valid" in result

    @pytest.mark.asyncio
    async def test_check_plugins(self, mock_context):
        """Test check_plugins function"""

        # Set up mock context with load functions
        mock_context.load_env_variables.return_value = {}
        mock_context.load_package_json.return_value = {
            "name": "test-project",
            "dependencies": {
                "test-plugin": "1.0.0",
                "public-access-plugin": "2.0.0",
            },
        }

        # Call the async function with two parameters
        result = await check_plugins("/project", mock_context)

        # Verify basic structure of result
        assert isinstance(result, dict)
        assert "plugins" in result
        assert "valid" in result

    @pytest.mark.asyncio
    async def test_check_vpc_configuration(self, mock_context):
        """Test check_vpc_configuration function"""

        # Set up mock context with load functions
        mock_context.load_env_variables.return_value = {
            "VPC_ID": "vpc-12345",
            "HTTP_PROXY": "http://proxy:8080",
        }
        mock_context.load_package_json.return_value = {"name": "test-project"}

        # Call the async function with two parameters
        result = await check_vpc_configuration("/project", mock_context)

        # Verify basic structure of result
        assert isinstance(result, dict)
        assert "vpc_config" in result
        assert "valid" in result
