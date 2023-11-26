import { Construct } from "constructs";
import { Stack, StackProps, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { AutoScalingGroup } from "aws-cdk-lib/aws-autoscaling";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codedeploy from "aws-cdk-lib/aws-codedeploy";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

import { StandardVpc } from "../constructs/network";
import { GitHubProps } from "../github-props";

export class CicdEc2 extends Stack {
  constructor(
    scope: Construct,
    id: string,
    github: GitHubProps,
    props?: StackProps
  ) {
    super(scope, id, props);

    // ----------------------------
    // Configuration
    // ----------------------------

    const sshKeyName = "EC2DefaultKeyPair";

    // ----------------------------
    // VPC
    // ----------------------------

    const vpc = new StandardVpc(this, "vpc", {
      vpcName: "cicd-ec2",
    }) as ec2.Vpc;

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
    userData.addCommands(
      [
        "sudo yum update -y",
        "sudo amazon-linux-extras enable epel",
        "sudo yum install epel-release -y",
        // nginx
        "sudo yum install nginx -y",
        "sudo systemctl start nginx",
        // codedeploy-agent
        "sudo yum install ruby -y",
        "cd /home/ec2-user",
        "wget https://aws-codedeploy-ap-southeast-1.s3.ap-southeast-1.amazonaws.com/latest/install",
        "sudo chmod +x ./install",
        "sudo ./install auto",
      ].join("\n")
    );

    const ec2LaunchTemplate = new ec2.LaunchTemplate(
      this,
      "cicd-ec2-launch-template",
      {
        blockDevices: [
          {
            deviceName: "/dev/xvda",
            volume: ec2.BlockDeviceVolume.ebs(10),
          },
        ],
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.SMALL
        ),
        keyName: sshKeyName,
        launchTemplateName: "cicd-ec2",
        machineImage: ec2.MachineImage.latestAmazonLinux2023(),
        role: new iam.Role(this, "instance-profile-role", {
          assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName(
              "AmazonEC2ReadOnlyAccess"
            ),
          ],
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
      internetFacing: true,
      loadBalancerName: "cicd-ec2",
      vpc,
    });
    const listener = alb.addListener("alb-listener", {
      port: 80,
    });
    const targetGroup = listener.addTargets("alb-target-1", {
      port: 80,
      targets: [ec2AutoScalingGroup],
    });
    new CfnOutput(this, "ApplicationLoadBalancerUrl", {
      value: "http://" + alb.loadBalancerDnsName,
    });

    // ----------------------------
    // S3
    // ----------------------------

    const artifactBucket = new s3.Bucket(this, "artifact-bucket", {
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ----------------------------
    // CodePipeline
    // ----------------------------

    const sourceArtifact = new codepipeline.Artifact("source-artifact");
    const buildArtifact = new codepipeline.Artifact("build-artifact");

    const deploymentGroup = new codedeploy.ServerDeploymentGroup(
      this,
      "deployment-group",
      {
        autoScalingGroups: [ec2AutoScalingGroup],
        deploymentConfig: codedeploy.ServerDeploymentConfig.ONE_AT_A_TIME,
        deploymentGroupName: "ec2-deployment-group",
        loadBalancers: [codedeploy.LoadBalancer.application(targetGroup)],
      }
    );

    const pipeline = new codepipeline.Pipeline(this, "pipeline", {
      artifactBucket: artifactBucket,
      pipelineName: "cicd-ec2",
      stages: [
        {
          stageName: "Source",
          actions: [
            new codepipeline_actions.CodeStarConnectionsSourceAction({
              actionName: "Retrieve-Source-Code-From-GitHub",
              owner: github.owner,
              repo: github.repository,
              output: sourceArtifact,
              connectionArn: github.connectionArn,
            }),
          ],
        },
        {
          stageName: "Deploy",
          actions: [
            new codepipeline_actions.CodeDeployServerDeployAction({
              actionName: "Deploy-To-EC2-Instances",
              input: sourceArtifact,
              deploymentGroup,
            }),
          ],
        },
      ],
    });
  }
}
