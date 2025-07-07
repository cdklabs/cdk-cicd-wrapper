# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import tempfile


# Test implementation of stage definitions checker
def mock_check_stage_definitions(project_path, ctx):
    """Mock implementation of check_stage_definitions for testing"""
    ctx.info(f"Checking stage definitions in {project_path}")

    # Simplified results structure
    results = {
        "valid": True,
        "issues": [],
        "recommendations": [],
        "stages": {"defined": [], "missing": [], "definition_method": "unknown"},
    }

    # If the path doesn't exist, add an issue
    if not os.path.exists(project_path):
        results["valid"] = False
        results["issues"].append(f"Project path does not exist: {project_path}")
        return results

    # Look for environment variables with ACCOUNT_ prefix
    env_vars = ctx.load_env_variables(project_path)
    for key in env_vars:
        if key.startswith("ACCOUNT_"):
            stage = key.replace("ACCOUNT_", "")
            results["stages"]["defined"].append(
                {"name": stage, "account_id": env_vars[key], "source": "environment"}
            )

    if results["stages"]["defined"]:
        results["stages"]["definition_method"] = "environment"

    # Check for defineStages method in TypeScript files
    src_dir = os.path.join(project_path, "src")
    if os.path.exists(src_dir):
        for file in os.listdir(src_dir):
            if file.endswith(".ts") or file.endswith(".js"):
                file_path = os.path.join(src_dir, file)
                with open(file_path, "r") as f:
                    content = f.read()
                    if "defineStages" in content:
                        if results["stages"]["definition_method"] == "environment":
                            results["stages"]["definition_method"] = "both"
                        else:
                            results["stages"]["definition_method"] = "code"

    return results


# Test for the stage definitions checker with environment variables
def test_check_stage_definitions_env(mock_context):
    """Test the stage definitions checker with environment variables"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a .env file with stage definitions
        with open(os.path.join(temp_dir, ".env"), "w") as f:
            f.write(
                """
            ACCOUNT_DEV=111111111111
            ACCOUNT_PROD=222222222222
            ACCOUNT_RES=333333333333
            """
            )

        # Override the load_env_variables method to read our test file
        mock_context.load_env_variables = lambda path: (
            {
                "ACCOUNT_DEV": "111111111111",
                "ACCOUNT_PROD": "222222222222",
                "ACCOUNT_RES": "333333333333",
            }
            if os.path.exists(path)
            else {}
        )

        result = mock_check_stage_definitions(temp_dir, mock_context)

        # Check basic structure
        assert isinstance(result, dict)
        assert "valid" in result
        assert "stages" in result
        assert "defined" in result["stages"]
        assert len(result["stages"]["defined"]) == 3
        assert result["stages"]["definition_method"] == "environment"


# Test for the stage definitions checker with code method
def test_check_stage_definitions_code(mock_context):
    """Test the stage definitions checker with code method"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a TypeScript file with defineStages
        os.makedirs(os.path.join(temp_dir, "src"))
        with open(os.path.join(temp_dir, "src", "main.ts"), "w") as f:
            f.write(
                """
            import * as cdk from 'aws-cdk-lib';
            
            const app = new cdk.App();
            
            // Define stages in code
            app.defineStages({
                dev: { accountId: '111111111111', region: 'us-west-2' },
                prod: { accountId: '222222222222', region: 'us-east-1' }
            });
            """
            )

        # Override to return empty env vars for this test
        mock_context.load_env_variables = lambda path: (
            {} if os.path.exists(path) else {}
        )

        result = mock_check_stage_definitions(temp_dir, mock_context)

        # Should detect code-based stage definitions
        assert result["stages"]["definition_method"] == "code"
