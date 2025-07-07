# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import json
import tempfile
from unittest.mock import patch, mock_open

# Import the helper functions from server
from server import load_package_json, load_env_variables


class TestServerHelpers:
    """Test class for server helper functions"""

    def test_load_package_json_valid(self):
        """Test loading a valid package.json file"""
        # Create a temporary directory with a package.json file
        with tempfile.TemporaryDirectory() as temp_dir:
            package_data = {
                "name": "test-project",
                "version": "1.0.0",
                "config": {"repositoryType": "github"},
            }

            # Write the test package.json file
            package_path = os.path.join(temp_dir, "package.json")
            with open(package_path, "w") as f:
                json.dump(package_data, f)

            # Test loading the file
            result = load_package_json(temp_dir)

            # Verify the results
            assert result == package_data
            assert result.get("name") == "test-project"
            assert result.get("config", {}).get("repositoryType") == "github"

    def test_load_package_json_nonexistent(self):
        """Test loading a non-existent package.json file"""
        # Use a non-existent path
        result = load_package_json("/path/does/not/exist")

        # Verify an empty dict is returned
        assert result == {}

    def test_load_package_json_invalid(self):
        """Test loading an invalid package.json file"""
        # Create a temporary directory with an invalid JSON file
        with tempfile.TemporaryDirectory() as temp_dir:
            package_path = os.path.join(temp_dir, "package.json")
            with open(package_path, "w") as f:
                f.write("This is not valid JSON")

            # Test loading the invalid file
            result = load_package_json(temp_dir)

            # Verify an empty dict is returned due to the error
            assert result == {}

    def test_load_package_json_none(self):
        """Test loading package.json with None path"""
        result = load_package_json(None)
        assert result == {}

    def test_load_env_variables_no_project(self):
        """Test loading env variables without a project path"""
        # Mock the OS environment
        with patch.dict(os.environ, {"TEST_VAR": "test_value"}, clear=True):
            result = load_env_variables()

            # Verify the env vars from os.environ are included
            assert result["TEST_VAR"] == "test_value"
            assert len(result) == 1

    def test_load_env_variables_with_env_file(self):
        """Test loading env variables with an .env file"""
        # Create a temporary directory with an .env file
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create .env file
            env_path = os.path.join(temp_dir, ".env")
            with open(env_path, "w") as f:
                f.write("ENV_VAR1=value1\nENV_VAR2=value2\n# Comment line\n")

            # Mock the dotenv.load_dotenv function to do nothing
            # The actual parsing is done manually in the function
            with patch("server.load_dotenv"):
                with patch.dict(os.environ, {"OS_VAR": "os_value"}, clear=True):
                    result = load_env_variables(temp_dir)

                    # Verify the env vars are loaded
                    assert result["ENV_VAR1"] == "value1"
                    assert result["ENV_VAR2"] == "value2"
                    assert result["OS_VAR"] == "os_value"
                    assert len(result) == 3

    def test_load_env_variables_multiple_files(self):
        """Test loading env variables from multiple .env files"""
        # Create a temporary directory with multiple .env files
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create multiple .env files
            env_path = os.path.join(temp_dir, ".env")
            with open(env_path, "w") as f:
                f.write("ENV_VAR1=value1\n")

            local_env_path = os.path.join(temp_dir, ".env.local")
            with open(local_env_path, "w") as f:
                f.write("ENV_VAR2=value2\n")

            dev_env_path = os.path.join(temp_dir, ".env.development")
            with open(dev_env_path, "w") as f:
                f.write("ENV_VAR3=value3\n")

            # Mock the dotenv.load_dotenv function
            with patch("server.load_dotenv"):
                result = load_env_variables(temp_dir)

                # Verify the env vars from all files are loaded
                assert result["ENV_VAR1"] == "value1"
                assert result["ENV_VAR2"] == "value2"
                assert result["ENV_VAR3"] == "value3"

    def test_load_env_variables_error_handling(self):
        """Test error handling in load_env_variables"""
        # Create a temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create .env file that won't be read due to mocked open exception
            env_path = os.path.join(temp_dir, ".env")
            with open(env_path, "w") as f:
                f.write("ENV_VAR1=value1\n")

            # Set up mock environment variables for the test
            mock_env = {"OS_VAR": "os_value"}

            # Mock builtins.open to raise an exception when reading .env file
            # But use contextlib to ensure the original open is used for other files
            mock_file = mock_open()
            mock_file.side_effect = Exception("File error")

            with patch.dict(os.environ, mock_env, clear=True):
                with patch("server.load_dotenv"):
                    with patch("builtins.open", mock_file):
                        # The function should handle the exception and return just the OS env vars
                        result = load_env_variables(temp_dir)

                        # Verify we got just the OS environment variables
                        assert isinstance(result, dict)
                        assert "OS_VAR" in result
                        assert result["OS_VAR"] == "os_value"
                        assert (
                            "ENV_VAR1" not in result
                        )  # Should not be there due to exception
