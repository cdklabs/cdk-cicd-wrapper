# MCP Tools

The CDK CI/CD Wrapper provides specialized **[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) Tools** that integrate seamlessly with AI-powered development assistants to help diagnose, troubleshoot, and optimize your CDK CI/CD Wrapper applications.

## What is MCP?

The Model Context Protocol (MCP) is an open standard that enables AI assistants to securely access external tools and data sources. MCP servers provide specialized capabilities that can be accessed by any MCP-compatible client, including popular AI coding assistants.

## Available MCP Tools

### Debugger Server

The **CDK CI/CD Wrapper Debugger** is a specialized MCP server that provides comprehensive debugging and validation tools for CDK CI/CD Wrapper projects.

**Key Features:**
- 🔧 **Comprehensive Configuration Analysis** - Validates all environment variables and configuration files
- 📊 **Stage Definition Verification** - Checks deployment stage configurations and account mappings
- 🔗 **Git Provider Configuration** - Validates GitHub/CodeCommit setup and connectivity
- ⚙️ **CI/CD Configuration Analysis** - Analyzes CodePipeline or GitHub Actions configuration
- 🔌 **Plugin Security Analysis** - Identifies custom plugins and security implications
- 🌐 **VPC Configuration Validation** - Ensures proper VPC and networking setup

[Learn more about the Debugger →](debugger.md) | [View Source Code →](https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/mcp-servers/debugger)

## Compatible MCP Clients

The MCP tools work with any [MCP-compatible client](https://modelcontextprotocol.io/clients), including:

- **[Amazon Q CLI](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line.html)** - Amazon's AI-powered command-line assistant
- **[Cline](https://cline.bot/)** - The Collaborative AI Coder for VS Code
- **Any other [MCP-compatible client](https://modelcontextprotocol.io/clients)** - Following the standard MCP protocol

## Getting Started

To get started with MCP tools:

1. **Choose an MCP Client** - Install one of the compatible clients (we recommend Cline for VS Code)
2. **Configure the MCP Server** - Set up the connection to the CDK CI/CD Wrapper MCP server
3. **Start Debugging** - Ask your AI assistant to analyze your CDK CI/CD Wrapper project

Example usage with any MCP-compatible AI assistant:

```
"Can you use the cdk-cicd-wrapper-debugger to check my project configuration?"
```

The AI assistant will automatically connect to the MCP server and provide comprehensive analysis and recommendations.

## Benefits

- **AI-Powered Troubleshooting** - Work with AI assistants to quickly identify and resolve issues
- **Comprehensive Validation** - Run complete health checks on your projects
- **Proactive Issue Detection** - Catch problems before they cause deployment failures
- **Security Analysis** - Identify potentially unsafe configurations and security risks
- **Environment Validation** - Ensure proper setup of all required components
