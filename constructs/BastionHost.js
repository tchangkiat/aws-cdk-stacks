const { Construct } = require("constructs");
const ec2 = require("aws-cdk-lib/aws-ec2");

class BastionHost extends Construct {
  constructor(scope, id, vpc, props = {}) {
    super(scope, id);

    const securityGroup = new ec2.SecurityGroup(this, id + "-sg", {
      vpc,
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH access"
    );

    const instance = new ec2.Instance(this, id, {
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(8, {
            deleteOnTermination: true,
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      instanceName: props.instanceName || id,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      securityGroup,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    var userData = props.userData
      ? ["sudo yum update -y"].concat(props.userData)
      : ["sudo yum update -y"];
    instance.addUserData(userData.join("\n"));

    return instance;
  }
}

module.exports = { BastionHost };
