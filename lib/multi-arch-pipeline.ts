import { type Construct } from "constructs";
import { Stack, type StackProps, RemovalPolicy } from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as logs from "aws-cdk-lib/aws-logs";

import { type GitHubProps } from "../github-props";

export class MultiArchPipeline extends Stack {
	public Repository: ecr.Repository;

	constructor(
		scope: Construct,
		id: string,
		github: GitHubProps,
		props?: StackProps,
	) {
		super(scope, id, props);

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

		const codebuildServiceRole = new iam.Role(this, "codebuild-service-role", {
			assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
			roleName: id + "-codebuild-service-role",
		});
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
		// S3
		// ----------------------------

		const artifactBucket = new s3.Bucket(this, "artifact-bucket", {
			removalPolicy: RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
		});

		// ----------------------------
		// CloudWatch Log Group
		// ----------------------------

		const codeBuildLogGroup = new logs.LogGroup(this, "codebuild-log-group", {
			retention: logs.RetentionDays.THREE_DAYS,
			removalPolicy: RemovalPolicy.DESTROY,
		});

		// ----------------------------
		// CodePipeline
		// ----------------------------

		const sourceArtifact = new codepipeline.Artifact("SourceArtifact");
		const outputArtifact = new codepipeline.Artifact("OutputArtifact");

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
						"COMMIT_ID=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -b -8)",
					],
				},
				build: {
					commands: [
						// 'echo Dockerfile Linting with Hadolint',
						// 'docker run --rm -i hadolint/hadolint < Dockerfile',
						// 'echo Detecting secrets in the repository with TruffleHog',
						// 'docker run -i -v "$PWD:/pwd" trufflesecurity/trufflehog:latest github --repo $SOURCE_REPO_URL',
						"echo Build started on `date`",
						"echo Building the Docker images",
						"docker build -t $IMAGE_REPO:$IMAGE_TAG_PREFIX-$COMMIT_ID -t $IMAGE_REPO:$IMAGE_TAG_PREFIX-latest .",
						"docker tag $IMAGE_REPO:$IMAGE_TAG_PREFIX-$COMMIT_ID $IMAGE_REPO_URL:$IMAGE_TAG_PREFIX-$COMMIT_ID",
						"docker tag $IMAGE_REPO:$IMAGE_TAG_PREFIX-latest $IMAGE_REPO_URL:$IMAGE_TAG_PREFIX-latest",
					],
				},
				post_build: {
					commands: [
						"echo Build completed on `date`",
						"echo Pushing the Docker images to ECR",
						"docker push $IMAGE_REPO_URL --all-tags",
					],
				},
			},
		});

		const amd64Project = new codebuild.PipelineProject(this, "codebuild-amd64", {
			buildSpec,
			projectName: id + "-amd64",
			environment: {
				buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
				computeType: codebuild.ComputeType.SMALL,
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
						value: "amd64",
					},
					SOURCE_REPO_URL: {
						value:
							"https://github.com/" + github.owner + "/" + github.repository + ".git",
					},
				},
			},
			logging: {
				cloudWatch: {
					logGroup: codeBuildLogGroup,
					prefix: "amd64",
				},
			},
			role: codebuildServiceRole,
		});

		const arm64Project = new codebuild.PipelineProject(this, "codebuild-arm64", {
			buildSpec,
			projectName: id + "-arm64",
			environment: {
				buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0,
				computeType: codebuild.ComputeType.SMALL,
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
						value:
							"https://github.com/" + github.owner + "/" + github.repository + ".git",
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

		const manifestProject = new codebuild.PipelineProject(
			this,
			"codebuild-manifest",
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
								"aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com",
								"COMMIT_ID=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -b -8)",
							],
						},
						build: {
							commands: [
								"echo Build started on `date`",
								"echo Building the Docker manifest",
								"export DOCKER_CLI_EXPERIMENTAL=enabled",
								"docker manifest create $IMAGE_REPO_URL:latest $IMAGE_REPO_URL:arm64-latest $IMAGE_REPO_URL:amd64-latest",
								"docker manifest annotate --arch arm64 $IMAGE_REPO_URL:latest $IMAGE_REPO_URL:arm64-latest",
								"docker manifest annotate --arch amd64 $IMAGE_REPO_URL:latest $IMAGE_REPO_URL:amd64-latest",
								"docker manifest create $IMAGE_REPO_URL:$COMMIT_ID $IMAGE_REPO_URL:arm64-$COMMIT_ID $IMAGE_REPO_URL:amd64-$COMMIT_ID",
								"docker manifest annotate --arch arm64 $IMAGE_REPO_URL:$COMMIT_ID $IMAGE_REPO_URL:arm64-$COMMIT_ID",
								"docker manifest annotate --arch amd64 $IMAGE_REPO_URL:$COMMIT_ID $IMAGE_REPO_URL:amd64-$COMMIT_ID",
							],
						},
						post_build: {
							commands: [
								"echo Build completed on `date`",
								"echo Pushing the Docker manifest to ECR",
								"docker manifest push $IMAGE_REPO_URL:latest",
								"docker manifest push $IMAGE_REPO_URL:$COMMIT_ID",
								"docker manifest inspect $IMAGE_REPO_URL:latest",
								"docker manifest inspect $IMAGE_REPO_URL:$COMMIT_ID",
								"echo Writing image definitions file",
								'printf \'[{"name":"' +
									github.repository +
									'","imageUri":"%s"}]\' $IMAGE_REPO_URL:$COMMIT_ID > imagedefinitions.json',
							],
						},
					},
					artifacts: {
						files: "imagedefinitions.json",
					},
				}),
				projectName: id + "-manifest",
				environment: {
					buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
					computeType: codebuild.ComputeType.SMALL,
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
					},
				},
				logging: {
					cloudWatch: {
						logGroup: codeBuildLogGroup,
						prefix: "manifest",
					},
				},
				role: codebuildServiceRole,
			},
		);

		new codepipeline.Pipeline(this, "CodePipeline", {
			artifactBucket,
			pipelineName: id,
			pipelineType: codepipeline.PipelineType.V1,
			stages: [
				{
					stageName: "Source",
					actions: [
						new codepipeline_actions.CodeStarConnectionsSourceAction({
							actionName: "get-source-code",
							owner: github.owner,
							repo: github.repository,
							output: sourceArtifact,
							connectionArn: github.connectionArn,
						}),
					],
				},
				{
					stageName: "Create-Images",
					actions: [
						new codepipeline_actions.CodeBuildAction({
							actionName: "create-amd64",
							project: amd64Project,
							input: sourceArtifact,
						}),
						new codepipeline_actions.CodeBuildAction({
							actionName: "create-arm64",
							project: arm64Project,
							input: sourceArtifact,
						}),
					],
				},
				{
					stageName: "Create-Manifest",
					actions: [
						new codepipeline_actions.CodeBuildAction({
							actionName: "create-manifest",
							project: manifestProject,
							input: sourceArtifact,
							outputs: [outputArtifact],
						}),
					],
				},
			],
		});
	}
}
