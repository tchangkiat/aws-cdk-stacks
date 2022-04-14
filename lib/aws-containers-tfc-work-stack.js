const { Stack, Duration, CfnOutput } = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const ecs = require("aws-cdk-lib/aws-ecs");
const ecsPatterns = require("aws-cdk-lib/aws-ecs-patterns");
const autoscaling = require("aws-cdk-lib/aws-autoscaling");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");

class AwsContainersTfcWorkStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // ----------------------------
    // Network
    // ----------------------------

    /*const vpc = new ec2.Vpc(this, "vpc", {
      cidr: "10.0.0.0/16",
      maxAZs: 3,
      natGateways: 1,
      vpcName: "TFC-Homework1-VPC",
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
      ],
    });*/

    const vpc = ec2.Vpc.fromLookup(this, "vpc", {
      isDefault: true,
    });

    const ecsEc2SG = new ec2.SecurityGroup(this, "ecs-ec2-security-group", {
      vpc,
      allowAllOutbound: true,
      description: "ECS EC2 Instances SG",
    });
    ecsEc2SG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP traffic"
    );

    // ----------------------------
    // ECS Cluster
    // ----------------------------

    const cluster = new ecs.Cluster(this, "cluster", {
      vpc,
    });

    // ----------------------------
    // ECS Cluster > EC2
    // ----------------------------

    // Active ASG
    const activeAutoScalingGroup = new autoscaling.AutoScalingGroup(
      this,
      "Ec2ActiveAsg",
      {
        vpc,
        instanceType: new ec2.InstanceType("t3.large"),
        machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
        desiredCapacity: 3,
        securityGroup: ecsEc2SG,
      }
    );
    activeAutoScalingGroup.scaleOnCpuUtilization("Ec2ActiveAsgCpuScalability", {
      targetUtilizationPercent: 70,
    });
    const ec2ActiveCapacityProvider = new ecs.AsgCapacityProvider(
      this,
      "Ec2ActiveAsgCapacityProvider",
      {
        autoScalingGroup: activeAutoScalingGroup,
        capacityProviderName: "Ec2ActiveAsgCapacityProvider",
        enableManagedScaling: false,
      }
    );
    cluster.addAsgCapacityProvider(ec2ActiveCapacityProvider);

    // Standby ASG
    const standbyAutoScalingGroup = new autoscaling.AutoScalingGroup(
      this,
      "Ec2StandbyAsg",
      {
        vpc,
        instanceType: new ec2.InstanceType("t3.medium"),
        machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
        minCapacity: 1,
        maxCapacity: 2,
        securityGroup: ecsEc2SG,
      }
    );
    standbyAutoScalingGroup.scaleOnCpuUtilization(
      "Ec2StandbyAsgCpuScalability",
      {
        targetUtilizationPercent: 70,
      }
    );
    const ec2StandbyCapacityProvider = new ecs.AsgCapacityProvider(
      this,
      "Ec2StandbyCapacityProvider",
      {
        autoScalingGroup: standbyAutoScalingGroup,
        capacityProviderName: "Ec2StandbyCapacityProvider",
        enableManagedScaling: false,
      }
    );
    cluster.addAsgCapacityProvider(ec2StandbyCapacityProvider);

    // Task Definition
    const ec2TaskDefinition = new ecs.Ec2TaskDefinition(
      this,
      "Ec2TaskDefinition",
      { networkMode: ecs.NetworkMode.AWS_VPC }
    );
    ec2TaskDefinition.addContainer("WebApp", {
      image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      portMappings: [{ containerPort: 80 }],
      cpu: 256,
      memoryLimitMiB: 512,
    });

    const ec2Service = new ecs.Ec2Service(this, "Ec2Service", {
      cluster,
      taskDefinition: ec2TaskDefinition,
      desiredCount: 3,
      placementStrategies: [
        ecs.PlacementStrategy.spreadAcrossInstances(),
        ecs.PlacementStrategy.packedByCpu(),
      ],
      capacityProviderStrategies: [
        {
          capacityProvider: ec2ActiveCapacityProvider.capacityProviderName,
          base: 3,
          weight: 1,
        },
        {
          capacityProvider: ec2StandbyCapacityProvider.capacityProviderName,
          base: 0,
          weight: 0,
        },
      ],
    });

    const lb = new elbv2.ApplicationLoadBalancer(this, "Ec2ServiceAlb", {
      vpc,
      internetFacing: true,
    });
    const listener = lb.addListener("Ec2ServiceAlbListener", {
      port: 80,
    });
    listener.addTargets("Ec2ServiceAlbTarget", {
      port: 80,
      targets: [
        ec2Service.loadBalancerTarget({
          containerName: "WebApp",
          containerPort: 80,
        }),
      ],
    });

    new CfnOutput(this, "EC2 Service Load Balancer DNS", {
      value: "http://" + lb.loadBalancerDnsName,
    });

    // ----------------------------
    // ECS Cluster > Fargate
    // ----------------------------

    const fargateTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "FargateTaskDefinition"
    );
    fargateTaskDefinition.addContainer("FargateApp", {
      image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      portMappings: [{ containerPort: 80 }],
      cpu: 256,
      memoryLimitMiB: 512,
    });

    const loadBalancedFargateService =
      new ecsPatterns.ApplicationLoadBalancedFargateService(
        this,
        "FargateService",
        {
          cluster,
          desiredCount: 1,
          publicLoadBalancer: true,
          taskDefinition: fargateTaskDefinition,
        }
      );
    const fargateServiceScalability =
      loadBalancedFargateService.service.autoScaleTaskCount({ maxCapacity: 3 });
    fargateServiceScalability.scaleOnCpuUtilization(
      "FargateServiceScalability",
      {
        targetUtilizationPercent: 70,
      }
    );

    // ----------------------------
    // ECS Cluster > CloudWatch
    // ----------------------------

    const dashboard = new cloudwatch.Dashboard(this, "CWDashboard", {
      dashboardName: "ECS",
    });

    const ec2CpuUtilizationMetric = ec2Service.metricCpuUtilization({
      period: Duration.minutes(1),
      label: "EC2 CPU Utilization",
    });

    const fargateCpuUtilizationMetric =
      loadBalancedFargateService.service.metricCpuUtilization({
        period: Duration.minutes(1),
        label: "Fargate CPU Utilization",
      });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        left: [ec2CpuUtilizationMetric],
        width: 12,
        title: "EC2 CPU Utilization",
      }),
      new cloudwatch.GraphWidget({
        left: [fargateCpuUtilizationMetric],
        width: 12,
        title: "Fargate CPU Utilization",
      })
    );
  }
}

module.exports = { AwsContainersTfcWorkStack };
