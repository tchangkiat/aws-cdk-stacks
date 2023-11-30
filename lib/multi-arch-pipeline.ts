import { type Construct } from 'constructs'
import { Stack, type StackProps, RemovalPolicy } from 'aws-cdk-lib'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline'
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions'
import * as codebuild from 'aws-cdk-lib/aws-codebuild'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as logs from 'aws-cdk-lib/aws-logs'

import { type GitHubProps } from '../github-props'

export class MultiArchPipeline extends Stack {
  public Repository: ecr.Repository

  constructor (
    scope: Construct,
    id: string,
    github: GitHubProps,
    props?: StackProps
  ) {
    super(scope, id, props)

    // ----------------------------
    // ECR
    // ----------------------------

    this.Repository = new ecr.Repository(this, 'ecr-repo', {
      lifecycleRules: [
        {
          description: 'Keep only 6 images',
          maxImageCount: 6
        }
      ],
      repositoryName: id,
      removalPolicy: RemovalPolicy.DESTROY
    })

    // ----------------------------
    // IAM Roles
    // ----------------------------

    const codebuildServiceRole = new iam.Role(this, 'codebuild-service-role', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      roleName: id + '-codebuild-service-role'
    })
    codebuildServiceRole.addToPolicy(
      new iam.PolicyStatement({
        resources: [this.Repository.repositoryArn],
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:BatchGetImage',
          'ecr:CompleteLayerUpload',
          'ecr:GetDownloadUrlForLayer',
          'ecr:InitiateLayerUpload',
          'ecr:PutImage',
          'ecr:UploadLayerPart'
        ]
      })
    )
    codebuildServiceRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: [
          'ecr:GetAuthorizationToken'
        ]
      })
    )

    // ----------------------------
    // S3
    // ----------------------------

    const artifactBucket = new s3.Bucket(this, 'artifact-bucket', {
      removalPolicy: RemovalPolicy.DESTROY
    })

    // ----------------------------
    // CloudWatch Log Group
    // ----------------------------

    const codeBuildLogGroup = new logs.LogGroup(this, 'codebuild-log-group', {
      retention: logs.RetentionDays.THREE_DAYS,
      removalPolicy: RemovalPolicy.DESTROY
    })

    // ----------------------------
    // CodePipeline
    // ----------------------------

    const sourceArtifact = new codepipeline.Artifact('SourceArtifact')
    const outputArtifact = new codepipeline.Artifact('OutputArtifact')

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
            'docker push $IMAGE_REPO_URL:$IMAGE_TAG'
          ]
        }
      }
    })

    const x86Project = new codebuild.PipelineProject(
      this,
      'codebuild-x86',
      {
        buildSpec,
        projectName: id + '-x86',
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
              value: this.Repository.repositoryName
            },
            IMAGE_REPO_URL: {
              value: this.Repository.repositoryUri
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
        logging: {
          cloudWatch: {
            logGroup: codeBuildLogGroup,
            prefix: 'x86'
          }
        },
        role: codebuildServiceRole
      }
    )

    const arm64Project = new codebuild.PipelineProject(
      this,
      'codebuild-arm64',
      {
        buildSpec,
        projectName: id + '-arm64',
        environment: {
          buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0,
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
              value: this.Repository.repositoryName
            },
            IMAGE_REPO_URL: {
              value: this.Repository.repositoryUri
            },
            IMAGE_TAG: {
              value: 'arm64-latest'
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
        logging: {
          cloudWatch: {
            logGroup: codeBuildLogGroup,
            prefix: 'arm64'
          }
        },
        role: codebuildServiceRole
      }
    )

    const manifestProject = new codebuild.PipelineProject(
      this,
      'codebuild-manifest',
      {
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              commands: 'yum update -y'
            },
            pre_build: {
              commands: [
                'echo Logging in to Amazon ECR',
                '$(aws ecr get-login --no-include-email --region $AWS_DEFAULT_REGION)'
              ]
            },
            build: {
              commands: [
                'echo Build started on `date`',
                'echo Building the Docker manifest',
                'export DOCKER_CLI_EXPERIMENTAL=enabled',
                'docker manifest create $IMAGE_REPO_URL $IMAGE_REPO_URL:arm64-latest $IMAGE_REPO_URL:amd64-latest',
                'docker manifest annotate --arch arm64 $IMAGE_REPO_URL $IMAGE_REPO_URL:arm64-latest',
                'docker manifest annotate --arch amd64 $IMAGE_REPO_URL $IMAGE_REPO_URL:amd64-latest'
              ]
            },
            post_build: {
              commands: [
                'echo Build completed on `date`',
                'echo Pushing the Docker manifest to ECR',
                'docker manifest push $IMAGE_REPO_URL',
                'docker manifest inspect $IMAGE_REPO_URL',
                'echo Writing image definitions file',
                'printf \'[{"name":"' +
                  github.repository +
                  '","imageUri":"%s"}]\' $IMAGE_REPO_URL:$IMAGE_TAG > imagedefinitions.json'
              ]
            }
          },
          artifacts: {
            files: 'imagedefinitions.json'
          }
        }),
        projectName: id + '-manifest',
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
              value: this.Repository.repositoryName
            },
            IMAGE_REPO_URL: {
              value: this.Repository.repositoryUri
            },
            IMAGE_TAG: {
              value: 'latest'
            }
          }
        },
        logging: {
          cloudWatch: {
            logGroup: codeBuildLogGroup,
            prefix: 'manifest'
          }
        },
        role: codebuildServiceRole
      }
    )

    new codepipeline.Pipeline(this, 'CodePipeline', {
      artifactBucket,
      pipelineName: id,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeStarConnectionsSourceAction({
              actionName: 'get-source-code',
              owner: github.owner,
              repo: github.repository,
              output: sourceArtifact,
              connectionArn: github.connectionArn
            })
          ]
        },
        {
          stageName: 'Create-Images',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'create-x86',
              project: x86Project,
              input: sourceArtifact
            }),
            new codepipeline_actions.CodeBuildAction({
              actionName: 'create-arm64',
              project: arm64Project,
              input: sourceArtifact
            })
          ]
        },
        {
          stageName: 'Create-Manifest',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'create-manifest',
              project: manifestProject,
              input: sourceArtifact,
              outputs: [outputArtifact]
            })
          ]
        }
      ]
    })
  }
}
