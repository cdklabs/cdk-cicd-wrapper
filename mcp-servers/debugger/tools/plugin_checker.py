#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import re
import logging
from typing import Dict

from mcp.server.fastmcp import Context

logger = logging.getLogger("cdk-cicd-wrapper-debugger")


async def check_plugins(project_path: str, ctx: Context) -> Dict:
    """Check for custom plugins in a CDK CI/CD Wrapper project.

    Identifies and analyzes any custom plugins used in the project,
    including potential security implications. Specifically highlights
    plugins that enable public access or other security-sensitive configurations.

    Args:
        project_path: Path to the CDK project directory
        ctx: MCP context

    Returns:
        Dict with plugin analysis and security recommendations
    """
    ctx.info(f"Checking plugins in {project_path}")

    results = {
        "valid": True,
        "issues": [],
        "recommendations": [],
        "plugins": {"detected": [], "security_concerns": []},
    }

    try:
        # Define supported file extensions for CDK CICD Wrapper
        supported_extensions = [
            ".ts",  # TypeScript
            ".js",  # JavaScript
            ".py",  # Python
            ".java",  # Java
            ".cs",  # C#
            ".go",  # Go
        ]

        # Look for entry files that might contain plugin configurations
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
                for root, dirs, files in os.walk(directory):
                    # Special handling for plugin directories
                    if os.path.basename(root) == "plugins":
                        # Give priority to files in plugin directories
                        for file in files:
                            file_ext = os.path.splitext(file)[1].lower()
                            if (
                                file_ext in supported_extensions
                                and not file.startswith(".")
                            ):
                                found_files.append(os.path.join(root, file))
                    else:
                        # Regular files
                        for file in files:
                            file_ext = os.path.splitext(file)[1].lower()
                            if (
                                file_ext in supported_extensions
                                and not file.startswith(".")
                            ):
                                found_files.append(os.path.join(root, file))
            return found_files

        # Search all potential directories
        for dir_path in potential_dirs:
            entry_files.extend(find_files_recursively(dir_path))

        # Define language-specific and generic plugin detection patterns
        plugin_patterns = {
            # TypeScript/JavaScript specific patterns
            "ts_js": [
                r"class\s+([A-Za-z0-9_]+Plugin)\b",
                r"const\s+([A-Za-z0-9_]+Plugin)\s*=",
                r"\.addPlugin\(\s*(?:new\s+)?([A-Za-z0-9_]+)",
            ],
            # Python specific patterns
            "py": [
                r"class\s+([A-Za-z0-9_]+Plugin)\s*\(",
                r"([A-Za-z0-9_]+Plugin)\s*=",
                r"\.add_plugin\(\s*(?:[A-Za-z0-9_]+\.)?([A-Za-z0-9_]+)",
            ],
            # Generic patterns that might work across languages
            "generic": [
                r"(?:implements|extends)\s+(?:[A-Za-z0-9_.]+\.)?IPlugin",
                r"registerPlugin\(\s*(?:new\s+)?([A-Za-z0-9_]+)",
                r"createPlugin\(\s*(?:new\s+)?([A-Za-z0-9_]+)",
                r"PipelinePlugin\s*\(",
                r"CDKPlugin\s*\(",
            ],
        }

        # Security-sensitive patterns to look for - making them more language-agnostic
        security_patterns = {
            "public_access": [
                r"public[_]?[rR]ead(?:able)?",
                r"public[_]?[aA]ccess",
                r"[aA]llow[pP]ublic",
                r"make[pP]ublic",
                r"publicly[_]?[aA]ccessible\s*(?:[=:])\s*(?:true|True|TRUE)",
                r"public[_]?[dD]ns",
                r"enable[pP]ublic",
            ],
            "broad_iam_permissions": [
                # Match both TypeScript/JavaScript and Python style IAM patterns
                r"effect\s*(?:[=:])\s*['\"](?:[aA]llow)['\"].*actions\s*(?:[=:])\s*['\"]\\*['\"]",
                r"effect\s*(?:[=:])\s*['\"](?:[aA]llow)['\"].*resource\s*(?:[=:])\s*['\"]\\*['\"]",
                r"[pP]olicy[dD]ocument.*[eE]ffect\s*(?:[=:])\s*['\"](?:Allow|allow)['\"].*[aA]ction\s*(?:[=:])\s*['\"][^'\"]*:[^'\"]*\\*",
                r"[nN]ew\s+(?:[mM]anaged)?[pP]olicy.*\{\s*statements:\s*\[.*\\*.*\]",
            ],
            "sensitive_data_handling": [
                r"no[_]?[eE]ncryption",
                r"disable[_]?[eE]ncryption",
                r"skip[_]?[eE]ncryption",
                r"encryption\s*(?:[=:])\s*(?:false|False|FALSE|undefined|null|None)",
                r"enable[_]?[kK]ey[_]?[rR]otation\s*(?:[=:])\s*(?:false|False|FALSE)",
            ],
            "insecure_defaults": [
                r"require[_]?[sS]sl\s*(?:[=:])\s*(?:false|False|FALSE)",
                r"insecure\s*(?:[=:])\s*(?:true|True|TRUE)",
                r"skip[_]?[vV]alidation",
                r"bypass[_]?[aA]pproval",
                r"bypass[_]?[sS]ecurity[_]?[cC]heck",
            ],
        }

        # Found plugins
        detected_plugins = []
        security_concerns = []

        # Search for plugin declarations
        for file_path in entry_files:
            try:
                with open(file_path, "r") as f:
                    content = f.read()

                # Skip if not a plugin-related file based on content check
                if "plugin" not in content.lower() and "Plugin" not in content:
                    continue

                file_ext = os.path.splitext(file_path)[1].lower()
                patterns_to_check = []

                # Select appropriate patterns based on file extension
                if file_ext in [".ts", ".js"]:
                    patterns_to_check.extend(plugin_patterns["ts_js"])
                elif file_ext == ".py":
                    patterns_to_check.extend(plugin_patterns["py"])

                # Always include generic patterns as a fallback
                patterns_to_check.extend(plugin_patterns["generic"])

                # Extract plugin information
                plugin_name = None
                plugin_classes = []

                # Check all patterns
                for pattern in patterns_to_check:
                    matches = re.findall(pattern, content)
                    if matches:
                        plugin_classes.extend(matches)

                if plugin_classes:
                    # Use the first match as the plugin name
                    plugin_name = plugin_classes[0]

                # If found a plugin, record it
                if plugin_name and not any(
                    plugin["name"] == plugin_name for plugin in detected_plugins
                ):
                    relative_path = os.path.relpath(file_path, project_path)
                    plugin_info = {"name": plugin_name, "file": relative_path}

                    # Check for security concerns
                    for concern_type, patterns in security_patterns.items():
                        for pattern in patterns:
                            if re.search(pattern, content, re.IGNORECASE):
                                security_concern = {
                                    "plugin": plugin_name,
                                    "file": relative_path,
                                    "type": concern_type,
                                    "pattern_matched": pattern,
                                }
                                security_concerns.append(security_concern)
                                break

                    detected_plugins.append(plugin_info)

            except Exception as e:
                results["issues"].append(f"Error analyzing {file_path}: {str(e)}")

        # Store results
        results["plugins"]["detected"] = detected_plugins
        results["plugins"]["security_concerns"] = security_concerns

        # Generate recommendations based on findings
        if security_concerns:
            for concern in security_concerns:
                if concern["type"] == "public_access":
                    results["issues"].append(
                        f"Plugin '{concern['plugin']}' in {concern['file']} may enable public access"
                    )
                    results["recommendations"].append(
                        f"Review {concern['plugin']} for public access settings that might expose data"
                    )

                elif concern["type"] == "broad_iam_permissions":
                    results["issues"].append(
                        f"Plugin '{concern['plugin']}' in {concern['file']} may use overly permissive IAM policies"
                    )
                    results["recommendations"].append(
                        f"Review {concern['plugin']} to ensure it follows least privilege principle"
                    )

                elif concern["type"] == "sensitive_data_handling":
                    results["issues"].append(
                        f"Plugin '{concern['plugin']}' in {concern['file']} may handle sensitive data insecurely"
                    )
                    results["recommendations"].append(
                        f"Ensure {concern['plugin']} uses encryption for sensitive data"
                    )

                elif concern["type"] == "insecure_defaults":
                    results["issues"].append(
                        f"Plugin '{concern['plugin']}' in {concern['file']} may use insecure defaults"
                    )
                    results["recommendations"].append(
                        f"Review default security settings in {concern['plugin']}"
                    )

        # General recommendations for plugin usage
        if detected_plugins:
            results["recommendations"].append(
                "Always review custom plugins for security implications before deployment"
            )
            results["recommendations"].append(
                "Consider adding plugin-specific tests to validate behavior"
            )

        # Mark as invalid if issues were found
        if results["issues"]:
            results["valid"] = False

        return results

    except Exception as e:
        logger.exception("Error in check_plugins")
        return {
            "valid": False,
            "issues": [f"Error checking plugins: {str(e)}"],
            "recommendations": ["Check your project configuration"],
        }
