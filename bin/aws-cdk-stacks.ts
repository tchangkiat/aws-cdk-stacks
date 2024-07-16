#!/usr/bin/env node
import * as dotenv from "dotenv";

import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { ALBRuleRestriction } from "../lib/alb-rule-restriction";
import { ApiGateway } from "../lib/api-gateway";
import { Common } from "../lib/common";
import { EcsCicd } from "../lib/ecs-cicd";
import { ECS } from "../lib/ecs";
import { EKS } from "../lib/eks";
import { MultiArchPipeline } from "../lib/multi-arch-pipeline";
import { EgressVpc } from "../lib/egress-vpc";
import { PostgresDatabase } from "../lib/postgres-db";

import { Autoscaler } from "../constants";
dotenv.config();

const app = new cdk.App();
const prefix = "cdk-stacks-";

const common = new Common(app, "common", {
	stackName: prefix + "common",
	description: "Includes a standard VPC and other common references",
});

const multiArchPipeline = new MultiArchPipeline(
	app,
	"multi-arch-pipeline",
	common.GitHub,
	{
		stackName: prefix + "multi-arch-pipeline",
		description:
			"Deploys a multi-architecture pipeline to create amd64 and arm64 container images and store them in an ECR repository",
	},
);

const ecs = new ECS(app, "ecs", common.Vpc, multiArchPipeline.Repository, {
	stackName: prefix + "ecs",
	description: "Deploys an ECS cluster with a service running on Fargate",
});

new EcsCicd(
	app,
	"ecs-cicd",
	ecs.FargateService,
	multiArchPipeline.Repository,
	common.GitHub,
	{
		stackName: prefix + "ecs-cicd",
		description:
			"Deploys a pipeline to build and deploy an application to a Fargate service in ECS",
	},
);

new EKS(
	app,
	"eks",
	multiArchPipeline.Repository,
	common.SSHKeyPairName,
	Autoscaler.Karpenter,
	{
		stackName: prefix + "eks",
		description:
			"Deploys an EKS cluster and a bastion host to manage the cluster",
	},
);

new EKS(
	app,
	"eks-ca",
	multiArchPipeline.Repository,
	common.SSHKeyPairName,
	Autoscaler.ClusterAutoscaler,
	{
		stackName: prefix + "eks-ca",
		description:
			"Deploys an EKS cluster with Cluster Autoscaler and a bastion host to manage the cluster",
	},
);

new EgressVpc(app, "egress-vpc", {
	stackName: prefix + "egress-vpc",
	description: "Deploys an egress VPC with Transit Gateway",
});

new ALBRuleRestriction(app, "alb-rule-restriction", common.SSHKeyPairName, {
	stackName: prefix + "alb-rule-restriction",
	description:
		"Deploys a solution that uses ALB to restrict traffic from an IP range",
});

new ApiGateway(app, "api-gateway", common.Vpc, common.SSHKeyPairName, {
	stackName: prefix + "api-gateway",
	description:
		"Deploys an API Gateway with two backends: Lambda function and ALB + EC2 instances",
});

new PostgresDatabase(app, "postgres-db", common.Vpc, {
	stackName: prefix + "postgresql",
	description: "Deploys an RDS PostgreSQL database instance",
});
