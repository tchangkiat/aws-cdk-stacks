const { Stack, CfnOutput } = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const lambda = require("aws-cdk-lib/aws-lambda");
const { AutoScalingGroup } = require("aws-cdk-lib/aws-autoscaling");
const ec2 = require("aws-cdk-lib/aws-ec2");
const iam = require("aws-cdk-lib/aws-iam");
const elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");
const { StandardVpc } = require("../constructs/Network");

class ApiGateway extends Stack {
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

    const sshKeyName = "EC2DefaultKeyPair";

    // ----------------------------
    // Lambda
    // ----------------------------

    const handler = new lambda.Function(this, "lambdaFunction", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline(`
        exports.handler = async function(event, context) {
            try {
                var method = event.httpMethod;
            
                if (method === "GET") {
                    if (event.path === "/") {
                        return {
                            statusCode: 200,
                            headers: {},
                            body: JSON.stringify('{ "From": "Lambda" }')
                        };
                    }
                }
            
                return {
                    statusCode: 400,
                    headers: {},
                    body: "Only GET '/' is accepted"
                };
            } catch(error) {
                var body = error.stack || JSON.stringify(error, null, 2);
                return {
                    statusCode: 400,
                    headers: {},
                    body: JSON.stringify(body)
                }
            }
        }
      `),
      handler: "index.handler",
    });

    // ----------------------------
    // Network
    // ----------------------------

    const vpc = new StandardVpc(this, "vpc", { vpcName: "api-gw" });

    // ----------------------------
    // Application Fleet
    // ----------------------------

    const ec2Sg = new ec2.SecurityGroup(this, "ec2-sg", {
      vpc,
      securityGroupName: "api-gateway-ec2-sg",
    });
    ec2Sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow all HTTP connection"
    );
    ec2Sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow all SSH connection"
    );

    const userData = ec2.UserData.forLinux();
    userData.addCommands([
      [
        "sudo yum update -y",
        "sudo amazon-linux-extras enable epel",
        "sudo yum install epel-release -y",
        // nginx
        "sudo yum install nginx -y",
        "sudo systemctl start nginx",
      ].join("\n"),
    ]);

    const ec2LaunchTemplate = new ec2.LaunchTemplate(
      this,
      "api-gateway-ec2-launch-template",
      {
        blockDevices: [
          {
            deviceName: "/dev/xvda",
            volume: ec2.BlockDeviceVolume.ebs(10),
          },
        ],
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.SMALL
        ),
        keyName: sshKeyName,
        launchTemplateName: "api-gateway-ec2",
        machineImage: ec2.MachineImage.latestAmazonLinux({
          generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        }),
        role: new iam.Role(this, "instance-profile-role", {
          assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName(
              "AmazonEC2ReadOnlyAccess"
            ),
          ],
        }),
        securityGroup: ec2Sg,
        userData,
      }
    );

    const ec2AutoScalingGroup = new AutoScalingGroup(this, "ec2-asg", {
      autoScalingGroupName: "api-gateway-ec2-asg",
      launchTemplate: ec2LaunchTemplate,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      vpc,
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, "alb", {
      internetFacing: true,
      loadBalancerName: "api-gateway-alb",
      vpc,
    });
    const listener = alb.addListener("alb-listener", {
      port: 80,
    });
    const targetGroup = listener.addTargets("alb-target-1", {
      port: 80,
      targets: [ec2AutoScalingGroup],
    });
    new CfnOutput(this, "ApplicationLoadBalancerUrl", {
      value: "http://" + alb.loadBalancerDnsName,
    });

    // ----------------------------
    // API Gateway
    // ----------------------------

    const api = new apigateway.RestApi(this, "apiGateway", {
      restApiName: "Sample Service",
      description: "Sample Service",
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(handler, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' },
    });
    api.root.addMethod("GET", lambdaIntegration);

    const httpIntegration = new apigateway.HttpIntegration(
      "http://" + alb.loadBalancerDnsName
    );
    const albResource = api.root.addResource("alb");
    albResource.addMethod("GET", httpIntegration);
  }
}

module.exports = { ApiGateway };
