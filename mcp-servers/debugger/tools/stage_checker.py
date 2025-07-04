#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import re
import logging
from typing import Dict, List

from mcp.server.fastmcp import Context

logger = logging.getLogger("cdk-cicd-wrapper-debugger")

async def check_stage_definitions(
    project_path: str,
    ctx: Context
) -> Dict:
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
            "missing_variables": []
        }
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
        
        # Look for stage definitions in entry files (optional method)
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
        
        defined_stages_in_code = []
        
        # Analyze each potential entry file for .defineStages (optional)
        for file_path in entry_files:
            try:
                with open(file_path, 'r') as f:
                    content = f.read()
                
                # Check for defineStages method
                define_stages_match = re.search(r'\.defineStages\(\[(.*?)\]\)', content, re.DOTALL)
                if define_stages_match:
                    stages_content = define_stages_match.group(1)
                    # Extract stage names
                    stage_matches = re.findall(r'[\'"]([A-Z]+)[\'"]', stages_content)
                    if stage_matches:
                        defined_stages_in_code.extend(stage_matches)
            
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
                results["issues"].append(f"Stage '{stage}' defined in code but ACCOUNT_{stage} environment variable is missing")
        
        # Core validation: ensure at least one stage is defined
        if not stage_env_vars and not defined_stages_in_code:
            results["issues"].append("No stages defined. Define stages using environment variables (ACCOUNT_*) or .defineStages() in code")
            results["recommendations"].append("Set ACCOUNT_RES environment variable as the minimum required stage")
        else:
            # Check for required RES stage
            if "RES" not in stage_env_vars and "RES" not in defined_stages_in_code:
                missing_vars.append("ACCOUNT_RES")
                results["issues"].append("Missing required RES stage. Set ACCOUNT_RES environment variable")
                results["recommendations"].append("Set ACCOUNT_RES environment variable - this is the required resource/management stage")
        
        # Store missing variables
        results["stages"]["missing_variables"] = missing_vars
        
        # Provide guidance on approach
        if defined_stages_in_code and stage_env_vars:
            results["recommendations"].append("Both .defineStages() and environment variables found. Environment variables will take precedence")
        elif defined_stages_in_code and not stage_env_vars:
            results["recommendations"].append("Using .defineStages() in code. Consider using environment variables (ACCOUNT_*) for easier configuration management")
        elif stage_env_vars and not defined_stages_in_code:
            results["recommendations"].append("Using environment variables for stage definitions - this is the recommended approach")
        
        if missing_vars:
            results["recommendations"].append(f"Set missing environment variables: {', '.join(missing_vars)}")
        
        # Mark as invalid if issues were found
        if results["issues"]:
            results["valid"] = False
        
        return results
    
    except Exception as e:
        logger.exception("Error in check_stage_definitions")
        return {
            "valid": False,
            "issues": [f"Error checking stage definitions: {str(e)}"],
            "recommendations": ["Check that the project directory is valid and accessible"]
        }
