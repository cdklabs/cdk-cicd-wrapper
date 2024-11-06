
# Introduction & Overview

## Welcome

Welcome to the workshop on leveraging the **GitHub Pipeline Plugin** with the **CDK CI/CD Wrapper**. In this session, you'll learn how to seamlessly integrate your **GitHub** repositories with **GitHub Actions** to automate the deployment of AWS CDK applications to AWS environments. This workshop is designed to demonstrate how the plugin simplifies the continuous integration and deployment process by connecting GitHub and AWS.

We are excited to help you explore how this new plugin can supercharge your CI/CD workflows!

---

## Target Audience

This workshop is aimed at:

- **Developers**, **DevOps engineers**, and **Cloud engineers** who are managing their AWS infrastructure using AWS CDK.
- Teams that host their source code on **GitHub** and are looking to leverage **GitHub Actions** for continuous delivery of AWS applications.
- Individuals who are already familiar with CI/CD workflows and are interested in optimizing AWS deployments through **GitHub Actions**.

You should have prior experience with AWS CDK and be familiar with developing or maintaining cloud applications using CDK.

- **Expected Completion Time**: 45 minutes

---

## Background Knowledge

To get the most out of this workshop, the following knowledge is recommended:

- **AWS CDK**: Familiarity with creating, maintaining, and deploying cloud infrastructure using AWS CDK.
- **GitHub & GitHub Actions**: Basic understanding of how GitHub repositories and GitHub Actions work to automate workflows.
- **CI/CD Concepts**: Knowledge of continuous integration and continuous deployment practices, including automated testing and deployments.
- **AWS Accounts & Services**: You should have access to an AWS account and be familiar with core services like **AWS IAM**, **AWS CodePipeline**, **AWS CloudFormation**, and **AWS IAM Roles**.

---

## What You Will Learn

By the end of this workshop, you will learn how to:

- Use the **GitHub Pipeline Plugin** to connect **GitHub** repositories to the **CDK CI/CD Wrapper** for seamless deployment to AWS accounts.
- Create a GitHub Actions pipeline that automatically deploys your AWS CDK applications.
- Manage multi-account AWS deployments with ease through GitHub Actions.
- Implement security best practices while using GitHub to manage CI/CD workflows in AWS.

---

## Architecture Overview

In this workshop, we will deploy a multi-stage pipeline for an AWS CDK application using **GitHub Actions**. Here’s a high-level overview of the architecture:

1. **GitHub Repository**: Hosts the source code of your AWS CDK application.
2. **GitHub Actions**: Used to automate the testing, building, and deployment of the application to AWS environments.
3. **AWS CDK CI/CD Wrapper**: Manages the continuous integration and deployment of the AWS CDK application across multiple AWS accounts (DEV, INT, PROD).
4. **AWS Accounts**: The deployment targets where the AWS CDK application will be provisioned, using GitHub Actions for each stage of the pipeline (DEV, INT, PROD).

![GitHub Pipeline Plugin Architecture](path_to_your_architecture_diagram)

Click on start to begin the workshop.

<a href="00-prerequisites.html" class="md-button">Start</a>