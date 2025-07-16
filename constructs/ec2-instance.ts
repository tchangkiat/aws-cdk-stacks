import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { AwsManagedPrefixList } from "../custom-resources/AwsManagedPrefixList";
import { EC2InstanceAccess } from "../constants";

export interface EC2InstanceProps {
  instanceName: string;
  instanceType: string;
  instanceAccess: EC2InstanceAccess;
  sshKeyPairName: string;
  region: string;
  userData?: string[];
}

export class EC2Instance extends Construct {
  constructor(
    scope: Construct,
    id: string,
    vpc: ec2.Vpc,
    props: EC2InstanceProps,
  ) {
    super(scope, id);

    const securityGroup = new ec2.SecurityGroup(this, id + "-sg", {
      vpc,
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
      ec2.Port.tcp(80),
      "Enable connection for web application serving on port 80",
    );

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Enable connection for web application serving on port 443",
    );

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8000),
      "Enable connection for web application serving on port 8000",
    );

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      "Enable connection for web application serving on port 8080",
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
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(32, {
            deleteOnTermination: true,
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      instanceName: props.instanceName ?? id,
      instanceType: new ec2.InstanceType(props.instanceType ?? "t4g.micro"),
      keyPair: ec2.KeyPair.fromKeyPairName(
        this,
        "sshKeyPairName",
        props.sshKeyPairName,
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType:
          !props.instanceType.includes("g.") &&
          !props.instanceType.includes("gn.") &&
          !props.instanceType.includes("gd.") &&
          !props.instanceType.includes("gen.") &&
          !props.instanceType.includes("a1.")
            ? ec2.AmazonLinuxCpuType.X86_64
            : ec2.AmazonLinuxCpuType.ARM_64,
      }),
      securityGroup,
      vpc,
      vpcSubnets: {
        subnetType:
          props.instanceAccess == EC2InstanceAccess.Private
            ? ec2.SubnetType.PRIVATE_ISOLATED
            : ec2.SubnetType.PUBLIC,
      },
    });

    const defaultEC2UserData = [
      "sudo yum update -y",
      // Git
      "sudo yum install git -y",
      // zsh and its dependencies
      "sudo yum install -y zsh util-linux-user",
      // Set zsh as default
      "sudo chsh -s /usr/bin/zsh ec2-user",
      // Install Oh My Zsh
      "sh -c '$(wget https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh -O -)'",
      // Set up Oh My Zsh theme
      "git clone --depth=1 https://github.com/romkatv/powerlevel10k.git /home/ec2-user/.powerlevel10k",
      "curl -o /home/ec2-user/.zshrc https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/zshrc",
      "curl -o /home/ec2-user/.p10k.zsh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/p10k.zsh",
    ];

    const userData =
      props.userData != null
        ? defaultEC2UserData.concat(props.userData)
        : defaultEC2UserData;
    instance.addUserData(userData.join("\n"));

    return instance;
  }
}
