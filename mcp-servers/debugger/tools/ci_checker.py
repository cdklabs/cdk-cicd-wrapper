#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import re
import logging
from typing import Dict, List

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

        # Load package.json content
        package_data = ctx.load_package_json(project_path)

        # Extract config from package.json
        package_config = package_data.get("config", {})

        # Define supported file extensions for CDK CICD Wrapper
        supported_extensions = [
            ".ts",  # TypeScript
            ".js",  # JavaScript
            ".py",  # Python
            ".java",  # Java
            ".cs",  # C#
            ".go",  # Go
        ]

        # Look for entry files that might contain CI configuration
        entry_files = []
        potential_dirs = [
            os.path.join(project_path, "bin"),
            os.path.join(project_path, "src"),
            os.path.join(project_path, "lib"),
            os.path.join(project_path, "app"),
            os.path.join(project_path, "cdk"),
            project_path,  # root directory
        ]

        # Add all supported files to the list (with recursive search)
        def find_files_recursively(directory):
            found_files = []
            if os.path.exists(directory):
                for root, _, files in os.walk(directory):
                    for file in files:
                        file_ext = os.path.splitext(file)[1].lower()
                        if file_ext in supported_extensions and not file.startswith(
                            "."
                        ):
                            found_files.append(os.path.join(root, file))
            return found_files

        # Search all potential directories
        for dir_path in potential_dirs:
            entry_files.extend(find_files_recursively(dir_path))

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

                file_ext = os.path.splitext(file_path)[1].lower()

                # Check for CodePipeline configuration in different language styles
                if "CodePipeline" in content or "codepipeline" in content.lower():
                    codepipeline_in_code = True

                    # Extract CodeBuild image if specified - with language-specific patterns
                    image_patterns = [
                        # TypeScript/JavaScript style
                        r'\.codeBuildImage\s*\(\s*[\'"]([^\'"]+)[\'"]',
                        # Python style
                        r'\.code_build_image\s*\(\s*[\'"]([^\'"]+)[\'"]',
                        # Generic style (might catch Java, C#, etc.)
                        r'[cC]ode[bB]uild[iI]mage\s*\([\'"]([^\'"]+)[\'"]',
                    ]

                    for pattern in image_patterns:
                        image_match = re.search(pattern, content)
                        if image_match:
                            codebuild_image = image_match.group(1)
                            break

                    # Extract CodeBuild version if specified - with language-specific patterns
                    version_patterns = [
                        # TypeScript/JavaScript style
                        r'\.codeBuildVersion\s*\(\s*[\'"]([^\'"]+)[\'"]',
                        # Python style
                        r'\.code_build_version\s*\(\s*[\'"]([^\'"]+)[\'"]',
                        # Generic style
                        r'[cC]ode[bB]uild[vV]ersion\s*\([\'"]([^\'"]+)[\'"]',
                    ]

                    for pattern in version_patterns:
                        version_match = re.search(pattern, content)
                        if version_match:
                            codebuild_version = version_match.group(1)
                            break

                    # Look for environment settings with language-specific patterns
                    env_settings_patterns = [
                        # TypeScript/JavaScript style
                        r"\.codeBuildEnvSettings\s*\(\s*({[^}]+})",
                        # Python style
                        r"\.code_build_env_settings\s*\(\s*({[^}]+})",
                        # Generic style
                        r"[cC]ode[bB]uild[eE]nv[sS]ettings\s*\(([^)]+)\)",
                    ]

                    for pattern in env_settings_patterns:
                        env_settings_match = re.search(pattern, content, re.DOTALL)
                        if env_settings_match:
                            env_settings_str = env_settings_match.group(1)
                            # Parse key-value pairs from the environment settings
                            # Adapt regex to handle both TypeScript and Python style key-value pairs
                            if file_ext in [".ts", ".js"]:
                                # TypeScript/JavaScript style
                                env_pairs = re.findall(
                                    r'([A-Za-z0-9_]+):\s*[\'"]([^\'"]+)[\'"]',
                                    env_settings_str,
                                )
                            elif file_ext == ".py":
                                # Python style
                                env_pairs = re.findall(
                                    r'[\'"]([A-Za-z0-9_]+)[\'"]\s*:\s*[\'"]([^\'"]+)[\'"]',
                                    env_settings_str,
                                )
                            else:
                                # Generic fallback pattern
                                env_pairs = re.findall(
                                    r'[\'"]?([A-Za-z0-9_]+)[\'"]?\s*[:=]\s*[\'"]([^\'"]+)[\'"]',
                                    env_settings_str,
                                )

                            for key, value in env_pairs:
                                codebuild_env_settings[key] = value
                            break

            except Exception as e:
                results["issues"].append(f"Error analyzing {file_path}: {str(e)}")

        # Check for GitHub Actions workflows
        if github_actions_files:
            github_actions_in_code = True

        # Check repository type in package.json config
        repository_type = package_config.get("repositoryType", "").upper()

        # Determine which CI system is being used based on multiple factors
        if repository_type == "GITHUB":
            # If repository type is GitHub, check if GitHub Actions is configured
            if github_actions_in_code:
                results["ci_system"]["type"] = "github_actions"
            else:
                # Using GitHub but with CodePipeline
                results["ci_system"]["type"] = "codepipeline_with_github"

                # Check for CodeStar Connection ARN which is required for GitHub
                codestar_arn = all_env_vars.get("CODESTAR_CONNECTION_ARN")
                if not codestar_arn:
                    results["issues"].append(
                        "GitHub repository type is configured but CODESTAR_CONNECTION_ARN is missing"
                    )
                    results["recommendations"].append(
                        "Set CODESTAR_CONNECTION_ARN environment variable for GitHub integration with CodePipeline"
                    )
        elif repository_type == "CODECOMMIT":
            results["ci_system"]["type"] = "codepipeline_with_codecommit"
        elif codepipeline_in_code and github_actions_in_code:
            # This is actually a valid pattern - GitHub Actions for PR checks and CodePipeline for deployments
            results["ci_system"]["type"] = "hybrid_ci_system"
            results["ci_system"]["configuration"][
                "note"
            ] = "Using both GitHub Actions and CodePipeline is a valid pattern where GitHub Actions handles PR validation and CodePipeline manages deployments"
        elif codepipeline_in_code:
            results["ci_system"]["type"] = "codepipeline"
        elif github_actions_in_code:
            results["ci_system"]["type"] = "github_actions"
        else:
            results["ci_system"]["type"] = "none"
            results["issues"].append("No CI system configuration found")
            results["recommendations"].append(
                "Configure either CodePipeline or GitHub Actions for CI/CD"
            )

        # Additional checks and recommendations based on CI system type
        if "codepipeline" in results["ci_system"]["type"]:
            # Store CodeBuild details
            results["ci_system"]["codepipeline_details"] = {
                "codebuild_image": codebuild_image,
                "codebuild_version": codebuild_version,
                "codebuild_env_settings": codebuild_env_settings,
            }

            # Check for mismatches between codeBuildEnvSettings and shell scripts
            if codebuild_env_settings:
                env_compute_type = codebuild_env_settings.get("computeType")
                env_build_image = codebuild_env_settings.get("buildImage")

                if env_compute_type or env_build_image:
                    # Find all .sh files in the project
                    shell_scripts = []
                    for root, _, files in os.walk(project_path):
                        for file in files:
                            if file.endswith(".sh"):
                                shell_scripts.append(os.path.join(root, file))

                    # Check each shell script for environment mismatches
                    script_mismatches = []
                    for script_path in shell_scripts:
                        try:
                            with open(script_path, "r") as f:
                                script_content = f.read()

                            script_name = os.path.basename(script_path)
                            script_issues = []

                            # Check for compute type mismatches
                            if env_compute_type:
                                # Look for references to different compute types in the script
                                compute_type_patterns = [
                                    r"BUILD_GENERAL1_SMALL",
                                    r"BUILD_GENERAL1_MEDIUM",
                                    r"BUILD_GENERAL1_LARGE",
                                    r"BUILD_GENERAL1_2XLARGE",
                                    r"BUILD_GENERAL1_XLARGE",
                                ]

                                for pattern in compute_type_patterns:
                                    if re.search(
                                        pattern, script_content, re.IGNORECASE
                                    ):
                                        found_compute_type = pattern
                                        if (
                                            found_compute_type.upper()
                                            != env_compute_type.upper()
                                        ):
                                            script_issues.append(
                                                f"Compute type mismatch: codeBuildEnvSettings specifies '{env_compute_type}' but script references '{found_compute_type}'"
                                            )

                            # Check for build image mismatches
                            if env_build_image:
                                # Look for Docker image references in scripts
                                image_patterns = [
                                    r"aws/codebuild/[a-zA-Z0-9\-:\.]+",
                                    r"[a-zA-Z0-9\-\.]+\.dkr\.ecr\.[a-zA-Z0-9\-]+\.amazonaws\.com/[a-zA-Z0-9\-\./]+:[a-zA-Z0-9\-\.]+",
                                    r"docker\.io/[a-zA-Z0-9\-\./]+:[a-zA-Z0-9\-\.]+",
                                    r"[a-zA-Z0-9\-\.]+:[0-9]+/[a-zA-Z0-9\-\./]+:[a-zA-Z0-9\-\.]+",
                                ]

                                for pattern in image_patterns:
                                    image_matches = re.findall(
                                        pattern, script_content, re.IGNORECASE
                                    )
                                    for found_image in image_matches:
                                        if found_image != env_build_image:
                                            script_issues.append(
                                                f"Build image mismatch: codeBuildEnvSettings specifies '{env_build_image}' but script references '{found_image}'"
                                            )

                            if script_issues:
                                script_mismatches.append(
                                    {
                                        "script": script_name,
                                        "path": script_path,
                                        "issues": script_issues,
                                    }
                                )

                        except Exception as e:
                            results["issues"].append(
                                f"Error analyzing shell script {script_path}: {str(e)}"
                            )

                    # Add script mismatch results
                    if script_mismatches:
                        results["ci_system"]["codepipeline_details"][
                            "script_mismatches"
                        ] = script_mismatches
                        for mismatch in script_mismatches:
                            for issue in mismatch["issues"]:
                                results["issues"].append(
                                    f"{mismatch['script']}: {issue}"
                                )
                        results["recommendations"].append(
                            "Review shell scripts to ensure they match the codeBuildEnvSettings configuration"
                        )

            # Validate CodePipeline configuration
            if not codebuild_image:
                results["recommendations"].append(
                    "Consider specifying a CodeBuild image with .codeBuildImage()"
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

            # Check AWS profiles and account IDs from CLI configure.md
            required_account_vars = ["ACCOUNT_RES"]
            for var in required_account_vars:
                if var not in all_env_vars:
                    results["issues"].append(
                        f"Missing required {var} environment variable"
                    )
                    results["recommendations"].append(
                        f"Set {var} environment variable for CI/CD pipeline"
                    )

            # Check AWS profiles
            if "RES_ACCOUNT_AWS_PROFILE" not in all_env_vars:
                results["recommendations"].append(
                    "Set RES_ACCOUNT_AWS_PROFILE environment variable for resource account access"
                )

            # Check AWS region
            if "AWS_REGION" not in all_env_vars:
                results["issues"].append("Missing AWS_REGION environment variable")
                results["recommendations"].append(
                    "Set AWS_REGION environment variable for deployments"
                )

        elif results["ci_system"]["type"] == "github_actions":
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

            # Check for required GitHub-specific settings
            git_repository = all_env_vars.get("GIT_REPOSITORY") or package_config.get(
                "repositoryName"
            )
            if not git_repository:
                results["issues"].append(
                    "Missing GIT_REPOSITORY environment variable or repositoryName in package.json"
                )
                results["recommendations"].append(
                    "Set GIT_REPOSITORY or repositoryName for GitHub Actions integration"
                )

        # Check for mandatory environment variables from CLI configure.md
        # for all CI systems
        ci_env_vars = {
            # Standard CI variables
            "NODE_VERSION": all_env_vars.get("NODE_VERSION"),
            "PYTHON_VERSION": all_env_vars.get("PYTHON_VERSION"),
            # CLI configure.md variables
            "AWS_REGION": all_env_vars.get("AWS_REGION"),
            "ACCOUNT_RES": all_env_vars.get("ACCOUNT_RES"),
            "ACCOUNT_DEV": all_env_vars.get("ACCOUNT_DEV"),
            "ACCOUNT_INT": all_env_vars.get("ACCOUNT_INT"),
            "RES_ACCOUNT_AWS_PROFILE": all_env_vars.get("RES_ACCOUNT_AWS_PROFILE"),
            "DEV_ACCOUNT_AWS_PROFILE": all_env_vars.get("DEV_ACCOUNT_AWS_PROFILE"),
            "INT_ACCOUNT_AWS_PROFILE": all_env_vars.get("INT_ACCOUNT_AWS_PROFILE"),
            "AWS_PROFILE": all_env_vars.get("AWS_PROFILE"),
            "CDK_QUALIFIER": all_env_vars.get("CDK_QUALIFIER")
            or package_config.get("cdkQualifier"),
            "CODESTAR_CONNECTION_ARN": all_env_vars.get("CODESTAR_CONNECTION_ARN"),
            "GIT_REPOSITORY": all_env_vars.get("GIT_REPOSITORY")
            or package_config.get("repositoryName"),
        }

        # Store environment variables that affect CI
        results["ci_system"]["environment_variables"] = {
            k: v for k, v in ci_env_vars.items() if v
        }

        # Check for application name
        application_name = package_config.get("applicationName")
        if not application_name:
            results["recommendations"].append(
                "Consider setting applicationName in package.json config section"
            )

        # Check CDK qualifier
        if not ci_env_vars.get("CDK_QUALIFIER"):
            results["recommendations"].append(
                "Consider setting CDK_QUALIFIER environment variable or cdkQualifier in package.json"
            )

        # Check for VPC configuration if using CodeBuild
        if "codepipeline" in results["ci_system"]["type"]:
            vpc_type = all_env_vars.get("CICD_VPC_TYPE") or package_config.get(
                "cicdVpcType", "NO_VPC"
            )

            if vpc_type == "VPC_FROM_LOOK_UP":
                if not all_env_vars.get("CICD_VPC_ID") and not package_config.get(
                    "cicdVpcId"
                ):
                    results["issues"].append(
                        "Using VPC_FROM_LOOK_UP but CICD_VPC_ID is not specified"
                    )
                    results["recommendations"].append(
                        "Set CICD_VPC_ID environment variable or cicdVpcId in package.json"
                    )
            elif vpc_type == "VPC":
                if not all_env_vars.get("PROXY_SECRET_ARN"):
                    results["recommendations"].append(
                        "Consider setting PROXY_SECRET_ARN for internet access through VPC proxy"
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
