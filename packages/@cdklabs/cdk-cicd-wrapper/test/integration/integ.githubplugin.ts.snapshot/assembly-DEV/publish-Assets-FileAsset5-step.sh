set -ex
npx cdk-assets --path "cdk-integ.out.integ.githubplugin.ts.snapshot/assembly-DEV/DEVteststack293BC6DC.assets.json" --verbose publish "e8a8d0905d295cad1a90ff3db79cb852f9b060f0889ba029768db86e9f71d950:171469511505-us-east-1"
echo 'asset-hash=e8a8d0905d295cad1a90ff3db79cb852f9b060f0889ba029768db86e9f71d950' >> $GITHUB_OUTPUT