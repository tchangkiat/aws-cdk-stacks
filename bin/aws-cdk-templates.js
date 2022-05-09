#!/usr/bin/env node
require("dotenv").config();

const cdk = require("aws-cdk-lib");
const { StandardVpc } = require("../lib/StandardVpc");
const { MultiArchPipeline } = require("../lib/MultiArchPipeline");
const { ECS } = require("../lib/ECS");
const { EKS } = require("../lib/EKS");
const { CicdEcs } = require("../lib/CICD-ECS");
const { CicdEc2 } = require("../lib/CICD-EC2");
const { AdotEcsFargate } = require("../lib/AdotEcsFargate");

const app = new cdk.App();

new StandardVpc(app, "vpc", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new MultiArchPipeline(app, "mapl", {
  // github_connection_arn: Go to https://console.aws.amazon.com/codesuite/settings/connections to set up a connection to GitHub, fill up the ARN in .env
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
    github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN,
    github_owner: process.env.CDK_GITHUB_OWNER,
    github_repo: process.env.CDK_GITHUB_REPO,
  },
});

new ECS(app, "ecs", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new EKS(app, "eks", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new CicdEcs(app, "cicd-ecs", {
  // github_connection_arn: Go to https://console.aws.amazon.com/codesuite/settings/connections to set up a connection to GitHub, fill up the ARN in .env
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
    github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN,
    github_owner: process.env.CDK_GITHUB_OWNER,
    github_repo: process.env.CDK_GITHUB_REPO,
  },
});

new CicdEc2(app, "cicd-ec2", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
    github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN,
    github_owner: process.env.CDK_GITHUB_OWNER,
    github_repo: process.env.CDK_GITHUB_REPO2,
  },
});

new AdotEcsFargate(app, "adot-ecs", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
