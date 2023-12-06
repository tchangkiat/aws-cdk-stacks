#!/usr/bin/env node
import * as dotenv from 'dotenv'

import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'

import { ALBRuleRestriction } from '../lib/alb-rule-restriction'
import { ApiGateway } from '../lib/api-gateway'
import { EcsCicd } from '../lib/ecs-cicd'
import { ECS } from '../lib/ecs'
import { EKS } from '../lib/eks'
import { MultiArchPipeline } from '../lib/multi-arch-pipeline'
import { EgressVpc } from '../lib/egress-vpc'

import { Autoscaler } from '../constants'
import { type GitHubProps } from '../github-props'
dotenv.config()

const github: GitHubProps = {
  connectionArn: process.env.CDK_GITHUB_CONNECTION_ARN ?? '',
  owner: process.env.CDK_GITHUB_OWNER ?? '',
  repository: process.env.CDK_GITHUB_REPO ?? ''
}

const app = new cdk.App()

const multiArchPipeline = new MultiArchPipeline(app, 'multi-arch-pipeline', github)

const ecs = new ECS(app, 'ecs', multiArchPipeline.Repository)

new EcsCicd(app, 'ecs-cicd', ecs.FargateService, multiArchPipeline.Repository, github)

new EKS(app, 'eks', multiArchPipeline.Repository)

new EKS(app, 'eks-ca', multiArchPipeline.Repository, Autoscaler.ClusterAutoscaler)

new EgressVpc(app, 'egress-vpc')

new ALBRuleRestriction(app, 'alb-rule-restriction')

new ApiGateway(app, 'api-gateway')
