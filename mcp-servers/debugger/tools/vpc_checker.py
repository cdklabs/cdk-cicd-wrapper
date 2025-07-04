#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import re
import logging
from typing import Dict

from mcp.server.fastmcp import Context

logger = logging.getLogger("cdk-cicd-wrapper-debugger")

async def check_vpc_configuration(
    project_path: str,
    ctx: Context
) -> Dict:
    """Check VPC configuration and CodeBuild environment variables.
    
    Validates VPC configuration in CDK CI/CD Wrapper project and ensures
    all necessary proxy configurations are present when VPC proxy is enabled.
    
    Args:
        project_path: Path to the CDK project directory
        ctx: MCP context
        
    Returns:
        Dict with analysis results including VPC config and proxy settings
    """
    ctx.info(f"Checking VPC configuration in {project_path}")
    
    results = {
        "valid": True,
        "issues": [],
        "recommendations": [],
        "vpc_config": {
            "vpc_in_use": False,
            "vpc_proxy_configured": False,
            "vpc_provider_configured": False,
            "vpc_config_found": {},
            "from_existing": False
        }
    }
    
    try:
        # Load environment variables from .env files and system environment
        all_env_vars = ctx.load_env_variables(project_path)
        
        # Look for entry files that might contain VPC configurations
        entry_files = []
        potential_dirs = [
            os.path.join(project_path, "bin"),
            os.path.join(project_path, "src"),
            os.path.join(project_path, "lib"),
            project_path  # root directory
        ]
        
        for dir_path in potential_dirs:
            if os.path.exists(dir_path):
                for file in os.listdir(dir_path):
                    if (file.endswith(".ts") or file.endswith(".js")) and not file.startswith("."):
                        entry_files.append(os.path.join(dir_path, file))
        
        vpc_in_use = False
        vpc_proxy_configured = False
        vpc_provider_configured = False
        vpc_from_existing = False
        vpc_config = {}
        
        # Analyze each potential entry file for VPC configuration
        for file_path in entry_files:
            try:
                with open(file_path, 'r') as f:
                    content = f.read()
                
                # Check if VPC resource provider is configured
                if re.search(r'\.resourceProvider\([\'"]VPC[\'"]', content):
                    vpc_provider_configured = True
                    vpc_in_use = True
                
                # Check for VPC configuration patterns
                vpc_config_match = re.search(r'\.vpc\(\s*({.*?})\s*\)', content, re.DOTALL)
                if vpc_config_match:
                    vpc_in_use = True
                    vpc_config_content = vpc_config_match.group(1)
                    
                    # Check if using existing VPC
                    if "fromExisting" in vpc_config_content or "lookup" in vpc_config_content.lower():
                        vpc_from_existing = True
                    
                    # Extract VPC configuration properties
                    vpc_id_match = re.search(r'vpcId:\s*[\'"]([^\'"]+)[\'"]', vpc_config_content)
                    if vpc_id_match:
                        vpc_config["vpcId"] = vpc_id_match.group(1)
                    
                    # Check for proxy configuration
                    proxy_match = re.search(r'proxy:\s*[\'"]([^\'"]+)[\'"]', vpc_config_content)
                    if proxy_match:
                        vpc_config["proxy"] = proxy_match.group(1)
                        vpc_proxy_configured = True
                    
                    # Check for proxy secret ARN
                    proxy_secret_match = re.search(r'proxySecretArn:\s*[\'"]([^\'"]+)[\'"]', vpc_config_content)
                    if proxy_secret_match:
                        vpc_config["proxySecretArn"] = proxy_secret_match.group(1)
                        vpc_proxy_configured = True
                    
                    # Check for other VPC properties
                    subnets_match = re.search(r'subnets:\s*\[(.*?)\]', vpc_config_content, re.DOTALL)
                    if subnets_match:
                        vpc_config["subnets"] = subnets_match.group(1).strip()
                    
                    security_groups_match = re.search(r'securityGroups:\s*\[(.*?)\]', vpc_config_content, re.DOTALL)
                    if security_groups_match:
                        vpc_config["securityGroups"] = security_groups_match.group(1).strip()
            
            except Exception as e:
                results["issues"].append(f"Error analyzing {file_path}: {str(e)}")
        
        # Check environment variables for VPC configuration
        vpc_env_vars = {
            "VPC_ID": all_env_vars.get("VPC_ID"),
            "PROXY_SECRET_ARN": all_env_vars.get("PROXY_SECRET_ARN"),
            "HTTP_PROXY": all_env_vars.get("HTTP_PROXY"),
            "HTTPS_PROXY": all_env_vars.get("HTTPS_PROXY"),
            "NO_PROXY": all_env_vars.get("NO_PROXY")
        }
        
        # Note: The following variables are not expected in the regular environment
        # They are only generated inside CodeBuild BuildSpec when PROXY_SECRET_ARN is provided:
        # - PROXY_USERNAME: ${proxySecretArn}:username
        # - PROXY_PASSWORD: ${proxySecretArn}:password
        # - HTTP_PROXY_PORT: ${proxySecretArn}:http_proxy_port
        # - HTTPS_PROXY_PORT: ${proxySecretArn}:https_proxy_port
        # - PROXY_DOMAIN: ${proxySecretArn}:proxy_domain
        
        # If VPC_ID is set in environment, VPC is in use and from existing
        if vpc_env_vars["VPC_ID"]:
            vpc_in_use = True
            vpc_from_existing = True
            if "vpcId" not in vpc_config:
                vpc_config["vpcId"] = vpc_env_vars["VPC_ID"]
        
        # If proxy variables are set in environment, proxy is configured
        if vpc_env_vars["PROXY_SECRET_ARN"] or vpc_env_vars["HTTP_PROXY"] or vpc_env_vars["HTTPS_PROXY"]:
            vpc_proxy_configured = True
        
        # Store VPC configuration results
        results["vpc_config"]["vpc_in_use"] = vpc_in_use
        results["vpc_config"]["vpc_proxy_configured"] = vpc_proxy_configured
        results["vpc_config"]["vpc_provider_configured"] = vpc_provider_configured
        results["vpc_config"]["vpc_config_found"] = vpc_config
        results["vpc_config"]["from_existing"] = vpc_from_existing
        
        # If VPC proxy is configured, check for required proxy environment variables
        if vpc_proxy_configured:
            # Required proxy environment variables
            required_proxy_vars = [
                "HTTP_PROXY",
                "HTTPS_PROXY", 
                "NO_PROXY",
                "PROXY_SECRET_ARN"
            ]
            
            # Check which proxy variables are missing
            missing_vars = []
            for var in required_proxy_vars:
                if not all_env_vars.get(var):
                    missing_vars.append(var)
            
            # Generate issues and recommendations for missing proxy variables
            if missing_vars:
                results["issues"].append(f"VPC proxy is configured but missing required environment variables: {', '.join(missing_vars)}")
                results["recommendations"].append("Set all required proxy environment variables for VPC configuration")
            
            # Validate proxy URLs if set
            for proxy_var in ["HTTP_PROXY", "HTTPS_PROXY"]:
                proxy_url = vpc_env_vars.get(proxy_var)
                if proxy_url and not (proxy_url.startswith("http://") or proxy_url.startswith("https://")):
                    results["issues"].append(f"{proxy_var} should be a valid URL starting with http:// or https://")
                    results["recommendations"].append(f"Fix {proxy_var} URL format")
            
            # Check NO_PROXY format
            no_proxy = vpc_env_vars.get("NO_PROXY")
            if no_proxy:
                # NO_PROXY should contain localhost and other common exclusions
                recommended_no_proxy = ["localhost", "127.0.0.1", "169.254.169.254", ".amazonaws.com"]
                missing_exclusions = []
                
                for exclusion in recommended_no_proxy:
                    if exclusion not in no_proxy:
                        missing_exclusions.append(exclusion)
                
                if missing_exclusions:
                    results["recommendations"].append(f"Consider adding these to NO_PROXY: {', '.join(missing_exclusions)}")
            
            # Check PROXY_SECRET_ARN format and the CodeBuild BuildSpec variables
            proxy_secret_arn = vpc_env_vars.get("PROXY_SECRET_ARN")
            if proxy_secret_arn:
                # Validate ARN format
                if not proxy_secret_arn.startswith("arn:aws:secretsmanager:"):
                    results["issues"].append("PROXY_SECRET_ARN should be a valid AWS Secrets Manager ARN")
                    results["recommendations"].append("Fix PROXY_SECRET_ARN format - should start with arn:aws:secretsmanager:")
                
                # Add the CodeBuild BuildSpec check for secret format
                results["vpc_config"]["codebuild_buildspec"] = {
                    "secrets_manager": {
                        "PROXY_USERNAME": f"{proxy_secret_arn}:username",
                        "PROXY_PASSWORD": f"{proxy_secret_arn}:password",
                        "HTTP_PROXY_PORT": f"{proxy_secret_arn}:http_proxy_port",
                        "HTTPS_PROXY_PORT": f"{proxy_secret_arn}:https_proxy_port",
                        "PROXY_DOMAIN": f"{proxy_secret_arn}:proxy_domain"
                    },
                    "install_commands": [
                        f'export HTTP_PROXY="http://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTP_PROXY_PORT"',
                        f'export HTTPS_PROXY="https://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTPS_PROXY_PORT"'
                    ]
                }
                
                # Check if the Secret exists (if we have access)
                try:
                    import boto3
                    if all_env_vars.get("RES_ACCOUNT_AWS_PROFILE"):
                        session = boto3.Session(profile_name=all_env_vars["RES_ACCOUNT_AWS_PROFILE"])
                        secretsmanager = session.client('secretsmanager')
                        
                        # Try to get secret
                        try:
                            secret_response = secretsmanager.describe_secret(SecretId=proxy_secret_arn)
                            results["vpc_config"]["proxy_secret_exists"] = True
                            
                            # Try to get the actual values to verify structure
                            try:
                                secret_value = secretsmanager.get_secret_value(SecretId=proxy_secret_arn)
                                if 'SecretString' in secret_value:
                                    import json
                                    secret_dict = json.loads(secret_value['SecretString'])
                                    
                                    # Check required fields
                                    required_fields = ['username', 'password', 'http_proxy_port', 'https_proxy_port', 'proxy_domain']
                                    missing_fields = [field for field in required_fields if field not in secret_dict]
                                    
                                    if missing_fields:
                                        results["issues"].append(f"Proxy secret is missing required fields: {', '.join(missing_fields)}")
                                        results["recommendations"].append(f"Update the secret at {proxy_secret_arn} to include all required fields")
                                    else:
                                        results["vpc_config"]["proxy_secret_valid"] = True
                            except Exception as e:
                                # Can't access the secret values
                                results["recommendations"].append(f"Couldn't validate proxy secret structure: {str(e)}")
                                
                        except secretsmanager.exceptions.ResourceNotFoundException:
                            results["issues"].append(f"Proxy secret {proxy_secret_arn} does not exist")
                            results["recommendations"].append(f"Create the secret at {proxy_secret_arn} with required fields")
                            results["valid"] = False
                            
                except Exception as e:
                    results["recommendations"].append(f"Couldn't check proxy secret existence: {str(e)}")
                
                # Add the check for the actual pipeline CodeBuild environment
                results["vpc_config"]["codebuild_environment"] = {
                    "AWS_STS_REGIONAL_ENDPOINTS": "regional",
                    "NO_PROXY": vpc_env_vars.get("NO_PROXY", ""),
                    "PROXY_SECRET_ARN": proxy_secret_arn
                }
        
        # VPC-specific validations
        if vpc_in_use:
            if not vpc_provider_configured:
                results["recommendations"].append("VPC configuration found but VPC resource provider is not explicitly configured")
            
            # Check if VPC ID is provided when needed
            if not vpc_config.get("vpcId") and not vpc_env_vars["VPC_ID"] and vpc_from_existing:
                results["issues"].append("Using existing VPC but VPC ID is not specified")
                results["recommendations"].append("Specify VPC ID either in code or via VPC_ID environment variable")
            
            # Check if subnets are specified
            if vpc_from_existing and not vpc_config.get("subnets"):
                results["recommendations"].append("Using existing VPC but subnet IDs are not specified in code")
            
            # Check if security groups are specified
            if vpc_from_existing and not vpc_config.get("securityGroups"):
                results["recommendations"].append("Using existing VPC but security group IDs are not specified in code")
        
        # General recommendations for VPC setup
        if vpc_in_use and not vpc_proxy_configured:
            results["recommendations"].append("VPC is configured but no proxy settings found. If internet access is needed, configure proxy or NAT Gateway")
        
        if vpc_proxy_configured and not vpc_in_use:
            results["issues"].append("Proxy configuration found but VPC is not properly configured")
            results["recommendations"].append("Ensure VPC resource provider is configured when using proxy")
        
        # Mark as invalid if issues were found
        if results["issues"]:
            results["valid"] = False
        
        return results
    
    except Exception as e:
        logger.exception("Error in check_vpc_configuration")
        return {
            "valid": False,
            "issues": [f"Error checking VPC configuration: {str(e)}"],
            "recommendations": ["Check that the project directory is valid and accessible"]
        }
