const { Stack, Duration, CfnOutput } = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const ecs = require("aws-cdk-lib/aws-ecs");
const ecsPatterns = require("aws-cdk-lib/aws-ecs-patterns");
const autoscaling = require("aws-cdk-lib/aws-autoscaling");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");
const { StandardVpc } = require("../constructs/Network");
const iam = require("aws-cdk-lib/aws-iam");
const ecr = require("aws-cdk-lib/aws-ecr");

class ECS extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const prefix = id + "-demo";

    // ----------------------------
    // IAM Roles
    // ----------------------------

    const ecsTaskExecutionRole = new iam.Role(this, "ecs-task-execution-role", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      roleName: prefix + "-ecs-task-execution",
    });
    ecsTaskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:GetAuthorizationToken",
          "ecr:GetDownloadUrlForLayer",
        ],
      })
    );

    // ----------------------------
    // ECR
    // ----------------------------

    const imgRepo = ecr.Repository.fromRepositoryName(
      this,
      "image-repository",
      "mapl"
    );

    // ----------------------------
    // VPC
    // ----------------------------

    const vpc = new StandardVpc(this, "vpc", { vpcName: prefix });

    // ----------------------------
    // ECS Cluster
    // ----------------------------

    const cluster = new ecs.Cluster(this, "cluster", {
      vpc,
      clusterName: prefix,
    });

    // ----------------------------
    // ECS Cluster > EC2 Capacity Provider
    // ----------------------------

    /*const asg = new autoscaling.AutoScalingGroup(this, "asg", {
      vpc,
      autoScalingGroupName: prefix + "-asg",
      instanceType: new ec2.InstanceType("t3.medium"),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2023(),
      minCapacity: 1,
      maxCapacity: 5,
    });
    asg.scaleOnCpuUtilization("asg-cpu-scaling", {
      targetUtilizationPercent: 70,
    });
    const ec2CapacityProvider = new ecs.AsgCapacityProvider(
      this,
      "ec2-asg-capacity-provider",
      {
        autoScalingGroup: asg,
        capacityProviderName: "ec2",
      }
    );
    cluster.addAsgCapacityProvider(ec2CapacityProvider);

    // Task Definition
    const ec2TaskDefinition = new ecs.Ec2TaskDefinition(
      this,
      "Ec2TaskDefinition",
      { networkMode: ecs.NetworkMode.AWS_VPC }
    );
    ec2TaskDefinition.addContainer("ec2-app", {
      image: ecs.ContainerImage.fromEcrRepository(imgRepo),
      portMappings: [{ containerPort: 8000 }],
      cpu: 256,
      memoryLimitMiB: 512,
    });

    const ec2Service = new ecs.Ec2Service(this, "Ec2Service", {
      cluster,
      taskDefinition: ec2TaskDefinition,
      desiredCount: 1,
      placementStrategies: [
        ecs.PlacementStrategy.spreadAcrossInstances(),
        ecs.PlacementStrategy.packedByCpu(),
      ],
      capacityProviderStrategies: [
        {
          capacityProvider: ec2CapacityProvider.capacityProviderName,
          base: 1,
          weight: 1,
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
    });*/

    // ----------------------------
    // ECS Cluster > Fargate
    // ----------------------------

    const loadBalancedFargateService =
      new ecsPatterns.ApplicationLoadBalancedFargateService(
        this,
        "FargateService",
        {
          cluster,
          desiredCount: 1,
          publicLoadBalancer: true,
          cpu: 256,
          memoryLimitMiB: 512,
          serviceName: prefix + "-fg-service",
          loadBalancerName: prefix + "-fg-service-lb",
          taskImageOptions: {
            image: ecs.ContainerImage.fromEcrRepository(imgRepo),
            containerName: "sample-express-api",
            containerPort: 8000,
            executionRole: ecsTaskExecutionRole,
          },
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
      dashboardName: prefix,
    });

    /*const ec2CpuUtilizationMetric = ec2Service.metricCpuUtilization({
      period: Duration.minutes(1),
      label: "EC2 CPU Utilization",
    });*/

    const fargateCpuUtilizationMetric =
      loadBalancedFargateService.service.metricCpuUtilization({
        period: Duration.minutes(1),
        label: "Fargate CPU Utilization",
      });

    dashboard.addWidgets(
      /*new cloudwatch.GraphWidget({
        left: [ec2CpuUtilizationMetric],
        width: 12,
        title: "EC2 CPU Utilization",
      }),*/
      new cloudwatch.GraphWidget({
        left: [fargateCpuUtilizationMetric],
        width: 12,
        title: "Fargate CPU Utilization",
      })
    );
  }
}

module.exports = { ECS };
