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
        # Look for entry files that might contain plugin configurations
        entry_files = []
        potential_dirs = [
            os.path.join(project_path, "bin"),
            os.path.join(project_path, "src"),
            os.path.join(project_path, "lib"),
            project_path,  # root directory
        ]

        # Also look for plugin-specific directories
        plugin_dirs = []
        for base_dir in [project_path, os.path.join(project_path, "src")]:
            plugins_dir = os.path.join(base_dir, "plugins")
            if os.path.exists(plugins_dir) and os.path.isdir(plugins_dir):
                plugin_dirs.append(plugins_dir)

        # Collect entry files
        for dir_path in potential_dirs:
            if os.path.exists(dir_path):
                for file in os.listdir(dir_path):
                    if (
                        file.endswith(".ts") or file.endswith(".js")
                    ) and not file.startswith("."):
                        entry_files.append(os.path.join(dir_path, file))

        # Also collect plugin files
        for plugin_dir in plugin_dirs:
            for root, _, files in os.walk(plugin_dir):
                for file in files:
                    if file.endswith((".ts", ".js")) and not file.startswith("."):
                        entry_files.append(os.path.join(root, file))

        # Keywords that might indicate a plugin
        plugin_keywords = [
            "plugin",
            "addPlugin",
            "registerPlugin",
            "createPlugin",
            "PipelinePlugin",
            "CDKPlugin",
            "IPlugin",
        ]

        # Security-sensitive patterns to look for
        security_patterns = {
            "public_access": [
                r"publicRead(able)?",
                r"publicAccess",
                r"AllowPublic",
                r"makePublic",
                r"publiclyAccessible\s*[=:]\s*true",
                r"publicDns",
                r"enablePublic",
            ],
            "broad_iam_permissions": [
                r"effect\s*:\s*['\"]Allow['\"].*actions\s*:\s*['\"]\\*['\"]",
                r"effect\s*:\s*['\"]Allow['\"].*resource\s*:\s*['\"]\\*['\"]",
                r"PolicyDocument.*Effect\s*:\s*['\"](?:Allow|allow)['\"].*Action\s*:\s*['\"][^'\"]*:[^'\"]*\\*",
                r"new\s+ManagedPolicy.*\{\s*statements:\s*\[.*\\*.*\]",
            ],
            "sensitive_data_handling": [
                r"noEncryption",
                r"disableEncryption",
                r"skipEncryption",
                r"encryption\s*[=:]\s*(?:false|undefined|null)",
                r"enableKeyRotation\s*[=:]\s*false",
            ],
            "insecure_defaults": [
                r"requireSsl\s*[=:]\s*false",
                r"insecure\s*[=:]\s*true",
                r"skipValidation",
                r"bypassApproval",
                r"bypassSecurityCheck",
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

                # Check if file contains plugin-related code
                for keyword in plugin_keywords:
                    if keyword in content:
                        # Extract plugin information
                        plugin_name = None
                        plugin_classes = []

                        # Try to extract plugin name from class name or variable name
                        class_matches = re.findall(
                            r"class\s+([A-Za-z0-9_]+Plugin)\b", content
                        )
                        plugin_classes.extend(class_matches)

                        var_matches = re.findall(
                            r"const\s+([A-Za-z0-9_]+Plugin)\s*=", content
                        )
                        plugin_classes.extend(var_matches)

                        if plugin_classes:
                            plugin_name = plugin_classes[0]
                        else:
                            # Try to extract from plugin usage
                            usage_match = re.search(
                                r"\.addPlugin\(\s*(?:new\s+)?([A-Za-z0-9_]+)", content
                            )
                            if usage_match:
                                plugin_name = usage_match.group(1)

                        # Skip if this looks like a standard import or reference
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

                        # Only need to continue checking this file if no plugin found yet
                        if plugin_name:
                            break

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
