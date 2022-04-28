const { Stack, CfnOutput } = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const eks = require("aws-cdk-lib/aws-eks");
const iam = require("aws-cdk-lib/aws-iam");

class Homework3 extends Stack {
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

    const eksClusterName = "Demo";
    const sshKeyName = "EC2DefaultKeyPair";
    const vpcLookupName = "standard-vpc";

    // ----------------------------
    // Network
    // ----------------------------

    const vpc = ec2.Vpc.fromLookup(this, "vpc", {
      vpcName: vpcLookupName,
    });

    // ----------------------------
    // EKS
    // ----------------------------

    const cluster = new eks.Cluster(this, "eks-cluster", {
      clusterLogging: [
        eks.ClusterLoggingTypes.API,
        eks.ClusterLoggingTypes.AUDIT,
      ],
      clusterName: eksClusterName,
      defaultCapacity: 0,
      version: eks.KubernetesVersion.V1_22,
      vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_NAT }],
    });

    const eksNodeLaunchTemplate = new ec2.CfnLaunchTemplate(
      this,
      "eks-node-launch-template",
      {
        launchTemplateData: {
          blockDeviceMappings: [
            {
              deviceName: "/dev/xvda",
              ebs: {
                deleteOnTermination: true,
                volumeSize: 15,
                volumeType: "gp2",
              },
            },
          ],
          instanceType: "t3.medium",
          tagSpecifications: [
            {
              resourceType: "instance",
              tags: [
                {
                  key: "Name",
                  value: "eks-" + eksClusterName + "-node",
                },
              ],
            },
            {
              resourceType: "volume",
              tags: [
                {
                  key: "Name",
                  value: "eks-" + eksClusterName + "-node-volume",
                },
              ],
            },
          ],
        },
      }
    );

    cluster.addNodegroupCapacity("mng", {
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      desiredSize: 2,
      launchTemplateSpec: {
        id: eksNodeLaunchTemplate.ref,
        version: eksNodeLaunchTemplate.attrLatestVersionNumber,
      },
    });

    // ----------------------------
    // Bastion Host to EKS
    // ----------------------------

    const bastionHostSG = new ec2.SecurityGroup(this, "bastion-host-sg", {
      vpc,
      allowAllOutbound: true,
    });
    bastionHostSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH access from anywhere"
    );

    const bastionHost = new ec2.Instance(this, "eks-bastion-host", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      keyName: sshKeyName,
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      securityGroup: bastionHostSG,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    bastionHost.addSecurityGroup(cluster.clusterSecurityGroup);
    bastionHost.addUserData(
      [
        "sudo yum update -y",
        "sudo yum install git -y",
        'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"',
        "unzip awscliv2.zip",
        "sudo ./aws/install",
        'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"',
        "sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl",
        "curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3",
        "chmod 700 get_helm.sh",
        "./get_helm.sh",
        'curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp',
        "sudo mv /tmp/eksctl /usr/local/bin",
        "sudo yum install jq -y",
      ].join("\n")
    );

    new CfnOutput(this, "EKS Bastion Host Public IP Address", {
      value: bastionHost.instancePublicIp,
    });
  }
}

module.exports = { Homework3 };
