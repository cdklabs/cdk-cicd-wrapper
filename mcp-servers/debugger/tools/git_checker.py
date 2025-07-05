#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import re
import logging
import boto3
from typing import Dict

from mcp.server.fastmcp import Context

logger = logging.getLogger("cdk-cicd-wrapper-debugger")


async def check_git_provider(project_path: str, ctx: Context) -> Dict:
    """Check Git provider configuration (GitHub/CodeCommit) and validate connectivity.

    Analyzes which Git provider is configured and validates that it's properly
    set up. For CodeCommit, performs a connectivity test using the RES account
    credentials to ensure repositories can be accessed.

    Args:
        project_path: Path to the CDK project directory
        ctx: MCP context

    Returns:
        Dict with Git provider analysis and connectivity test results
    """
    ctx.info(f"Checking Git provider configuration in {project_path}")

    results = {
        "valid": True,
        "issues": [],
        "recommendations": [],
        "provider": {"type": None, "configuration": {}, "connectivity_test": {}},
    }

    try:
        # Load environment variables
        all_env_vars = ctx.load_env_variables(project_path)

        # For GitHub, only GITHUB_CONNECTION_ARN is mandatory as environment variable
        github_vars = {
            "GITHUB_CONNECTION_ARN": all_env_vars.get("GITHUB_CONNECTION_ARN")
        }

        # Load package.json content using shared helper
        package_data = ctx.load_package_json(project_path)
        package_json_repo_type = None

        # Extract repository type from package.json
        if "config" in package_data and "repositoryType" in package_data["config"]:
            package_json_repo_type = package_data["config"]["repositoryType"].upper()
            ctx.info(f"Found repository type in package.json: {package_json_repo_type}")

        # Look for entry files that might contain Git provider configuration
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

        # Check for Git provider configuration in code
        github_in_code = False
        codecommit_in_code = False

        for file_path in entry_files:
            try:
                with open(file_path, "r") as f:
                    content = f.read()

                # Check for GitHub configuration
                if re.search(r"\.github\(", content) or "GitHubRepository" in content:
                    github_in_code = True

                # Check for CodeCommit configuration
                if (
                    re.search(r"\.codecommit\(", content)
                    or "CodeCommitRepository" in content
                ):
                    codecommit_in_code = True
            except Exception as e:
                results["issues"].append(f"Error analyzing {file_path}: {str(e)}")

        # Determine which provider is configured
        github_configured = github_in_code or package_json_repo_type == "GITHUB"
        codecommit_configured = (
            codecommit_in_code or package_json_repo_type == "CODECOMMIT"
        )

        # Store configuration sources for reporting
        config_sources = {
            "github": {
                "environment_vars": False,
                "in_code": github_in_code,
                "package_json": package_json_repo_type == "GITHUB",
            },
            "codecommit": {
                "environment_vars": False,
                "in_code": codecommit_in_code,
                "package_json": package_json_repo_type == "CODECOMMIT",
            },
        }

        # Add configuration sources to results
        results["provider"]["config_sources"] = config_sources

        if github_configured and codecommit_configured:
            results["issues"].append("Both GitHub and CodeCommit configurations found")
            results["recommendations"].append(
                "Use only one Git provider - either GitHub or CodeCommit"
            )
            results["provider"]["type"] = "both_configured"
        elif github_configured:
            results["provider"]["type"] = "github"
            results["provider"]["configuration"] = github_vars

            # Add package.json info if that's where the configuration was found
            if package_json_repo_type == "GITHUB":
                results["provider"]["configuration"]["package_json_config"] = True

            # For GitHub, validate that GITHUB_CONNECTION_ARN is present
            if package_json_repo_type == "GITHUB":
                # Check for required GITHUB_CONNECTION_ARN
                if not github_vars["GITHUB_CONNECTION_ARN"]:
                    results["issues"].append(
                        "GitHub repository type is configured but GITHUB_CONNECTION_ARN is missing"
                    )
                    results["recommendations"].append(
                        "Set GITHUB_CONNECTION_ARN environment variable for GitHub integration"
                    )
                    results["valid"] = False
                else:
                    # Check GitHub connection ARN format
                    connection_arn = github_vars["GITHUB_CONNECTION_ARN"]
                    if not connection_arn.startswith("arn:aws:codestar-connections:"):
                        results["issues"].append(
                            "GITHUB_CONNECTION_ARN does not appear to be a valid CodeStar connection ARN"
                        )
                        results["recommendations"].append(
                            "Verify GITHUB_CONNECTION_ARN format - should start with arn:aws:codestar-connections:"
                        )
            elif github_in_code:
                results["recommendations"].append(
                    "GitHub configuration found in code but repository type not set to GITHUB in package.json"
                )

        elif codecommit_configured:
            results["provider"]["type"] = "codecommit"
            results["provider"]["configuration"] = {}

            # Add package.json info if that's where the configuration was found
            if package_json_repo_type == "CODECOMMIT":
                results["provider"]["configuration"]["package_json_config"] = True

            # Verify if CodeCommit repository exists
            if all_env_vars.get("ACCOUNT_RES") and all_env_vars.get(
                "RES_ACCOUNT_AWS_PROFILE"
            ):
                # Try to verify CodeCommit repository
                try:
                    # Create a boto3 session with the RES account AWS profile
                    session = boto3.Session(
                        profile_name=all_env_vars["RES_ACCOUNT_AWS_PROFILE"]
                    )
                    cc_client = session.client("codecommit")

                    # Try to list repositories to validate access
                    response = cc_client.list_repositories(maxResults=10)
                    repositories = response.get("repositories", [])

                    # Check if any repositories exist in the account
                    repositories_count = len(repositories)

                    # Check if the specified repository exists, if one is specified in package.json
                    repo_exists = False
                    repo_name = None

                    if (
                        "config" in package_data
                        and "repositoryName" in package_data["config"]
                    ):
                        repo_name = package_data["config"]["repositoryName"]

                    if repo_name and repositories_count > 0:
                        for repo in repositories:
                            if repo.get("repositoryName") == repo_name:
                                repo_exists = True
                                break

                    # Store connectivity test results
                    results["provider"]["connectivity_test"] = {
                        "accessible": True,
                        "repositories_found": repositories_count,
                        "specific_repository_exists": (
                            repo_exists if repo_name else None
                        ),
                    }

                    # Check if there are any repositories in the account
                    if repositories_count == 0:
                        results["issues"].append(
                            "No CodeCommit repositories found in the RES account"
                        )
                        results["recommendations"].append(
                            "CodeCommit is an end-of-life service with restrictions. Create at least one repository in the RES account for valid configuration"
                        )
                        results["valid"] = False

                    # Only add a recommendation for a specific repo if the account has repositories
                    elif repo_name and not repo_exists:
                        results["recommendations"].append(
                            f"CodeCommit repository '{repo_name}' does not exist in the RES account. You can create it or use one of the {repositories_count} existing repositories"
                        )

                except Exception as e:
                    results["provider"]["connectivity_test"] = {
                        "accessible": False,
                        "error": str(e),
                    }
                    results["issues"].append(
                        f"CodeCommit connectivity test failed: {str(e)}"
                    )
                    results["recommendations"].append(
                        "Check AWS credentials and CodeCommit permissions"
                    )
            else:
                results["issues"].append(
                    "CodeCommit is configured but ACCOUNT_RES or RES_ACCOUNT_AWS_PROFILE is missing"
                )
                results["recommendations"].append(
                    "Set ACCOUNT_RES and RES_ACCOUNT_AWS_PROFILE for CodeCommit access validation"
                )
        else:
            results["provider"]["type"] = "none"
            results["issues"].append("No Git provider configuration found")
            results["recommendations"].append(
                "Configure either GitHub or CodeCommit as your Git provider"
            )

        # Check for configuration inconsistency
        if (
            config_sources["github"]["environment_vars"]
            or config_sources["github"]["in_code"]
        ) and package_json_repo_type == "CODECOMMIT":
            results["issues"].append(
                "Inconsistent configuration: GitHub settings found in environment/code but package.json specifies CODECOMMIT"
            )
            results["recommendations"].append(
                "Align your package.json config.repositoryType with your environment variables and code"
            )

        if (
            config_sources["codecommit"]["in_code"]
            and package_json_repo_type == "GITHUB"
        ):
            results["issues"].append(
                "Inconsistent configuration: CodeCommit settings found in code but package.json specifies GITHUB"
            )
            results["recommendations"].append(
                "Align your package.json config.repositoryType with your code"
            )

        # Mark as invalid if issues were found
        if results["issues"]:
            results["valid"] = False

        return results

    except Exception as e:
        logger.exception("Error in check_git_provider")
        return {
            "valid": False,
            "issues": [f"Error checking Git provider: {str(e)}"],
            "recommendations": ["Check your project configuration and AWS credentials"],
        }
