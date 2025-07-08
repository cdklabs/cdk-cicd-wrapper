# CDK CI/CD Wrapper Debugger MCP Server

An MCP (Model Context Protocol) server providing specialized debugging tools for CDK CI/CD Wrapper applications.

**[📂 View Source Code →](https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/mcp-servers/debugger)**

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
- **Cline extension**: Installed in VSCode
- **Git**: For cloning the repository (if needed)

For AWS functionality, the following environment should be configured:

- **AWS credentials**: Properly set up in `~/.aws/credentials` with necessary profiles
- **AWS region**: Configured in your environment or AWS config

## Scripts

The debugger includes several utility scripts to streamline development and testing:

### `scripts/init.sh`

Initializes the development environment by:
1. Creating a Python virtual environment (if it doesn't exist)
2. Installing the `uv` package manager (if not already installed)
3. Installing all dependencies from requirements.txt

```bash
# Make the initialization script executable (if not already)
chmod +x scripts/init.sh

# Run the initialization script
./scripts/init.sh
```

### `scripts/start.sh`

Starts the MCP server:
1. Checks if the virtual environment exists (prompts to run init.sh if not)
2. Activates the virtual environment
3. Launches the MCP server

```bash
# Make the script executable (if not already)
chmod +x scripts/start.sh

# Start the MCP server
./scripts/start.sh
```

### `scripts/test.sh`

Runs the test suite with coverage reporting:
1. Creates a .coveragerc file with specific settings
2. Runs pytest on the entire test suite
3. Generates coverage reports for server.py and tools/
4. Ensures a minimum coverage threshold (currently 50%)
5. Displays which lines are missing coverage

```bash
# Make the script executable (if not already)
chmod +x scripts/test.sh

# Run the tests
./scripts/test.sh
```

### `scripts/lint.sh`

Formats the Python code using Black:
1. Checks if the virtual environment exists
2. Formats all Python code in tools/, tests/, and server.py

```bash
# Make the script executable (if not already)
chmod +x scripts/lint.sh

# Format the code
./scripts/lint.sh
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

## Configuring MCP Clients for the CDK CI/CD Wrapper Debugger

This MCP server can be used with any MCP-compatible client. Below are configuration instructions for popular clients:

### Compatible MCP Clients

- **[Amazon Q CLI](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line.html)** - Amazon's AI-powered command-line assistant ([Installation Guide](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-getting-started-installing.html))
- **[Cline](https://cline.bot/)** - The Collaborative AI Coder. Experience an AI development partner that amplifies your engineering capabilities
- **Any other [MCP-compatible client](https://modelcontextprotocol.io/clients)** - The server follows the standard [MCP protocol specification](https://spec.modelcontextprotocol.io/)

### Configuring Cline (VS Code Extension)

To use this MCP server with Cline in VS Code, you need to configure the MCP server in the Cline extension settings. Here's a step-by-step guide:

### 1. Locate Your MCP Server Configuration File

The MCP server configuration is typically located at `$HOME/path/to/cdk-cicd-wrapper/mcp-servers/debugger/mcp-server-config.json`. If this file doesn't exist, you can create it running `task samples:dev:generate-mcp-config`

### 2. Configure the MCP Server

Add the CDK CI/CD Wrapper Debugger server configuration to your MCP server configuration file. We use the approach with UV as the most convenient:

#### Using UV Package Manager

If you have UV installed:

```json
{
  "mcpServers": {
    "cdk-cicd-wrapper-debugger": {
      "autoApprove": [],
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "uv",
      "args": ["--directory", "$CURRENT_DIR/mcp-servers/debugger", "run", "server.py"],
      "env": {}
    }
  }
}
```

### 3. Using the Debugger with Cline

Once configured, you can use the debugger tools through Cline by opening your CDK CI/CD Wrapper project in VS Code and asking Cline to analyze your project. Here are some example prompts:

- "Can you use the cdk-cicd-wrapper-debugger to check my project configuration?"
- "Analyze my CDK CI/CD Wrapper project using the debugger tools."
- "Check for VPC configuration issues in my CDK CI/CD Wrapper project."

Cline will connect to the MCP server and use the appropriate tools to analyze your project.

### Configuring Amazon Q CLI

Amazon Q CLI can also connect to this MCP server. Here's how to configure it:

#### 1. Install Amazon Q CLI

If you haven't already, install Amazon Q CLI following the official AWS documentation.

#### 2. Configure MCP Server for Amazon Q

Create or update your Amazon Q CLI MCP configuration. The exact configuration method may vary depending on your Amazon Q CLI version, but typically involves:

```bash
# Example configuration for Amazon Q CLI
# (Please refer to the latest Amazon Q CLI documentation for exact syntax)
q configure mcp add \
  --name cdk-cicd-wrapper-debugger \
  --command "python" \
  --args "$HOME/path/to/cdk-cicd-wrapper/mcp-servers/debugger/server.py"
```

#### 3. Using with Amazon Q CLI

Once configured, you can interact with the debugger through Amazon Q CLI:

```bash
# Example usage (syntax may vary based on Amazon Q CLI version)
q chat "Use the cdk-cicd-wrapper-debugger to analyze my CDK project at ./my-project"
```

#### 4. Troubleshooting MCP Server Connection

If your MCP client cannot connect to the server:

1. Verify that the path in your MCP server configuration is correct
2. Ensure the virtual environment is activated and all dependencies are installed
3. Check that the server script has execute permissions
4. Examine client console logs for any error messages
5. Test the server manually by running `python server.py` in the debugger directory

## Usage Examples

### Example 1: Using with Cline

When using this MCP server with Cline, you can request analysis like this:

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

## Test Coverage

The debugger includes comprehensive test coverage for all components:

### Testing Framework

- Uses pytest for running tests
- Implements coverage reporting with pytest-cov
- Currently enforces a minimum coverage threshold of 50%
- Configuration defined in .coveragerc

### Test Suite Organization

The test suite covers:

1. **Server Components**
   - Server initialization and registration (`test_server.py`, `test_server_registration.py`)
   - Server helper functions (`test_server_helpers.py`)
   - MCP integration (`test_mcp_integration.py`)

2. **Debugging Tools**
   - CI Checker (`test_ci_checker_comprehensive.py`, `test_ci_configuration.py`)
   - Configuration Checker (`test_comprehensive_config.py`)
   - Git Provider (`test_git_provider.py`)
   - Plugin Analysis (`test_plugins.py`)
   - Stage Definitions (`test_stage_definitions.py`)
   - VPC Configuration (`test_vpc_configuration.py`, `test_vpc_language_support.py`)
   - Tool Mocking (`test_tools_mock.py`)

### Running the Tests

```bash
# Run the full test suite with coverage reporting
./scripts/test.sh
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
