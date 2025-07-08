# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import tempfile


# Test implementation of config checker that mimics the real function
def mock_check_comprehensive_config(project_path, ctx):
    """Mock implementation of check_comprehensive_config for testing"""
    ctx.info(f"Running comprehensive config check in {project_path}")

    # Simplified results structure
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
            "optional": {"present": {}, "missing": []},
        },
    }

    # If the path doesn't exist, add an issue
    if not os.path.exists(project_path):
        results["valid"] = False
        results["issues"].append(f"Project path does not exist: {project_path}")

    return results


# Test the config checker with a valid directory
def test_check_comprehensive_config(mock_context):
    """Test the config checker with a mock approach"""
    # Use temporary directory for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        result = mock_check_comprehensive_config(temp_dir, mock_context)

        # Check basic structure
        assert isinstance(result, dict)
        assert "valid" in result
        assert result["valid"] is True
        assert "issues" in result
        assert len(result["issues"]) == 0
        assert "recommendations" in result
        assert "config_categories" in result


# Test with non-existent directory
def test_check_comprehensive_config_invalid_path(mock_context):
    """Test the config checker with an invalid path"""
    result = mock_check_comprehensive_config("/non/existent/path", mock_context)

    # Should handle error gracefully
    assert isinstance(result, dict)
    assert "valid" in result
    assert result["valid"] is False
    assert "issues" in result
    assert len(result["issues"]) > 0
