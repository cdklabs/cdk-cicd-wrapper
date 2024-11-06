set -ex
npx cdk-assets --path "cdk-integ.out.integ.githubplugin.ts.snapshot/assembly-DEV/DEVinteggithubComplianceLogBucketStack2513C965.assets.json" --verbose publish "a91e86267c79b6182b4bdb27ac0818e4a79466f45f96d294b782ca0ef12fa26f:171469511505-us-east-1"
echo 'asset-hash=a91e86267c79b6182b4bdb27ac0818e4a79466f45f96d294b782ca0ef12fa26f' >> $GITHUB_OUTPUT