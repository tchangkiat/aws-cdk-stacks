import { Construct } from "constructs";
import { Stack, StackProps, Duration } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as logs from "aws-cdk-lib/aws-logs";

import { StandardVpc } from "../constructs/network";

export class ECS extends Stack {
  public Vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: StackProps) {
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

    const ecsTaskRole = new iam.Role(this, "ecs-task-role", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      roleName: prefix + "-ecs-task",
    });
    ecsTaskRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: [
          "logs:CreateLogStream",
          "logs:CreateLogGroup",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
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

    const vpc = new StandardVpc(this, "vpc", { vpcName: prefix }) as ec2.Vpc;
    this.Vpc = vpc;

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

    const fgTaskDef = new ecs.FargateTaskDefinition(
      this,
      "fg-task-definition",
      {
        executionRole: ecsTaskExecutionRole,
        taskRole: ecsTaskRole,
        cpu: 512,
        memoryLimitMiB: 1024,
      }
    );

    fgTaskDef.addContainer("sample-express-api", {
      image: ecs.ContainerImage.fromEcrRepository(imgRepo),
      containerName: "sample-express-api",
      portMappings: [{ containerPort: 8000 }],
      cpu: 256,
      memoryReservationMiB: 512,
      logging: ecs.LogDrivers.firelens({
        options: {
          Name: "cloudwatch",
          region: "ap-southeast-1",
          log_group_name: "/aws/containerinsights/" + prefix + "/application",
          auto_create_group: "true",
          log_stream_name: "sample-express-api-$(ecs_task_id)",
          retry_limit: "2",
        },
      }),
    });

    fgTaskDef.addFirelensLogRouter("log-router", {
      essential: true,
      image: ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/aws-observability/aws-for-fluent-bit:latest"
      ),
      containerName: "log_router",
      firelensConfig: { type: ecs.FirelensLogRouterType.FLUENTBIT },
      logging: new ecs.AwsLogDriver({
        streamPrefix: "firelens",
        logGroup: new logs.LogGroup(this, "firelens-container-log-group", {
          logGroupName: "firelens-container",
          retention: logs.RetentionDays.ONE_DAY,
        }),
      }),
      memoryReservationMiB: 50,
    });

    const loadBalancedFargateService =
      new ecsPatterns.ApplicationLoadBalancedFargateService(
        this,
        "FargateService",
        {
          cluster,
          desiredCount: 1,
          publicLoadBalancer: true,
          serviceName: prefix + "-fg-service",
          loadBalancerName: prefix + "-fg-service-lb",
          taskDefinition: fgTaskDef,
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
