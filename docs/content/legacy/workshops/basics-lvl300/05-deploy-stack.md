# Deploy Stack with the Pipeline

Now that we are satisfied with our **DemoStack** implementation in the Workbench, it’s time to deploy it through the pipeline. 

## Update the Pipeline to Include the DemoStack

This time, we will use the **BaseStackProvider** class, which helps maintain cleaner and more manageable code.

### Step 1: Create the DemoProvider Class

We’ll begin by creating a `bin/demo-provider.ts` file that will use the `BaseStackProvider` class to provide the DemoStack.

1. **Create** a file named `bin/demo-provider.ts`.
2. **Add** the following content to the file:

```typescript
--8<----
content/workshops/basics-lvl300/assets/code/00-demo-provider.ts
--8<----
```

> **Congratulations!** You’ve successfully created the `DemoProvider` class to manage the deployment of the `DemoStack`.

### Step 2: Add the DemoProvider to the Pipeline

Next, we will modify the `bin/cdk-cicd-example.ts` file to include the **DemoProvider**.

1. **Open** the `bin/cdk-cicd-example.ts` file.
2. **Add** the following line to include the DemoProvider class:

    ```typescript
    .addStack(new DemoProvider())
    ```
3. **Import** the `DemoProvider` class at the top of the file:

    ```typescript
    import { DemoProvider } from './demo-provider';
    ```

> **Great work!** You’ve successfully updated the pipeline to include the **DemoProvider** class.

??? "Show Solution"
    The `bin/cdk-cicd-example.ts` file should look like this:
    ```typescript
    --8<----
    content/workshops/basics-lvl300/assets/code/04-cdk-cicd-example.ts
    --8<----
    ```

### Step 3: Commit and Push the Changes

Let’s commit and push the changes to the repository so the pipeline can pick them up.

1. **Run** the following command to fix any linting issues:

    ```bash
    npm run lint -- --fix
    ```

2. **Add** the changes to Git:

    ```bash
    git add .
    ```

3. **Commit** the changes with a meaningful message:

    ```bash
    git commit -m "feat: include DemoStack in CD"
    ```

4. **Push** the changes to the remote repository:

    ```bash
    git push
    ```

> **Fantastic!** Your changes have been committed and pushed to the repository.

### Step 4: Monitor the Pipeline for Deployment

Once the changes are pushed, the pipeline will update, and a new **DEV stage** will appear for deploying the **DemoStack**.

1. **Go to** the AWS CodePipeline service in the AWS Management Console.
2. **Select** the `cdk-cicd-example` pipeline.
3. **Monitor** the progress of the pipeline. The **UpdatePipeline** step will update the pipeline configuration to include the new DEV stage.

<div class="workshop-congrats-box">
  <strong class="workshop-congrats-title">✓ Congratulations!</strong><br/>
You’ve successfully integrated the **DemoStack** into the pipeline.
</div>

Click **Next** to continue to the next section.

<a href="06-develop-genai-solution-part-2.html" class="md-button">Next</a>