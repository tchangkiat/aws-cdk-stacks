const { Construct } = require("constructs");
const ec2 = require("aws-cdk-lib/aws-ec2");

class StandardVpc extends Construct {
  constructor(scope, id, props = {}) {
    super(scope, id);

    const useVpcEndpoints = props.useVpcEndpoints || false;

    const vpc = new ec2.Vpc(this, "vpc", {
      gatewayEndpoints: useVpcEndpoints
        ? {
            S3: {
              service: ec2.GatewayVpcEndpointAwsService.S3,
            },
          }
        : null,
      ipAddresses: props.cidr
        ? ec2.IpAddresses.cidr(props.cidr)
        : ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: props.maxAzs || 3,
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

    if (useVpcEndpoints) {
      new ec2.InterfaceVpcEndpoint(this, "vpc-endpoint-ecr-dkr", {
        vpc,
        service: new ec2.InterfaceVpcEndpointService(
          "com.amazonaws.ap-southeast-1.ecr.dkr",
          443
        ),
        privateDnsEnabled: true,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      });

      new ec2.InterfaceVpcEndpoint(this, "vpc-endpoint-ecr-api", {
        vpc,
        service: new ec2.InterfaceVpcEndpointService(
          "com.amazonaws.ap-southeast-1.ecr.api",
          443
        ),
        privateDnsEnabled: true,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      });

      new ec2.InterfaceVpcEndpoint(this, "vpc-endpoint-ec2", {
        vpc,
        service: new ec2.InterfaceVpcEndpointService(
          "com.amazonaws.ap-southeast-1.ec2",
          443
        ),
        privateDnsEnabled: true,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      });

      new ec2.InterfaceVpcEndpoint(this, "vpc-endpoint-logs", {
        vpc,
        service: new ec2.InterfaceVpcEndpointService(
          "com.amazonaws.ap-southeast-1.logs",
          443
        ),
        privateDnsEnabled: true,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      });

      new ec2.InterfaceVpcEndpoint(this, "vpc-endpoint-sts", {
        vpc,
        service: new ec2.InterfaceVpcEndpointService(
          "com.amazonaws.ap-southeast-1.sts",
          443
        ),
        privateDnsEnabled: true,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      });
    }

    return vpc;
  }
}

module.exports = { StandardVpc };
