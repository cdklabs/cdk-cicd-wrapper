# Develop a GenAI Solution with CDK CI/CD Workbench Part 2

In this section, we will continue developing the GenAI solution using the Workbench. We will create an AWS ECS Fargate task to run a [Streamlit](https://streamlit.io/) application that will host a Python web application to generate images using Amazon Bedrock.

## Enhance the Solution

### Step 1: Get your IP address

Before proceeding, we need to obtain your IP address to ensure that access to the application is restricted to only you.

1. **Open the following URL:** https://checkip.amazonaws.com/.

    This will display your current IP address.

2. **Note down your IP address**, as you will need it later to configure access restrictions for the application.

### Step 2: Create the Fargate Task Definition

We’ll start by enhancing the solution with an ECS Fargate task definition to run the Streamlit application.

1. **Open the file** `lib/demo-stack.ts` and add the following code after the ECS Cluster definition:

```typescript
const taskRole = new iam.Role(this, 'TaskRole', {
    assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    inlinePolicies: {
        BedrockInvokeModel: new iam.PolicyDocument({
        statements: [
            new iam.PolicyStatement({
            actions: ['bedrock:InvokeModel'],
            resources: [`arn:aws:bedrock:${cdk.Aws.REGION}::foundation-model/amazon.titan-image-generator-v1`],
            }),
        ],
        }),
    },
});

// Define a Fargate task definition
const fargateTaskDefinition = new ecs.FargateTaskDefinition(this, 'StreamlitAppTaskDef', {
    taskRole,
});

// Add container to task definition
const container = fargateTaskDefinition.addContainer('StreamlitContainer', {
    image: ecs.ContainerImage.fromAsset(path.resolve(__dirname, 'image_prompts'), { networkMode: ecrAsset.NetworkMode.custom('sagemaker') }),
    memoryLimitMiB: 512,
    cpu: 256,
    logging: new ecs.AwsLogDriver({ streamPrefix: 'streamlit-app' }),
});

// Expose the container on port 8501 (Streamlit default port)
container.addPortMappings({
    containerPort: 8501,
    protocol: ecs.Protocol.TCP,
});

// Create security group for ALB
const albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
    vpc: cluster.vpc,
    allowAllOutbound: true,
    description: 'Security group for ALB with restricted ingress',
});

for (const ip of allowedIPs) {
    albSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(ip),
        ec2.Port.tcp(80),
        `Allow HTTP from ${ip}`,
    );
}

// Create Fargate service in ECS
const loadBalancer = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'StreamlitFargateService', {
    cluster: cluster, // Required
    taskDefinition: fargateTaskDefinition,
    desiredCount: 1,
    publicLoadBalancer: true,
    openListener: false,
});

loadBalancer.loadBalancer.addSecurityGroup(albSecurityGroup);

nag.NagSuppressions.addResourceSuppressions(
    loadBalancer,
    [
        {
        id: 'AwsSolutions-ELB2',
        reason: 'ELB access logs',
        },
    ],
    true,
);

nag.NagSuppressions.addResourceSuppressions(fargateTaskDefinition, [{
    id: 'AwsSolutions-IAM5',
    reason: 'Allow * permissions.',
    appliesTo: ['Resource::*']
}], true);
```

2. **Add the following import statements** at the top of the file:

```typescript
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecrAsset from 'aws-cdk-lib/aws-ecr-assets';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as path from 'path';
import * as nag from 'cdk-nag';
```

3. **Add the following code** to the `allowedIPs` array in the `lib/demo-stack.ts` file:

```typescript
const allowedIPs = ['<your-ip-address>/32'];
```

> **Congratulations!** You've successfully defined the Fargate task to run the Streamlit app.

### Step 3: Create the Streamlit Application

Let’s create the Streamlit application that will interact with Amazon Bedrock for generating images.

#### Step 3.1: Create the Docker Setup

1. **Create a new directory** called `image_prompts` in the lib folder.

2. **Create a new file** called `Dockerfile` in the `image_prompts` folder.

3. **Add the following content** to the `Dockerfile`:

```Dockerfile
--8<----
content/workshops/basics-lvl300/assets/code/Dockerfile
--8<----
```

> **Well done!** The Docker setup for the Streamlit app is complete.

#### Step 3.2: Define Dependencies and Application Code

1. **Create a new file** called `Pipfile` in the `image_prompts` folder.
2. **Add the following content** to the `Pipfile`:

```toml
--8<----
content/workshops/basics-lvl300/assets/code/Pipfile
--8<----
```

3. **Create a new file** called `Pipfile.lock` in the `image_prompts` folder.
Open a terminal and run the following command to generate the `Pipfile.lock` file:

```bash
cd lib/image_prompts && pipenv lock && cd ../..
```

> **Nice work!** The dependencies for the Streamlit app have been set up.

#### Step 3.3: Add the Streamlit Application Logic

1. **Create a new file** called `image_prompts_app.py` in the `image_prompts` folder.
2. **Add the following content** to `image_prompts_app.py`:

```python
--8<----
content/workshops/basics-lvl300/assets/code/image_prompts_app.py
--8<----
```

> **Awesome!** The Streamlit application is ready to generate images.

#### Step 3.4: Create the Helper Library

1. **Create a new file** called `image_prompts_lib.py` in the `image_prompts` folder.
2. **Add the following content** to `image_prompts_lib.py`:

```python
--8<----
content/workshops/basics-lvl300/assets/code/image_prompts_lib.py
--8<----
```

> **Fantastic!** The helper library is in place to interact with AWS Bedrock.

### Step 4: Deploy the Workbench

Run the following command to deploy the Workbench environment:

```bash
npm run workbench deploy -- --all
```

> **Well done!** The Workbench has been successfully deployed.

### Step 5: Verify the Deployment

The deployment process may take a few minutes. Once it's complete, the LoadBalancer URL will be displayed in the terminal.

1. **Open the LoadBalancer URL** in your browser to verify the deployment. The Streamlit application should be accessible.

> **Congratulations!** Your application is up and running.


## Introduce Feature Flag

Now, we need to introduce a feature flag to control whether the Streamlit application should be deployed. This allows us to work on the feature without immediately deploying it through the pipeline.

### Step 6: Add the Feature Flag to Control the Streamlit App

1. **Open the `lib/demo-stack.ts` file** and wrap the Streamlit app logic inside a feature flag check. The feature flag allows us to selectively enable or disable the deployment of the Streamlit app:

    ```typescript
    if (cdk.FeatureFlags.of(this).isEnabled('feature-streamlit')) {
        wrapper.logger.info('Feature Streamlit is enabled');

        const taskRole = new iam.Role(this, 'TaskRole', {
        // ... Streamlit app definition
        });

        nag.NagSuppressions.addResourceSuppressions(fargateTaskDefinition.executionRole!, [{
            id: 'AwsSolutions-IAM5',
            reason: 'Allow * permissions.',
            appliesTo: ['Resource::*']
        }], true);
    }
    ```

2. **Import** the CDK CI/CD Wrapper module at the top of the file:

    ```typescript
    import * as wrapper from '@cdklabs/cdk-cicd-wrapper';
    ```

??? "Show Solution"
    The `lib/demo-stack.ts` file should look like this:
    ```typescript
    --8<----
    content/workshops/basics-lvl300/assets/code/02-demo-stack.ts
    --8<----
    ```

> **Great job!** The Streamlit app is now controlled by a feature flag.

### Step 7: Test the Feature Flag

Let’s test if the feature flag works as expected.

1. **Run the following command** to synthesize the CDK code **without** the feature flag:

    ```bash
    npm run workbench synth
    ```

2. Notice there is no log about the Streamlit app in the console.

3. **Now enable the feature flag** by running this command:

    ```bash
    npm run workbench synth -- --context feature-streamlit=true
    ```

4. You should see a log message indicating that the Streamlit app feature is enabled:

    ```
    [Info at /sagemaker-user-cdk-cicd-example] Feature Streamlit is enabled
    ```

> **Fantastic!** The feature flag works as expected.

### Step 8: Enable the Feature Flag by Default in Workbench

If we want to enable the feature flag by default in the Workbench environment, we can set it in the pipeline configuration.

1. **Open the `bin/cdk-cicd-example.ts` file** and update the Workbench configuration:

    ```typescript
    .workbench({
        provide(context) {
          context.scope.node.setContext('feature-streamlit', true);
          new DemoStack(context.scope, 'DemoStack', { env: context.environment });
        },
    })
    ```

> **Well done!** The feature flag is now enabled by default in the Workbench.

??? "Show Solution"
    The `bin/cdk-cicd-example.ts` file should look like this:
    ```typescript
    --8<----
    content/workshops/basics-lvl300/assets/code/05-cdk-cicd-example.ts
    --8<----
    ```

### Step 9: Commit and Push the Changes

1. **Run** the following command to fix any linting issues:

    ```bash
    npm run lint -- --fix
    ```

2. **Run** the following commands to update the license and validate the package.json:

    ```bash
    npm run audit:license -- --fix
    npm run validate -- --fix
    ```

3. **Add** the changes to Git:

    ```bash
    git add .
    ```

4. **Commit** the changes with a meaningful message:

    ```bash
    git commit -m "feat: add feature flag for Streamlit"
    ```

5. **Push** the changes to the repository:

    ```bash
    git push
    ```

<div class="workshop-congrats-box">
  <strong class="workshop-congrats-title">✓ Congratulations!</strong><br/>
You’ve successfully prepared the Streamlit app for deployment using a feature flag.
</div>

Click **Next** to continue to the next section.

<a href="07-deploy-solution.html" class="md-button">Next</a>