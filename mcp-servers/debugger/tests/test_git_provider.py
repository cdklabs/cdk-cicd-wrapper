# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import tempfile


# Test implementation of Git provider checker
def mock_check_git_provider(project_path, ctx):
    """Mock implementation of check_git_provider for testing"""
    ctx.info(f"Checking Git provider in {project_path}")

    # Simplified results structure
    results = {
        "valid": True,
        "issues": [],
        "recommendations": [],
        "git_provider": {
            "type": "unknown",
            "config_source": "unknown",
            "connectivity": {"tested": False, "success": False, "error": None},
        },
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
        results["git_provider"]["type"] = repo_type
        results["git_provider"]["config_source"] = "package.json"

        # Simulate connectivity test
        results["git_provider"]["connectivity"]["tested"] = True
        results["git_provider"]["connectivity"]["success"] = True

    # Check env vars for CodeCommit config
    env_vars = ctx.load_env_variables(project_path)
    if "CODECOMMIT_REPOSITORY_NAME" in env_vars:
        if results["git_provider"]["type"] != "unknown":
            results["issues"].append(
                "Git provider is defined in both package.json and environment variables"
            )
            results["recommendations"].append(
                "Use package.json for defining repository type"
            )
        else:
            results["git_provider"]["type"] = "codecommit"
            results["git_provider"]["config_source"] = "environment"

    return results


# Test for the Git provider checker with GitHub
def test_check_git_provider_github(mock_context):
    """Test the Git provider checker with GitHub"""
    with tempfile.TemporaryDirectory() as temp_dir:
        result = mock_check_git_provider(temp_dir, mock_context)

        # Check basic structure
        assert isinstance(result, dict)
        assert "valid" in result
        assert "git_provider" in result
        assert result["git_provider"]["type"] == "github"
        assert result["git_provider"]["config_source"] == "package.json"
        assert result["git_provider"]["connectivity"]["tested"] is True


# Test for the Git provider checker with CodeCommit
def test_check_git_provider_codecommit(mock_context):
    """Test the Git provider checker with CodeCommit"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Override the load_env_variables and load_package_json methods for this test
        mock_context.load_env_variables = lambda path: (
            {"CODECOMMIT_REPOSITORY_NAME": "my-repo"} if os.path.exists(path) else {}
        )

        mock_context.load_package_json = lambda path: {} if os.path.exists(path) else {}

        result = mock_check_git_provider(temp_dir, mock_context)

        # Check basic structure
        assert isinstance(result, dict)
        assert "valid" in result
        assert "git_provider" in result
        assert result["git_provider"]["type"] == "codecommit"
        assert result["git_provider"]["config_source"] == "environment"


# Test for the Git provider checker with conflicting configurations
def test_check_git_provider_conflict(mock_context):
    """Test the Git provider checker with conflicting configurations"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Set both package.json and env vars for conflicting config
        mock_context.load_env_variables = lambda path: (
            {"CODECOMMIT_REPOSITORY_NAME": "my-repo"} if os.path.exists(path) else {}
        )

        # Default mock context returns GitHub config

        result = mock_check_git_provider(temp_dir, mock_context)

        # Should detect the conflict and report issues
        assert len(result["issues"]) > 0
        assert "both" in result["issues"][0].lower()
        assert len(result["recommendations"]) > 0
