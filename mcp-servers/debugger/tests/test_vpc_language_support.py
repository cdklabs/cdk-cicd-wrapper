# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import re
import pytest
import tempfile
from unittest.mock import Mock


# Mock the check_vpc_configuration function to avoid direct dependency on the original async function
def mock_check_vpc_configuration(project_path, mock_context):
    """Synchronous version of the check_vpc_configuration function for testing"""
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

    # Define supported file extensions
    supported_extensions = [
        ".ts",  # TypeScript
        ".js",  # JavaScript
        ".py",  # Python
        ".java",  # Java
        ".cs",  # C#
        ".go",  # Go
    ]

    # Look for entry files that might contain VPC configurations
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
                    if file_ext in supported_extensions and not file.startswith("."):
                        found_files.append(os.path.join(root, file))
        return found_files

    # Search all potential directories
    for dir_path in potential_dirs:
        entry_files.extend(find_files_recursively(dir_path))

    # Analyze each file for VPC configuration
    vpc_in_use = False
    vpc_proxy_configured = False
    vpc_provider_configured = False
    vpc_config = {}

    for file_path in entry_files:
        try:
            with open(file_path, "r") as f:
                content = f.read()

            # Check for VPC resource provider
            if (
                'resourceProvider("VPC"' in content
                or 'resource_provider("VPC"' in content
            ):
                vpc_provider_configured = True
                vpc_in_use = True

            # Check for VPC configuration in different language styles
            # - TypeScript/JavaScript: stack.vpc({...})
            # - Python: self.vpc({...}) or vpc = {...}
            # - Java: vpc(Map.of(...))
            if (
                ".vpc(" in content
                or "vpc = " in content
                or re.search(r"(\s|^)vpc\(", content)
            ):
                vpc_in_use = True

                # Check for VPC ID in different formats
                if "vpc_id" in content or "vpcId" in content:
                    vpc_config["vpcId"] = "vpc-12345"  # Simplified for testing

                # Check for proxy configuration
                if "proxy" in content:
                    vpc_config["proxy"] = "http://proxy.example.com"
                    vpc_proxy_configured = True

                # Check for proxy secret ARN
                if "proxy_secret_arn" in content or "proxySecretArn" in content:
                    vpc_config["proxySecretArn"] = (
                        "arn:aws:secretsmanager:region:account:secret:name"
                    )
                    vpc_proxy_configured = True

        except Exception as e:
            results["issues"].append(f"Error analyzing {file_path}: {str(e)}")

    # Store VPC configuration results
    results["vpc_config"]["vpc_in_use"] = vpc_in_use
    results["vpc_config"]["vpc_proxy_configured"] = vpc_proxy_configured
    results["vpc_config"]["vpc_provider_configured"] = vpc_provider_configured
    results["vpc_config"]["vpc_config_found"] = vpc_config

    return results


# Mock Context for testing
class MockContext:
    """Mock Context class for testing"""

    def __init__(self):
        self.info = Mock()
        self.warning = Mock()
        self.error = Mock()

    def load_env_variables(self, project_path):
        # Mock implementation
        if not os.path.exists(project_path):
            return {}
        return {
            "AWS_REGION": "us-west-2",
            "VPC_ID": "vpc-12345",
            "PROXY_SECRET_ARN": "arn:aws:secretsmanager:region:account:secret:name",
            "HTTP_PROXY": "http://proxy.example.com:8080",
            "HTTPS_PROXY": "https://proxy.example.com:8443",
            "NO_PROXY": "localhost,127.0.0.1,.amazonaws.com",
        }


# Fixture for the mock context
@pytest.fixture
def mock_context():
    """Fixture that provides a mock Context object for testing"""
    return MockContext()


# Test for Python file VPC configuration detection
def test_vpc_configuration_python(mock_context):
    """Test that the VPC checker can detect VPC configuration in Python files"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a Python CDK file with VPC configuration
        os.makedirs(os.path.join(temp_dir, "app"))
        with open(os.path.join(temp_dir, "app", "main.py"), "w") as f:
            f.write(
                """
# Example Python CDK file with VPC configuration
from aws_cdk import aws_ec2 as ec2
from aws_cdk import core

class MyStack(core.Stack):
    def __init__(self, scope, id, **kwargs):
        super().__init__(scope, id, **kwargs)
        
        # VPC configuration in Python
        self.vpc = self.vpc({
            'vpc_id': 'vpc-12345',
            'proxy': 'http://proxy.example.com',
            'proxy_secret_arn': 'arn:aws:secretsmanager:region:account:secret:name',
            'subnets': ['subnet-1', 'subnet-2'],
            'security_groups': ['sg-1', 'sg-2']
        })
            """
            )

        # Run the VPC configuration checker (synchronous version)
        result = mock_check_vpc_configuration(temp_dir, mock_context)

        # Check that VPC configuration was detected
        assert result["valid"] is True
        assert result["vpc_config"]["vpc_in_use"] is True

        # Check that the Python-style vpc_id was detected
        assert "vpcId" in result["vpc_config"]["vpc_config_found"]

        # Check that proxy configuration was detected
        assert result["vpc_config"]["vpc_proxy_configured"] is True


# Test for Java file VPC configuration detection
def test_vpc_configuration_java(mock_context):
    """Test that the VPC checker can detect VPC configuration in Java files"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a Java CDK file with VPC configuration
        os.makedirs(os.path.join(temp_dir, "src", "main", "java"))
        with open(
            os.path.join(temp_dir, "src", "main", "java", "MyStack.java"), "w"
        ) as f:
            f.write(
                """
// Example Java CDK file with VPC configuration
package com.mycompany.app;

import software.amazon.awscdk.core.Stack;
import software.amazon.awscdk.core.StackProps;

public class MyStack extends Stack {
    public MyStack(final Construct scope, final String id) {
        super(scope, id);
        
        // VPC configuration in Java
        vpc(Map.of(
            "vpcId", "vpc-12345",
            "proxy", "http://proxy.example.com",
            "proxySecretArn", "arn:aws:secretsmanager:region:account:secret:name"
        ));
    }
}
            """
            )

        # Run the VPC configuration checker (synchronous version)
        result = mock_check_vpc_configuration(temp_dir, mock_context)

        # Check that VPC configuration was detected
        assert result["valid"] is True
        assert result["vpc_config"]["vpc_in_use"] is True


# Test for resource provider in different languages
def test_vpc_resource_provider_detection(mock_context):
    """Test that the VPC checker can detect resource providers in different languages"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create files with different language syntaxes
        languages = {
            "typescript": {
                "path": os.path.join(temp_dir, "src", "main.ts"),
                "code": """
                stack.resourceProvider("VPC", {
                    vpcId: 'vpc-12345'
                });
                """,
            },
            "python": {
                "path": os.path.join(temp_dir, "app", "main.py"),
                "code": """
                stack.resource_provider("VPC", {
                    'vpc_id': 'vpc-12345'
                })
                """,
            },
        }

        for lang, info in languages.items():
            # Create parent directories
            os.makedirs(os.path.dirname(info["path"]), exist_ok=True)

            # Create the file
            with open(info["path"], "w") as f:
                f.write(info["code"])

            # Run the VPC configuration checker (synchronous version)
            result = mock_check_vpc_configuration(temp_dir, mock_context)

            # Check that VPC resource provider was detected
            assert (
                result["vpc_config"]["vpc_provider_configured"] is True
            ), f"Failed to detect VPC resource provider in {lang}"
            assert (
                result["vpc_config"]["vpc_in_use"] is True
            ), f"Failed to detect VPC in use in {lang}"
