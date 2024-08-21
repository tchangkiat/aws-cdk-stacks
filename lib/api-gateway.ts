import { type Construct } from "constructs";
import { Stack, type StackProps, CfnOutput } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { AutoScalingGroup } from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

export class ApiGateway extends Stack {
	constructor(
		scope: Construct,
		id: string,
		vpc: ec2.Vpc,
		sshKeyPairName: string,
		props?: StackProps,
	) {
		super(scope, id, props);

		// ----------------------------
		// Lambda
		// ----------------------------

		const sampleApiFunction = new lambda.Function(this, "sampleApiFunction", {
			runtime: lambda.Runtime.NODEJS_20_X,
			code: lambda.Code.fromInline(`
        exports.handler = async function(event, context) {
            try {
                var method = event.httpMethod;
            
                if (method === "GET") {
                    if (event.path === "/") {
                        return {
                            statusCode: 200,
                            headers: {},
                            body: JSON.stringify('{ "message": "If you see this message, you are authorized" }')
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

		const authenticator = new lambda.Function(this, 'authenticator', {
			functionName: id + "-authenticator",
			architecture: lambda.Architecture.ARM_64,
			runtime: lambda.Runtime.PYTHON_3_12,
			code: lambda.Code.fromAsset('lambda_api_gateway.zip'),
			handler: "authenticator.handler",
		});
		
		const authorizer = new lambda.Function(this, 'authorizer', {
			functionName: id + "-authorizer",
			architecture: lambda.Architecture.ARM_64,
			runtime: lambda.Runtime.PYTHON_3_12,
			code: lambda.Code.fromAsset('lambda_api_gateway.zip'),
			handler: "authorizer.handler",
		});

		// ----------------------------
		// Application Fleet
		// ----------------------------

		// const ec2Sg = new ec2.SecurityGroup(this, "ec2-sg", {
		// 	vpc,
		// 	securityGroupName: "api-gateway-ec2-sg",
		// 	description: "Allows port 22 and 80 from all IP addresses",
		// });
		// ec2Sg.addIngressRule(
		// 	ec2.Peer.anyIpv4(),
		// 	ec2.Port.tcp(80),
		// 	"Allow all HTTP connection",
		// );
		// ec2Sg.addIngressRule(
		// 	ec2.Peer.anyIpv4(),
		// 	ec2.Port.tcp(22),
		// 	"Allow all SSH connection",
		// );

		// const userData = ec2.UserData.forLinux();
		// userData.addCommands(
		// 	[
		// 		"sudo yum update -y",
		// 		"sudo amazon-linux-extras enable epel",
		// 		"sudo yum install epel-release -y",
		// 		// nginx
		// 		"sudo yum install nginx -y",
		// 		"sudo systemctl start nginx",
		// 	].join("\n"),
		// );

		// const ec2LaunchTemplate = new ec2.LaunchTemplate(
		// 	this,
		// 	"api-gateway-ec2-launch-template",
		// 	{
		// 		blockDevices: [
		// 			{
		// 				deviceName: "/dev/xvda",
		// 				volume: ec2.BlockDeviceVolume.ebs(10),
		// 			},
		// 		],
		// 		instanceType: ec2.InstanceType.of(
		// 			ec2.InstanceClass.T4G,
		// 			ec2.InstanceSize.SMALL,
		// 		),
		// 		keyPair: ec2.KeyPair.fromKeyPairName(
		// 			this,
		// 			"sshKeyPairName",
		// 			sshKeyPairName,
		// 		),
		// 		launchTemplateName: "api-gateway-ec2",
		// 		machineImage: new ec2.AmazonLinuxImage({
		// 			generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
		// 			cpuType: ec2.AmazonLinuxCpuType.ARM_64
		// 		}),
		// 		role: new iam.Role(this, "instance-profile-role", {
		// 			assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
		// 			managedPolicies: [
		// 				iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ReadOnlyAccess"),
		// 			],
		// 		}),
		// 		securityGroup: ec2Sg,
		// 		userData,
		// 	},
		// );

		// const ec2AutoScalingGroup = new AutoScalingGroup(this, "ec2-asg", {
		// 	autoScalingGroupName: "api-gateway-ec2-asg",
		// 	launchTemplate: ec2LaunchTemplate,
		// 	vpcSubnets: {
		// 		subnetType: ec2.SubnetType.PUBLIC,
		// 	},
		// 	vpc,
		// });

		// const alb = new elbv2.ApplicationLoadBalancer(this, "alb", {
		// 	internetFacing: true,
		// 	loadBalancerName: "api-gateway-alb",
		// 	vpc,
		// });
		// const listener = alb.addListener("alb-listener", {
		// 	port: 80,
		// });
		// listener.addTargets("alb-target-1", {
		// 	port: 80,
		// 	targets: [ec2AutoScalingGroup],
		// });
		// new CfnOutput(this, "ApplicationLoadBalancerUrl", {
		// 	value: "http://" + alb.loadBalancerDnsName,
		// });

		// ----------------------------
		// API Gateway
		// ----------------------------

		const api = new apigateway.RestApi(this, "restApi", {
			restApiName: "demo",
			description: "API Gateway Demo",
			deployOptions: {
				stageName: "v1"
			}
		});
		const authResource = api.root.addResource("auth")

		const tokenAuthorizer = new apigateway.TokenAuthorizer(this, 'tokenAuthorizer', {
			authorizerName: "JWT",
			handler: authorizer
		});

		const sampleApiFunctionIntegration = new apigateway.LambdaIntegration(sampleApiFunction);
		api.root.addMethod("GET", sampleApiFunctionIntegration, { authorizer: tokenAuthorizer });

		const authenticatorIntegration = new apigateway.LambdaIntegration(authenticator);
		authResource.addMethod("GET", authenticatorIntegration);

		// const httpIntegration = new apigateway.HttpIntegration(
		// 	"http://" + alb.loadBalancerDnsName,
		// );
		// const albResource = api.root.addResource("alb");
		// albResource.addMethod("GET", httpIntegration, { authorizer: auth });
	}
}
