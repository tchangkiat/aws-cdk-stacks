import { type Construct } from "constructs";
import { CfnOutput, Stack, type StackProps, aws_ec2 as ec2 } from "aws-cdk-lib";

export class GravitonInstance extends Stack {
  constructor(
    scope: Construct,
    id: string,
    vpc: ec2.Vpc,
    sshKeyPairName: string,
    props?: StackProps,
  ) {
    super(scope, id, props);

    const securityGroup = new ec2.SecurityGroup(this, id + "-sg", {
      vpc,
      allowAllOutbound: true,
      securityGroupName: "graviton-instance",
    });
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Enable SSH",
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8000),
      "Enable connection to web application serving on port 8000",
    );

    const instance = new ec2.Instance(this, id, {
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(20, {
            deleteOnTermination: true,
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      instanceName: "graviton-instance",
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.C7G,
        ec2.InstanceSize.XLARGE,
      ),
      keyPair: ec2.KeyPair.fromKeyPairName(
        this,
        "sshKeyPairName",
        sshKeyPairName,
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      securityGroup,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const userData = [
      "sudo yum update -y",
      "curl -o setup.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/setup-graviton-instance.sh",
      "sh setup.sh",
    ];
    instance.addUserData(userData.join("\n"));

    new CfnOutput(this, "Instance Connect URL", {
      value:
        "https://" +
        this.region +
        ".console.aws.amazon.com/ec2/v2/home?region=" +
        this.region +
        "#ConnectToInstance:instanceId=" +
        instance.instanceId,
    });
  }
}
