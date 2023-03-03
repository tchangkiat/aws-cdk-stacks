#!/usr/bin/env node
require("dotenv").config();

const cdk = require("aws-cdk-lib");
const { Vpc } = require("../lib/Vpc");
const { MultiArchPipeline } = require("../lib/MultiArchPipeline");
const { ECS } = require("../lib/ECS");
const { EKS } = require("../lib/EKS");
const { CicdEcs } = require("../lib/CICD-ECS");
const { CicdEc2 } = require("../lib/CICD-EC2");
const { ApiGateway } = require("../lib/ApiGateway");
const { TransitGateway } = require("../lib/TransitGateway");
const { Jenkins } = require("../lib/Jenkins");
const { Autoscaler } = require("../Constants");

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;

new Vpc(app, "vpc", {
  env: {
    account,
    region,
  },
});

new MultiArchPipeline(app, "mapl", {
  env: {
    account,
    region,
    github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN,
    github_owner: process.env.CDK_GITHUB_OWNER,
    github_repo: process.env.CDK_GITHUB_REPO,
  },
});

new ECS(app, "ecs", {
  env: {
    account,
    region,
  },
});

new EKS(app, "eks", {
  env: {
    account,
    region,
  },
});

new EKS(app, "eks-kpt", {
  env: {
    account,
    region,
  },
  autoscaler: Autoscaler.Karpenter,
});

new EKS(app, "eks-ca", {
  env: {
    account,
    region,
  },
  autoscaler: Autoscaler.ClusterAutoscaler,
});

new CicdEcs(app, "cicd-ecs", {
  env: {
    account,
    region,
    github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN,
    github_owner: process.env.CDK_GITHUB_OWNER,
    github_repo: process.env.CDK_GITHUB_REPO,
  },
});

new CicdEc2(app, "cicd-ec2", {
  env: {
    account,
    region,
    github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN,
    github_owner: process.env.CDK_GITHUB_OWNER,
    github_repo: process.env.CDK_GITHUB_REPO2,
  },
});

new ApiGateway(app, "api-gateway", {
  env: {
    account,
    region,
  },
});

new TransitGateway(app, "transit-gateway", {
  env: {
    account,
    region,
  },
});

new Jenkins(app, "jenkins", {
  env: {
    account,
    region,
  },
});
