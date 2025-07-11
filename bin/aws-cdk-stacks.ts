#!/usr/bin/env node
import * as dotenv from "dotenv";

import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { ApiGateway } from "../lib/api-gateway";
import { Common } from "../lib/common";
import { EcsCicd } from "../lib/ecs-cicd";
import { EcsAdot } from "../lib/ecs-adot";
import { ECS } from "../lib/ecs";
import { EKS } from "../lib/eks";
import { GravitonInstance } from "../lib/graviton-instance";
import { MultiArchPipeline } from "../lib/multi-arch-pipeline";
import { Vllm } from "../lib/vllm";
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

new Vllm(app, "vllm", {
  stackName: prefix + "vllm",
  description:
    "Builds container images for vLLM and store them in an ECR repository",
});

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
      "Deploys a pipeline to build and deploy an application to a Fargate service in an ECS cluster",
  },
);

new EcsAdot(app, "ecs-adot", common.Vpc, {
  stackName: prefix + "ecs-adot",
  description: "Deploys an ECS cluster with ADOT as sidecar running on Fargate",
});

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

new GravitonInstance(
  app,
  "graviton-instance",
  common.Vpc,
  common.SSHKeyPairName,
  {
    stackName: prefix + "graviton-instance",
    description:
      "Deploys an AWS Graviton-based instance that is accessible via SSH",
  },
);

new EgressVpc(app, "egress-vpc", {
  stackName: prefix + "egress-vpc",
  description: "Deploys an egress VPC with Transit Gateway",
});

// Uncomment to use; commented away to avoid error when the zip file is not built
// new ApiGateway(app, "api-gateway", {
//   stackName: prefix + "api-gateway",
//   description: "Deploys an API Gateway with a Lambda authorizer",
// });

new PostgresDatabase(app, "postgres-db", common.Vpc, {
  stackName: prefix + "postgresql",
  description: "Deploys an RDS PostgreSQL database instance",
});
