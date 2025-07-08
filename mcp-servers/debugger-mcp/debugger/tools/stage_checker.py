#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import re
import logging
from typing import Dict

from mcp.server.fastmcp import Context

logger = logging.getLogger("cdk-cicd-wrapper-debugger")


async def check_stage_definitions(project_path: str, ctx: Context) -> Dict:
    """Verify stage definitions in CDK CI/CD Wrapper project.

    Checks if stages are correctly defined through environment variables or code.
    Environment variables (ACCOUNT_*) are the preferred method for defining stages.
    The .defineStages method in code is optional and can be used as an alternative.

    Args:
        project_path: Path to the CDK project directory
        ctx: MCP context

    Returns:
        Dict with analysis results including issues found and recommendations
    """
    ctx.info(f"Checking stage definitions in {project_path}")

    results = {
        "valid": True,
        "issues": [],
        "recommendations": [],
        "stages": {
            "defined_in_code": [],
            "defined_via_env": {},
            "all_stages": [],
            "missing_variables": [],
        },
    }

    try:
        # Load environment variables from .env files and system environment
        all_env_vars = ctx.load_env_variables(project_path)

        # Check environment variables for stage accounts (primary method)
        stage_env_vars = {}
        for var in all_env_vars:
            if var.startswith("ACCOUNT_"):
                stage = var.replace("ACCOUNT_", "")
                stage_env_vars[stage] = all_env_vars[var]

        # Define supported file extensions for CDK CICD Wrapper
        supported_extensions = [
            ".ts",  # TypeScript
            ".js",  # JavaScript
            ".py",  # Python
            ".java",  # Java
            ".cs",  # C#
            ".go",  # Go
        ]

        # Look for entry files that might contain stage definitions
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

        defined_stages_in_code = []

        # Define language-specific patterns for stage definitions
        stage_definition_patterns = {
            # TypeScript/JavaScript style
            "ts_js": [
                r"\.defineStages\(\s*\{([^}]+)\}",  # Object format
                r"\.defineStages\(\s*\[(.*?)\]\)",  # Array format
            ],
            # Python style
            "py": [
                r"\.define_stages\(\s*\{([^}]+)\}",  # Dictionary format
                r"\.define_stages\(\s*\[(.*?)\]\)",  # List format
            ],
            # Generic patterns that might catch other languages
            "generic": [
                r"define[_]?[sS]tages\s*\([^\)]+\)",
                r"stages\s*=\s*\{([^}]+)\}",
            ],
        }

        # Analyze each potential entry file for stage definitions
        for file_path in entry_files:
            try:
                with open(file_path, "r") as f:
                    content = f.read()

                file_ext = os.path.splitext(file_path)[1].lower()
                patterns_to_check = []

                # Select appropriate patterns based on file extension
                if file_ext in [".ts", ".js"]:
                    patterns_to_check.extend(stage_definition_patterns["ts_js"])
                elif file_ext == ".py":
                    patterns_to_check.extend(stage_definition_patterns["py"])

                # Always include generic patterns as a fallback
                patterns_to_check.extend(stage_definition_patterns["generic"])

                # Check all applicable patterns
                for pattern in patterns_to_check:
                    define_stages_match = re.search(pattern, content, re.DOTALL)
                    if define_stages_match:
                        try:
                            stages_content = define_stages_match.group(1)
                            # Extract stage names, accounting for different formats
                            # Handle both quoted strings and object keys in different languages
                            stage_matches = re.findall(
                                r'[\'"]([A-Za-z0-9_]+)[\'"]', stages_content
                            )
                            if stage_matches:
                                defined_stages_in_code.extend(stage_matches)
                                break
                        except IndexError:
                            # If we can't extract group(1), it might be using a different format
                            # Just detect that defineStages is being used
                            if "defineStages" in content or "define_stages" in content:
                                results["recommendations"].append(
                                    f"Found stage definitions in {os.path.relpath(file_path, project_path)} but couldn't parse specific stages"
                                )
                            break

            except Exception as e:
                results["issues"].append(f"Error analyzing {file_path}: {str(e)}")

        # Remove duplicates from code-defined stages
        defined_stages_in_code = list(set(defined_stages_in_code))

        # Combine all stages from both sources
        all_stages = list(set(list(stage_env_vars.keys()) + defined_stages_in_code))

        # Store results
        results["stages"]["defined_in_code"] = defined_stages_in_code
        results["stages"]["defined_via_env"] = stage_env_vars
        results["stages"]["all_stages"] = all_stages

        # Validation logic - prioritize environment variables
        missing_vars = []

        # Check that stages defined in code have corresponding environment variables
        for stage in defined_stages_in_code:
            if f"ACCOUNT_{stage}" not in all_env_vars:
                missing_vars.append(f"ACCOUNT_{stage}")
                results["issues"].append(
                    f"Stage '{stage}' defined in code but ACCOUNT_{stage} environment variable is missing"
                )

        # Core validation: ensure at least one stage is defined
        if not stage_env_vars and not defined_stages_in_code:
            results["issues"].append(
                "No stages defined. Define stages using environment variables (ACCOUNT_*) or .defineStages() in code"
            )
            results["recommendations"].append(
                "Set ACCOUNT_RES environment variable as the minimum required stage"
            )
        else:
            # Check for required RES stage
            if "RES" not in stage_env_vars and "RES" not in defined_stages_in_code:
                missing_vars.append("ACCOUNT_RES")
                results["issues"].append(
                    "Missing required RES stage. Set ACCOUNT_RES environment variable"
                )
                results["recommendations"].append(
                    "Set ACCOUNT_RES environment variable - this is the required resource/management stage"
                )

        # Store missing variables
        results["stages"]["missing_variables"] = missing_vars

        # Provide guidance on approach
        if defined_stages_in_code and stage_env_vars:
            results["recommendations"].append(
                "Both .defineStages() and environment variables found. Environment variables will take precedence"
            )
        elif defined_stages_in_code and not stage_env_vars:
            results["recommendations"].append(
                "Using .defineStages() in code. Consider using environment variables (ACCOUNT_*) for easier configuration management"
            )
        elif stage_env_vars and not defined_stages_in_code:
            results["recommendations"].append(
                "Using environment variables for stage definitions - this is the recommended approach"
            )

        if missing_vars:
            results["recommendations"].append(
                f"Set missing environment variables: {', '.join(missing_vars)}"
            )

        # Mark as invalid if issues were found
        if results["issues"]:
            results["valid"] = False

        return results

    except Exception as e:
        logger.exception("Error in check_stage_definitions")
        return {
            "valid": False,
            "issues": [f"Error checking stage definitions: {str(e)}"],
            "recommendations": [
                "Check that the project directory is valid and accessible"
            ],
        }
