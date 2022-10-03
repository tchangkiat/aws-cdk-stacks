const { Construct } = require("constructs");
const ec2 = require("aws-cdk-lib/aws-ec2");
const iam = require("aws-cdk-lib/aws-iam");
const eks = require("aws-cdk-lib/aws-eks");

class ManagedNodeGroup extends Construct {
  constructor(scope, id, props = {}) {
    super(scope, id);

    const eksNodeRole = new iam.Role(this, id + "-node-role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      roleName: props.cluster.clusterName + "-" + id + "-node",
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

    const launchTemplate = new ec2.CfnLaunchTemplate(
      this,
      id + "-launch-template",
      {
        launchTemplateName: props.cluster.clusterName + "/" + props.name,
        launchTemplateData: {
          blockDeviceMappings: [
            {
              deviceName: "/dev/xvda",
              ebs: {
                deleteOnTermination: true,
                volumeSize: 20,
                volumeType: "gp3",
              },
            },
          ],
          instanceType: props.instanceType || "m5.large",
          tagSpecifications: [
            {
              resourceType: "instance",
              tags: [
                {
                  key: "Name",
                  value: props.cluster.clusterName + "/" + props.name,
                },
              ],
            },
            {
              resourceType: "volume",
              tags: [
                {
                  key: "Name",
                  value:
                    props.cluster.clusterName + "/" + props.name + "/volume",
                },
              ],
            },
          ],
        },
      }
    );

    return props.cluster.addNodegroupCapacity(id, {
      amiType: props.amiType || eks.NodegroupAmiType.BOTTLEROCKET_X86_64,
      capacityType: props.capacityType || eks.CapacityType.ON_DEMAND,
      desiredSize: props.desiredSize || 0,
      minSize: props.minSize || 0,
      maxSize: props.maxSize || 3,
      nodegroupName: props.name,
      nodeRole: eksNodeRole,
      launchTemplateSpec: {
        id: launchTemplate.ref,
        version: launchTemplate.attrLatestVersionNumber,
      },
      taints: props.taints || [],
    });
  }
}

module.exports = { ManagedNodeGroup };
