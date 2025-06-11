import { type Construct } from "constructs";
import { Stack, type StackProps } from "aws-cdk-lib";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as iam from "aws-cdk-lib/aws-iam";

export class EcsAdot extends Stack {
  public Cluster: ecs.Cluster;
  public FargateService: ecs.FargateService;

  constructor(scope: Construct, id: string, vpc: ec2.Vpc, props?: StackProps) {
    super(scope, id, props);

    const prefix = id + "-demo";

    // ----------------------------
    // ECS Cluster
    // ----------------------------

    this.Cluster = new ecs.Cluster(this, "ecs-cluster", {
      vpc,
      clusterName: prefix,
      enableFargateCapacityProviders: true,
    });
    this.Cluster.addDefaultCapacityProviderStrategy([
      { capacityProvider: "FARGATE", base: 0, weight: 1 },
      { capacityProvider: "FARGATE_SPOT", base: 0, weight: 4 },
    ]);

    // ----------------------------
    // IAM Roles
    // ----------------------------

    const ecsTaskExecutionRole = new iam.Role(this, "ecs-task-execution-role", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      roleName: prefix + "-ecs-task-execution",
    });
    // ecsTaskExecutionRole.addToPolicy(
    // 	new iam.PolicyStatement({
    // 		resources: ["*"],
    // 		actions: [
    // 			"ecr:BatchCheckLayerAvailability",
    // 			"ecr:BatchGetImage",
    // 			"ecr:GetDownloadUrlForLayer",
    // 		],
    // 	}),
    // );
    ecsTaskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: ["ecr:GetAuthorizationToken"],
      }),
    );

    const ecsTaskRole = new iam.Role(this, "ecs-task-role", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      roleName: prefix + "-ecs-task",
    });
    ecsTaskRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:PutRetentionPolicy",
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets",
          "xray:GetSamplingStatisticSummaries",
          "cloudwatch:PutMetricData",
          "ec2:DescribeVolumes",
          "ec2:DescribeTags",
          "ssm:GetParameters",
        ],
      }),
    );

    // ----------------------------
    // Task Definition & Service
    // ----------------------------

    const fgTaskDef = new ecs.FargateTaskDefinition(
      this,
      "fg-task-definition",
      {
        executionRole: ecsTaskExecutionRole,
        taskRole: ecsTaskRole,
        cpu: 256,
        memoryLimitMiB: 512,
      },
    );

    fgTaskDef.addContainer("adot-test-app", {
      image: ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/aws-otel-test/python-flask-manual:dc12d14a5f6f4538226e4cee2772b478b6edb18c",
      ),
      containerName: "adot-test-python-flask-manual",
      portMappings: [{ containerPort: 8080 }],
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: prefix + "/adot-test-app",
      }),
      environment: {
        LISTEN_ADDRESS: "0.0.0.0:8080",
      },
    });

    fgTaskDef.addContainer("adot", {
      image: ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/aws-observability/aws-otel-collector:latest",
      ),
      containerName: "adot-collector",
      command: ["--config=/etc/ecs/ecs-default-config.yaml"],
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: prefix + "/adot",
      }),
    });

    this.FargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      "fg-service",
      {
        cluster: this.Cluster,
        desiredCount: 1,
        publicLoadBalancer: true,
        serviceName: prefix + "-fg-service",
        loadBalancerName: prefix + "-fg-service-lb",
        taskDefinition: fgTaskDef,
        enableECSManagedTags: true,
        propagateTags: ecs.PropagatedTagSource.SERVICE,
        minHealthyPercent: 50,
      },
    ).service;
  }
}
