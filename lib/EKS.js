const {
  Stack,
  CfnOutput,
  CfnJson,
  Duration,
  Tag,
  Tags,
} = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const eks = require("aws-cdk-lib/aws-eks");
const iam = require("aws-cdk-lib/aws-iam");
const {
  Karpenter,
  AMIFamily,
  ArchType,
  CapacityType,
} = require("cdk-karpenter");

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

    const eksClusterName = "Demo";

    const bastionHostSshKeyName = "EC2DefaultKeyPair";

    const eksClusterKubernetesVersion = eks.KubernetesVersion.of("1.23");
    const eksClusterAutoscalerVersion = "v1.25.0";

    const resourcePrefix = id + "-";

    // ----------------------------
    // Network
    // ----------------------------

    const vpc = new ec2.Vpc(this, "vpc", {
      cidr: "10.0.0.0/16",
      maxAZs: 2,
      natGateways: 1,
      vpcName: resourcePrefix + eksClusterName,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    for (const subnet of vpc.publicSubnets) {
      Tags.of(subnet).add("kubernetes.io/cluster/" + eksClusterName, "owned");
      Tags.of(subnet).add("kubernetes.io/role/elb", "1");
    }
    for (const subnet of vpc.privateSubnets) {
      Tags.of(subnet).add("kubernetes.io/cluster/" + eksClusterName, "owned");
      Tags.of(subnet).add("kubernetes.io/role/internal-elb", "1");
    }

    // ----------------------------
    // IAM
    // ----------------------------

    const eksMasterRole = new iam.Role(this, "master-role", {
      assumedBy: new iam.AccountRootPrincipal(),
      roleName: resourcePrefix + eksClusterName + "-master",
    });

    const eksNodeRole = new iam.Role(this, "node-role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      roleName: resourcePrefix + eksClusterName + "-node",
    });
    eksNodeRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSWorkerNodePolicy")
    );
    eksNodeRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonEC2ContainerRegistryReadOnly"
      )
    );
    eksNodeRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy")
    );
    eksNodeRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );
    eksNodeRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKS_CNI_Policy")
    );
    eksNodeRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMPatchAssociation")
    );

    // ----------------------------
    // EKS
    // ----------------------------

    const cluster = new eks.Cluster(this, "cluster", {
      clusterLogging: [
        eks.ClusterLoggingTypes.API,
        eks.ClusterLoggingTypes.AUDIT,
      ],
      clusterName: resourcePrefix + eksClusterName,
      defaultCapacity: 0,
      endpointAccess: eks.EndpointAccess.PRIVATE,
      mastersRole: eksMasterRole,
      version: eksClusterKubernetesVersion,
      vpc,
    });

    // Equivalent to executing `eksctl utils associate-iam-oidc-provider`
    /*new iam.OpenIdConnectProvider(this, "iam-oidc-provider", {
      clientIds: ["sts.amazonaws.com"],
      url: cluster.clusterOpenIdConnectIssuerUrl,
    });*/

    // ----------------------------
    // EKS > NodeGroup
    // ----------------------------

    // Graviton instances are not used for the managed node groups because App Mesh Controller does not support them.
    // App Mesh Controller Pod will be stuck in "CrashLoopBackOff" status.
    // Error: exec /controller: exec format error.

    const eksAddOnsNodeLaunchTemplate = new ec2.CfnLaunchTemplate(
      this,
      "addons-node-launch-template",
      {
        launchTemplateName:
          resourcePrefix + eksClusterName + "-addons-node-launch-template",
        launchTemplateData: {
          blockDeviceMappings: [
            {
              deviceName: "/dev/xvda",
              ebs: {
                deleteOnTermination: true,
                volumeSize: 25,
                volumeType: "gp3",
              },
            },
          ],
          instanceType: "m5.large",
          tagSpecifications: [
            {
              resourceType: "instance",
              tags: [
                {
                  key: "Name",
                  value: resourcePrefix + eksClusterName + "-addons-node",
                },
              ],
            },
            {
              resourceType: "volume",
              tags: [
                {
                  key: "Name",
                  value:
                    resourcePrefix + eksClusterName + "-addons-node-volume",
                },
              ],
            },
          ],
        },
      }
    );

    const addons_mng = cluster.addNodegroupCapacity("addons-mng", {
      amiType: eks.NodegroupAmiType.BOTTLEROCKET_X86_64,
      desiredSize: 2,
      minSize: 2,
      maxSize: 3,
      nodegroupName: resourcePrefix + eksClusterName + "-addons",
      nodeRole: eksNodeRole,
      launchTemplateSpec: {
        id: eksAddOnsNodeLaunchTemplate.ref,
        version: eksAddOnsNodeLaunchTemplate.attrLatestVersionNumber,
      },
      taints: [
        {
          effect: eks.TaintEffect.NO_SCHEDULE,
          key: "CriticalAddonsOnly",
          value: "yes",
        },
      ],
    });

    /*const eksSpotNodeLaunchTemplate = new ec2.CfnLaunchTemplate(
      this,
      "spot-node-launch-template",
      {
        launchTemplateName:
          resourcePrefix + eksClusterName + "-spot-node-launch-template",
        launchTemplateData: {
          blockDeviceMappings: [
            {
              deviceName: "/dev/xvda",
              ebs: {
                deleteOnTermination: true,
                volumeSize: 25,
                volumeType: "gp3",
              },
            },
          ],
          instanceType: "m5.large",
          tagSpecifications: [
            {
              resourceType: "instance",
              tags: [
                {
                  key: "Name",
                  value: resourcePrefix + eksClusterName + "-spot-node",
                },
              ],
            },
            {
              resourceType: "volume",
              tags: [
                {
                  key: "Name",
                  value: resourcePrefix + eksClusterName + "-spot-node-volume",
                },
              ],
            },
          ],
        },
      }
    );

    const spot_mng = cluster.addNodegroupCapacity("spot-mng", {
      amiType: eks.NodegroupAmiType.BOTTLEROCKET_X86_64,
      capacityType: eks.CapacityType.SPOT,
      desiredSize: 0,
      minSize: 0,
      maxSize: 4,
      nodegroupName: resourcePrefix + eksClusterName + "-spot",
      nodeRole: eksNodeRole,
      launchTemplateSpec: {
        id: eksSpotNodeLaunchTemplate.ref,
        version: eksSpotNodeLaunchTemplate.attrLatestVersionNumber,
      },
    });*/

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

    const bastionHost = new ec2.Instance(this, "bastion-host", {
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(8, {
            deleteOnTermination: true,
            encrypted: true,
          }),
        },
      ],
      instanceName: resourcePrefix + eksClusterName + "-bastion-host",
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
    // EKS > Cluster Autoscaler
    // ----------------------------

    /*const clusterName = new CfnJson(this, "clusterName", {
      value: cluster.clusterName,
    });

    this.configureNodeGroupForAutoscaling(clusterName, mng, "od-mng-");

    this.configureNodeGroupForAutoscaling(clusterName, spot_mng, "spot-mng-");

    new eks.KubernetesManifest(this, "cluster-autoscaler", {
      cluster,
      manifest: [
        {
          apiVersion: "v1",
          kind: "ServiceAccount",
          metadata: {
            name: "cluster-autoscaler",
            namespace: "kube-system",
            labels: {
              "k8s-addon": "cluster-autoscaler.addons.k8s.io",
              "k8s-app": "cluster-autoscaler",
            },
          },
        },
        {
          apiVersion: "rbac.authorization.k8s.io/v1",
          kind: "ClusterRole",
          metadata: {
            name: "cluster-autoscaler",
            namespace: "kube-system",
            labels: {
              "k8s-addon": "cluster-autoscaler.addons.k8s.io",
              "k8s-app": "cluster-autoscaler",
            },
          },
          rules: [
            {
              apiGroups: [""],
              resources: ["events", "endpoints"],
              verbs: ["create", "patch"],
            },
            {
              apiGroups: [""],
              resources: ["pods/eviction"],
              verbs: ["create"],
            },
            {
              apiGroups: [""],
              resources: ["pods/status"],
              verbs: ["update"],
            },
            {
              apiGroups: [""],
              resources: ["endpoints"],
              resourceNames: ["cluster-autoscaler"],
              verbs: ["get", "update"],
            },
            {
              apiGroups: ["coordination.k8s.io"],
              resources: ["leases"],
              verbs: ["watch", "list", "get", "patch", "create", "update"],
            },
            {
              apiGroups: [""],
              resources: ["nodes"],
              verbs: ["watch", "list", "get", "update"],
            },
            {
              apiGroups: [""],
              resources: [
                "pods",
                "services",
                "replicationcontrollers",
                "persistentvolumeclaims",
                "persistentvolumes",
              ],
              verbs: ["watch", "list", "get"],
            },
            {
              apiGroups: ["extensions"],
              resources: ["replicasets", "daemonsets"],
              verbs: ["watch", "list", "get"],
            },
            {
              apiGroups: ["policy"],
              resources: ["poddisruptionbudgets"],
              verbs: ["watch", "list"],
            },
            {
              apiGroups: ["apps"],
              resources: ["statefulsets", "replicasets", "daemonsets"],
              verbs: ["watch", "list", "get"],
            },
            {
              apiGroups: ["storage.k8s.io"],
              resources: ["storageclasses", "csinodes"],
              verbs: ["watch", "list", "get"],
            },
            {
              apiGroups: ["batch", "extensions"],
              resources: ["jobs"],
              verbs: ["get", "list", "watch", "patch"],
            },
          ],
        },
        {
          apiVersion: "rbac.authorization.k8s.io/v1",
          kind: "Role",
          metadata: {
            name: "cluster-autoscaler",
            namespace: "kube-system",
            labels: {
              "k8s-addon": "cluster-autoscaler.addons.k8s.io",
              "k8s-app": "cluster-autoscaler",
            },
          },
          rules: [
            {
              apiGroups: [""],
              resources: ["configmaps"],
              verbs: ["create", "list", "watch"],
            },
            {
              apiGroups: [""],
              resources: ["configmaps"],
              resourceNames: [
                "cluster-autoscaler-status",
                "cluster-autoscaler-priority-expander",
              ],
              verbs: ["delete", "get", "update", "watch"],
            },
          ],
        },
        {
          apiVersion: "rbac.authorization.k8s.io/v1",
          kind: "ClusterRoleBinding",
          metadata: {
            name: "cluster-autoscaler",
            namespace: "kube-system",
            labels: {
              "k8s-addon": "cluster-autoscaler.addons.k8s.io",
              "k8s-app": "cluster-autoscaler",
            },
          },
          roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "ClusterRole",
            name: "cluster-autoscaler",
          },
          subjects: [
            {
              kind: "ServiceAccount",
              name: "cluster-autoscaler",
              namespace: "kube-system",
            },
          ],
        },
        {
          apiVersion: "rbac.authorization.k8s.io/v1",
          kind: "RoleBinding",
          metadata: {
            name: "cluster-autoscaler",
            namespace: "kube-system",
            labels: {
              "k8s-addon": "cluster-autoscaler.addons.k8s.io",
              "k8s-app": "cluster-autoscaler",
            },
          },
          roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "Role",
            name: "cluster-autoscaler",
          },
          subjects: [
            {
              kind: "ServiceAccount",
              name: "cluster-autoscaler",
              namespace: "kube-system",
            },
          ],
        },
        {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: {
            name: "cluster-autoscaler",
            namespace: "kube-system",
            labels: {
              app: "cluster-autoscaler",
            },
            annotations: {
              "cluster-autoscaler.kubernetes.io/safe-to-evict": "false",
            },
          },
          spec: {
            replicas: 1,
            selector: {
              matchLabels: {
                app: "cluster-autoscaler",
              },
            },
            template: {
              metadata: {
                labels: {
                  app: "cluster-autoscaler",
                },
                annotations: {
                  "prometheus.io/scrape": "true",
                  "prometheus.io/port": "8085",
                },
              },
              spec: {
                serviceAccountName: "cluster-autoscaler",
                containers: [
                  {
                    image:
                      "k8s.gcr.io/autoscaling/cluster-autoscaler:" +
                      eksClusterAutoscalerVersion,
                    name: "cluster-autoscaler",
                    resources: {
                      limits: {
                        cpu: "100m",
                        memory: "300Mi",
                      },
                      requests: {
                        cpu: "100m",
                        memory: "300Mi",
                      },
                    },
                    command: [
                      "./cluster-autoscaler",
                      "--v=4",
                      "--stderrthreshold=info",
                      "--cloud-provider=aws",
                      "--skip-nodes-with-local-storage=false",
                      "--expander=least-waste",
                      "--node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/" +
                        cluster.clusterName,
                      "--balance-similar-node-groups",
                      "--skip-nodes-with-system-pods=false",
                    ],
                    volumeMounts: [
                      {
                        name: "ssl-certs",
                        mountPath: "/etc/ssl/certs/ca-certificates.crt",
                        readOnly: true,
                      },
                    ],
                    imagePullPolicy: "Always",
                  },
                ],
                volumes: [
                  {
                    name: "ssl-certs",
                    hostPath: {
                      path: "/etc/ssl/certs/ca-bundle.crt",
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    });
  }

  configureNodeGroupForAutoscaling(clusterName, ng, prefix) {
    const autoscalerStmt = new iam.PolicyStatement();
    autoscalerStmt.addResources("*");
    autoscalerStmt.addActions(
      "autoscaling:DescribeAutoScalingGroups",
      "autoscaling:DescribeAutoScalingInstances",
      "autoscaling:DescribeLaunchConfigurations",
      "autoscaling:DescribeTags",
      "autoscaling:SetDesiredCapacity",
      "autoscaling:TerminateInstanceInAutoScalingGroup",
      "ec2:DescribeLaunchTemplateVersions"
    );
    const autoscalerPolicy = new iam.Policy(
      this,
      prefix + "cluster-autoscaler-policy",
      {
        policyName: prefix + "ClusterAutoscalerPolicy",
        statements: [autoscalerStmt],
      }
    );
    autoscalerPolicy.attachToRole(ng.role);

    Tags.of(ng).add(`k8s.io/cluster-autoscaler/${clusterName}`, "owned", {
      applyToLaunchedInstances: true,
    });
    Tags.of(ng).add("k8s.io/cluster-autoscaler/enabled", "true", {
      applyToLaunchedInstances: true,
    });*/

    // ----------------------------
    // EKS > Karpenter
    // ----------------------------

    const karpenter = new Karpenter(this, "karpenter", {
      cluster,
      vpc,
    });

    karpenter.addProvisioner("custom", {
      requirements: {
        archTypes: [ArchType.AMD64],
        capacityTypes: [CapacityType.SPOT],
        instanceTypes: [
          ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE),
          ec2.InstanceType.of(ec2.InstanceClass.M5A, ec2.InstanceSize.LARGE),
        ],
      },
      ttlSecondsAfterEmpty: Duration.minutes(15),
      ttlSecondsUntilExpired: Duration.days(14),
      limits: {
        cpu: "10",
      },
      provider: {
        amiFamily: AMIFamily.BOTTLEROCKET,
        tags: {
          name: resourcePrefix + eksClusterName + "-spot-node",
        },
        blockDeviceMappings: [
          {
            deviceName: resourcePrefix + eksClusterName + "-spot-node-volume",
            ebs: {
              deleteOnTermination: true,
              volumeSize: "25G",
              volumeType: ec2.EbsDeviceVolumeType.GP3,
            },
          },
        ],
      },
    });
  }
}

module.exports = { EKS };
