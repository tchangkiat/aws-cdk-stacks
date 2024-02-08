import { type Construct } from 'constructs'
import { Stack, type StackProps } from 'aws-cdk-lib'
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'

import { StandardVpc } from '../constructs/network'
import { BastionHost } from '../constructs/bastion-host'

export class ALBRuleRestriction extends Stack {
  constructor (scope: Construct, id: string, sshKeyPairName: string, props?: StackProps) {
    super(scope, id, props)

    // ----------------------------
    // VPC
    // ----------------------------x

    const vpc = new StandardVpc(this, 'vpc-1', {
      vpcName: id + '-vpc-1',
      natGateways: 0
    }) as ec2.Vpc

    const vpc2 = new StandardVpc(this, 'vpc-2', {
      vpcName: id + '-vpc-2',
      natGateways: 0,
      cidr: '11.0.0.0/16'
    }) as ec2.Vpc

    const vpcPeering = new ec2.CfnVPCPeeringConnection(
      this,
      id + '-vpc-peering',
      {
        peerVpcId: vpc2.vpcId,
        vpcId: vpc.vpcId
      }
    )

    vpc.publicSubnets.forEach(({ routeTable: { routeTableId } }, index) => {
      new ec2.CfnRoute(
        this,
        id + '-vpc1-peering-connection-public-subnet-route-' + index,
        {
          destinationCidrBlock: '11.0.0.0/16',
          routeTableId,
          vpcPeeringConnectionId: vpcPeering.ref
        }
      )
    })
    vpc.privateSubnets.forEach(({ routeTable: { routeTableId } }, index) => {
      new ec2.CfnRoute(
        this,
        id + '-vpc1-peering-connection-private-subnet-route-' + index,
        {
          destinationCidrBlock: '11.0.0.0/16',
          routeTableId,
          vpcPeeringConnectionId: vpcPeering.ref
        }
      )
    })

    vpc2.publicSubnets.forEach(({ routeTable: { routeTableId } }, index) => {
      new ec2.CfnRoute(
        this,
        id + '-vpc2-peering-connection-public-subnet-route-' + index,
        {
          destinationCidrBlock: '10.0.0.0/16',
          routeTableId,
          vpcPeeringConnectionId: vpcPeering.ref
        }
      )
    })
    vpc2.privateSubnets.forEach(({ routeTable: { routeTableId } }, index) => {
      new ec2.CfnRoute(
        this,
        id + '-vpc2-peering-connection-private-subnet-route-' + index,
        {
          destinationCidrBlock: '10.0.0.0/16',
          routeTableId,
          vpcPeeringConnectionId: vpcPeering.ref
        }
      )
    })

    // ----------------------------
    // EC2 Instances
    // ----------------------------

    new BastionHost(this, id + '-bastion-host', vpc2, sshKeyPairName)

    const ec2Sg = new ec2.SecurityGroup(this, id + '-ec2-sg', {
      vpc,
      securityGroupName: id + '-sg',
      description: 'Allows port 80 and 8080 from all IP addresses'
    })
    ec2Sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow all HTTP connection'
    )
    ec2Sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'Allow all connection for port 8080'
    )

    const userData = ec2.UserData.forLinux()
    userData.addCommands(
      [
        'sudo yum update -y',
        'sudo amazon-linux-extras enable epel',
        'sudo yum install epel-release -y',
        // nginx
        'sudo yum install nginx -y',
        'sudo systemctl start nginx'
      ].join('\n')
    )

    const ec2LaunchTemplate = new ec2.LaunchTemplate(
      this,
      id + '-launch-template',
      {
        blockDevices: [
          {
            deviceName: '/dev/xvda',
            volume: ec2.BlockDeviceVolume.ebs(8)
          }
        ],
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.SMALL
        ),
        launchTemplateName: id + '-launch-template',
        machineImage: ec2.MachineImage.latestAmazonLinux2023(),
        role: new iam.Role(this, 'instance-profile-role', {
          assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName(
              'AmazonEC2ReadOnlyAccess'
            )
          ]
        }),
        securityGroup: ec2Sg,
        userData
      }
    )

    const ec2AutoScalingGroup = new AutoScalingGroup(this, id + '-ec2-asg', {
      autoScalingGroupName: id + '-ec2-asg',
      launchTemplate: ec2LaunchTemplate,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      vpc
    })

    // ----------------------------
    // Application Load Balancer
    // ----------------------------

    const alb = new elbv2.ApplicationLoadBalancer(this, id + '-alb', {
      internetFacing: false,
      loadBalancerName: id + '-alb',
      vpc
    })
    const listener = alb.addListener(id + '-alb-listener-1', {
      port: 80
    })
    listener.addTargets(id + '-alb-target-1', {
      port: 80,
      targets: [ec2AutoScalingGroup],
      conditions: [elbv2.ListenerCondition.sourceIps(['11.0.0.0/16'])],
      priority: 10
    })
    listener.addAction(id + '-default-action-1', {
      action: elbv2.ListenerAction.fixedResponse(403, {
        contentType: 'text/plain',
        messageBody: 'Denied by ALB\n'
      })
    })

    const listener2 = alb.addListener(id + '-alb-listener-2', {
      port: 8080
    })
    listener2.addTargets(id + '-alb-target-2', {
      port: 8080,
      targets: [ec2AutoScalingGroup],
      conditions: [elbv2.ListenerCondition.sourceIps(['12.0.0.0/16'])],
      priority: 10
    })
    listener2.addAction(id + '-default-action-2', {
      action: elbv2.ListenerAction.fixedResponse(403, {
        contentType: 'text/plain',
        messageBody: 'Denied by ALB\n'
      })
    })
  }
}
