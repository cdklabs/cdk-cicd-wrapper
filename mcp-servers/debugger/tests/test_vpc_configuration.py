# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import tempfile


# Test implementation of VPC checker that mimics the real function
def mock_check_vpc_configuration(project_path, ctx):
    """Mock implementation of check_vpc_configuration for testing"""
    ctx.info(f"Checking VPC configuration in {project_path}")

    # Simplified results structure
    results = {
        "valid": True,
        "issues": [],
        "recommendations": [],
        "vpc_config": {
            "vpc_in_use": False,
            "vpc_proxy_configured": False,
            "vpc_provider_configured": False,
            "vpc_config_found": {},
            "from_existing": False,
        },
    }

    # If the path doesn't exist, add an issue
    if not os.path.exists(project_path):
        results["valid"] = False
        results["issues"].append(f"Project path does not exist: {project_path}")

    # If we find a file with VPC configuration in it, set vpc_in_use to True
    if os.path.exists(project_path):
        src_dir = os.path.join(project_path, "src")
        if os.path.exists(src_dir):
            for file in os.listdir(src_dir):
                if file.endswith(".ts") or file.endswith(".js"):
                    file_path = os.path.join(src_dir, file)
                    with open(file_path, "r") as f:
                        content = f.read()
                        if "vpc" in content.lower():
                            results["vpc_config"]["vpc_in_use"] = True
                            if "proxy" in content.lower():
                                results["vpc_config"]["vpc_proxy_configured"] = True

    return results


# Test the VPC checker with a mock TypeScript file containing VPC configuration
def test_check_vpc_configuration(mock_context):
    """Test the VPC configuration checker"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a mock TypeScript file with VPC configuration
        os.makedirs(os.path.join(temp_dir, "src"))
        with open(os.path.join(temp_dir, "src", "main.ts"), "w") as f:
            f.write(
                """
            import * as cdk from 'aws-cdk-lib';
            
            const app = new cdk.App();
            const stack = new cdk.Stack(app, 'TestStack');
            
            // VPC configuration
            stack.vpc({
                vpcId: 'vpc-12345',
                proxy: 'http://proxy.example.com',
                proxySecretArn: 'arn:aws:secretsmanager:region:account:secret:name'
            });
            """
            )

        result = mock_check_vpc_configuration(temp_dir, mock_context)

        # Basic structure checks
        assert isinstance(result, dict)
        assert "valid" in result
        assert "vpc_config" in result
        assert isinstance(result["vpc_config"], dict)
        assert result["vpc_config"]["vpc_in_use"] is True
        assert result["vpc_config"]["vpc_proxy_configured"] is True


# Test the VPC checker with a directory that doesn't have VPC configuration
def test_check_vpc_configuration_no_vpc(mock_context):
    """Test the VPC configuration checker with no VPC config"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a mock TypeScript file without VPC configuration
        os.makedirs(os.path.join(temp_dir, "src"))
        with open(os.path.join(temp_dir, "src", "main.ts"), "w") as f:
            f.write(
                """
            import * as cdk from 'aws-cdk-lib';
            
            const app = new cdk.App();
            const stack = new cdk.Stack(app, 'TestStack');
            """
            )

        result = mock_check_vpc_configuration(temp_dir, mock_context)

        # VPC should not be in use
        assert result["vpc_config"]["vpc_in_use"] is False
        assert result["vpc_config"]["vpc_proxy_configured"] is False
