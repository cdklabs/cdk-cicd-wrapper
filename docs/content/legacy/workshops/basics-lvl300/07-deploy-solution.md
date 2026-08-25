# Deploy the Solution

Now that we are satisfied with our DemoStack implementation in the Workbench, it’s time to enable the feature flag and deploy it through the pipeline.

### Step 1: Enable the Feature Flag

Open the `cdk.json` file and add the following line to the context:

```json
"context": {
  "feature-streamlit": true,
  ...
}
```

### Step 2: Commit and Push the Changes

Let’s commit and push the changes to the repository so the pipeline can pick them up.

Run the following command to fix any linting issues:

```bash
npm run lint -- --fix
```

Add the changes to Git:

```bash
git add .
```

Commit the changes with a meaningful message:

```bash
git commit -m "feat: enable Streamlit feature flag"
```

Push the changes to the remote repository:

```bash
git push
```

> **Fantastic!** Your changes have been committed and pushed to the repository.

### Step 3: Monitor the Pipeline for Deployment

Once the changes are pushed, the pipeline will deploy the new streamlit application.

1. Go to the AWS CodePipeline service in the AWS Management Console.
2. Select the `cdk-cicd-example` pipeline.
3. Monitor the progress of the pipeline.

> **Awesome!** The deployment is in progress and soon your solution will be live.

<div class="workshop-congrats-box">
  <strong class="workshop-congrats-title">✓ Congratulations!</strong><br/>
You’ve successfully finished the workshop.
</div>

<a href="08-summary.html" class="md-button md-button--primary" style="background: green; border: green;">Finish</a>