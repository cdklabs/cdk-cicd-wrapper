# Introduction & Overview

**Welcome, and thank you for joining us!**

We are excited to have you here to learn more about the **CDK CI/CD Wrapper**, a powerful tool designed to streamline your CI/CD processes using AWS CDK.

## Target Audience
This workshop is tailored for builders such as:

- Software Developers
- DevOps Engineers
- Cloud Engineers

You should have prior experience with AWS CDK and be familiar with developing or maintaining cloud applications using CDK.

- **Expected Completion Time**: 1.5 hours

## Background Knowledge
To successfully complete this workshop, it’s recommended that you have knowledge of the following:

- **TypeScript/JavaScript**
- **Basic Python**
- **Linux and Bash scripting**
- **Infrastructure-as-Code (IaC) with AWS CDK**

## What You Will Learn
In this workshop, we will guide you through the following steps:

1. **Creating a CDK Project & Bootstrapping the AWS Account**  
   Learn how to initiate and configure your AWS environment for CDK development.

2. **Defining Quality Gates and Continuous Integration**  
   Establish quality controls and build automation processes to ensure code quality and efficiency.

3. **Creating a Pipeline and Enabling GitOps**  
   Set up a CI/CD pipeline and integrate GitOps to streamline deployment workflows.

4. **Developing with Workbench**  
   Utilize the Workbench environment to accelerate development and testing workflows.

5. **Building a GenAI Solution**  
   Deliver a Generative AI solution from start to end, incorporating it into your CI/CD pipeline for seamless deployment.

6. **Putting Everything Together**  
   Combine all components to build a production-ready CI/CD pipeline that’s scalable and efficient.

## Architecture Overview

Before we dive in, here’s an architecture diagram of the CDK CI/CD Wrapper to ensure you’re familiar with the outcome.

![CDK CI/CD Wrapper Architecture](./assets/architecture.png){: class="workshop-image"}

The diagram illustrates how AWS services like CodeCommit, CodePipeline, and CloudFormation work together to automate the CI/CD process across different accounts, integrating security, compliance, and automation tools such as Amazon KMS, CodeGuru, and S3.

**Disclaimer**: In this workshop, we are using **AWS CodeCommit** for simplicity and to demonstrate the core concepts of the CDK CI/CD Wrapper. However, the **CDK CI/CD Wrapper** is highly flexible and can be integrated with any third-party repository management system that supports **AWS CodeConnections**, such as GitHub, GitLab, or Bitbucket.

### Demo application: Image Generation using Amazon Bedrock

In this workshop, you will be deploying a demo application powered by AWS Fargate and AWS Bedrock using the CDK CI/CD Wrapper. Below is a high-level architectural overview of the demo application:

![Demo Application](./assets/00-images/cdk-cicd-demoapp.png){: class="workshop-image"}

**Key Components**:

- Application Load Balancer: This component manages incoming traffic and distributes it to the underlying Fargate tasks. It ensures that your application is highly available and scalable by routing requests efficiently.

- AWS Fargate (Streamlit Application): The main application is hosted as a Streamlit web app on AWS Fargate, a serverless compute engine that runs containers. Fargate abstracts the server management, allowing us to focus on the application logic.

- Amazon Bedrock: The backend logic interacts with Amazon Bedrock to power the generative AI capabilities. The Streamlit app communicates with Amazon Bedrock to generate images based on user-provided prompts.


Click on start to begin the workshop.

<a href="00-prerequisites.html" class="md-button">Start</a>