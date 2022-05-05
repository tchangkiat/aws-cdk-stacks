const { Stack, RemovalPolicy } = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const codepipeline = require("aws-cdk-lib/aws-codepipeline");
const codepipeline_actions = require("aws-cdk-lib/aws-codepipeline-actions");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const s3 = require("aws-cdk-lib/aws-s3");
const { BlockDeviceVolume } = require("aws-cdk-lib/aws-ec2");
const { AutoScalingGroup } = require("aws-cdk-lib/aws-autoscaling");
const elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");

class CicdEc2 extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // ----------------------------
    // Configuration
    // ----------------------------

    const sshKeyName = "EC2DefaultKeyPair";
    const vpcName = "standard";

    // ----------------------------
    // Network
    // ----------------------------

    const vpc = ec2.Vpc.fromLookup(this, "vpc", {
      vpcName,
    });

    // ----------------------------
    // Application Fleet
    // ----------------------------

    const ec2Sg = new ec2.SecurityGroup(this, "ec2-sg", {
      vpc,
      securityGroupName: "cicd-ec2-sg",
    });
    ec2Sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow all HTTP connection"
    );
    ec2Sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow all SSH connection"
    );

    const userData = ec2.UserData.forLinux();
    userData.addCommands([
      [
        "sudo yum update -y",
        "sudo amazon-linux-extras enable epel",
        "sudo yum install epel-release -y",
        // nginx
        "sudo yum install nginx -y",
        "sudo systemctl start nginx",
      ].join("\n"),
    ]);

    const ec2LaunchTemplate = new ec2.LaunchTemplate(
      this,
      "cicd-ec2-launch-template",
      {
        blockDevices: [
          {
            deviceName: "/dev/xvda",
            volume: BlockDeviceVolume.ebs(10),
          },
        ],
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.SMALL
        ),
        keyName: sshKeyName,
        launchTemplateName: "cicd-ec2",
        machineImage: ec2.MachineImage.latestAmazonLinux({
          generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        }),
        securityGroup: ec2Sg,
        userData,
      }
    );

    const ec2AutoScalingGroup = new AutoScalingGroup(this, "ec2-asg", {
      autoScalingGroupName: "cicd-ec2-asg",
      launchTemplate: ec2LaunchTemplate,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      vpc,
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, "alb", {
      vpc,
      internetFacing: true,
    });
    const listener = alb.addListener("Listener", {
      port: 80,
    });
    listener.addTargets("alb-target-1", {
      port: 80,
      targets: [ec2AutoScalingGroup],
    });

    // ----------------------------
    // S3
    // ----------------------------

    // const artifactBucket = new s3.Bucket(this, "ArtifactBucket", {
    //   removalPolicy: RemovalPolicy.DESTROY,
    // });

    // ----------------------------
    // CodePipeline
    // ----------------------------

    // const sourceArtifact = new codepipeline.Artifact("SourceArtifact");
    // const buildArtifact = new codepipeline.Artifact("BuildArtifact");

    // const buildSpec = codebuild.BuildSpec.fromObject({
    //   version: "0.2",
    //   phases: {
    //     install: {
    //       commands: "yum update -y",
    //     },
    //     pre_build: {
    //       commands: [
    //         "echo Logging in to Amazon ECR",
    //         "aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com",
    //       ],
    //     },
    //     build: {
    //       commands: [
    //         //'echo Dockerfile Linting with Hadolint',
    //         //'docker run --rm -i hadolint/hadolint < Dockerfile',
    //         //'echo Detecting secrets in the repository with TruffleHog',
    //         //'docker run -i -v "$PWD:/pwd" trufflesecurity/trufflehog:latest github --repo $SOURCE_REPO_URL',
    //         "echo Build started on `date`",
    //         "echo Building the Docker image",
    //         "docker build -t $IMAGE_REPO:$IMAGE_TAG .",
    //         "docker tag $IMAGE_REPO:$IMAGE_TAG $IMAGE_REPO_URL:$IMAGE_TAG",
    //       ],
    //     },
    //     post_build: {
    //       commands: [
    //         "echo Build completed on `date`",
    //         "echo Pushing the Docker image to ECR",
    //         "docker push $IMAGE_REPO_URL:$IMAGE_TAG",
    //         "echo Writing image definitions file...",
    //         'printf \'[{"name":"' +
    //           props.env.github_repo +
    //           '","imageUri":"%s"}]\' $IMAGE_REPO_URL:$IMAGE_TAG > imagedefinitions.json',
    //       ],
    //     },
    //   },
    //   artifacts: {
    //     files: "imagedefinitions.json",
    //   },
    // });

    // const buildx86Project = new codebuild.PipelineProject(
    //   this,
    //   "CodeBuildx86",
    //   {
    //     buildSpec,
    //     projectName: "hw2Buildx86",
    //     environment: {
    //       buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
    //       computeType: codebuild.ComputeType.SMALL,
    //       privileged: true,
    //       environmentVariables: {
    //         AWS_DEFAULT_REGION: {
    //           value: props.env.region,
    //         },
    //         AWS_ACCOUNT_ID: {
    //           value: props.env.account,
    //         },
    //         IMAGE_REPO: {
    //           value: imgRepo.repositoryName,
    //         },
    //         IMAGE_REPO_URL: {
    //           value: imgRepo.repositoryUri,
    //         },
    //         IMAGE_TAG: {
    //           value: "amd64-latest",
    //         },
    //         SOURCE_REPO_URL: {
    //           value:
    //             "https://github.com/" +
    //             props.env.github_owner +
    //             "/" +
    //             props.env.github_repo +
    //             ".git",
    //         },
    //       },
    //     },
    //     /*logging: {
    //       cloudWatch: {
    //         enabled: false,
    //       },
    //     },*/
    //     role: codebuildServiceRole,
    //   }
    // );

    // const pipeline = new codepipeline.Pipeline(this, "CodePipeline", {
    //   artifactBucket: artifactBucket,
    //   pipelineName: "hw2Pipeline",
    //   stages: [
    //     {
    //       stageName: "Source",
    //       actions: [
    //         new codepipeline_actions.CodeStarConnectionsSourceAction({
    //           actionName: "GitHub_Source",
    //           owner: props.env.github_owner,
    //           repo: props.env.github_repo,
    //           output: sourceArtifact,
    //           connectionArn: props.env.github_connection_arn,
    //         }),
    //       ],
    //     },
    //     {
    //       stageName: "Build",
    //       actions: [
    //         new codepipeline_actions.CodeBuildAction({
    //           actionName: "x86",
    //           project: buildx86Project,
    //           input: sourceArtifact,
    //           outputs: [buildArtifact],
    //           runOrder: 1,
    //         }),
    //       ],
    //     },
    //     {
    //       stageName: "Deploy",
    //       actions: [
    //         new codepipeline_actions.EcsDeployAction({
    //           actionName: "DeployToECSCluster",
    //           service: loadBalancedFargateService.service,
    //           input: buildArtifact,
    //           runOrder: 1,
    //         }),
    //       ],
    //     },
    //   ],
    // });
  }
}

module.exports = { CicdEc2 };
