import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as eks from "aws-cdk-lib/aws-eks";
import { Stack } from "aws-cdk-lib";

export interface ManagedNodeGroupProps {
  cluster: eks.Cluster;
  nodeGroupName: string;
  instanceType?: string;
  amiType?: eks.NodegroupAmiType;
  capacityType?: eks.CapacityType;
  taints?: object[];
  tags?: Record<string, string>;
}

export class ManagedNodeGroup extends Construct {
  constructor(scope: Construct, id: string, props: ManagedNodeGroupProps) {
    super(scope, id);

    const cluster = props.cluster;
    const nodeGroupName = props.nodeGroupName;

    const nodeRole = new iam.Role(this, id + "-node-role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      roleName:
        cluster.clusterName + "-" + Stack.of(this).region + "-" + id + "-node",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKS_CNI_Policy"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSWorkerNodePolicy"),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonEC2ContainerRegistryReadOnly",
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore",
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMPatchAssociation"),
        // For X-Ray Daemon to send logs to X-Ray
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"),
        // For nodes to send logs and metrics to CloudWatch (Container Insights)
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy",
        ),
        // For EBS CSI to provision EBS volumes
        iam.ManagedPolicy.fromManagedPolicyArn(
          this,
          "ebs-csi-driver-policy",
          "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy",
        ),
      ],
    });

    const launchTemplate = new ec2.CfnLaunchTemplate(
      this,
      id + "-launch-template",
      {
        launchTemplateName: cluster.clusterName + "/" + nodeGroupName,
        launchTemplateData: {
          blockDeviceMappings: [
            {
              deviceName: "/dev/xvda",
              ebs: {
                deleteOnTermination: true,
                volumeType: "gp3",
              },
            },
            {
              deviceName: "/dev/xvdb",
              ebs: {
                deleteOnTermination: true,
                volumeType: "gp3",
              },
            },
          ],
          instanceType: props.instanceType ?? "c6g.xlarge",
          tagSpecifications: [
            {
              resourceType: "instance",
              tags: [
                {
                  key: "Name",
                  value: cluster.clusterName + "/" + nodeGroupName,
                },
                {
                  key: "eks-cost-cluster",
                  value: cluster.clusterName,
                },
                {
                  key: "eks-cost-workload",
                  value: "Proof-of-Concept",
                },
                {
                  key: "eks-cost-team",
                  value: "tck",
                },
              ],
            },
            {
              resourceType: "volume",
              tags: [
                {
                  key: "Name",
                  value: cluster.clusterName + "/" + nodeGroupName + "/volume",
                },
                {
                  key: "eks-cost-cluster",
                  value: cluster.clusterName,
                },
                {
                  key: "eks-cost-workload",
                  value: "Proof-of-Concept",
                },
                {
                  key: "eks-cost-team",
                  value: "tck",
                },
              ],
            },
          ],
        },
      },
    );

    return cluster.addNodegroupCapacity(id, {
      amiType: props.amiType ?? eks.NodegroupAmiType.BOTTLEROCKET_ARM_64,
      capacityType: props.capacityType ?? eks.CapacityType.ON_DEMAND,
      desiredSize: 1,
      minSize: 0,
      maxSize: 3,
      nodegroupName: nodeGroupName,
      nodeRole: nodeRole,
      launchTemplateSpec: {
        id: launchTemplate.ref,
        version: launchTemplate.attrLatestVersionNumber,
      },
      taints: props.taints ?? [],
      tags: props.tags ?? {},
    });
  }
}
