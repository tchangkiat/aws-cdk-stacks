import { type Construct } from "constructs";
import { Stack, type StackProps, RemovalPolicy } from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";

export class Vllm extends Stack {
    public Repository: ecr.Repository;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);
        const source_repo_url = "https://github.com/vllm-project/vllm.git";

        // ----------------------------
        // ECR
        // ----------------------------

        this.Repository = new ecr.Repository(this, "ecr-repo", {
            lifecycleRules: [
                {
                    description: "Keep only 6 images",
                    maxImageCount: 6,
                },
            ],
            repositoryName: id,
            removalPolicy: RemovalPolicy.DESTROY,
            emptyOnDelete: true,
        });

        // ----------------------------
        // IAM Roles
        // ----------------------------

        const codebuildServiceRole = new iam.Role(
            this,
            "codebuild-service-role",
            {
                assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
                roleName: id + "-codebuild-service-role-" + this.region,
            },
        );
        codebuildServiceRole.addToPolicy(
            new iam.PolicyStatement({
                resources: [this.Repository.repositoryArn],
                actions: [
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:BatchGetImage",
                    "ecr:CompleteLayerUpload",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:InitiateLayerUpload",
                    "ecr:PutImage",
                    "ecr:UploadLayerPart",
                ],
            }),
        );
        codebuildServiceRole.addToPolicy(
            new iam.PolicyStatement({
                resources: ["*"],
                actions: ["ecr:GetAuthorizationToken"],
            }),
        );

        // ----------------------------
        // CloudWatch Log Group
        // ----------------------------

        const codeBuildLogGroup = new logs.LogGroup(
            this,
            "codebuild-log-group",
            {
                retention: logs.RetentionDays.THREE_DAYS,
                removalPolicy: RemovalPolicy.DESTROY,
            },
        );

        // ----------------------------
        // CodeBuild
        // ----------------------------

        new codebuild.Project(this, "codebuild-arm64", {
            buildSpec: codebuild.BuildSpec.fromObject({
                version: 0.2,
                phases: {
                    install: {
                        commands: ["yum update -y"],
                    },
                    pre_build: {
                        commands: [
                            "echo Logging in to Amazon ECR",
                            "aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com",
                        ],
                    },
                    build: {
                        commands: [
                            "echo Build started on `date`",
                            "echo Building the Docker images",
                            "git clone $SOURCE_REPO_URL",
                            "cd vllm",
                            // Use Amazon ECR Public Gallery instead of Docker Hub for the base image
                            "sed -i 's|FROM ubuntu|FROM public.ecr.aws/ubuntu/ubuntu|g' docker/Dockerfile.arm",
                            "docker build -f docker/Dockerfile.arm -t $IMAGE_REPO:$IMAGE_TAG_PREFIX --shm-size=4g .",
                        ],
                    },
                    post_build: {
                        commands: [
                            "echo Build completed on `date`",
                            "docker tag $IMAGE_REPO:$IMAGE_TAG_PREFIX $IMAGE_REPO_URL:$IMAGE_TAG_PREFIX",
                            "echo Pushing the Docker images to ECR",
                            "docker push $IMAGE_REPO_URL --all-tags",
                        ],
                    },
                },
            }),
            projectName: id + "-arm64",
            environment: {
                buildImage:
                    codebuild.LinuxArmBuildImage.AMAZON_LINUX_2023_STANDARD_3_0,
                computeType: codebuild.ComputeType.LARGE, //Required to avoid running out of memory when building the container image
                privileged: true,
                environmentVariables: {
                    AWS_DEFAULT_REGION: {
                        value: this.region,
                    },
                    AWS_ACCOUNT_ID: {
                        value: this.account,
                    },
                    IMAGE_REPO: {
                        value: this.Repository.repositoryName,
                    },
                    IMAGE_REPO_URL: {
                        value: this.Repository.repositoryUri,
                    },
                    IMAGE_TAG_PREFIX: {
                        value: "arm64",
                    },
                    SOURCE_REPO_URL: {
                        value: source_repo_url,
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
        });
    }
}
