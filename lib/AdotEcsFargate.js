const { Stack } = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const ecs = require("aws-cdk-lib/aws-ecs");
const ecsPatterns = require("aws-cdk-lib/aws-ecs-patterns");
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");

class AdotEcsFargate extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // ----------------------------
    // Configuration
    // ----------------------------

    const vpcName = "standard";

    // ----------------------------
    // Network
    // ----------------------------

    const vpc = ec2.Vpc.fromLookup(this, "vpc", {
      vpcName,
    });

    // ----------------------------
    // IAM Roles
    // ----------------------------

    const executionRole = new iam.Role(this, "ecsTaskExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    executionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonECSTaskExecutionRolePolicy"
      )
    );

    const taskRole = new iam.Role(this, "adotTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonPrometheusRemoteWriteAccess"
      )
    );
    taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXrayWriteOnlyAccess")
    );

    // ----------------------------
    // CloudWatch Log Groups
    // ----------------------------

    const appLogGroup = new logs.LogGroup(this, "appLogGroup", {
      logGroupName: "/ecs/otel-app",
    });

    const adotLogGroup = new logs.LogGroup(this, "adotLogGroup", {
      logGroupName: "/ecs/ecs-adot-collector",
    });

    const promLogGroup = new logs.LogGroup(this, "promLogGroup", {
      logGroupName: "/ecs/ecs-prom",
    });

    // ----------------------------
    // ECS
    // ----------------------------

    const fargateTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "TaskDef",
      {
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
        },
        memoryLimitMiB: 1024,
        cpu: 256,
        executionRole: executionRole,
        taskRole: taskRole,
      }
    );

    const container = fargateTaskDefinition.addContainer("otel-app", {
      image: ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/one-observability-workshop/demo-sampleapp:latest"
      ),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: "ecs",
        logGroup: appLogGroup,
      }),
    });
    //test app at curl -v http://<IP>/outgoing-http-call

    // Add a port mapping
    container.addPortMappings({
      containerPort: 8080,
      protocol: ecs.Protocol.TCP,
    });

    const otelContainer = fargateTaskDefinition.addContainer(
      "aws-otel-collector",
      {
        image: ecs.ContainerImage.fromRegistry(
          "public.ecr.aws/aws-observability/aws-otel-collector:latest"
        ),
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: "ecs",
          logGroup: adotLogGroup,
        }),
        command: ["--config=/etc/ecs/ecs-amp-xray.yaml"],
        environment: {
          REGION: "ap-southeast-1",
          AWS_PROMETHEUS_ENDPOINT:
            "https://aps-workspaces.ap-southeast-1.amazonaws.com/workspaces/ws-9644d556-9ec0-405b-bf97-3185965dd834/api/v1/remote_write",
        },
      }
    );

    const promContainer = fargateTaskDefinition.addContainer(
      "prometheus-exporter",
      {
        image: ecs.ContainerImage.fromRegistry("prom/prometheus:main"),
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: "ecs",
          logGroup: promLogGroup,
        }),
        environment: {
          REGION: "ap-southeast-1",
        },
      }
    );

    const cluster = new ecs.Cluster(this, "cluster", {
      vpc,
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
  }
}

module.exports = { AdotEcsFargate };
