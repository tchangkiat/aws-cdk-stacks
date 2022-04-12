const { Stack, Duration } = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const ecs = require("aws-cdk-lib/aws-ecs");
const ecsPatterns = require("aws-cdk-lib/aws-ecs-patterns");
const autoscaling = require("aws-cdk-lib/aws-autoscaling");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");

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

    const vpc = new ec2.Vpc(this, "vpc", {
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
    });

    // ----------------------------
    // ECS Cluster
    // ----------------------------

    const cluster = new ecs.Cluster(this, "EcsCluster", {
      vpc,
    });

    // ----------------------------
    // ECS Cluster > EC2
    // ----------------------------

    // Active
    const activeAutoScalingGroup = new autoscaling.AutoScalingGroup(this, "Ec2ActiveAsg", {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.STANDARD5, ec2.InstanceSize.MEDIUM),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      minCapacity: 1,
      maxCapacity: 2,
    });
    activeAutoScalingGroup.scaleOnCpuUtilization("Ec2ActiveAsgCpuScalability", {
      targetUtilizationPercent: 70,
    });
    const ec2ActiveCapacityProvider = new ecs.AsgCapacityProvider(this, 'Ec2ActiveAsgCapacityProvider', {
      autoScalingGroup: activeAutoScalingGroup,
      capacityProviderName: "Ec2ActiveAsgCapacityProvider"
    });
    cluster.addAsgCapacityProvider(ec2ActiveCapacityProvider);

    // Standby
    const standbyAutoScalingGroup = new autoscaling.AutoScalingGroup(this, "Ec2StandbyAsg", {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MEDIUM),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      minCapacity: 0,
      maxCapacity: 2,
    });
    standbyAutoScalingGroup.scaleOnCpuUtilization("Ec2StandbyAsgCpuScalability", {
      targetUtilizationPercent: 70,
    });
    const ec2StandbyCapacityProvider = new ecs.AsgCapacityProvider(this, 'Ec2StandbyAsgCapacityProvider', {
      autoScalingGroup: standbyAutoScalingGroup,
      capacityProviderName: "Ec2StandbyAsgCapacityProvider"
    });
    cluster.addAsgCapacityProvider(ec2StandbyCapacityProvider);

    const ec2TaskDefinition = new ecs.Ec2TaskDefinition(
      this,
      "Ec2TaskDefinition",
      {
        family: "Ec2TaskDefinition",
      }
    );
    ec2TaskDefinition.addContainer("Ec2App", {
      image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      portMappings: [{ containerPort: 80 }],
      cpu: 256,
      memoryLimitMiB: 512,
      networkMode: ecs.NetworkMode.AWS_VPC,
      compatibility: ecs.Compatibility.EC2,
    });

    const ec2Service = new ecs.Ec2Service(this, 'Ec2Service', {
      cluster,
      taskDefinition: ec2TaskDefinition,
      capacityProviderStrategies: [
        {
          capacityProvider: ec2ActiveCapacityProvider.capacityProviderName,
          base: 2,
          weight: 0,
        },
        {
          capacityProvider: ec2StandbyCapacityProvider.capacityProviderName,
          base: 0,
          weight: 1,
        },
      ],
    });

    // ----------------------------
    // ECS Cluster > Fargate
    // ----------------------------

    const fargateTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "FargateTaskDefinition",
      {
        family: "FargateTaskDefinition",
      }
    );
    fargateTaskDefinition.addContainer("FargateApp", {
      image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      portMappings: [{ containerPort: 80 }],
      cpu: 256,
      memoryLimitMiB: 512,
      networkMode: ecs.NetworkMode.AWS_VPC,
      compatibility: ecs.Compatibility.FARGATE,
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
      loadBalancedFargateService.service.autoScaleTaskCount({ maxCapacity: 5 });
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

    const ec2CpuUtilizationMetric =
      ec2Service.metricCpuUtilization({
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
