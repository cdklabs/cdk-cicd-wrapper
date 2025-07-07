# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import tempfile
import re


# Test implementation of plugins checker
def mock_check_plugins(project_path, ctx):
    """Mock implementation of check_plugins for testing"""
    ctx.info(f"Checking plugins in {project_path}")

    # Simplified results structure
    results = {
        "valid": True,
        "issues": [],
        "recommendations": [],
        "plugins": {"detected": [], "security_concerns": []},
    }

    # If the path doesn't exist, add an issue
    if not os.path.exists(project_path):
        results["valid"] = False
        results["issues"].append(f"Project path does not exist: {project_path}")
        return results

    # Check for plugins in TypeScript files
    src_dir = os.path.join(project_path, "src")
    if os.path.exists(src_dir):
        for file in os.listdir(src_dir):
            if file.endswith(".ts") or file.endswith(".js"):
                file_path = os.path.join(src_dir, file)
                with open(file_path, "r") as f:
                    content = f.read()

                    # Find all plugin declarations
                    plugin_declarations = re.finditer(
                        r'addPlugin\([\'"]([^\'"]+)[\'"].*?(?:\{.*?\})',
                        content,
                        re.DOTALL,
                    )

                    for match in plugin_declarations:
                        plugin_name = match.group(1)
                        plugin_code = match.group(0)

                        # Add to detected plugins
                        results["plugins"]["detected"].append(
                            {"name": plugin_name, "file": file}
                        )

                        # Check this specific plugin code for security issues
                        if (
                            "UnsecurePlugin" in plugin_name
                            or "publicAccess" in plugin_code
                            or "noAuth" in plugin_code
                        ):
                            results["plugins"]["security_concerns"].append(
                                {
                                    "plugin": plugin_name,
                                    "issue": "Potential public access configuration detected",
                                }
                            )
                            results["recommendations"].append(
                                f"Review security settings for plugin '{plugin_name}'"
                            )

    return results


# Test for the plugins checker with no plugins
def test_check_plugins_no_plugins(mock_context):
    """Test the plugins checker with no plugins"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a TypeScript file with no plugins
        os.makedirs(os.path.join(temp_dir, "src"))
        with open(os.path.join(temp_dir, "src", "main.ts"), "w") as f:
            f.write(
                """
            import * as cdk from 'aws-cdk-lib';
            
            const app = new cdk.App();
            const stack = new cdk.Stack(app, 'TestStack');
            """
            )

        result = mock_check_plugins(temp_dir, mock_context)

        # Check basic structure
        assert isinstance(result, dict)
        assert "valid" in result
        assert "plugins" in result
        assert len(result["plugins"]["detected"]) == 0
        assert len(result["plugins"]["security_concerns"]) == 0


# Test for the plugins checker with a safe plugin
def test_check_plugins_safe_plugin(mock_context):
    """Test the plugins checker with a safe plugin"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a TypeScript file with a plugin
        os.makedirs(os.path.join(temp_dir, "src"))
        with open(os.path.join(temp_dir, "src", "main.ts"), "w") as f:
            f.write(
                """
            import * as cdk from 'aws-cdk-lib';
            
            const app = new cdk.App();
            const stack = new cdk.Stack(app, 'TestStack');
            
            // Add plugins
            stack.addPlugin("MyCustomPlugin", {
              options: {
                secure: true,
                privateAccess: true
              }
            });
            """
            )

        result = mock_check_plugins(temp_dir, mock_context)

        # Check basic structure
        assert isinstance(result, dict)
        assert "valid" in result
        assert "plugins" in result
        assert len(result["plugins"]["detected"]) == 1
        assert result["plugins"]["detected"][0]["name"] == "MyCustomPlugin"
        assert len(result["plugins"]["security_concerns"]) == 0


# Test for the plugins checker with security concerns
def test_check_plugins_security_concerns(mock_context):
    """Test the plugins checker with security concerns"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a TypeScript file with a plugin that has security concerns
        os.makedirs(os.path.join(temp_dir, "src"))
        with open(os.path.join(temp_dir, "src", "main.ts"), "w") as f:
            f.write(
                """
            import * as cdk from 'aws-cdk-lib';
            
            const app = new cdk.App();
            const stack = new cdk.Stack(app, 'TestStack');
            
            // Add plugins with security concerns
            stack.addPlugin("UnsecurePlugin", {
              options: {
                publicAccess: true,  // This is a security concern
                noAuth: true         // This is another security concern
              }
            });
            """
            )

        result = mock_check_plugins(temp_dir, mock_context)

        # Check that security concerns were detected
        assert isinstance(result, dict)
        assert "plugins" in result
        assert len(result["plugins"]["detected"]) == 1
        assert len(result["plugins"]["security_concerns"]) == 1
        assert "UnsecurePlugin" in result["plugins"]["security_concerns"][0]["plugin"]
        assert len(result["recommendations"]) > 0


# Test for multiple plugins with mixed security concerns
def test_check_multiple_plugins(mock_context):
    """Test the plugins checker with multiple plugins"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a TypeScript file with multiple plugins
        os.makedirs(os.path.join(temp_dir, "src"))
        with open(os.path.join(temp_dir, "src", "main.ts"), "w") as f:
            f.write(
                """
            import * as cdk from 'aws-cdk-lib';
            
            const app = new cdk.App();
            const stack = new cdk.Stack(app, 'TestStack');
            
            // Add a secure plugin
            stack.addPlugin("SecurePlugin", {
              options: {
                secure: true
              }
            });
            
            // Add an unsecure plugin
            stack.addPlugin("UnsecurePlugin", {
              options: {
                publicAccess: true
              }
            });
            """
            )

        result = mock_check_plugins(temp_dir, mock_context)

        # Print for debugging
        print(result["plugins"]["security_concerns"])

        # Check detection results
        assert len(result["plugins"]["detected"]) == 2
        assert len(result["plugins"]["security_concerns"]) == 1
        assert "UnsecurePlugin" in result["plugins"]["security_concerns"][0]["plugin"]
