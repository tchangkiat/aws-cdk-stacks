import { type Construct } from 'constructs'
import { Stack, type StackProps, RemovalPolicy } from 'aws-cdk-lib'
import type * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline'
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions'
import * as codebuild from 'aws-cdk-lib/aws-codebuild'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3'

import { type GitHubProps } from '../github-props'

export class CicdEcs extends Stack {
  constructor (
    scope: Construct,
    id: string,
    vpc: ec2.Vpc,
    github: GitHubProps,
    props?: StackProps
  ) {
    super(scope, id, props)

    const prefix = id + '-demo'

    // ----------------------------
    // IAM Roles
    // ----------------------------

    const codebuildServiceRole = new iam.Role(this, 'code-build-service-role', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      roleName: prefix + '-codebuild-service'
    })
    codebuildServiceRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:BatchGetImage',
          'ecr:CompleteLayerUpload',
          'ecr:GetAuthorizationToken',
          'ecr:GetDownloadUrlForLayer',
          'ecr:InitiateLayerUpload',
          'ecr:PutImage',
          'ecr:UploadLayerPart'
        ]
      })
    )

    // ----------------------------
    // ECR
    // ----------------------------

    const imgRepo = new ecr.Repository(this, 'ImageRepository', {
      repositoryName: prefix,
      removalPolicy: RemovalPolicy.DESTROY
    })
    imgRepo.addLifecycleRule({
      description: 'Keep only 6 images',
      maxImageCount: 6
    })

    // ----------------------------
    // ECS Cluster
    // ----------------------------

    const cluster = ecs.Cluster.fromClusterAttributes(this, 'cluster', {
      clusterName: 'ecs-demo',
      vpc
    })

    const fargateService = ecs.FargateService.fromFargateServiceAttributes(
      this,
      'FargateService',
      { cluster, serviceName: 'ecs-demo-fg-service' }
    )

    // ----------------------------
    // S3
    // ----------------------------

    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      bucketName: prefix + '-artifact-bucket'
    })

    // ----------------------------
    // CodePipeline
    // ----------------------------

    const sourceArtifact = new codepipeline.Artifact('SourceArtifact')
    const buildArtifact = new codepipeline.Artifact('BuildArtifact')

    const buildSpec = codebuild.BuildSpec.fromObject({
      version: '0.2',
      phases: {
        install: {
          commands: 'yum update -y'
        },
        pre_build: {
          commands: [
            'echo Logging in to Amazon ECR',
            'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com'
          ]
        },
        build: {
          commands: [
            // 'echo Dockerfile Linting with Hadolint',
            // 'docker run --rm -i hadolint/hadolint < Dockerfile',
            // 'echo Detecting secrets in the repository with TruffleHog',
            // 'docker run -i -v "$PWD:/pwd" trufflesecurity/trufflehog:latest github --repo $SOURCE_REPO_URL',
            'echo Build started on `date`',
            'echo Building the Docker image',
            'docker build -t $IMAGE_REPO:$IMAGE_TAG .',
            'docker tag $IMAGE_REPO:$IMAGE_TAG $IMAGE_REPO_URL:$IMAGE_TAG'
          ]
        },
        post_build: {
          commands: [
            'echo Build completed on `date`',
            'echo Pushing the Docker image to ECR',
            'docker push $IMAGE_REPO_URL:$IMAGE_TAG',
            'echo Writing image definitions file...',
            'printf \'[{"name":"' +
              github.repository +
              '","imageUri":"%s"}]\' $IMAGE_REPO_URL:$IMAGE_TAG > imagedefinitions.json'
          ]
        }
      },
      artifacts: {
        files: 'imagedefinitions.json'
      }
    })

    const buildx86Project = new codebuild.PipelineProject(
      this,
      'CodeBuildx86',
      {
        buildSpec,
        projectName: prefix + '-x86',
        environment: {
          buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
          computeType: codebuild.ComputeType.SMALL,
          privileged: true,
          environmentVariables: {
            AWS_DEFAULT_REGION: {
              value: this.region
            },
            AWS_ACCOUNT_ID: {
              value: this.account
            },
            IMAGE_REPO: {
              value: imgRepo.repositoryName
            },
            IMAGE_REPO_URL: {
              value: imgRepo.repositoryUri
            },
            IMAGE_TAG: {
              value: 'amd64-latest'
            },
            SOURCE_REPO_URL: {
              value:
                'https://github.com/' +
                github.owner +
                '/' +
                github.repository +
                '.git'
            }
          }
        },
        /* logging: {
          cloudWatch: {
            enabled: false,
          },
        }, */
        role: codebuildServiceRole
      }
    )

    new codepipeline.Pipeline(this, 'CodePipeline', {
      artifactBucket,
      pipelineName: prefix + '-pipeline',
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeStarConnectionsSourceAction({
              actionName: 'GitHub_Source',
              owner: github.owner,
              repo: github.repository,
              output: sourceArtifact,
              connectionArn: github.connectionArn
            })
          ]
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'x86',
              project: buildx86Project,
              input: sourceArtifact,
              outputs: [buildArtifact],
              runOrder: 1
            })
          ]
        },
        {
          stageName: 'Deploy',
          actions: [
            new codepipeline_actions.EcsDeployAction({
              actionName: 'DeployToECSCluster',
              service: fargateService,
              input: buildArtifact,
              runOrder: 1
            })
          ]
        }
      ]
    })
  }
}
