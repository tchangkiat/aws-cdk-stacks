const { Stack, CfnOutput, CfnJson, Tag, Tags } = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const eks = require("aws-cdk-lib/aws-eks");
const iam = require("aws-cdk-lib/aws-iam");

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
    const enableClusterAutoscaler = true;
    
    const bastionHostSshKeyName = "EC2DefaultKeyPair";

    // ----------------------------
    // Network
    // ----------------------------

    const vpc = new ec2.Vpc(this, "vpc", {
      cidr: "10.0.0.0/16",
      maxAZs: 2,
      natGateways: 1,
      vpcName: "eks-vpc",
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
      ],
    });

    for (const subnet of vpc.publicSubnets) {
      Tags.of(subnet).add("kubernetes.io/cluster/" + eksClusterName, "shared");
      Tags.of(subnet).add("kubernetes.io/role/elb", "1");
    }
    for (const subnet of vpc.privateSubnets) {
      Tags.of(subnet).add("kubernetes.io/cluster/" + eksClusterName, "shared");
      Tags.of(subnet).add("kubernetes.io/role/internal-elb", "1");
    }

    // ----------------------------
    // EKS
    // ----------------------------

    const cluster = new eks.Cluster(this, "eks-cluster", {
      albController: {
        version: eks.AlbControllerVersion.V2_4_1,
      },
      clusterLogging: [
        eks.ClusterLoggingTypes.API,
        eks.ClusterLoggingTypes.AUDIT,
      ],
      clusterName: eksClusterName,
      defaultCapacity: 0,
      endpointAccess: eks.EndpointAccess.PRIVATE,
      version: eks.KubernetesVersion.V1_21,
      vpc,
    });

    // ----------------------------
    // EKS > NodeGroup
    // ----------------------------

    const eksNodeLaunchTemplate = new ec2.CfnLaunchTemplate(
      this,
      "eks-node-launch-template",
      {
        launchTemplateName: "eks-" + eksClusterName + "-node-launch-template",
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

    const ng = cluster.addNodegroupCapacity("mng", {
      amiType: eks.NodegroupAmiType.AL2_X86_64,
      desiredSize: 2,
      minSize: 0,
      launchTemplateSpec: {
        id: eksNodeLaunchTemplate.ref,
        version: eksNodeLaunchTemplate.attrLatestVersionNumber,
      },
    });

    // ----------------------------
    // EKS > Cluster Autoscaler
    // ----------------------------

    if (enableClusterAutoscaler) {
      this.enableAutoscaling(cluster, ng);
    }

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
      instanceName: "eks-" + eksClusterName + "-bastion-host",
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      keyName: bastionHostSshKeyName,
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
        // Git
        "sudo yum install git -y",
        // AWS CLI
        'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"',
        "unzip awscliv2.zip",
        "sudo ./aws/install",
        // kubectl
        'curl -o kubectl https://s3.us-west-2.amazonaws.com/amazon-eks/1.22.6/2022-03-09/bin/linux/amd64/kubectl',
        "chmod +x ./kubectl",
        "mkdir -p $HOME/bin && cp ./kubectl $HOME/bin/kubectl && export PATH=$PATH:$HOME/bin",
        "echo 'export PATH=$PATH:$HOME/bin' >> ~/.bashrc",
        // helm
        "curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3",
        "chmod 700 get_helm.sh",
        "./get_helm.sh",
        // eksctl
        'curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp',
        "sudo mv /tmp/eksctl /usr/local/bin",
        // jq
        "sudo yum install jq -y",
      ].join("\n")
    );

    new CfnOutput(this, "EKS Bastion Host Public IP Address", {
      value: bastionHost.instancePublicIp,
    });
  }

  // ----------------------------
  // Cluster Autoscaling Function
  // ----------------------------

  enableAutoscaling(cluster, ng, version = "v1.22.1") {
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
    const autoscalerPolicy = new iam.Policy(this, "cluster-autoscaler-policy", {
      policyName: "ClusterAutoscalerPolicy",
      statements: [autoscalerStmt],
    });
    autoscalerPolicy.attachToRole(ng.role);

    const clusterName = new CfnJson(this, "clusterName", {
      value: cluster.clusterName,
    });
    Tags.of(ng).add(`k8s.io/cluster-autoscaler/${clusterName}`, "owned", {
      applyToLaunchedInstances: true,
    });
    Tags.of(ng).add("k8s.io/cluster-autoscaler/enabled", "true", {
      applyToLaunchedInstances: true,
    });

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
                      "k8s.gcr.io/autoscaling/cluster-autoscaler:" + version,
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
}

module.exports = { EKS };
