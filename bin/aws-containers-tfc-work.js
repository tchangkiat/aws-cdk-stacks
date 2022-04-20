#!/usr/bin/env node
require('dotenv').config();

const cdk = require('aws-cdk-lib');
const { Homework1 } = require('../lib/Homework1');
const { Homework2 } = require('../lib/Homework2');
const { MultiArchPipeline } = require('../lib/MultiArchPipeline');

const app = new cdk.App();
new Homework1(app, 'hw1', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

new Homework2(app, 'hw2', {
  // github_connection_arn: Go to https://console.aws.amazon.com/codesuite/settings/connections to set up a connection to GitHub, fill up the ARN in .env
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION, github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN, github_owner: process.env.CDK_GITHUB_OWNER, github_repo: process.env.CDK_GITHUB_REPO, github_url: process.env.CDK_GITHUB_URL },
});

new MultiArchPipeline(app, 'mapl', {
  // github_connection_arn: Go to https://console.aws.amazon.com/codesuite/settings/connections to set up a connection to GitHub, fill up the ARN in .env
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION, github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN, github_owner: process.env.CDK_GITHUB_OWNER, github_repo: process.env.CDK_GITHUB_REPO, github_url: process.env.CDK_GITHUB_URL },
});
