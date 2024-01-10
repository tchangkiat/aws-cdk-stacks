import { type Construct } from 'constructs'
import { Stack, type StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib'
import type * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns'
// import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
// import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from 'aws-cdk-lib/aws-iam'
import type * as ecr from 'aws-cdk-lib/aws-ecr'
import * as logs from 'aws-cdk-lib/aws-logs'

export class ECS extends Stack {
  public Cluster: ecs.Cluster
  public FargateService: ecs.FargateService

  constructor (scope: Construct, id: string, vpc: ec2.Vpc, repository: ecr.Repository, props?: StackProps) {
    super(scope, id, props)

    const prefix = id + '-demo'

    // ----------------------------
    // ECS Cluster
    // ----------------------------

    this.Cluster = new ecs.Cluster(this, 'ecs-cluster', {
      vpc,
      clusterName: prefix
    })

    // ----------------------------
    // CloudWatch Log Group
    // ----------------------------

    const logGroup = new logs.LogGroup(this, 'log-group', {
      logGroupName: prefix,
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: RemovalPolicy.DESTROY
    })

    // ----------------------------
    // IAM Roles
    // ----------------------------

    const ecsTaskExecutionRole = new iam.Role(this, 'ecs-task-execution-role', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: prefix + '-ecs-task-execution'
    })
    ecsTaskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        resources: [repository.repositoryArn],
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:BatchGetImage',
          'ecr:GetDownloadUrlForLayer'
        ]
      })
    )
    ecsTaskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: [
          'ecr:GetAuthorizationToken'
        ]
      })
    )

    const ecsTaskRole = new iam.Role(this, 'ecs-task-role', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: prefix + '-ecs-task'
    })
    ecsTaskRole.addToPolicy(
      new iam.PolicyStatement({
        resources: [logGroup.logGroupArn, 'arn:aws:logs:' + this.region + ':' + this.account + ':log-group:/aws/ecs/containerinsights/' + prefix + '/*'],
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:DescribeLogStreams',
          'logs:PutLogEvents'
        ]
      })
    )

    // ----------------------------
    // ECS Cluster > EC2 Capacity Provider
    // ----------------------------

    /* const asg = new autoscaling.AutoScalingGroup(this, "asg", {
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
    this.Cluster.addAsgCapacityProvider(ec2CapacityProvider);

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
      cluster: this.Cluster,
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
    }); */

    // ----------------------------
    // ECS Cluster > Fargate
    // ----------------------------

    const fgTaskDef = new ecs.FargateTaskDefinition(
      this,
      'fg-task-definition',
      {
        executionRole: ecsTaskExecutionRole,
        taskRole: ecsTaskRole,
        cpu: 512,
        memoryLimitMiB: 1024
      }
    )

    fgTaskDef.addContainer('sample-express-api', {
      image: ecs.ContainerImage.fromEcrRepository(repository),
      containerName: 'sample-express-api',
      portMappings: [{ containerPort: 8000 }],
      cpu: 256,
      memoryReservationMiB: 512,
      logging: ecs.LogDrivers.firelens({
        options: {
          Name: 'cloudwatch',
          region: 'ap-southeast-1',
          log_group_name: '/aws/ecs/containerinsights/' + prefix + '/application',
          auto_create_group: 'true',
          log_stream_name: 'sample-express-api-$(ecs_task_id)',
          retry_limit: '2'
        }
      })
    })

    fgTaskDef.addFirelensLogRouter('log-router', {
      essential: true,
      image: ecs.ContainerImage.fromRegistry(
        'public.ecr.aws/aws-observability/aws-for-fluent-bit:latest'
      ),
      containerName: 'log_router',
      firelensConfig: { type: ecs.FirelensLogRouterType.FLUENTBIT },
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'firelens',
        logGroup
      }),
      memoryReservationMiB: 50
    })

    this.FargateService =
      new ecsPatterns.ApplicationLoadBalancedFargateService(
        this,
        'fg-service',
        {
          cluster: this.Cluster,
          desiredCount: 1,
          publicLoadBalancer: true,
          serviceName: prefix + '-fg-service',
          loadBalancerName: prefix + '-fg-service-lb',
          taskDefinition: fgTaskDef
        }
      ).service
    const fargateServiceScalability = this.FargateService.autoScaleTaskCount({ maxCapacity: 3 })
    fargateServiceScalability.scaleOnCpuUtilization(
      'FargateServiceScalability',
      {
        targetUtilizationPercent: 70
      }
    )

    // ----------------------------
    // ECS Cluster > CloudWatch
    // ----------------------------

    const dashboard = new cloudwatch.Dashboard(this, 'cloudwatch-dashboard', {
      dashboardName: prefix
    })

    /* const ec2CpuUtilizationMetric = ec2Service.metricCpuUtilization({
      period: Duration.minutes(1),
      label: "EC2 CPU Utilization",
    }); */

    const fargateCpuUtilizationMetric = this.FargateService.metricCpuUtilization({
      period: Duration.minutes(1),
      label: 'Fargate CPU Utilization'
    })

    dashboard.addWidgets(
      /* new cloudwatch.GraphWidget({
        left: [ec2CpuUtilizationMetric],
        width: 12,
        title: "EC2 CPU Utilization",
      }), */
      new cloudwatch.GraphWidget({
        left: [fargateCpuUtilizationMetric],
        width: 12,
        title: 'Fargate CPU Utilization'
      })
    )
  }
}
