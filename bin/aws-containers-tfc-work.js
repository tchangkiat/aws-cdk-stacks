#!/usr/bin/env node
require('dotenv').config();

const cdk = require('aws-cdk-lib');
const { StandardVpc } = require('../lib/StandardVpc');
const { Homework1 } = require('../lib/Homework1');
const { Homework2 } = require('../lib/Homework2');
const { EKS } = require('../lib/EKS');
const { AdotEcsFargate } = require('../lib/AdotEcsFargate');
const { MultiArchPipeline } = require('../lib/MultiArchPipeline');

const app = new cdk.App();

new StandardVpc(app, 'vpc', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

new Homework1(app, 'hw1', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

new Homework2(app, 'hw2', {
  // github_connection_arn: Go to https://console.aws.amazon.com/codesuite/settings/connections to set up a connection to GitHub, fill up the ARN in .env
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION, github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN, github_owner: process.env.CDK_GITHUB_OWNER, github_repo: process.env.CDK_GITHUB_REPO },
});

new MultiArchPipeline(app, 'mapl', {
  // github_connection_arn: Go to https://console.aws.amazon.com/codesuite/settings/connections to set up a connection to GitHub, fill up the ARN in .env
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION, github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN, github_owner: process.env.CDK_GITHUB_OWNER, github_repo: process.env.CDK_GITHUB_REPO },
});

new EKS(app, 'eks-cluster', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

new AdotEcsFargate(app, 'adot-ecs', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
