const { Stack, CfnOutput, Duration, Tags } = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const iam = require("aws-cdk-lib/aws-iam");
const eks = require("aws-cdk-lib/aws-eks");
const { Karpenter } = require("../constructs/Karpenter");
const { ManagedNodeGroup, ClusterAutoscaler } = require("../constructs/EKS");
const { StandardVPC } = require("../constructs/Network");
const { Autoscaler } = require("../Constants");

class EKS extends Stack {
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

    const bastionHostSshKeyName = "EC2DefaultKeyPair";

    const eksClusterKubernetesVersion = eks.KubernetesVersion.of("1.23");

    const eksClusterName = id + "-demo";

    const autoscaler = props.autoscaler || Autoscaler.Karpenter;

    // ----------------------------
    // VPC
    // ----------------------------

    const vpc = new StandardVPC(this, "vpc", {
      vpcName: eksClusterName,
    });

    for (const subnet of vpc.publicSubnets) {
      // Tags for AWS Load Balancer Controller
      Tags.of(subnet).add("kubernetes.io/cluster/" + eksClusterName, "owned");
      Tags.of(subnet).add("kubernetes.io/role/elb", "1");
    }
    for (const subnet of vpc.privateSubnets) {
      // Tags for AWS Load Balancer Controller
      Tags.of(subnet).add("kubernetes.io/cluster/" + eksClusterName, "owned");
      Tags.of(subnet).add("kubernetes.io/role/internal-elb", "1");
      // Tag for Karpenter
      Tags.of(subnet).add("karpenter.sh/discovery", eksClusterName);
    }

    // ----------------------------
    // IAM
    // ----------------------------

    const eksMasterRole = new iam.Role(this, "master-role", {
      assumedBy: new iam.AccountRootPrincipal(),
      roleName: eksClusterName + "-master",
    });

    // ----------------------------
    // EKS
    // ----------------------------

    const cluster = new eks.Cluster(this, "cluster", {
      clusterLogging: [
        eks.ClusterLoggingTypes.API,
        eks.ClusterLoggingTypes.AUDIT,
      ],
      clusterName: eksClusterName,
      defaultCapacity: 0,
      endpointAccess: eks.EndpointAccess.PRIVATE,
      mastersRole: eksMasterRole,
      version: eksClusterKubernetesVersion,
      vpc,
      tags: {
        "eks-cost-cluster": eksClusterName,
        "eks-cost-workload": "Proof-of-Concept",
        "eks-cost-team": "tck",
      },
    });

    // Equivalent to executing `eksctl utils associate-iam-oidc-provider`
    /*new iam.OpenIdConnectProvider(this, "iam-oidc-provider", {
      clientIds: ["sts.amazonaws.com"],
      url: cluster.clusterOpenIdConnectIssuerUrl,
    });*/

    // ----------------------------
    // Addons NodeGroup
    // ----------------------------

    const addons_mng = new ManagedNodeGroup(this, "addons-mng", {
      cluster,
      desiredSize: 1,
      minSize: 1,
      maxSize: 3,
      nodeGroupName: "addons",
      taints: [
        {
          effect: eks.TaintEffect.NO_SCHEDULE,
          key: "CriticalAddonsOnly",
          value: "true",
        },
      ],
    });

    // ----------------------------
    // Bastion Host
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

