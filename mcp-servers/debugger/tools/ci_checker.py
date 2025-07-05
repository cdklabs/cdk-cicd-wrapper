#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import re
import logging
from typing import Dict

from mcp.server.fastmcp import Context

logger = logging.getLogger("cdk-cicd-wrapper-debugger")


async def check_ci_configuration(project_path: str, ctx: Context) -> Dict:
    """Check CI system configuration (CodePipeline or GitHub Actions).

    Determines which CI system is being used and validates its configuration.
    If CodePipeline is in use, analyzes the version, Docker base image, and
    CodeBuild environment settings.

    Args:
        project_path: Path to the CDK project directory
        ctx: MCP context

    Returns:
        Dict with CI system analysis and configuration details
    """
    ctx.info(f"Checking CI configuration in {project_path}")

    results = {
        "valid": True,
        "issues": [],
        "recommendations": [],
        "ci_system": {"type": None, "configuration": {}, "codepipeline_details": {}},
    }

    try:
        # Load environment variables
        all_env_vars = ctx.load_env_variables(project_path)

        # Look for entry files that might contain CI configuration
        entry_files = []
        potential_dirs = [
            os.path.join(project_path, "bin"),
            os.path.join(project_path, "src"),
            os.path.join(project_path, "lib"),
            project_path,  # root directory
        ]

        for dir_path in potential_dirs:
            if os.path.exists(dir_path):
                for file in os.listdir(dir_path):
                    if (
                        file.endswith(".ts") or file.endswith(".js")
                    ) and not file.startswith("."):
                        entry_files.append(os.path.join(dir_path, file))

        # Also check for GitHub Actions workflow files
        github_workflow_dir = os.path.join(project_path, ".github", "workflows")
        github_actions_files = []
        if os.path.exists(github_workflow_dir):
            for file in os.listdir(github_workflow_dir):
                if file.endswith((".yml", ".yaml")):
                    github_actions_files.append(os.path.join(github_workflow_dir, file))

        # Check for CI configuration in code
        codepipeline_in_code = False
        github_actions_in_code = False
        codebuild_image = None
        codebuild_version = None
        codebuild_env_settings = {}

        # First check main code files
        for file_path in entry_files:
            try:
                with open(file_path, "r") as f:
                    content = f.read()

                # Check for CodePipeline configuration
                if "CodePipeline" in content or "codepipeline" in content.lower():
                    codepipeline_in_code = True

                    # Extract CodeBuild image if specified
                    image_match = re.search(
                        r'\.codeBuildImage\s*\(\s*[\'"]([^\'"]+)[\'"]', content
                    )
                    if image_match:
                        codebuild_image = image_match.group(1)

                    # Extract CodeBuild version if specified
                    version_match = re.search(
                        r'\.codeBuildVersion\s*\(\s*[\'"]([^\'"]+)[\'"]', content
                    )
                    if version_match:
                        codebuild_version = version_match.group(1)

                    # Look for environment settings
                    env_settings_match = re.search(
                        r"\.codeBuildEnvSettings\s*\(\s*({[^}]+})", content, re.DOTALL
                    )
                    if env_settings_match:
                        env_settings_str = env_settings_match.group(1)
                        # Parse key-value pairs from the environment settings
                        env_pairs = re.findall(
                            r'([A-Za-z0-9_]+):\s*[\'"]([^\'"]+)[\'"]', env_settings_str
                        )
                        for key, value in env_pairs:
                            codebuild_env_settings[key] = value

            except Exception as e:
                results["issues"].append(f"Error analyzing {file_path}: {str(e)}")

        # Check for GitHub Actions workflows
        if github_actions_files:
            github_actions_in_code = True

        # Determine which CI system is being used
        if codepipeline_in_code and github_actions_in_code:
            results["issues"].append(
                "Both CodePipeline and GitHub Actions configurations found"
            )
            results["recommendations"].append(
                "Use only one CI system - either CodePipeline or GitHub Actions"
            )
            results["ci_system"]["type"] = "both_configured"
        elif codepipeline_in_code:
            results["ci_system"]["type"] = "codepipeline"

            # Store CodeBuild details
            results["ci_system"]["codepipeline_details"] = {
                "codebuild_image": codebuild_image,
                "codebuild_version": codebuild_version,
                "codebuild_env_settings": codebuild_env_settings,
            }

            # Validate CodePipeline configuration
            if not codebuild_image:
                results["recommendations"].append(
                    "Consider specifying a CodeBuild image with .codeBuildImage()"
                )

            if not codebuild_version:
                results["recommendations"].append(
                    "Consider specifying a CodeBuild version with .codeBuildVersion()"
                )

            # Check if Docker image is outdated
            if (
                codebuild_image
                and "aws/codebuild/amazonlinux2-x86_64-standard:" in codebuild_image
            ):
                image_version = (
                    codebuild_image.split(":")[-1] if ":" in codebuild_image else ""
                )
                try:
                    # Simple version check - recommend newer if it seems outdated
                    if image_version and float(image_version) < 3.0:
                        results["recommendations"].append(
                            f"Consider updating CodeBuild image to a newer version (current: {image_version})"
                        )
                except (ValueError, TypeError):
                    # If we can't parse the version, don't make a recommendation
                    pass

        elif github_actions_in_code:
            results["ci_system"]["type"] = "github_actions"

            # Store info about GitHub Actions workflows
            results["ci_system"]["configuration"] = {
                "workflow_files": [os.path.basename(f) for f in github_actions_files]
            }

            # Check for required workflows
            build_workflow_found = False
            deploy_workflow_found = False

            for workflow_file in github_actions_files:
                try:
                    with open(workflow_file, "r") as f:
                        workflow_content = f.read().lower()
                        if "build" in workflow_content and (
                            "npm" in workflow_content or "yarn" in workflow_content
                        ):
                            build_workflow_found = True
                        if (
                            "deploy" in workflow_content
                            or "cdk deploy" in workflow_content
                        ):
                            deploy_workflow_found = True
                except Exception:
                    pass

            if not build_workflow_found:
                results["recommendations"].append(
                    "Consider adding a GitHub Actions workflow for building the project"
                )

            if not deploy_workflow_found:
                results["recommendations"].append(
                    "Consider adding a GitHub Actions workflow for deploying with CDK"
                )

        else:
            results["ci_system"]["type"] = "none"
            results["issues"].append("No CI system configuration found")
            results["recommendations"].append(
                "Configure either CodePipeline or GitHub Actions for CI/CD"
            )

        # Check for environment variables that might affect CI
        ci_env_vars = {
            "CODEBUILD_IMAGE": all_env_vars.get("CODEBUILD_IMAGE"),
            "NODE_VERSION": all_env_vars.get("NODE_VERSION"),
            "PYTHON_VERSION": all_env_vars.get("PYTHON_VERSION"),
            "SKIP_VALIDATION": all_env_vars.get("SKIP_VALIDATION"),
            "SKIP_TESTS": all_env_vars.get("SKIP_TESTS"),
            "SKIP_BUILD": all_env_vars.get("SKIP_BUILD"),
        }

        # Store environment variables that affect CI
        results["ci_system"]["environment_variables"] = {
            k: v for k, v in ci_env_vars.items() if v
        }

        # Warn about skipping important steps
        if all_env_vars.get("SKIP_VALIDATION") == "true":
            results["issues"].append(
                "Validation is being skipped (SKIP_VALIDATION=true)"
            )
            results["recommendations"].append(
                "Only skip validation temporarily for development purposes"
            )

        if all_env_vars.get("SKIP_TESTS") == "true":
            results["issues"].append("Tests are being skipped (SKIP_TESTS=true)")
            results["recommendations"].append(
                "Only skip tests temporarily for development purposes"
            )

        # Mark as invalid if issues were found
        if results["issues"]:
            results["valid"] = False

        return results

    except Exception as e:
        logger.exception("Error in check_ci_configuration")
        return {
            "valid": False,
            "issues": [f"Error checking CI configuration: {str(e)}"],
            "recommendations": ["Check your project configuration"],
        }
