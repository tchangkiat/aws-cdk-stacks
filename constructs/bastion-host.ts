import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { AwsManagedPrefixList } from "../custom-resources/AwsManagedPrefixList";

export interface BastionHostProps {
	region?: string;
	instanceName?: string;
	userData?: string[];
}

export class BastionHost extends Construct {
	constructor(
		scope: Construct,
		id: string,
		vpc: ec2.Vpc,
		sshKeyPairName: string,
		props?: BastionHostProps,
	) {
		super(scope, id);

		const ec2InstanceConnectPrefixList = new AwsManagedPrefixList(this, 'EC2InstanceConnectPrefixList', {
			name: "com.amazonaws." + props?.region + ".ec2-instance-connect",
		  }).prefixList;

		const securityGroup = new ec2.SecurityGroup(this, id + "-sg", {
			vpc,
			allowAllOutbound: true,
			securityGroupName: "Bastion Host"
		});
		securityGroup.addIngressRule(
			ec2.Peer.prefixList(ec2InstanceConnectPrefixList.prefixListId),
			ec2.Port.tcp(22),
			"Enable EC2 Instance Connect",
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
			instanceName: props?.instanceName ?? id,
			instanceType: ec2.InstanceType.of(
				ec2.InstanceClass.T4G,
				ec2.InstanceSize.MICRO,
			),
			keyPair: ec2.KeyPair.fromKeyPairName(this, "sshKeyPairName", sshKeyPairName),
			machineImage: ec2.MachineImage.latestAmazonLinux2023({
				cpuType: ec2.AmazonLinuxCpuType.ARM_64,
			}),
			securityGroup,
			vpc,
			vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
		});

		const userData =
			props?.userData != null
				? ["sudo yum update -y"].concat(props.userData)
				: ["sudo yum update -y"];
		instance.addUserData(userData.join("\n"));

		return instance;
	}
}
