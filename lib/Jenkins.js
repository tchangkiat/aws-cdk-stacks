const { Stack, CfnOutput } = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const { StandardVpc } = require("../constructs/Network");

class Jenkins extends Stack {
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

    const jenkinsInstanceSshKeyName = "EC2DefaultKeyPair";

    // ----------------------------
    // VPC
    // ----------------------------

    const vpc = new StandardVpc(this, "vpc", {
      vpcName: "jenkins",
    });

    // ----------------------------
    // Instance to run Jenkins
    // ----------------------------

    const jenkinsSG = new ec2.SecurityGroup(this, "jenkins-sg", {
      vpc,
      allowAllOutbound: true,
    });
    jenkinsSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH access from anywhere"
    );
    jenkinsSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      "Allow port 8080 from anywhere"
    );
    jenkinsSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow port 80 from anywhere"
    );

    const jenkinsInstance = new ec2.Instance(this, "jenkins-instance", {
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(50, {
            deleteOnTermination: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      instanceName: "jenkins",
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.M5,
        ec2.InstanceSize.LARGE
      ),
      keyName: jenkinsInstanceSshKeyName,
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      securityGroup: jenkinsSG,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    jenkinsInstance.addUserData(
      [
        "sudo yum -y update",
        "sudo wget -O /etc/yum.repos.d/jenkins.repo https://pkg.jenkins.io/redhat-stable/jenkins.repo",
        "sudo rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io.key",
        "sudo yum upgrade",
        // AWS CLI
        'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"',
        "unzip awscliv2.zip",
        "sudo ./aws/install",
        // Dependencies
        "sudo amazon-linux-extras install java-openjdk11 -y",
        "sudo yum install git -y",
        "sudo yum install python-pip -y",
        // Jenkins
        "sudo yum install jenkins -y",
        "sudo systemctl enable jenkins",
        "sudo systemctl start jenkins",
      ].join("\n")
    );

    new CfnOutput(this, "Jenkins Instance SSH Command", {
      value:
        "ssh -i " +
        jenkinsInstanceSshKeyName +
        ".pem ec2-user@" +
        jenkinsInstance.instancePublicIp,
    });

    new CfnOutput(this, "Jenkins Instance Connect URL", {
      value:
        "https://" +
        props.env.region +
        ".console.aws.amazon.com/ec2/v2/home?region=" +
        props.env.region +
        "#ConnectToInstance:instanceId=" +
        jenkinsInstance.instanceId,
    });
  }
}

module.exports = { Jenkins };
