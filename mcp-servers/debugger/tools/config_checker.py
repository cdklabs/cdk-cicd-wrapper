#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import logging
from typing import Dict

from mcp.server.fastmcp import Context

logger = logging.getLogger("cdk-cicd-wrapper-debugger")

async def check_comprehensive_config(
    project_path: str,
    ctx: Context
) -> Dict:
    """Comprehensive configuration file checker for CDK CI/CD Wrapper.
    
    Checks if the most important parameters are present in .env files or 
    exported as environment variables. This is a comprehensive check that
    covers all critical configuration parameters.
    
    Args:
        project_path: Path to the CDK project directory
        ctx: MCP context
        
    Returns:
        Dict with comprehensive configuration analysis and recommendations
    """
    ctx.info(f"Running comprehensive config check in {project_path}")
    
    results = {
        "valid": True,
        "issues": [],
        "recommendations": [],
        "config_categories": {
            "core": {"present": {}, "missing": []},
            "stages": {"present": {}, "missing": []},
            "aws_profiles": {"present": {}, "missing": []},
            "repository": {"present": {}, "missing": []},
            "networking": {"present": {}, "missing": []},
            "ci_cd": {"present": {}, "missing": []},
            "security": {"present": {}, "missing": []},
            "optional": {"present": {}, "missing": []}
        }
    }
    
    try:
        # Load all environment variables from .env files and system environment
        all_env_vars = ctx.load_env_variables(project_path)
        
        # Define critical configuration categories and their parameters
        config_categories = {
            "core": {
                "required": ["AWS_REGION"],
                "recommended": ["CDK_QUALIFIER"]
            },
            "stages": {
                "required": ["ACCOUNT_RES"],
                "recommended": ["ACCOUNT_DEV", "ACCOUNT_INT", "ACCOUNT_PROD"]
            },
            "aws_profiles": {
                "required": ["RES_ACCOUNT_AWS_PROFILE"],
                "recommended": ["DEV_ACCOUNT_AWS_PROFILE", "INT_ACCOUNT_AWS_PROFILE", "PROD_ACCOUNT_AWS_PROFILE"]
            },
            "repository": {
                "required": [],
                "recommended": ["GITHUB_CONNECTION_ARN"]
            },
            "networking": {
                "required": [],
                "recommended": ["VPC_ID", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "PROXY_SECRET_ARN"]
            },
            "ci_cd": {
                "required": [],
                "recommended": ["CODEBUILD_IMAGE", "NODE_VERSION", "PYTHON_VERSION", "NPM_REGISTRY"]
            },
            "security": {
                "required": [],
                "recommended": ["NPM_BASIC_AUTH_SECRET_ID", "SONAR_PROJECT_KEY", "SONAR_ORGANIZATION", "SONAR_TOKEN"]
            },
            "optional": {
                "required": [],
                "recommended": ["CDK_DEFAULT_ACCOUNT", "CDK_DEFAULT_REGION", "APPLICATION_NAME", "APPLICATION_QUALIFIER"]
            }
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
                    results["issues"].append(f"Missing required {category} parameter: {param}")
            
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
                    results["issues"].append(f"Stage {stage} is defined but {profile_var} is missing")
                    results["recommendations"].append(f"Set {profile_var} for stage {stage}")
        
        # Repository configuration is determined by package.json, not environment variables
        codecommit_vars = ["CODECOMMIT_REPOSITORY_NAME"]
        codecommit_count = sum(1 for var in codecommit_vars if all_env_vars.get(var))
        
        # Check for package.json configuration using shared helper
        package_data = ctx.load_package_json(project_path)
        if "config" in package_data and "repositoryType" in package_data["config"]:
            results["config_categories"]["repository"]["present"]["package.json"] = package_data["config"]["repositoryType"]
        
        if codecommit_count > 0:
            results["recommendations"].append("CodeCommit should be configured in package.json, not through environment variables")
        
        # Check proxy configuration consistency
        proxy_vars = ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "PROXY_SECRET_ARN"]
        proxy_count = sum(1 for var in proxy_vars if all_env_vars.get(var))
        
        if proxy_count > 0 and proxy_count < len(proxy_vars):
            missing_proxy = [var for var in proxy_vars if not all_env_vars.get(var)]
            results["recommendations"].append(f"Partial proxy configuration found, consider setting: {', '.join(missing_proxy)}")
        
        # Check for .env file presence
        env_file = os.path.join(project_path, ".env")
        if not os.path.exists(env_file):
            results["recommendations"].append("Consider creating a .env file for local development configuration")
        
        # Generate summary recommendations
        total_missing = sum(len(cat["missing"]) for cat in results["config_categories"].values())
        total_present = sum(len(cat["present"]) for cat in results["config_categories"].values())
        
        if total_missing > total_present:
            results["recommendations"].append("Many configuration parameters are missing. Review the documentation for required settings.")
        
        # Check if minimum viable configuration is present
        minimum_required = ["AWS_REGION", "ACCOUNT_RES", "RES_ACCOUNT_AWS_PROFILE"]
        missing_minimum = [var for var in minimum_required if not all_env_vars.get(var)]
        
        if missing_minimum:
            results["issues"].append(f"Missing minimum viable configuration: {', '.join(missing_minimum)}")
            results["recommendations"].append("Set minimum required configuration to get started")
        
        # Mark as invalid if critical issues were found
        if results["issues"]:
            results["valid"] = False
        
        return results
    
    except Exception as e:
        logger.exception("Error in check_comprehensive_config")
        return {
            "valid": False,
            "issues": [f"Error checking comprehensive configuration: {str(e)}"],
            "recommendations": ["Check that the project directory is valid and accessible"]
        }
