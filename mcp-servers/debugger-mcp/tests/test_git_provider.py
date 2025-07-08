# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import tempfile


# Test implementation of Git provider checker
def mock_check_git_provider(project_path, ctx):
    """Mock implementation of check_git_provider for testing"""
    ctx.info(f"Checking Git provider in {project_path}")

    # Match the actual implementation structure
    results = {
        "valid": True,
        "issues": [],
        "recommendations": [],
        "provider": {"type": None, "configuration": {}, "connectivity_test": {}},
    }

    # If the path doesn't exist, add an issue
    if not os.path.exists(project_path):
        results["valid"] = False
        results["issues"].append(f"Project path does not exist: {project_path}")
        return results

    # Check package.json for repository type
    package_json = ctx.load_package_json(project_path)
    if "config" in package_json and "repositoryType" in package_json["config"]:
        repo_type = package_json["config"]["repositoryType"].lower()
        results["provider"]["type"] = repo_type
        results["provider"]["configuration"]["package_json_config"] = True

        # Add config sources like the real implementation
        results["provider"]["config_sources"] = {
            "github": {
                "in_code": False,
                "package_json": repo_type == "github",
            },
            "codecommit": {
                "in_code": False,
                "package_json": repo_type == "codecommit",
            },
        }

        # Simulate connectivity test for CodeCommit
        if repo_type == "codecommit":
            results["provider"]["connectivity_test"] = {
                "accessible": True,
                "repositories_found": 1,
                "specific_repository_exists": True,
            }

        # For GitHub, check CODESTAR_CONNECTION_ARN
        if repo_type == "github":
            env_vars = ctx.load_env_variables(project_path)
            if "CODESTAR_CONNECTION_ARN" in env_vars:
                results["provider"]["configuration"]["CODESTAR_CONNECTION_ARN"] = (
                    env_vars["CODESTAR_CONNECTION_ARN"]
                )
            else:
                results["issues"].append(
                    "GitHub repository type is configured but CODESTAR_CONNECTION_ARN is missing"
                )
                results["valid"] = False

    else:
        results["issues"].append("No repository type defined in package.json")
        results["valid"] = False

    return results


# Test for the Git provider checker with GitHub
def test_check_git_provider_github(mock_context):
    """Test the Git provider checker with GitHub"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Set up mock context to include CODESTAR_CONNECTION_ARN for GitHub
        mock_context.load_env_variables = lambda path: (
            {
                "CODESTAR_CONNECTION_ARN": "arn:aws:codestar-connections:us-east-1:123456789012:connection/abc123"
            }
            if os.path.exists(path)
            else {}
        )

        result = mock_check_git_provider(temp_dir, mock_context)

        # Check basic structure
        assert isinstance(result, dict)
        assert "valid" in result
        assert "provider" in result
        assert result["provider"]["type"] == "github"
        assert result["provider"]["configuration"]["package_json_config"] is True
        assert "CODESTAR_CONNECTION_ARN" in result["provider"]["configuration"]


# Test for the Git provider checker with CodeCommit
def test_check_git_provider_codecommit(mock_context):
    """Test the Git provider checker with CodeCommit"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Override the load_package_json method to return codecommit config
        mock_context.load_package_json = lambda path: (
            {"name": "test-project", "config": {"repositoryType": "codecommit"}}
            if os.path.exists(path)
            else {}
        )

        result = mock_check_git_provider(temp_dir, mock_context)

        # Check basic structure
        assert isinstance(result, dict)
        assert "valid" in result
        assert "provider" in result
        assert result["provider"]["type"] == "codecommit"
        assert result["provider"]["configuration"]["package_json_config"] is True
        assert "connectivity_test" in result["provider"]


# Test for the Git provider checker with missing config
def test_check_git_provider_missing_config(mock_context):
    """Test the Git provider checker with missing repository configuration"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Override to return empty package.json
        mock_context.load_package_json = lambda path: {} if os.path.exists(path) else {}

        result = mock_check_git_provider(temp_dir, mock_context)

        # Should detect missing config and report issues
        assert result["valid"] is False
        assert len(result["issues"]) > 0
        assert "No repository type defined in package.json" in result["issues"][0]
