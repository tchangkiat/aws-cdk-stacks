#!/usr/bin/env node
import * as dotenv from 'dotenv'

import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'

import { ALBRuleRestriction } from '../lib/alb-rule-restriction'
import { ApiGateway } from '../lib/api-gateway'
import { Common } from '../lib/common'
import { EcsCicd } from '../lib/ecs-cicd'
import { ECS } from '../lib/ecs'
import { EKS } from '../lib/eks'
import { MultiArchPipeline } from '../lib/multi-arch-pipeline'
import { EgressVpc } from '../lib/egress-vpc'
import { PostgresDatabase } from '../lib/postgres-db'

import { Autoscaler } from '../constants'
dotenv.config()

const app = new cdk.App()

const common = new Common(app, 'aws-cdk-stacks-common')

const multiArchPipeline = new MultiArchPipeline(app, 'multi-arch-pipeline', common.GitHub)

const ecs = new ECS(app, 'ecs', common.Vpc, multiArchPipeline.Repository)

new EcsCicd(app, 'ecs-cicd', ecs.FargateService, multiArchPipeline.Repository, common.GitHub)

new EKS(app, 'eks', common.Vpc, multiArchPipeline.Repository)

new EKS(app, 'eks-ca', common.Vpc, multiArchPipeline.Repository, Autoscaler.ClusterAutoscaler)

new EgressVpc(app, 'egress-vpc')

new ALBRuleRestriction(app, 'alb-rule-restriction')

new ApiGateway(app, 'api-gateway', common.Vpc)

new PostgresDatabase(app, 'postgres-db', common.Vpc)