    const bastionHost = new ec2.Instance(this, "bastion-host", {
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
      instanceName: eksClusterName + "/bastion-host",
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      keyName: bastionHostSshKeyName,
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      securityGroup: bastionHostSG,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    bastionHost.addSecurityGroup(cluster.clusterSecurityGroup);
    bastionHost.addUserData(
      [
        "sudo yum update -y",
        // Git
        "sudo yum install git -y",
        // AWS CLI
        'curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"',
        "unzip awscliv2.zip",
        "sudo ./aws/install",
        // kubectl
        "curl -o kubectl https://s3.us-west-2.amazonaws.com/amazon-eks/1.22.6/2022-03-09/bin/linux/arm64/kubectl",
        "chmod +x ./kubectl",
        "mkdir -p $HOME/bin && cp ./kubectl $HOME/bin/kubectl && export PATH=$PATH:$HOME/bin",
        "echo 'export PATH=$PATH:$HOME/bin' >> ~/.bashrc",
        // helm
        "curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3",
        "chmod 700 get_helm.sh",
        "./get_helm.sh",
        // eksctl
        'curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_arm64.tar.gz" | tar xz -C /tmp',
        "sudo mv /tmp/eksctl /usr/local/bin",
        // jq
        "sudo yum install jq -y",
        // Environment Variables
        "echo 'export AWS_ACCOUNT_ID=" +
          props.env.account +
          "' >> /home/ec2-user/.bashrc",
        "echo 'export AWS_REGION=" +
          props.env.region +
          "' >> /home/ec2-user/.bashrc",
        "echo 'export AWS_EKS_CLUSTER=" +
          cluster.clusterName +
          "' >> /home/ec2-user/.bashrc",
        "echo 'export AWS_EKS_CLUSTER_MASTER_ROLE=" +
          eksMasterRole.roleArn +
          "' >> /home/ec2-user/.bashrc",
        "echo 'export CONTAINER_IMAGE_URL=" +
          props.env.account +
          ".dkr.ecr." +
          props.env.region +
          ".amazonaws.com/mapl:latest' >> /home/ec2-user/.bashrc",
        // Download script to set up bastion host
        "curl -o /home/ec2-user/setup-bastion-host.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/setup-bastion-host.sh",
        "chmod +x /home/ec2-user/setup-bastion-host.sh",
        // Alias
        "echo 'alias k=kubectl' >> /home/ec2-user/.bashrc",
      ].join("\n")
    );

    Tags.of(bastionHost).add("eks-cost-cluster", eksClusterName);
    Tags.of(bastionHost).add("eks-cost-workload", "Proof-of-Concept");
    Tags.of(bastionHost).add("eks-cost-team", "tck");
    bastionHost.node.addDependency(cluster);

    new CfnOutput(this, "Bastion Host SSH Command", {
      value:
        "ssh -i " +
        bastionHostSshKeyName +
        ".pem ec2-user@" +
        bastionHost.instancePublicIp,
    });

    new CfnOutput(this, "Bastion Host Instance Connect URL", {
      value:
        "https://" +
        props.env.region +
        ".console.aws.amazon.com/ec2/v2/home?region=" +
        props.env.region +
        "#ConnectToInstance:instanceId=" +
        bastionHost.instanceId,
    });

    // ----------------------------
    // Autoscaler
    // ----------------------------

    if (autoscaler == Autoscaler.ClusterAutoscaler) {
      // Grant Cluster Autoscaler permissions to modify Auto Scaling Groups via the node role.
      const autoscalerStmt = new iam.PolicyStatement();
      autoscalerStmt.addResources("*");
      autoscalerStmt.addActions(
        "autoscaling:DescribeAutoScalingGroups",
        "autoscaling:DescribeAutoScalingInstances",
        "autoscaling:DescribeLaunchConfigurations",
        "autoscaling:DescribeTags",
        "autoscaling:SetDesiredCapacity",
        "autoscaling:TerminateInstanceInAutoScalingGroup",
        "ec2:DescribeLaunchTemplateVersions",
        "ec2:DescribeInstanceTypes"
      );
      const autoscalerPolicy = new iam.Policy(
        this,
        "cluster-autoscaler-policy",
        {
          policyName: eksClusterName + "-ClusterAutoscalerPolicy",
          statements: [autoscalerStmt],
        }
      );
      autoscalerPolicy.attachToRole(addons_mng.role);

      // Create a NodeGroup to run workloads on spot instances
      const spot_mng = new ManagedNodeGroup(this, "spot-mng", {
        cluster,
        amiType: eks.NodegroupAmiType.BOTTLEROCKET_X86_64,
        capacityType: eks.CapacityType.SPOT,
        desiredSize: 0,
        instanceType: "t3.medium",
        nodeGroupName: "spot",
      });

      const ca = new ClusterAutoscaler(this, "cluster-autoscaler", {
        cluster,
      });

      ca.addNodeGroups(eksClusterName, [addons_mng, spot_mng]);
    } else {
      const karpenter = new Karpenter(this, "karpenter", {
        cluster,
      });

      karpenter.addProvisioner("spot", {
        weight: 100,
        consolidation: {
          enabled: true,
        },
        requirements: [
          {
            key: "karpenter.sh/capacity-type",
            operator: "In",
            values: ["spot"],
          },
        ],
        limits: {
          resources: {
            cpu: 30,
          },
        },
        provider: {
          amiFamily: "Bottlerocket",
          blockDeviceMappings: [
            {
              deviceName: "/dev/xvda",
              ebs: {
                deleteOnTermination: true,
                volumeSize: "5G",
                volumeType: "gp3",
              },
            },
            {
              deviceName: "/dev/xvdb",
              ebs: {
                deleteOnTermination: true,
                volumeSize: "20G",
                volumeType: "gp3",
              },
            },
          ],
          subnetSelector: {
            "karpenter.sh/discovery": eksClusterName,
          },
          securityGroupSelector: {
            "aws:eks:cluster-name": eksClusterName,
          },
          tags: {
            Name: eksClusterName + "/karpenter/spot",
            "eks-cost-cluster": eksClusterName,
            "eks-cost-workload": "Proof-of-Concept",
            "eks-cost-team": "tck",
          },
        },
      });
    }
  }
}

module.exports = { EKS };
