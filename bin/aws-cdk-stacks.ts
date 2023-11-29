#!/usr/bin/env node
import * as dotenv from 'dotenv'

import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'

import { ALBRuleRestriction } from '../lib/alb-rule-restriction'
import { ApiGateway } from '../lib/api-gateway'
import { CicdEcs } from '../lib/cicd-ecs'
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

new ALBRuleRestriction(app, 'alb-rule-restriction')

new ApiGateway(app, 'api-gateway')

const ecs = new ECS(app, 'ecs')

new CicdEcs(app, 'cicd-ecs', ecs.Vpc, github)

new EgressVpc(app, 'egress-vpc')

new EKS(app, 'eks')

new EKS(app, 'eks-ca', Autoscaler.ClusterAutoscaler)

new MultiArchPipeline(app, 'mapl', github)
