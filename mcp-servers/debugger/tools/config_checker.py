#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import logging
from typing import Dict, Callable

logger = logging.getLogger("cdk-cicd-wrapper-debugger")


def check_comprehensive_config(
    project_path: str, load_env_variables: Callable, load_package_json: Callable
) -> Dict:
    """Comprehensive configuration file checker for CDK CI/CD Wrapper.

    Checks if the most important parameters are present in .env files or
    exported as environment variables. This is a comprehensive check that
    covers all critical configuration parameters.

    Args:
        project_path: Path to the CDK project directory
        load_env_variables: Function to load environment variables
        load_package_json: Function to load package.json

    Returns:
        Dict with comprehensive configuration analysis and recommendations
    """
    logger.info(f"Running comprehensive config check in {project_path}")

    results = {
        "status": "success",
        "findings": [],
        "recommendations": [],
        "config_categories": {
            "core": {"present": {}, "missing": []},
            "stages": {"present": {}, "missing": []},
            "aws_profiles": {"present": {}, "missing": []},
            "repository": {"present": {}, "missing": []},
            "networking": {"present": {}, "missing": []},
            "ci_cd": {"present": {}, "missing": []},
            "security": {"present": {}, "missing": []},
            "optional": {"present": {}, "missing": []},
        },
    }

    try:
        # Load all environment variables from .env files and system environment
        all_env_vars = load_env_variables(project_path)

        # Define critical configuration categories and their parameters
        config_categories = {
            "core": {"required": ["AWS_REGION", "CDK_QUALIFIER"], "recommended": []},
            "stages": {
                "required": ["ACCOUNT_RES"],
                "recommended": ["ACCOUNT_DEV", "ACCOUNT_INT", "ACCOUNT_PROD"],
            },
            "aws_profiles": {
                "required": ["RES_ACCOUNT_AWS_PROFILE"],
                "recommended": [
                    "DEV_ACCOUNT_AWS_PROFILE",
                    "INT_ACCOUNT_AWS_PROFILE",
                    "PROD_ACCOUNT_AWS_PROFILE",
                ],
            },
            "repository": {"required": [], "recommended": ["CODESTAR_CONNECTION_ARN"]},
            "networking": {
                "required": [],
                "recommended": [
                    "HTTP_PROXY",
                    "HTTPS_PROXY",
                    "NO_PROXY",
                    "PROXY_SECRET_ARN",
                    "VPC_ID",
                ],
            },
            "ci_cd": {
                "required": [],
                "recommended": [
                    "CODEBUILD_IMAGE",
                    "NODE_VERSION",
                    "NPM_REGISTRY",
                    "PYTHON_VERSION",
                ],
            },
            "security": {
                "required": [],
                "recommended": ["NPM_BASIC_AUTH_SECRET_ID", "NPM_REGISTRY"],
            },
            "optional": {
                "required": [],
                "recommended": [
                    "CDK_DEFAULT_ACCOUNT",
                    "CDK_DEFAULT_REGION",
                    "CDK_QUALIFIER",
                ],
            },
        }

        # Check each category
        for category, params in config_categories.items():
            category_results = {"present": {}, "missing": []}

            # Check required parameters
            for param in params["required"]:
                if param in all_env_vars and all_env_vars[param]:
                    category_results["present"][param] = all_env_vars[param]
                else:
                    category_results["missing"].append(param)
                    results["findings"].append(
                        f"Missing required {category} parameter: {param}"
                    )

            # Check recommended parameters
            for param in params["recommended"]:
                if param in all_env_vars and all_env_vars[param]:
                    category_results["present"][param] = all_env_vars[param]
                else:
                    category_results["missing"].append(param)

            results["config_categories"][category] = category_results

        # Special validation logic for specific combinations

        # Check stage-profile consistency
        for stage_var in all_env_vars:
            if stage_var.startswith("ACCOUNT_"):
                stage = stage_var.replace("ACCOUNT_", "")
                profile_var = f"{stage}_ACCOUNT_AWS_PROFILE"
                if profile_var not in all_env_vars or not all_env_vars[profile_var]:
                    results["findings"].append(
                        f"Stage {stage} is defined but {profile_var} is missing"
                    )
                    results["recommendations"].append(
                        f"Set {profile_var} for stage {stage}"
                    )

        # Repository configuration is determined by package.json, not environment variables
        codecommit_vars = ["CODECOMMIT_REPOSITORY_NAME"]
        codecommit_count = sum(1 for var in codecommit_vars if all_env_vars.get(var))

        # Check for package.json configuration using shared helper
        package_data = load_package_json(project_path)
        if "config" in package_data and "repositoryType" in package_data["config"]:
            results["config_categories"]["repository"]["present"]["package.json"] = (
                package_data["config"]["repositoryType"]
            )

        if codecommit_count > 0:
            results["recommendations"].append(
                "CodeCommit should be configured in package.json, not through environment variables"
            )

        # Check proxy configuration consistency
        proxy_vars = ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "PROXY_SECRET_ARN"]
        proxy_count = sum(1 for var in proxy_vars if all_env_vars.get(var))

        if proxy_count > 0 and proxy_count < len(proxy_vars):
            missing_proxy = [var for var in proxy_vars if not all_env_vars.get(var)]
            results["recommendations"].append(
                f"Partial proxy configuration found, consider setting: {', '.join(missing_proxy)}"
            )

        # Check for .env file presence
        env_file = os.path.join(project_path, ".env")
        if not os.path.exists(env_file):
            results["recommendations"].append(
                "Consider creating a .env file for local development configuration"
            )

        # Generate summary recommendations
        total_missing = sum(
            len(cat["missing"]) for cat in results["config_categories"].values()
        )
        total_present = sum(
            len(cat["present"]) for cat in results["config_categories"].values()
        )

        if total_missing > total_present:
            results["recommendations"].append(
                "Many configuration parameters are missing. Review the documentation for required settings."
            )

        # Check if minimum viable configuration is present
        minimum_required = ["AWS_REGION", "ACCOUNT_RES", "RES_ACCOUNT_AWS_PROFILE"]
        missing_minimum = [var for var in minimum_required if not all_env_vars.get(var)]

        if missing_minimum:
            results["findings"].append(
                f"Missing minimum viable configuration: {', '.join(missing_minimum)}"
            )
            results["recommendations"].append(
                "Set minimum required configuration to get started"
            )

        return results

    except Exception as e:
        logger.exception("Error in check_comprehensive_config")
        return {
            "status": "error",
            "findings": [f"Error checking comprehensive configuration: {str(e)}"],
            "recommendations": [
                "Check that the project directory is valid and accessible"
            ],
        }
