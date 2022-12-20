const { Stack, CfnOutput } = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const iam = require("aws-cdk-lib/aws-iam");
const { StandardVpc } = require("../constructs/Network");

class TransitGateway extends Stack {
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

    const bastionHostSshKeyName = "EC2DefaultKeyPair";

    // ----------------------------
    // VPC
    // ----------------------------

    const egressVpc = new StandardVpc(this, "tgw-poc-vpc-egress", {
      maxAzs: 1,
      vpcName: "tgw-poc-vpc-egress",
    });

    const vpc1 = new ec2.Vpc(this, "tgw-poc-vpc-1", {
      ipAddresses: ec2.IpAddresses.cidr("20.0.0.0/16"),
      maxAzs: 1,
      natGateways: 0,
      vpcName: "tgw-poc-vpc-1",
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

    const tgw = new ec2.CfnTransitGateway(this, "tgw", {
      description: "Transit Gateway",
      vpnEcmpSupport: "enable",
      defaultRouteTableAssociation: "disable",
      defaultRouteTablePropagation: "disable",
      tags: [
        {
          key: "Name",
          value: "tgw-poc",
        },
      ],
    });

    const tgwAttachmentVpcEgress = new ec2.CfnTransitGatewayAttachment(
      this,
      "tgw-attachment-vpc-egress",
      {
        transitGatewayId: tgw.ref,
        vpcId: egressVpc.vpcId,
        subnetIds: [egressVpc.privateSubnets[0].subnetId],
        tags: [
          {
            key: "Name",
            value: "tgw-attachment-vpc-egress",
          },
        ],
      }
    );
    tgwAttachmentVpcEgress.addDependsOn(tgw);

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
      }
    );
    tgwAttachmentVpc1.addDependsOn(tgw);

    for (let subnet of egressVpc.publicSubnets) {
      new ec2.CfnRoute(this, subnet.node.id, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: vpc1.vpcCidrBlock,
        transitGatewayId: tgw.ref,
      }).addDependsOn(tgwAttachmentVpcEgress);
    }

    for (let subnet of vpc1.isolatedSubnets) {
      new ec2.CfnRoute(this, subnet.node.id, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: "0.0.0.0/0",
        transitGatewayId: tgw.ref,
      }).addDependsOn(tgwAttachmentVpc1);
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
      }
    );
    const tgwRouteVpcEgress = new ec2.CfnTransitGatewayRoute(
      this,
      "tgw-route-vpc-egress",
      {
        transitGatewayRouteTableId: tgwRouteTable.ref,
        transitGatewayAttachmentId: tgwAttachmentVpcEgress.ref,
        destinationCidrBlock: "0.0.0.0/0",
      }
    );
    const tgwRouteTableAssociationVpcEgress =
      new ec2.CfnTransitGatewayRouteTableAssociation(
        this,
        "tgw-route-table-association-vpc-egress",
        {
          transitGatewayAttachmentId: tgwAttachmentVpcEgress.ref,
          transitGatewayRouteTableId: tgwRouteTable.ref,
        }
      );
    const tgwRouteTablePropagationVpcEgress =
      new ec2.CfnTransitGatewayRouteTablePropagation(
        this,
        "tgw-route-table-propagation-vpc-egress",
        {
          transitGatewayAttachmentId: tgwAttachmentVpcEgress.ref,
          transitGatewayRouteTableId: tgwRouteTable.ref,
        }
      );
    const tgwRouteTableAssociationVpc1 =
      new ec2.CfnTransitGatewayRouteTableAssociation(
        this,
        "tgw-route-table-association-vpc-1",
        {
          transitGatewayAttachmentId: tgwAttachmentVpc1.ref,
          transitGatewayRouteTableId: tgwRouteTable.ref,
        }
      );
    const tgwRouteTablePropagationVpc1 =
      new ec2.CfnTransitGatewayRouteTablePropagation(
        this,
        "tgw-route-table-propagation-vpc-1",
        {
          transitGatewayAttachmentId: tgwAttachmentVpc1.ref,
          transitGatewayRouteTableId: tgwRouteTable.ref,
        }
      );

    // ----------------------------
    // EC2
    // ----------------------------

    const demoInstanceSG = new ec2.SecurityGroup(this, "tgw-poc-instance-sg", {
      vpc: vpc1,
      securityGroupName: "tgw-poc-instance-sg",
      description: "Demo Instance Security Group",
      allowAllOutbound: true,
    });
    demoInstanceSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allIcmp());

    const latestLinuxAMI = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
    });

    const ssmRole = new iam.Role(this, "ssm-role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy"
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

    const demoInstance = new ec2.CfnInstance(this, "demo-instance", {
      subnetId: vpc1.isolatedSubnets[0].subnetId,
      imageId: latestLinuxAMI.getImage(this).imageId,
      instanceType: "t4g.nano",
      iamInstanceProfile: new iam.CfnInstanceProfile(
        this,
        "demo-instance-profile",
        {
          roles: [ssmRole.roleName],
        }
      ).ref,
      tags: [
        {
          key: "Name",
          value: "tgw-poc-demo-instance",
        },
      ],
      securityGroupIds: [demoInstanceSG.securityGroupId],
    });

    // ------------------------------------------------------------------------------------
    // VPN
    // - Comment all the code in this section if VPN connection between the Transit
    //   Gateway and the simulated customer's on-prem environment is not required)
    // ------------------------------------------------------------------------------------

    const customerVpc = new ec2.Vpc(this, "tgw-poc-customer-vpc", {
      ipAddresses: ec2.IpAddresses.cidr("30.0.0.0/16"),
      maxAzs: 1,
      natGateways: 1,
      vpcName: "tgw-poc-customer-vpc",
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
      "elastic-ip-for-strongswan-instance"
    );

    const cgw = new ec2.CfnCustomerGateway(this, "tgw-poc-cgw", {
      bgpAsn: 65000,
      ipAddress: elasticIp.ref,
      type: "ipsec.1",

      tags: [
        {
          key: "Name",
          value: "tgw-poc-cgw",
        },
      ],
    });

    const vpnConnection = new ec2.CfnVPNConnection(this, "tgw-poc-vpn", {
      customerGatewayId: cgw.ref,
      type: "ipsec.1",

      staticRoutesOnly: false,
      tags: [
        {
          key: "Name",
          value: "tgw-poc-vpn",
        },
      ],
      transitGatewayId: tgw.ref,
      vpnTunnelOptionsSpecifications: [
        {
          preSharedKey: "tgw.poc.psk1",
          tunnelInsideCidr: "169.254.7.0/30",
        },
        {
          preSharedKey: "tgw.poc.psk2",
          tunnelInsideCidr: "169.254.8.0/30",
        },
      ],
    });

    const demoInstance2SG = new ec2.SecurityGroup(
      this,
      "tgw-poc-instance-2-sg",
      {
        vpc: customerVpc,
        securityGroupName: "tgw-poc-instance-2-sg",
        description: "Demo Instance 2 Security Group",
        allowAllOutbound: true,
      }
    );
    demoInstance2SG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allIcmp());

    const demoInstance2 = new ec2.CfnInstance(this, "demo-instance-2", {
      subnetId: customerVpc.privateSubnets[0].subnetId,
      imageId: latestLinuxAMI.getImage(this).imageId,
      instanceType: "t4g.nano",
      iamInstanceProfile: new iam.CfnInstanceProfile(
        this,
        "demo-instance-2-profile",
        {
          roles: [ssmRole.roleName],
        }
      ).ref,
      tags: [
        {
          key: "Name",
          value: "tgw-poc-demo-instance-2",
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

module.exports = { TransitGateway };
