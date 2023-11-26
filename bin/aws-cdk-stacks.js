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
const { ALBRuleRestriction } = require("../lib/ALBRuleRestriction");
const { Autoscaler } = require("../Constants");

const app = new cdk.App();

new Vpc(app, "vpc");

new MultiArchPipeline(app, "mapl", {
  env: {
    github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN,
    github_owner: process.env.CDK_GITHUB_OWNER,
    github_repo: process.env.CDK_GITHUB_REPO,
  },
});

new ECS(app, "ecs");

new EKS(app, "eks");

new EKS(app, "eks-ca", Autoscaler.ClusterAutoscaler);

new CicdEcs(app, "cicd-ecs", {
  env: {
    github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN,
    github_owner: process.env.CDK_GITHUB_OWNER,
    github_repo: process.env.CDK_GITHUB_REPO,
  },
});

new CicdEc2(app, "cicd-ec2", {
  env: {
    github_connection_arn: process.env.CDK_GITHUB_CONNECTION_ARN,
    github_owner: process.env.CDK_GITHUB_OWNER,
    github_repo: process.env.CDK_GITHUB_REPO2,
  },
});

new ApiGateway(app, "api-gateway");

new TransitGateway(app, "transit-gateway");

new ALBRuleRestriction(app, "alb-rule-restriction");
