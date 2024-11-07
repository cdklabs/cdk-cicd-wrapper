set -ex
npx cdk-assets --path "cdk-integ.out.integ.githubplugin.ts.snapshot/assembly-DEV/DEVinteggithubComplianceLogBucketStack2513C965.assets.json" --verbose publish "e06cb68a43bde3d15e34d50b15f5aed7b6b2f450860a9e8fb9a9d8c6977e871e:171469511505-us-east-1"
echo 'asset-hash=e06cb68a43bde3d15e34d50b15f5aed7b6b2f450860a9e8fb9a9d8c6977e871e' >> $GITHUB_OUTPUT