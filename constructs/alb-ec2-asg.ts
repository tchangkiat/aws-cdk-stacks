import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { AutoScalingGroup } from "aws-cdk-lib/aws-autoscaling";
import * as iam from "aws-cdk-lib/aws-iam";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

export class AlbEc2Asg extends Construct {
  public Alb: elbv2.ApplicationLoadBalancer;

  constructor(
    scope: Construct,
    id: string,
    vpc: ec2.Vpc,
    sshKeyPairName: string,
  ) {
    super(scope, id);

    const ec2Sg = new ec2.SecurityGroup(this, "ec2Sg", {
      vpc,
      securityGroupName: id + "-ec2-sg",
      description: "Allows port 22 and 80 from all IP addresses",
    });
    ec2Sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow all HTTP connection",
    );
    ec2Sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow all SSH connection",
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
      ].join("\n"),
    );

    const ec2LaunchTemplate = new ec2.LaunchTemplate(
      this,
      "ec2LaunchTemplate",
      {
        blockDevices: [
          {
            deviceName: "/dev/xvda",
            volume: ec2.BlockDeviceVolume.ebs(10),
          },
        ],
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T4G,
          ec2.InstanceSize.SMALL,
        ),
        keyPair: ec2.KeyPair.fromKeyPairName(
          this,
          "sshKeyPairName",
          sshKeyPairName,
        ),
        launchTemplateName: id + "-ec2",
        machineImage: new ec2.AmazonLinuxImage({
          generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
          cpuType: ec2.AmazonLinuxCpuType.ARM_64,
        }),
        role: new iam.Role(this, "instanceProfileRole", {
          assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName(
              "AmazonEC2ReadOnlyAccess",
            ),
          ],
        }),
        securityGroup: ec2Sg,
        userData,
      },
    );

    const ec2AutoScalingGroup = new AutoScalingGroup(this, "ec2Asg", {
      autoScalingGroupName: id + "-ec2-asg",
      launchTemplate: ec2LaunchTemplate,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      vpc,
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, "alb", {
      internetFacing: true,
      loadBalancerName: id + "-alb",
      vpc,
    });
    const listener = alb.addListener("albListener", {
      port: 80,
    });
    listener.addTargets("albTarget1", {
      port: 80,
      targets: [ec2AutoScalingGroup],
    });
    new CfnOutput(this, "ApplicationLoadBalancerUrl", {
      value: "http://" + alb.loadBalancerDnsName,
    });

    this.Alb = alb;
  }
}
