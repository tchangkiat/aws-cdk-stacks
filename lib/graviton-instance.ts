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
      // Git
      "sudo yum install git -y",
      // perf
      "sudo yum install perf -y",
      // perl-open; see issue: https://github.com/brendangregg/FlameGraph/issues/245
      "sudo yum install perl-open.noarch -y",
      // zsh and its dependencies
      "sudo yum install -y zsh util-linux-user",
      // Set zsh as default
      "sudo chsh -s /usr/bin/zsh $USER",
      "sudo chsh -s /usr/bin/zsh ec2-user",
      // Install Oh My Zsh
      "sh -c '$(wget https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh -O -)'",
      // Set up Oh My Zsh theme
      "git clone --depth=1 https://github.com/romkatv/powerlevel10k.git /home/ec2-user/.powerlevel10k",
      "curl -o /home/ec2-user/.zshrc https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/zshrc",
      "curl -o /home/ec2-user/.p10k.zsh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/p10k.zsh",
      // Go
      "wget -O /home/ec2-user/go.tar.gz https://go.dev/dl/go1.24.5.linux-arm64.tar.gz",
      "sudo tar -C /usr/local -xzf /home/ec2-user/go.tar.gz",
      "sudo echo 'export PATH=\"$PATH:/usr/local/go/bin\"' >> /home/ec2-user/.bashrc",
      "sudo rm /home/ec2-user/go.tar.gz",
      // APerf
      "wget -O /home/ec2-user/aperf.tar.gz https://github.com/aws/aperf/releases/download/v0.1.15-alpha/aperf-v0.1.15-alpha-aarch64.tar.gz",
      "sudo tar -C /home/ec2-user/ -xzf /home/ec2-user/aperf.tar.gz",
      "sudo mv /home/ec2-user/aperf-v0.1.15-alpha-aarch64 /home/ec2-user/aperf",
      "sudo rm /home/ec2-user/aperf.tar.gz",
      // FlameGraph
      "git clone https://github.com/brendangregg/FlameGraph /home/ec2-user/FlameGraph",
      // Example Golang application
      "git clone https://github.com/tchangkiat/go-gin /home/ec2-user/go-gin",
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
