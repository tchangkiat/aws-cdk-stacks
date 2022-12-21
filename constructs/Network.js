const { Construct } = require("constructs");
const ec2 = require("aws-cdk-lib/aws-ec2");

class StandardVpc extends Construct {
  constructor(scope, id, props = {}) {
    super(scope, id);

    const vpc = new ec2.Vpc(this, "vpc", {
      ipAddresses: props.cidr
        ? ec2.IpAddresses.cidr(props.cidr)
        : ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: props.maxAzs || 2,
      natGateways: props.natGateways || 1,
      vpcName: props.vpcName || "Standard",
      subnetConfiguration: props.subnetConfiguration || [
        {
          cidrMask: props.cidrMask || 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: props.cidrMask || 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    return vpc;
  }
}

module.exports = { StandardVpc };
