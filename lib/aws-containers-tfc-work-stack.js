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

    // Network
    const vpc = new ec2.Vpc(this, "ecs-vpc", {
      cidr: "10.0.0.0/16",
      maxAZs: 3,
      natGateways: 1,
      vpcName: "ECS-VPC",
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "PublicSubnet",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "PrivateSubnet",
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
      ],
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, "ecs-cluster", {
      vpc,
    });

    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, "ecs-asg", {
      vpc,
      instanceType: new ec2.InstanceType("t3.medium"),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      desiredCapacity: 1,
    });
    cluster.addAutoScalingGroup(autoScalingGroup);

    const ec2TaskDefinition = new ecs.Ec2TaskDefinition(
      this,
      "Ec2TaskDefinition",
      {
        family: "Ec2TaskDefinition",
      }
    );
    ec2TaskDefinition.addContainer("ec2App", {
      image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      portMappings: [{ containerPort: 80 }],
      cpu: 256,
      memoryLimitMiB: 512,
    });

    const fargateTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "FargateTaskDefinition",
      {
        family: "FargateTaskDefinition",
      }
    );
    fargateTaskDefinition.addContainer("fargateApp", {
      image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      portMappings: [{ containerPort: 80 }],
      cpu: 256,
      memoryLimitMiB: 512,
    });

    const loadBalancedEc2Service =
      new ecsPatterns.ApplicationLoadBalancedEc2Service(this, "Ec2Service", {
        cluster,
        desiredCount: 1,
        publicLoadBalancer: true,
        taskDefinition: ec2TaskDefinition,
      });
    const ec2ServiceScalability =
      loadBalancedEc2Service.service.autoScaleTaskCount({ maxCapacity: 5 });
    ec2ServiceScalability.scaleOnCpuUtilization("Ec2ServiceScalability", {
      targetUtilizationPercent: 70,
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

    // CloudWatch
    const dashboard = new cloudwatch.Dashboard(this, "CWDashboard", {
      dashboardName: "ECS",
    });

    const ec2CpuUtilizationMetric =
      loadBalancedEc2Service.service.metricCpuUtilization({
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
