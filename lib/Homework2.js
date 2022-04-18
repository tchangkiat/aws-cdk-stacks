const { Stack } = require("aws-cdk-lib");
const ecr = require("aws-cdk-lib/aws-ecr");
const codecommit = require("aws-cdk-lib/aws-codecommit");
const codepipeline = require("aws-cdk-lib/aws-codepipeline");
const codepipeline_actions = require("aws-cdk-lib/aws-codepipeline-actions");
const codebuild = require("aws-cdk-lib/aws-codebuild");

class Homework2 extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // ----------------------------
    // ECR
    // ----------------------------

    const imgRepo = new ecr.Repository(this, "ImageRepository", {
      repositoryName: "hw2",
    });
    imgRepo.addLifecycleRule({
      description: "Keep only 6 images",
      maxImageCount: 6,
    });

    // ----------------------------
    // CodePipeline
    // ----------------------------

    const sourceArtifact = new codepipeline.Artifact("SourceArtifact");

    const buildx86Project = new codebuild.PipelineProject(
      this,
      "CodeBuildx86",
      {
        projectName: "hw2Buildx86",
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
            IMAGE_TAG: {
              value: "amd64-latest",
            },
            SOURCE_REPO_URL: {
              value: props.env.github_url,
            },
          },
        },
        /*logging: {
          cloudWatch: {
            enabled: false,
          },
        },*/
      }
    );

    const pipeline = new codepipeline.Pipeline(this, "CodePipeline", {
      pipelineName: "hw2Pipeline",
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
          ],
        },
      ],
    });
  }
}

module.exports = { Homework2 };
