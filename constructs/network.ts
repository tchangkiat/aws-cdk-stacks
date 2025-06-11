import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface StandardVpcProps {
  cidr?: string;
  maxAzs?: number;
  natGateways?: number;
  vpcName?: string;
  subnetConfiguration?: ec2.SubnetConfiguration[];
}

export class StandardVpc extends Construct {
  constructor(scope: Construct, id: string, props: StandardVpcProps = {}) {
    super(scope, id);

    const vpc = new ec2.Vpc(this, "vpc", {
      ipAddresses:
        props.cidr != null
          ? ec2.IpAddresses.cidr(props.cidr)
          : ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: props.maxAzs ?? 2,
      natGateways: props.natGateways ?? 1,
      vpcName: props.vpcName ?? "Standard",
      subnetConfiguration: props.subnetConfiguration ?? [
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

    return vpc;
  }
}
