set -ex
npx cdk-assets --path "cdk-integ.out.integ.githubplugin.ts.snapshot/assembly-DEV/DEVinteggithubEncryptionStackE5A0ACCE.assets.json" --verbose publish "ada9d5d9731e0e246f819f36211b3e1886554c6b7cd70cf2174dfaa0a84e3b55:171469511505-us-east-1"
echo 'asset-hash=ada9d5d9731e0e246f819f36211b3e1886554c6b7cd70cf2174dfaa0a84e3b55' >> $GITHUB_OUTPUT