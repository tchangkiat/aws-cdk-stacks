import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { AwsManagedPrefixList } from "../custom-resources/AwsManagedPrefixList";
import { EC2InstanceAccess, EC2InstanceOS } from "../constants";

export interface EC2InstanceProps {
  vpc: ec2.Vpc;
  instanceName: string;
  instanceType: string;
  instanceAccess: EC2InstanceAccess;
  sshKeyPairName: string;
  region: string;
  os?: EC2InstanceOS;
  userData?: string[];
}

export class EC2Instance extends Construct {
  constructor(scope: Construct, id: string, props: EC2InstanceProps) {
    super(scope, id);

    var machineImage = ec2.MachineImage.latestAmazonLinux2023({
      cpuType:
        !props.instanceType.includes("g.") &&
        !props.instanceType.includes("gn.") &&
        !props.instanceType.includes("gd.") &&
        !props.instanceType.includes("gen.") &&
        !props.instanceType.includes("a1.")
          ? ec2.AmazonLinuxCpuType.X86_64
          : ec2.AmazonLinuxCpuType.ARM_64,
    });
    var blockDevices = [
      {
        deviceName: "/dev/xvda",
        volume: ec2.BlockDeviceVolume.ebs(32, {
          deleteOnTermination: true,
          encrypted: true,
          volumeType: ec2.EbsDeviceVolumeType.GP3,
        }),
      },
    ];
    var user = "ec2-user";
    var installer = "dnf";
    var defaultEC2UserData = [
      "sudo " + installer + " update -y",
      // Git
      "sudo " + installer + " install git -y",
      // zsh and its dependencies
      "sudo " + installer + " install -y zsh util-linux-user",
      // Set zsh as default
      "sudo chsh -s /usr/bin/zsh " + user,
      // Install Oh My Zsh
      "sh -c '$(wget https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh -O -)'",
      // Set up Oh My Zsh theme
      "git clone --depth=1 https://github.com/romkatv/powerlevel10k.git /home/" +
        user +
        "/.powerlevel10k",
      "curl -o /home/" +
        user +
        "/.zshrc https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/zshrc",
      "curl -o /home/" +
        user +
        "/.p10k.zsh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/p10k.zsh",
    ];

    if (props.os == EC2InstanceOS.Ubuntu) {
      machineImage = ec2.MachineImage.genericLinux({
        "ap-southeast-1": "ami-06f87694403c8ae6a",
      });
      blockDevices = [
        {
          deviceName: "/dev/sda1",
          volume: ec2.BlockDeviceVolume.ebs(128, {
            deleteOnTermination: true,
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ];
      user = "ubuntu";
      installer = "apt-get";
      defaultEC2UserData = [
        // zsh and its dependencies
        "sudo " + installer + " install -y zsh util-linux",
        // Set zsh as default
        "sudo chsh -s /usr/bin/zsh " + user,
        "curl -o /home/" +
          user +
          "/omz.sh https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh",
        "su - " + user + " -c '/home/" + user + "/omz.sh'",
        "git clone --depth=1 https://github.com/romkatv/powerlevel10k.git /home/" +
          user +
          "/.powerlevel10k",
        "curl -o /home/" +
          user +
          "/.zshrc https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/zshrc",
        "curl -o /home/" +
          user +
          "/.p10k.zsh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/p10k.zsh",
        "rm /home/" + user + "/omz.sh",
      ];
    }

    const securityGroup = new ec2.SecurityGroup(this, id + "-sg", {
      vpc: props.vpc,
      allowAllOutbound: true,
      securityGroupName: props.instanceName,
    });

    const ec2InstanceConnectPrefixList = new AwsManagedPrefixList(
      this,
      "EC2InstanceConnectPrefixList",
      {
        name: "com.amazonaws." + props.region + ".ec2-instance-connect",
      },
    ).prefixList;

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8000),
      "Enable connection for web application serving on port 8000",
    );

    if (props.instanceAccess == EC2InstanceAccess.InstanceConnect) {
      securityGroup.addIngressRule(
        ec2.Peer.prefixList(ec2InstanceConnectPrefixList.prefixListId),
        ec2.Port.tcp(22),
        "Enable EC2 Instance Connect",
      );
    } else if (props.instanceAccess == EC2InstanceAccess.SSH) {
      securityGroup.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(22),
        "Enable SSH",
      );
    }

    const instance = new ec2.Instance(this, id, {
      blockDevices,
      instanceName: props.instanceName ?? id,
      instanceType: new ec2.InstanceType(props.instanceType ?? "t4g.micro"),
      keyPair: ec2.KeyPair.fromKeyPairName(
        this,
        "sshKeyPairName",
        props.sshKeyPairName,
      ),
      machineImage,
      securityGroup,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType:
          props.instanceAccess == EC2InstanceAccess.Private
            ? ec2.SubnetType.PRIVATE_WITH_EGRESS
            : ec2.SubnetType.PUBLIC,
      },
    });

    const userData = props.userData
      ? defaultEC2UserData.concat(props.userData)
      : defaultEC2UserData;
    instance.addUserData(userData.join("\n"));

    return instance;
  }
}
