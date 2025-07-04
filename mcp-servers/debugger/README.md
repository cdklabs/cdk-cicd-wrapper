# CDK CI/CD Wrapper Debugger MCP Server

An MCP (Model Context Protocol) server providing specialized debugging tools for CDK CI/CD Wrapper applications.

## Overview

This MCP server provides a suite of tools for diagnosing and resolving common issues in CDK CI/CD Wrapper applications. It helps identify configuration problems, deployment failures, and environment setup issues that can occur when working with the CDK CI/CD Wrapper.

### Implementation Details

This server uses the standard MCP Server implementation from the Python MCP SDK:

- Uses `from mcp.server.fastmcp import FastMCP` for proper MCP server initialization
- Provides six specialized debugging tools
- Runs with stdio transport for direct communication with MCP clients

## Local Environment Requirements

Before installing and running the debugger MCP server, ensure your environment meets the following requirements:

- **Python 3.10+**: The server requires Python 3.10 or newer
- **pip or uv package manager**: For installing dependencies
- **AWS CLI**: Configured with appropriate profiles if you want to test AWS resource access
- **Cline AI extension**: Installed in VSCode
- **Git**: For cloning the repository (if needed)

For AWS functionality, the following environment should be configured:

- **AWS credentials**: Properly set up in `~/.aws/credentials` with necessary profiles
- **AWS region**: Configured in your environment or AWS config

## Installation & Running

