const { Construct } = require("constructs");
const ec2 = require("aws-cdk-lib/aws-ec2");

class StandardVPC extends Construct {
  constructor(scope, id, props = {}) {
    super(scope, id);

    const vpc = new ec2.Vpc(this, "vpc", {
      cidr: props.cidr || "10.0.0.0/16",
      maxAZs: props.maxAZs || 3,
      natGateways: props.natGateways || 1,
      vpcName: props.vpcName || "standard",
      subnetConfiguration: [
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
  }
}

module.exports = { StandardVPC };
