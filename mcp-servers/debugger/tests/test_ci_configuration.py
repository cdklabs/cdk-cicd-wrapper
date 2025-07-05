# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import tempfile


# Test implementation of CI configuration checker
def mock_check_ci_configuration(project_path, ctx):
    """Mock implementation of check_ci_configuration for testing"""
    ctx.info(f"Checking CI configuration in {project_path}")

    # Simplified results structure
    results = {
        "valid": True,
        "issues": [],
        "recommendations": [],
        "ci_system": {
            "type": "unknown",
            "version": "unknown",
            "docker_image": None,
            "build_environment": {},
        },
    }

    # If the path doesn't exist, add an issue
    if not os.path.exists(project_path):
        results["valid"] = False
        results["issues"].append(f"Project path does not exist: {project_path}")
        return results

    # Check for GitHub workflow files
    github_dir = os.path.join(project_path, ".github", "workflows")
    if os.path.exists(github_dir):
        results["ci_system"]["type"] = "github_actions"
        results["ci_system"]["version"] = "latest"

    # Check for CodePipeline configuration
    env_vars = ctx.load_env_variables(project_path)
    package_json = ctx.load_package_json(project_path)

    if "CODEBUILD_IMAGE" in env_vars:
        results["ci_system"]["type"] = "codepipeline"
        results["ci_system"]["docker_image"] = env_vars["CODEBUILD_IMAGE"]

    if "NODE_VERSION" in env_vars:
        results["ci_system"]["build_environment"]["node"] = env_vars["NODE_VERSION"]

    if "PYTHON_VERSION" in env_vars:
        results["ci_system"]["build_environment"]["python"] = env_vars["PYTHON_VERSION"]

    return results


# Test for the CI configuration checker with GitHub Actions
def test_check_ci_github_actions(mock_context):
    """Test the CI configuration checker with GitHub Actions"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create GitHub workflows directory
        os.makedirs(os.path.join(temp_dir, ".github", "workflows"))
        with open(os.path.join(temp_dir, ".github", "workflows", "ci.yml"), "w") as f:
            f.write(
                """
            name: CI
            on: [push, pull_request]
            jobs:
              build:
                runs-on: ubuntu-latest
                steps:
                  - uses: actions/checkout@v2
            """
            )

        result = mock_check_ci_configuration(temp_dir, mock_context)

        # Check basic structure
        assert isinstance(result, dict)
        assert "valid" in result
        assert "ci_system" in result
        assert result["ci_system"]["type"] == "github_actions"


# Test for the CI configuration checker with CodePipeline
def test_check_ci_codepipeline(mock_context):
    """Test the CI configuration checker with CodePipeline"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Override the load_env_variables method for this test
        mock_context.load_env_variables = lambda path: (
            {
                "CODEBUILD_IMAGE": "aws/codebuild/amazonlinux2-x86_64-standard:3.0",
                "NODE_VERSION": "20.x",
                "PYTHON_VERSION": "3.10",
            }
            if os.path.exists(path)
            else {}
        )

        result = mock_check_ci_configuration(temp_dir, mock_context)

        # Check basic structure
        assert isinstance(result, dict)
        assert "valid" in result
        assert "ci_system" in result
        assert result["ci_system"]["type"] == "codepipeline"
        assert (
            result["ci_system"]["docker_image"]
            == "aws/codebuild/amazonlinux2-x86_64-standard:3.0"
        )
        assert result["ci_system"]["build_environment"]["node"] == "20.x"
        assert result["ci_system"]["build_environment"]["python"] == "3.10"


# Test for missing CI configuration
def test_check_ci_missing(mock_context):
    """Test the CI configuration checker with no CI system"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Reset env vars to empty
        mock_context.load_env_variables = lambda path: (
            {} if os.path.exists(path) else {}
        )

        result = mock_check_ci_configuration(temp_dir, mock_context)

        # Should have unknown CI system type
        assert result["ci_system"]["type"] == "unknown"