Simply run the initialization script, which will:
1. Create a virtual environment (if it doesn't exist)
2. Install all required dependencies
3. Launch the MCP server

```bash
# Make the initialization script executable (if not already)
chmod +x init.sh

# Run the initialization script
./init.sh
```

You can also perform these steps manually:

```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install uv if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.cargo/bin:$PATH"

# Install dependencies using uv
uv pip install -r requirements.txt

# Run the server
python server.py
```

## Environment Variable Support

The debugger automatically loads environment variables from multiple sources:

1. **System environment variables** - Variables set in your current shell session
2. **.env files** - Loads from `.env`, `.env.local`, and `.env.development` files in the project directory
3. **Priority** - System environment variables take precedence over .env file variables

This follows the common developer practice of using `npx dotenv-cli` or similar tools to manage environment variables.

## Available Tools

### Configuration Analysis Tools

#### `check_comprehensive_config`

Performs a comprehensive configuration check for CDK CI/CD Wrapper projects, examining environment variables and configuration files to ensure all required parameters are properly set.

```python
check_comprehensive_config(project_path="/path/to/cdk-project")
```

#### `check_stage_definitions`

Verifies that stages are correctly defined through environment variables or code, ensuring account mappings are present and environment variables are set appropriately.

```python
check_stage_definitions(project_path="/path/to/cdk-project")
```

### Git Provider Tools

#### `check_git_provider`

Checks Git provider configuration (GitHub or CodeCommit) and validates connectivity. For CodeCommit, performs a connectivity test using the RES account credentials to ensure repositories can be accessed.

```python
check_git_provider(project_path="/path/to/cdk-project")
```

### CI/CD Configuration Tools

#### `check_ci_configuration`

Determines which CI system is being used (CodePipeline or GitHub Actions) and validates its configuration. For CodePipeline, analyzes the version, Docker base image, and CodeBuild environment settings.

```python
check_ci_configuration(project_path="/path/to/cdk-project")
```

### Plugin Analysis Tools

#### `check_plugins`

Identifies and analyzes any custom plugins used in the project, including potential security implications. Specifically highlights plugins that enable public access or other security-sensitive configurations.

```python
check_plugins(project_path="/path/to/cdk-project")
```

### Networking Configuration Tools

#### `check_vpc_configuration`

Validates VPC configuration in CDK CI/CD Wrapper projects and ensures all necessary proxy configurations are present when VPC proxy is enabled.

```python
check_vpc_configuration(project_path="/path/to/cdk-project")
```

## Configuring Cline AI for the CDK CI/CD Wrapper Debugger

To use this MCP server with Cline AI in VS Code, you need to configure the MCP server in the Cline AI extension settings. Here's a step-by-step guide:

### 1. Locate Your MCP Server Configuration File

The Cline AI MCP server configuration is typically located at `~/.config/cline/mcp-server-config.json`. If this file doesn't exist, you can create it with the appropriate directory structure.

### 2. Configure the MCP Server

Add the CDK CI/CD Wrapper Debugger server configuration to your MCP server configuration file. There are several approaches depending on your environment:

#### Option 1: Using the Repository Path

If you have the repository checked out:

```json
{
  "mcpServers": {
    "cdk-cicd-wrapper-debugger": {
      "command": "$SHELL",
      "args": [
        "-c",
        "cd $HOME/path/to/cdk-cicd-wrapper/mcp-servers/debugger && source .venv/bin/activate && python server.py"
      ],
      "disabled": false
    }
  }
}
```

Replace `$HOME/path/to/cdk-cicd-wrapper` with the actual path to your project.

#### Option 2: Using UV Package Manager

If you have UV installed:

```json
{
  "mcpServers": {
    "cdk-cicd-wrapper-debugger": {
      "command": "uv",
      "args": ["--directory", "$CURRENT_DIR/mcp-servers/debugger", "run", "server.py"],
      "disabled": false
    }
  }
}
```

#### Option 3: Using Current Directory with Relative Path

If the debugger is in your current working directory:

```json
{
  "mcpServers": {
    "cdk-cicd-wrapper-debugger": {
      "command": "python",
      "args": ["$CURRENT_DIR/mcp-servers/debugger/server.py"],
      "disabled": false
    }
  }
}
```

### 3. Using the Debugger with Cline AI

Once configured, you can use the debugger tools through Cline AI by opening your CDK CI/CD Wrapper project in VS Code and asking Cline AI to analyze your project. Here are some example prompts:

- "Can you use the cdk-cicd-wrapper-debugger to check my project configuration?"
- "Analyze my CDK CI/CD Wrapper project using the debugger tools."
- "Check for VPC configuration issues in my CDK CI/CD Wrapper project."

Cline AI will connect to the MCP server and use the appropriate tools to analyze your project.

### 4. Troubleshooting MCP Server Connection

If Cline AI cannot connect to the MCP server:

1. Verify that the path in your MCP server configuration is correct
2. Ensure the virtual environment is activated and all dependencies are installed
3. Check that the server script has execute permissions
4. Examine VS Code console logs for any error messages

## Usage Examples

### Example 1: Using with Cline AI

When using this MCP server with Cline AI, you can request analysis like this:

```
"Can you analyze my CDK CI/CD Wrapper project configuration using the debugger tools? 
The project is located at ./my-cdk-project"
```

Cline will then use the MCP tools to:
1. Check comprehensive configuration settings
2. Verify stage definitions
3. Validate Git provider configuration
4. Check CI/CD configuration
5. Analyze any custom plugins
6. Validate VPC and networking settings

### Example 2: Troubleshooting Configuration Issues

Ask Cline to diagnose specific configuration problems:

```
"My CDK CI/CD Wrapper project is having issues with VPC configuration. 
Can you diagnose what might be wrong?"
```

Cline will use the `check_vpc_configuration` tool to analyze the VPC setup and provide recommendations.

### Example 3: Complete Project Validation

Request a comprehensive analysis:

```
"Please perform a complete validation of my CDK CI/CD Wrapper project, 
including configuration, stages, Git provider, CI/CD setup, plugins, and VPC configuration."
```

## Common Debugging Workflows

### Workflow 1: Complete Project Validation

1. Check comprehensive configuration: `check_comprehensive_config(project_path="./project")`
2. Verify stage definitions: `check_stage_definitions(project_path="./project")`
3. Validate Git provider setup: `check_git_provider(project_path="./project")`
4. Check CI/CD configuration: `check_ci_configuration(project_path="./project")`
5. Analyze custom plugins: `check_plugins(project_path="./project")`
6. Validate VPC configuration: `check_vpc_configuration(project_path="./project")`

### Workflow 2: Troubleshooting Configuration Issues

1. Check comprehensive configuration: `check_comprehensive_config(project_path="./project")`
2. Identify specific problem areas from the comprehensive check
3. Run specialized tools for problem areas (e.g., `check_vpc_configuration` for VPC issues)
4. Follow recommendations provided by the tools

## Contributing

Contributions to enhance the debugging capabilities of this MCP server are welcome. Please ensure that any new tools follow the existing pattern and include proper error handling and documentation.

## License

Apache 2.0
