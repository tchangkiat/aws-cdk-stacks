const { Aws, CfnJson, Duration } = require("aws-cdk-lib");
const {
  CfnInstanceProfile,
  ManagedPolicy,
  OpenIdConnectPrincipal,
  PolicyStatement,
  Role,
  ServicePrincipal,
} = require("aws-cdk-lib/aws-iam");
const { HelmChart } = require("aws-cdk-lib/aws-eks");
const { Construct } = require("constructs");
const { Rule } = require("aws-cdk-lib/aws-events");
const { SqsQueue } = require("aws-cdk-lib/aws-events-targets");
const { Queue } = require("aws-cdk-lib/aws-sqs");

class Karpenter extends Construct {
  constructor(scope, id, props) {
    super(scope, id);

    this.cluster = props.cluster;
    this.namespace = props.namespace ?? "karpenter";
    this.version = props.version;

    this.interruptionQueue = new Queue(this, "InterruptionQueue", {
      queueName: this.cluster.clusterName,
      retentionPeriod: Duration.minutes(5),
    });

    this.interruptionQueue.addToResourcePolicy(
      new PolicyStatement({
        actions: ["sqs:SendMessage"],
        principals: [
          new ServicePrincipal("events.amazonaws.com"),
          new ServicePrincipal("sqs.amazonaws.com"),
        ],
      })
    );

    [
      new Rule(this, "ScheduledChangeRule", {
        eventPattern: {
          source: ["aws.ec2"],
          detailType: ["EC2 Instance Scheduled Change"],
        },
      }),
      new Rule(this, "SpotInterruptionRule", {
        eventPattern: {
          source: ["aws.ec2"],
          detailType: ["EC2 Spot Instance Interruption Warning"],
        },
      }),
      new Rule(this, "RebalanceRule", {
        eventPattern: {
          source: ["aws.ec2"],
          detailType: ["EC2 Instance Rebalance Recommendation"],
        },
      }),
      new Rule(this, "InstanceStateChangeRule", {
        eventPattern: {
          source: ["aws.ec2"],
          detailType: ["EC2 Instance State-change Notification"],
        },
      }),
    ].forEach((rule) => {
      rule.addTarget(new SqsQueue(this.interruptionQueue));
    });

    /*
     * We create a node role for Karpenter managed nodes, alongside an instance profile for the EC2
     * instances that will be managed by karpenter.
     *
     * We will also create a role mapping in the `aws-auth` ConfigMap so that the nodes can authenticate
     * with the Kubernetes API using IAM.
     */
    this.nodeRole = new Role(this, "NodeRole", {
      assumedBy: new ServicePrincipal(`ec2.${Aws.URL_SUFFIX}`),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AmazonEKS_CNI_Policy"),
        ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSWorkerNodePolicy"),
        ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonEC2ContainerRegistryReadOnly"
        ),
        ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
        // For X-Ray Daemon to send logs to X-Ray
        ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"),
        // For nodes to send logs and metrics to CloudWatch (Container Insights)
        ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
        // For EBS CSI to provision EBS volumes
        ManagedPolicy.fromManagedPolicyArn(
          this,
          "ebs-csi-driver-policy",
          "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
        ),
      ],
      roleName: this.cluster.clusterName + "-karpenter-node",
    });

    this.cluster.awsAuth.addRoleMapping(this.nodeRole, {
      username: "system:node:{{EC2PrivateDNSName}}",
      groups: ["system:bootstrappers", "system:nodes"],
    });

    const instanceProfile = new CfnInstanceProfile(this, "InstanceProfile", {
      roles: [this.nodeRole.roleName],
      instanceProfileName: `${this.cluster.clusterName}`, // Must be specified to avoid CFN error
    });

    const controllerPolicy = new ManagedPolicy(this, "ControllerPolicy", {
      statements: [
        new PolicyStatement({
          actions: [
            "ec2:CreateLaunchTemplate",
            "ec2:CreateFleet",
            "ec2:RunInstances",
            "ec2:CreateTags",
            "ec2:TerminateInstances",
            "ec2:DeleteLaunchTemplate",
            "ec2:DescribeLaunchTemplates",
            "ec2:DescribeInstances",
            "ec2:DescribeSecurityGroups",
            "ec2:DescribeSubnets",
            "ec2:DescribeImages",
            "ec2:DescribeInstanceTypes",
            "ec2:DescribeInstanceTypeOfferings",
            "ec2:DescribeAvailabilityZones",
            "ec2:DescribeSpotPriceHistory",
            "eks:DescribeCluster",
            "ssm:GetParameter",
            "pricing:GetProducts",
          ],
          resources: ["*"],
        }),
        new PolicyStatement({
          actions: [
            "sqs:DeleteMessage",
            "sqs:GetQueueUrl",
            "sqs:GetQueueAttributes",
            "sqs:ReceiveMessage",
          ],
          resources: [this.interruptionQueue.queueArn],
        }),
        new PolicyStatement({
          actions: ["iam:PassRole"],
          resources: [this.nodeRole.roleArn],
        }),
      ],
    });

    const conditions = new CfnJson(this, "ConditionPlainJson", {
      value: {
        [`${this.cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]:
          "sts.amazonaws.com",
        [`${this.cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]:
          "system:serviceaccount:karpenter:karpenter",
      },
    });
    const principal = new OpenIdConnectPrincipal(
      this.cluster.openIdConnectProvider
    ).withConditions({
      StringEquals: conditions,
    });

    this.controllerRole = new Role(this, "ControllerRole", {
      assumedBy: principal,
      description: `This is the IAM role Karpenter uses to allocate compute for ${this.cluster.clusterName}`,
    });
    this.controllerRole.addManagedPolicy(controllerPolicy);

    this.chart = new HelmChart(this, "KarpenterHelmChart", {
      // This one is important, if we don't ask helm to wait for resources to become available, the
      // subsequent creation of karpenter resources will fail.
      wait: true,
      chart: "karpenter",
      release: "karpenter",
      repository: "oci://public.ecr.aws/karpenter/karpenter",
      cluster: this.cluster,
      namespace: this.namespace,
      version: this.version ?? "v0.26.0",
      createNamespace: true,
      timeout: Duration.minutes(15),
      values: {
        serviceAccount: {
          annotations: {
            "eks.amazonaws.com/role-arn": this.controllerRole.roleArn,
          },
        },
        settings: {
          aws: {
            clusterName: this.cluster.clusterName,
            interruptionQueueName: this.interruptionQueue.queueName,
            defaultInstanceProfile: instanceProfile.ref,
          },
        },
      },
    });
  }

  /**
   * addProvisioner adds a provisioner manifest to the cluster. Currently the provisioner spec
   * parameter is relatively free form.
   *
   * @param id - must consist of lower case alphanumeric characters, \'-\' or \'.\', and must start and end with an alphanumeric character
   * @param provisionerSpec - spec of Karpenters Provisioner object.
   */
  addProvisioner(id, provisionerSpec) {
    let m = {
      apiVersion: "karpenter.sh/v1alpha5",
      kind: "Provisioner",
      metadata: {
        name: id,
        namespace: this.namespace,
      },
      spec: {},
    };
    m.spec = provisionerSpec;
    let provisioner = this.cluster.addManifest(id, m);
    provisioner.node.addDependency(this.chart);
  }
}

module.exports = { Karpenter };
