# Deployer image for container-pipeline-verify. The Repo 1 build runs `npm ci` in the source directory
# before `docker build`, so node_modules is already in the build context: the image vendors the app and
# its dependencies and needs no registry access at deploy time.
FROM public.ecr.aws/docker/library/node:22-slim
WORKDIR /deployer
COPY . .
ENV PATH=/deployer/node_modules/.bin:$PATH
CMD ["cdk-cicd", "--help"]
