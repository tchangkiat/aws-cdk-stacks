import { type Construct } from "constructs";
import { Stack, type StackProps, CfnOutput, SecretValue } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

import { StandardVpc } from "../constructs/network";

export class EgressVpc extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const prefix = id + "-";

    // ----------------------------
    // Secrets Manager
    // ----------------------------

    new secretsmanager.Secret(this, "psk1", {
      secretName: prefix + "psk1",
      secretObjectValue: {
        psk: SecretValue.unsafePlainText("egress.vpc.psk1"),
      },
    });

    new secretsmanager.Secret(this, "psk2", {
      secretName: prefix + "psk2",
      secretObjectValue: {
        psk: SecretValue.unsafePlainText("egress.vpc.psk2"),
      },
    });

    // ----------------------------
    // VPC
    // ----------------------------

    const egressVpc = new StandardVpc(this, "egress-vpc", {
      maxAzs: 1,
      vpcName: "egress-vpc",
    }) as ec2.Vpc;

    const vpc1 = new ec2.Vpc(this, "vpc-1", {
      ipAddresses: ec2.IpAddresses.cidr("20.0.0.0/16"),
      maxAzs: 1,
      natGateways: 0,
      vpcName: prefix + "vpc-1",
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // ----------------------------
    // Transit Gateway
    // ----------------------------

    const tgw = new ec2.CfnTransitGateway(this, "transit-gateway", {
      description: "Transit Gateway",
      vpnEcmpSupport: "enable",
      defaultRouteTableAssociation: "disable",
      defaultRouteTablePropagation: "disable",
      tags: [
        {
          key: "Name",
          value: prefix + "tgw",
        },
      ],
    });

    const tgwAttachmentVpcEgress = new ec2.CfnTransitGatewayAttachment(
      this,
      "tgw-attachment-egress-vpc",
      {
        transitGatewayId: tgw.ref,
        vpcId: egressVpc.vpcId,
        subnetIds: [egressVpc.privateSubnets[0].subnetId],
        tags: [
          {
            key: "Name",
            value: "tgw-attachment-egress-vpc",
          },
        ],
      },
    );
    tgwAttachmentVpcEgress.addDependency(tgw);

    const tgwAttachmentVpc1 = new ec2.CfnTransitGatewayAttachment(
      this,
      "tgw-attachment-vpc-1",
      {
        transitGatewayId: tgw.ref,
        vpcId: vpc1.vpcId,
        subnetIds: [vpc1.isolatedSubnets[0].subnetId],
        tags: [
          {
            key: "Name",
            value: "tgw-attachment-vpc-1",
          },
        ],
      },
    );
    tgwAttachmentVpc1.addDependency(tgw);

    for (const subnet of egressVpc.publicSubnets) {
      new ec2.CfnRoute(this, subnet.node.id, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: vpc1.vpcCidrBlock,
        transitGatewayId: tgw.ref,
      }).addDependency(tgwAttachmentVpcEgress);
    }

    for (const subnet of vpc1.isolatedSubnets) {
      new ec2.CfnRoute(this, subnet.node.id, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: "0.0.0.0/0",
        transitGatewayId: tgw.ref,
      }).addDependency(tgwAttachmentVpc1);
    }

    const tgwRouteTable = new ec2.CfnTransitGatewayRouteTable(
      this,
      "tgwRouteTable",
      {
        transitGatewayId: tgw.ref,
        tags: [
          {
            key: "Name",
            value: "tgw-route-table",
          },
        ],
      },
    );

    new ec2.CfnTransitGatewayRoute(this, "tgw-route-egress-vpc", {
      transitGatewayRouteTableId: tgwRouteTable.ref,
      transitGatewayAttachmentId: tgwAttachmentVpcEgress.ref,
      destinationCidrBlock: "0.0.0.0/0",
    });

    new ec2.CfnTransitGatewayRouteTableAssociation(
      this,
      "tgw-route-table-association-egress-vpc",
      {
        transitGatewayAttachmentId: tgwAttachmentVpcEgress.ref,
        transitGatewayRouteTableId: tgwRouteTable.ref,
      },
    );

    new ec2.CfnTransitGatewayRouteTablePropagation(
      this,
      "tgw-route-table-propagation-vpc-egress",
      {
        transitGatewayAttachmentId: tgwAttachmentVpcEgress.ref,
        transitGatewayRouteTableId: tgwRouteTable.ref,
      },
    );

    new ec2.CfnTransitGatewayRouteTableAssociation(
      this,
      "tgw-route-table-association-vpc-1",
      {
        transitGatewayAttachmentId: tgwAttachmentVpc1.ref,
        transitGatewayRouteTableId: tgwRouteTable.ref,
      },
    );

    new ec2.CfnTransitGatewayRouteTablePropagation(
      this,
      "tgw-route-table-propagation-vpc-1",
      {
        transitGatewayAttachmentId: tgwAttachmentVpc1.ref,
        transitGatewayRouteTableId: tgwRouteTable.ref,
      },
    );

    // ----------------------------
    // EC2
    // ----------------------------

    const demoInstanceSG = new ec2.SecurityGroup(this, "instance-sg", {
      vpc: vpc1,
      securityGroupName: prefix + "instance-sg",
      allowAllOutbound: true,
      description: "Allows ping from all IP addresses",
    });
    demoInstanceSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allIcmp());

    const latestLinuxAMI = ec2.MachineImage.latestAmazonLinux2023({
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
    });

    const ssmRole = new iam.Role(this, "ssm-role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore",
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy",
        ),
      ],
      // optional inline policy for S3 SSM
      inlinePolicies: {
        ssmS3policy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["s3:GetObject"],
              resources: [
                "arn:aws:s3:::aws-ssm-" + this.region + "/*",
                "arn:aws:s3:::aws-windows-downloads-" + this.region + "/*",
                "arn:aws:s3:::amazon-ssm-" + this.region + "/*",
                "arn:aws:s3:::amazon-ssm-packages-" + this.region + "/*",
                "arn:aws:s3:::" + this.region + "-birdwatcher-prod/*",
                "arn:aws:s3:::patch-baseline-snapshot-" + this.region + "/*",
              ],
            }),
          ],
        }),
      },
    });

    new ec2.CfnInstance(this, "demo-instance", {
      subnetId: vpc1.isolatedSubnets[0].subnetId,
      imageId: latestLinuxAMI.getImage(this).imageId,
      instanceType: "t4g.nano",
      iamInstanceProfile: new iam.CfnInstanceProfile(
        this,
        "demo-instance-profile",
        {
          roles: [ssmRole.roleName],
        },
      ).ref,
      tags: [
        {
          key: "Name",
          value: prefix + "demo-instance",
        },
      ],
      securityGroupIds: [demoInstanceSG.securityGroupId],
    });

    // ------------------------------------------------------------------------------------
    // VPN
    // ------------------------------------------------------------------------------------

    const customerVpc = new ec2.Vpc(this, "customer-vpc", {
      ipAddresses: ec2.IpAddresses.cidr("30.0.0.0/16"),
      maxAzs: 1,
      natGateways: 1,
      vpcName: prefix + "customer-vpc",
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

    const elasticIp = new ec2.CfnEIP(
      this,
      "elastic-ip-for-strongswan-instance",
    );

    const customerGateway = new ec2.CfnCustomerGateway(
      this,
      "customer-gateway",
      {
        bgpAsn: 65000,
        ipAddress: elasticIp.ref,
        type: "ipsec.1",

        tags: [
          {
            key: "Name",
            value: prefix + "cgw",
          },
        ],
      },
    );

    new ec2.CfnVPNConnection(this, "vpn", {
      customerGatewayId: customerGateway.ref,
      type: "ipsec.1",

      staticRoutesOnly: false,
      tags: [
        {
          key: "Name",
          value: prefix + "vpn",
        },
      ],
      transitGatewayId: tgw.ref,
      vpnTunnelOptionsSpecifications: [
        {
          preSharedKey: "egress.vpc.psk1",
          tunnelInsideCidr: "169.254.7.0/30",
        },
        {
          preSharedKey: "egress.vpc.psk2",
          tunnelInsideCidr: "169.254.8.0/30",
        },
      ],
    });

    const demoInstance2SG = new ec2.SecurityGroup(this, "instance-2-sg", {
      vpc: customerVpc,
      securityGroupName: prefix + "instance-2-sg",
      allowAllOutbound: true,
      description: "Allows ping from all IP addresses",
    });
    demoInstance2SG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allIcmp());

    new ec2.CfnInstance(this, "demo-instance-2", {
      subnetId: customerVpc.privateSubnets[0].subnetId,
      imageId: latestLinuxAMI.getImage(this).imageId,
      instanceType: "t4g.nano",
      iamInstanceProfile: new iam.CfnInstanceProfile(
        this,
        "demo-instance-2-profile",
        {
          roles: [ssmRole.roleName],
        },
      ).ref,
      tags: [
        {
          key: "Name",
          value: prefix + "demo-instance-2",
        },
      ],
      securityGroupIds: [demoInstance2SG.securityGroupId],
    });

    new CfnOutput(this, "CustomerGatewayElasticIpAddress", {
      value: elasticIp.ref,
    });

    new CfnOutput(this, "CustomerGatewayElasticIpAllocationId", {
      value: elasticIp.attrAllocationId,
    });
  }
}
