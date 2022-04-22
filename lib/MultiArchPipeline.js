const { Stack, RemovalPolicy } = require("aws-cdk-lib");
const ecr = require("aws-cdk-lib/aws-ecr");
const ec2 = require("aws-cdk-lib/aws-ec2");
const ecs = require("aws-cdk-lib/aws-ecs");
const ecsPatterns = require("aws-cdk-lib/aws-ecs-patterns");
const codepipeline = require("aws-cdk-lib/aws-codepipeline");
const codepipeline_actions = require("aws-cdk-lib/aws-codepipeline-actions");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const iam = require("aws-cdk-lib/aws-iam");
const s3 = require("aws-cdk-lib/aws-s3");
const logs = require("aws-cdk-lib/aws-logs");

class MultiArchPipeline extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // ----------------------------
    // IAM Roles
    // ----------------------------

    const codebuildServiceRole = new iam.Role(this, "CodeBuildServiceRole", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
    });
    codebuildServiceRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:GetAuthorizationToken",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
        ],
      })
    );

    // ----------------------------
    // ECR
    // ----------------------------

    const imgRepo = new ecr.Repository(this, "ImageRepository", {
      lifecycleRules: [
        {
          description: "Keep only 6 images",
          maxImageCount: 6,
        },
      ],
      repositoryName: "mapl",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ----------------------------
    // S3
    // ----------------------------

    const artifactBucket = new s3.Bucket(this, "ArtifactBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ----------------------------
    // CloudWatch Log Group
    // ----------------------------

    const codeBuildLogGroup = new logs.LogGroup(this, "codeBuildLogGroup", {
      retention: logs.RetentionDays.THREE_DAYS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ----------------------------
    // CodePipeline
    // ----------------------------

    const sourceArtifact = new codepipeline.Artifact("SourceArtifact");
    const buildArtifact = new codepipeline.Artifact("BuildArtifact");

    const buildSpec = codebuild.BuildSpec.fromObject({
      version: "0.2",
      phases: {
        install: {
          commands: "yum update -y",
        },
        pre_build: {
          commands: [
            "echo Logging in to Amazon ECR",
            "aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com",
          ],
        },
        build: {
          commands: [
            //'echo Dockerfile Linting with Hadolint',
            //'docker run --rm -i hadolint/hadolint < Dockerfile',
            //'echo Detecting secrets in the repository with TruffleHog',
            //'docker run -i -v "$PWD:/pwd" trufflesecurity/trufflehog:latest github --repo $SOURCE_REPO_URL',
            "echo Build started on `date`",
            "echo Building the Docker image",
            "docker build -t $IMAGE_REPO:$IMAGE_TAG .",
            "docker tag $IMAGE_REPO:$IMAGE_TAG $IMAGE_REPO_URL:$IMAGE_TAG",
          ],
        },
        post_build: {
          commands: [
            "echo Build completed on `date`",
            "echo Pushing the Docker image to ECR",
            "docker push $IMAGE_REPO_URL:$IMAGE_TAG",
          ],
        },
      },
    });

    const buildx86Project = new codebuild.PipelineProject(
      this,
      "CodeBuildX86",
      {
        buildSpec,
        projectName: "maplBuildX86",
        environment: {
          buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
          computeType: codebuild.ComputeType.SMALL,
          privileged: true,
          environmentVariables: {
            AWS_DEFAULT_REGION: {
              value: props.env.region,
            },
            AWS_ACCOUNT_ID: {
              value: props.env.account,
            },
            IMAGE_REPO: {
              value: imgRepo.repositoryName,
            },
            IMAGE_REPO_URL: {
              value: imgRepo.repositoryUri,
            },
            IMAGE_TAG: {
              value: "amd64-latest",
            },
            SOURCE_REPO_URL: {
              value:
                "https://github.com/" +
                props.env.github_owner +
                "/" +
                props.env.github_repo +
                ".git",
            },
          },
        },
        logging: {
          cloudWatch: {
            logGroup: codeBuildLogGroup,
            prefix: "x86",
          },
        },
        role: codebuildServiceRole,
      }
    );

    const buildArm64Project = new codebuild.PipelineProject(
      this,
      "CodeBuildArm64",
      {
        buildSpec,
        projectName: "maplBuildArm64",
        environment: {
          buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_2_0,
          computeType: codebuild.ComputeType.SMALL,
          privileged: true,
          environmentVariables: {
            AWS_DEFAULT_REGION: {
              value: props.env.region,
            },
            AWS_ACCOUNT_ID: {
              value: props.env.account,
            },
            IMAGE_REPO: {
              value: imgRepo.repositoryName,
            },
            IMAGE_REPO_URL: {
              value: imgRepo.repositoryUri,
            },
            IMAGE_TAG: {
              value: "arm64-latest",
            },
            SOURCE_REPO_URL: {
              value:
                "https://github.com/" +
                props.env.github_owner +
                "/" +
                props.env.github_repo +
                ".git",
            },
          },
        },
        logging: {
          cloudWatch: {
            logGroup: codeBuildLogGroup,
            prefix: "arm64",
          },
        },
        role: codebuildServiceRole,
      }
    );

    const buildManifestProject = new codebuild.PipelineProject(
      this,
      "CodeBuildManifest",
      {
        buildSpec: codebuild.BuildSpec.fromObject({
          version: "0.2",
          phases: {
            install: {
              commands: "yum update -y",
            },
            pre_build: {
              commands: [
                "echo Logging in to Amazon ECR",
                "$(aws ecr get-login --no-include-email --region $AWS_DEFAULT_REGION)",
              ],
            },
            build: {
              commands: [
                "echo Build started on `date`",
                "echo Building the Docker manifest",
                "export DOCKER_CLI_EXPERIMENTAL=enabled",
                "docker manifest create $IMAGE_REPO_URL $IMAGE_REPO_URL:arm64-latest $IMAGE_REPO_URL:amd64-latest",
                "docker manifest annotate --arch arm64 $IMAGE_REPO_URL $IMAGE_REPO_URL:arm64-latest",
                "docker manifest annotate --arch amd64 $IMAGE_REPO_URL $IMAGE_REPO_URL:amd64-latest",
              ],
            },
            post_build: {
              commands: [
                "echo Build completed on `date`",
                "echo Pushing the Docker manifest to ECR",
                "docker manifest push $IMAGE_REPO_URL",
                "docker manifest inspect $IMAGE_REPO_URL",
                "echo Writing image definitions file",
                'printf \'[{"name":"' +
                  props.env.github_repo +
                  '","imageUri":"%s"}]\' $IMAGE_REPO_URL:$IMAGE_TAG > imagedefinitions.json',
              ],
            },
          },
          artifacts: {
            files: "imagedefinitions.json",
          },
        }),
        projectName: "maplBuildManifest",
        environment: {
          buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
          computeType: codebuild.ComputeType.SMALL,
          privileged: true,
          environmentVariables: {
            AWS_DEFAULT_REGION: {
              value: props.env.region,
            },
            AWS_ACCOUNT_ID: {
              value: props.env.account,
            },
            IMAGE_REPO: {
              value: imgRepo.repositoryName,
            },
            IMAGE_REPO_URL: {
              value: imgRepo.repositoryUri,
            },
            IMAGE_TAG: {
              value: "latest",
            },
          },
        },
        logging: {
          cloudWatch: {
            logGroup: codeBuildLogGroup,
            prefix: "manifest",
          },
        },
        role: codebuildServiceRole,
      }
    );

    const pipeline = new codepipeline.Pipeline(this, "CodePipeline", {
      artifactBucket: artifactBucket,
      pipelineName: "mapl",
      stages: [
        {
          stageName: "Source",
          actions: [
            new codepipeline_actions.CodeStarConnectionsSourceAction({
              actionName: "GitHub_Source",
              owner: props.env.github_owner,
              repo: props.env.github_repo,
              output: sourceArtifact,
              connectionArn: props.env.github_connection_arn,
            }),
          ],
        },
        {
          stageName: "Build",
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: "x86",
              project: buildx86Project,
              input: sourceArtifact,
              runOrder: 1,
            }),
            new codepipeline_actions.CodeBuildAction({
              actionName: "arm64",
              project: buildArm64Project,
              input: sourceArtifact,
              runOrder: 1,
            }),
          ],
        },
        {
          stageName: "Build-Manifest",
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: "Build-Manifest",
              project: buildManifestProject,
              input: sourceArtifact,
              outputs: [buildArtifact],
              runOrder: 1,
            }),
          ],
        },
      ],
    });
  }
}

module.exports = { MultiArchPipeline };
